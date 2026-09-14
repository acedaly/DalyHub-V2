/**
 * UNTITLED-18 — the Settings section rail.
 *
 * Twelve destinations in three groups, drawn as two-line rows: a name and the
 * sentence that says what is inside it. It is the same component at every width
 * — on a phone this list IS the Settings screen (see `routes/index.tsx`), and on
 * a desktop it is the persistent rail beside the chosen section.
 *
 * ── Where the appearance comes from ─────────────────────────────────────────
 *
 * Untitled's `application/command-menus/base-components/command-menu-item`, in
 * its STACKED form — which is the library's own answer to "a list of
 * destinations, each with a name and a line of supporting text", and is already
 * vendored into this repository. Every class string below is that component's:
 * the row's `min-h-10 rounded-lg p-2.5 pl-3.5` geometry and its
 * `hover:bg-primary_hover`, the `flex-1 flex-col` stack, the
 * `text-sm font-medium text-primary` label and the `text-sm text-tertiary`
 * description.
 *
 * The SELECTED treatment is `application/app-navigation/base-components/nav-item`'s
 * (`bg-secondary`) rather than the menu item's, because this is a persistent
 * navigation rail and not a transient menu: the current destination has to stay
 * legible beside a row the pointer happens to be over, and `bg-primary_hover`
 * for both would make them identical. That is the same distinction Untitled
 * itself draws between the two components.
 *
 * The group heading is `nav-list`'s section subheading role — muted, at the
 * label rung, above the list it names.
 *
 * ── Why it composes those styles rather than rendering those components ─────
 *
 * The same two reasons `RailNavItem` gives, and they still hold. Upstream's
 * `CommandDropdownMenuItem` is a React Aria `ListBoxItem`, which is a listbox
 * option — not a link — so it neither navigates nor exposes link semantics.
 * `NavItemBase` renders a React Aria `<Link href>`, which navigates but has no
 * equivalent of React Router's `prefetch`; Settings' twelve sections each run a
 * loader, and warming them on intent is why moving between two of them feels
 * instant.
 *
 * So the rows are React Router `<Link>`s — real anchors, so the link semantics
 * React Aria would add are already native — wearing Untitled's presentation.
 *
 * ── The accessible name is the section, not the paragraph ───────────────────
 *
 * The summary is the link's DESCRIPTION and never part of its NAME. "Account &
 * security" is what a screen reader should announce; "Account & security Who you
 * are signed in as, recent activity, and signing out, link" is a name that is a
 * sentence. `aria-labelledby` points at the label alone and `aria-describedby`
 * at the summary, so the whole two-line row is ONE target with a one-phrase name
 * and its supporting text read after it.
 *
 * That replaces the previous arrangement — a summary rendered as a SIBLING of
 * the link, with the link's `::after` stretched over the row to make the two
 * into one target. Same semantics, same target, one element and no pseudo.
 *
 * ── Where the summary is VISIBLE, and why that changed ──────────────────────
 *
 * On a phone, always: this list is the whole Settings screen there, and twelve
 * bare nouns is exactly the surface a sentence turns into something navigable
 * without guessing. FINAL-UI then made it visible on the desktop rail too,
 * following a reference screen of two-line rows.
 *
 * MEASURED after this pass rebuilt the rail: twelve two-line rows at 240px wide
 * make the rail **1278px tall in a 950px viewport**, at 1024 and at 1440 alike.
 * A persistent navigation column that has to be scrolled to reach its last four
 * destinations is not persistent, and the reference screen it came from had six
 * sections rather than twelve. The pane beside it also already states the
 * section's purpose in its own heading and lede, so on a desktop the sentence is
 * printed twice — once where it is being read, and once in the column whose job
 * is to be scanned.
 *
 * So `md:sr-only` from the `md` breakpoint up: still in the DOM, still the
 * link's accessible description at every width, and not occupying the rail.
 * Untitled draws exactly this distinction between its own two components — the
 * stacked menu item is for a list you open and READ, `nav-item`'s single-line
 * `max-h-9` row for a rail you SCAN — and the rail is now the second at desktop
 * and the first on a phone.
 */

import { useId } from "react";
import { Link } from "react-router";

import { cx } from "~/shared/ui/untitled/utils/cx";

export interface SettingsNavItem {
  readonly id: string;
  /** The section's name — and the row's accessible name. */
  readonly label: string;
  /** One line saying what is inside. The row's accessible description. */
  readonly summary: string;
  /** Where the row goes. */
  readonly href: string;
  /** Whether this row is the current section. */
  readonly current: boolean;
}

export interface SettingsNavGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly SettingsNavItem[];
}

export interface SettingsNavProps {
  readonly groups: readonly SettingsNavGroup[];
  /** The rail's accessible name. */
  readonly "aria-label": string;
  /**
   * Whether the URL names a section.
   *
   * It decides where the SELECTED treatment is drawn, because the two widths ask
   * different questions of the same markup. On a desktop the rail sits beside
   * the section it points at, so the current row is always current. On a phone
   * this list IS the screen when no section is chosen — nothing is "current"
   * while the list itself is what is being looked at, and tinting the first row
   * says a choice has been made that has not.
   *
   * The route knows this (it resolves `?section=` on the server), so it is told
   * rather than sniffed — same markup, same first byte, no hydration mismatch.
   */
  readonly sectionChosen: boolean;
  readonly className?: string;
}

/** Upstream's stacked row, minus the states, which a link reaches differently. */
const ROW =
  "relative flex min-h-10 flex-col items-start gap-y-1 rounded-lg p-2.5 pl-3.5 no-underline outline-focus-ring transition duration-100 ease-linear focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2";

export function SettingsNav({
  groups,
  "aria-label": ariaLabel,
  sectionChosen,
  className,
}: SettingsNavProps) {
  return (
    <nav
      aria-label={ariaLabel}
      className={cx("flex flex-col gap-5", className)}
    >
      {groups.map((group) => (
        <SettingsNavGroupList
          key={group.id}
          group={group}
          sectionChosen={sectionChosen}
        />
      ))}
    </nav>
  );
}

function SettingsNavGroupList({
  group,
  sectionChosen,
}: {
  readonly group: SettingsNavGroup;
  readonly sectionChosen: boolean;
}) {
  const headingId = useId();
  return (
    <div className="flex min-w-0 flex-col gap-1">
      {/*
       * A real heading, and the list is named BY it — so a screen reader hears
       * "Your data, list, 6 items" rather than twelve links in one
       * undifferentiated run.
       */}
      <h2 id={headingId} className="px-3 text-sm font-semibold text-tertiary">
        {group.label}
      </h2>
      <ul
        aria-labelledby={headingId}
        className="m-0 flex list-none flex-col gap-0.5 p-0"
      >
        {group.items.map((item) => (
          <SettingsNavRow
            key={item.id}
            item={item}
            sectionChosen={sectionChosen}
          />
        ))}
      </ul>
    </div>
  );
}

function SettingsNavRow({
  item,
  sectionChosen,
}: {
  readonly item: SettingsNavItem;
  readonly sectionChosen: boolean;
}) {
  const labelId = useId();
  const summaryId = useId();
  const selected = item.current
    ? sectionChosen
      ? "bg-secondary hover:bg-secondary_hover"
      : // Desktop shows this section's content even with no `?section=`, so the
        // row IS current there. The phone is showing this list instead.
        "hover:bg-primary_hover md:bg-secondary md:hover:bg-secondary_hover"
    : "hover:bg-primary_hover";
  return (
    <li className="min-w-0">
      <Link
        to={item.href}
        preventScrollReset
        prefetch="intent"
        /*
         * The SAME condition as the selected tint above, and it has to be:
         * `aria-current` is one value in one document, but the tint is drawn
         * per width. On a phone at a bare `/settings` this list IS the screen,
         * so "Account & security is the current page" is a claim about a place
         * the owner has not gone — announced to exactly the people who cannot
         * see that the list, not a section, is in front of them.
         *
         * That leaves the desktop rail unmarked until a section is named, which
         * is the lesser error by some distance: an absent current marker is an
         * omission, a wrong one is a lie about where you are. The desktop's
         * default pane is a rendering convenience; the URL genuinely does not
         * name a section yet.
         */
        aria-current={item.current && sectionChosen ? "page" : undefined}
        aria-labelledby={labelId}
        aria-describedby={summaryId}
        className={cx(ROW, selected)}
      >
        <span id={labelId} className="text-sm font-medium text-primary">
          {item.label}
        </span>
        <span id={summaryId} className="text-sm text-tertiary md:sr-only">
          {item.summary}
        </span>
      </Link>
    </li>
  );
}
