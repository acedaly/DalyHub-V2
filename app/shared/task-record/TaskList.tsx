/**
 * DS-04 — the Task LIST and the Task GROUP.
 *
 * Two very small components that exist for one reason each:
 *
 *   - **`TaskList`** owns the column grid. The template is declared ONCE, on the
 *     list, and inherited by the header cells and by every row, so a date column
 *     is a column rather than four elements that happen to be near each other.
 *     It also carries the list semantics — a real `<ul>` with an accessible name
 *     — which is what a screen reader needs to say "list, 24 items" instead of
 *     reading a wall of divs.
 *   - **`TaskGroup`** draws a server-authoritative bucket. The heading is a
 *     chevron, a word and a count, and NOT a card: wrapping each group in a
 *     bounded surface is most of what made the old screen read as a stack of
 *     panels rather than as one list (DS-04 §24). The chevron folds the bucket.
 *
 * FINAL-UI removed the column KEY. Neither approved Tasks concept draws one, and
 * it was `aria-hidden` decoration in the first place — every cell inside a row
 * carries its own accessible name ("Due date: 12 Aug", "Project or Area:
 * Kitchen fit-out"), so a screen reader never had it and never needed it. What
 * it cost was visual: a small-caps header row above a dense list is what makes
 * the list read as a data grid rather than as the owner's work.
 */

import { useId, useState, type ReactNode } from "react";
import { Link } from "react-router";

import { ChevronDownIcon } from "~/shared/icons";
import { DH_MOTION_BASE_MS, usePresence } from "~/shared/motion";
import type { TaskDensity } from "~/kernel/task-views";

/**
 * The Tasks density preference, as a DS-01 density preset.
 *
 * `compact` is the preset DS-01 defines by this exact case ("a dense task
 * list"); `comfortable` is the standard desktop rung, which is what `default`
 * is. The mapping lives here so the ONE place that reads the owner's choice is
 * the one place that knows how it is spelled in the token layer.
 */
function densityPreset(
  density: TaskDensity | undefined,
): "compact" | "default" {
  return density === "comfortable" ? "default" : "compact";
}

export interface TaskListProps {
  /** The accessible name of the list ("Tasks", "Overdue tasks"). */
  readonly ariaLabel: string;
  /**
   * The owner's chosen Tasks density, from the shared control's `?density=`.
   *
   * The list DECLARED `compact` unconditionally in its first form, which made
   * the still-shipped Comfortable option change the URL and the control while
   * every row stayed exactly where it was — a preference that is visibly inert
   * is worse than one that does not exist.
   */
  readonly density?: TaskDensity;
  readonly children: ReactNode;
  readonly className?: string;
}

export function TaskList({
  ariaLabel,
  density,
  children,
  className,
}: TaskListProps) {
  return (
    <div
      className={["dh-tasklist", className].filter(Boolean).join(" ")}
      /*
       * DS-01's `compact` preset is DEFINED by this case — "a desktop
       * productivity surface: a dense task list … the density the reference
       * designs are drawn at" — and it is the DEFAULT here rather than the only
       * option: the owner's Comfortable choice resolves to `default`.
       *
       * Declaring it on the region rather than on the document is the whole
       * point of doing density with custom properties: a dense list does not
       * make the Settings screen dense. The coarse-pointer floor in `tokens.css`
       * hands every touch target back on a phone, unconditionally.
       */
      data-dh-density={densityPreset(density)}
    >
      <ul className="dh-tasklist__rows" aria-label={ariaLabel}>
        {children}
      </ul>
    </div>
  );
}

export interface TaskGroupProps {
  /** The bucket's word — "Overdue", "Today", "No date". */
  readonly title: string;
  /** The SERVER's count for the whole bucket, not the slice that loaded. */
  readonly count: number;
  /** The document outline level for the heading. */
  readonly headingLevel?: 2 | 3;
  /** "View all N", when the bucket holds more than the slice. */
  readonly moreHref?: string | null;
  /**
   * The bucket's STATE, as a data attribute on the section.
   *
   * `overdue` is the only non-default tone. It no longer colours the heading —
   * the references keep every heading the same near-black and put the red on
   * each row's own date — but it stays declared, because it is a true fact about
   * the bucket that forced-colours rules and tests read. Anything else — Today,
   * Upcoming, a project bucket, a priority bucket — is `default`.
   */
  readonly tone?: "default" | "overdue";
  /**
   * The presentation's own container class (`dh-tasks-grouped__section`,
   * `dh-tasks-board__column`, `dh-tasks-sectors__column`). It lands on the SAME
   * element as the region's name rather than on a wrapper, so a bucket is one
   * object: one landmark, one layout box, one thing to select.
   */
  readonly className?: string;
  readonly children: ReactNode;
}

export function TaskGroup({
  title,
  count,
  headingLevel = 2,
  moreHref = null,
  tone = "default",
  className,
  children,
}: TaskGroupProps) {
  const Heading = `h${headingLevel}` as const;
  const [collapsed, setCollapsed] = useState(false);
  /*
   * DHDS-08 — the body stays PAINTED for the length of the collapse, so the
   * section can transition shut instead of teleporting.
   *
   * `hidden` is still the collapsed end state (see the note on the body below:
   * it is what keeps a folded group out of the accessibility tree and out of
   * layout on a long list). It simply arrives when the transition finishes
   * rather than on the click, which is exactly the removal-timing problem
   * `usePresence` exists for. Under reduced motion it arrives immediately and
   * the behaviour is identical to what it was before DHDS-08.
   */
  const { mounted: bodyPainted } = usePresence(!collapsed, DH_MOTION_BASE_MS);
  const bodyId = `${useId()}-taskgroup-body`;
  return (
    /*
     * A NAMED region, so the bucket is a navigable landmark.
     *
     * Named by the bucket alone: the heading inside already carries the
     * authoritative count, and repeating it in the landmark name would make a
     * screen reader announce the number twice.
     */
    <section
      className={["dh-taskgroup", className].filter(Boolean).join(" ")}
      aria-label={title}
      data-tone={tone}
      data-testid="task-group"
    >
      <div className="dh-taskgroup__header">
        {/*
         * The DISCLOSURE — a real button wrapping the chevron and the heading.
         *
         * The references put a chevron at the head of every bucket, and a list
         * that groups by due state is exactly the list someone wants to fold: an
         * owner clearing Today does not want forty Upcoming rows under it.
         *
         * The whole "chevron + Overdue 2" run is the control, because a 16px
         * chevron is a poor target and a heading that looks clickable but is not
         * is worse. The heading element stays INSIDE the button so the document
         * outline is unchanged and the accessible name is the bucket and its
         * count — the button adds `aria-expanded`, not a second name.
         *
         * Collapse is view state, not a preference: it lives here and resets on
         * navigation, which is what makes it safe to offer without persisting a
         * per-bucket setting the owner never asked for.
         */}
        <button
          type="button"
          className="dh-taskgroup__disclosure"
          aria-expanded={!collapsed}
          aria-controls={bodyId}
          onClick={() => setCollapsed((open) => !open)}
        >
          {/*
           * The count is INSIDE the heading, and it is a FIGURE rather than a
           * badge: "OVERDUE 15", not "Overdue (15)". Brackets around a number
           * read as a debugger printing a length, and a coloured pill here was
           * one of the loudest objects on the pre-DS-04 screen — on a page whose
           * job is to be calm.
           *
           * Inside, because a heading a screen reader announces as "Overdue"
           * while the eye reads "Overdue 15" is two different headings. The
           * explicit space matters for the same reason: the gap to the figure is
           * CSS margin, and a screen reader cannot see margin, so without it the
           * accessible name is "Overdue15".
           */}
          {/*
           * The heading is INK, the count is muted, and there is no separator.
           *
           * An earlier pass drew "Overdue · 2" in red on the reading that a
           * bucket's state should be legible while scanning. The current visual
           * references draw every heading the same near-black — "Overdue 2",
           * "Today 6", "Upcoming 8" — and put the red on the ROW's date instead,
           * where it belongs: the state is a property of each task's deadline, and
           * a whole heading in red is the "do not colour an entire section red"
           * the brief rules out. Sampling the references confirms it: the word is
           * #000, the figure is grey.
           *
           * The middot went with it. The count is a FIGURE beside the word, not a
           * list length, and the explicit space is still real text rather than CSS
           * margin — a screen reader cannot see margin, so without it the
           * accessible name would be "Overdue2".
           */}
          <span
            className="dh-taskgroup__chevron dh-disclosure-marker"
            aria-hidden="true"
          >
            <ChevronDownIcon />
          </span>
          <Heading className="dh-taskgroup__title">
            {title} <span className="dh-taskgroup__count">{count}</span>
          </Heading>
        </button>
        {moreHref !== null ? (
          /*
           * A ROUTER link, and `preventScrollReset`.
           *
           * A bare `<a>` here is a full document navigation: it throws away the
           * accumulated pages, the selection, any open overlay and the scroll
           * position, to move between two configurations of the surface the
           * owner is already on. "Never lose the user's place" (AGENTS.md §6) is
           * the rule, and `preventScrollReset` is how the previous
           * implementation kept it.
           */
          <Link className="dh-taskgroup__more" to={moreHref} preventScrollReset>
            View all {count}
          </Link>
        ) : null}
      </div>
      {/*
       * The body is HIDDEN rather than unmounted.
       *
       * Unmounting would throw away anything the rows are holding — an open
       * inline editor, a pending optimistic completion, the paginator's
       * accumulated pages — and re-fetching them on expand would make a fold
       * cost a round trip. `hidden` keeps `aria-controls` pointing at a real
       * element and takes the subtree out of the accessibility tree at the same
       * time.
       */}
      <div
        id={bodyId}
        className="dh-taskgroup__body dh-disclosure"
        data-dh-open={collapsed ? "false" : "true"}
      >
        <div className="dh-disclosure__content" hidden={!bodyPainted}>
          {children}
        </div>
      </div>
    </section>
  );
}
