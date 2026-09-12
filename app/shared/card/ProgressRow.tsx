/**
 * The MEASURED row — an outcome, with how far along it is.
 *
 * Drawn three times in the product: the Goals workspace's left list, the Area
 * record's Goals tab, and the compact Goals section on the Projects page. It is
 * a row, not a card:
 *
 *     ┌────────────────────────────────────────────────────────────┐
 *     │ [tile]  Reach 78 kg                             83 / 78 kg │
 *     │         Health & Fitness · Ahead                            │
 *     │         Moved this week.                                    │
 *     │         ▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁▁ │
 *     └────────────────────────────────────────────────────────────┘
 *
 * Three rules make it different from `AreaCard` (which is what an Area is, and
 * deliberately carries NO bar because an Area never completes) and from
 * `ProjectCard` (a gallery object with room for a foot):
 *
 * 1. **The value is the row's honest end, not a percentage.** `83 / 78 kg`,
 *    `12 / 24`, `75% complete` — whatever the record's own arithmetic produces.
 *    The caller passes the string it derived; this component never computes,
 *    formats or rounds a measure, so a row can never disagree with the record
 *    it opens.
 * 2. **The bar is optional, and its ABSENCE is a state.** A goal with no
 *    measurement configuration has no bar and no value — it is not at 0%. The
 *    row renders what it is given and fabricates nothing.
 * 3. **Selection is a first-class state.** The Goals workspace is a
 *    master–detail, so one row is the current one. `selected` marks it with
 *    `aria-current` as well as a tint — never a tone alone.
 *
 * ── UNTITLED-07 — the paint, and where it now comes from ────────────────────
 *
 * `card-family.css`'s `.dh-mrow*` block and `premium.css`'s two overrides drew
 * every pixel of this row: its padding, its hover, its selected tint and rail,
 * its title and value type, and a THIRD hand-written progress track beside the
 * two the product already had. The presentation is the component's now, in
 * Untitled's own grammar:
 *
 *   - the list is Untitled's divided body (`application/table`'s
 *     `divide-y divide-secondary`), so the list owns the hairlines and no row
 *     has to know where it sits;
 *   - the row's hover, selected and focus states are Untitled's
 *     `bg-primary_hover` / `bg-active` / `outline-focus-ring` roles;
 *   - the bar is the shared `ProgressTrack`, which is Untitled's
 *     `ProgressBarBase` geometry (UNTITLED-07) — so this row, a Project card
 *     and a record's summary band are finally the same bar.
 *
 * The `.dh-mrow*` class names survive as hooks (the E2E suite reads
 * `.dh-mrow__title` and `.dh-mrow__value`); every rule attached to them is
 * deleted in the same change, which is the migration's standing rule.
 *
 * Presentation only: it resolves no icons, no colours and no arithmetic. The
 * caller hands it a rendered mark and already-derived display strings.
 */

import type { ReactNode } from "react";
import { Children } from "react";
import { Link } from "react-router";

import {
  identityAttribute,
  resolveIdentity,
} from "~/shared/entity/identity-resolution";
import { ProgressTrack, type MeterStatus } from "~/shared/progress";

export type ProgressRowProps = {
  /** The record's identity mark — a rendered node. Decorative. */
  readonly icon?: ReactNode;
  readonly title: string;
  readonly headingLevel?: 2 | 3 | 4;
  /** The context beneath the name — the Area, or "Health · Personal". */
  readonly context?: string | null;
  /**
   * The bounded measure. OMITTED where the record has none — an absent bar is
   * an honest "not measured", and a 0% bar would be a lie about the same state.
   */
  readonly progress?: {
    readonly percent: number;
    /** The complete sentence for assistive tech — "60 of 70 kg, 60% complete". */
    readonly valueText: string;
    /**
     * POLISH-01 — how the measure is GOING, from the caller's own evaluator.
     *
     * The bar used to take the record's identity hue, so a Goal reading "60.0 /
     * 70 kg · Ahead" drew a red bar if red was that Goal's chosen colour.
     * Absent is `neutral`, which is what an unmeasured or just-started Goal
     * honestly is.
     */
    readonly status?: MeterStatus;
  };
  /**
   * The honest figure at the row's end — "60.0 / 70 kg", "12 / 24",
   * "75% complete". Already formatted by the caller's own evaluator.
   */
  readonly value?: string | null;
  /** The record's stable identity rank, painting the mark and the bar alike. */
  readonly accent?: number | null;
  /**
   * IDENTITY-01 — the record's OWN chosen colour slot, when it has one.
   *
   * A chosen slot beats the derived rank, and the two are folded together by the
   * one resolver rather than by this component. Passing neither is the NEUTRAL
   * identity, which is a designed outcome for a record that genuinely has none.
   */
  readonly colourSlot?: string | null;
  /**
   * FOLLOW-02 — a quiet derived STATEMENT under the row's context line.
   *
   * A slot rather than a string, because the one thing a caller must not do is
   * author its own version of a shared sentence: the Goals workspace hands this
   * the same `GoalMovementLine` Today and the Goal record render. It sits below
   * the context and above the bar, so the record's NAME keeps priority over it
   * at every width.
   */
  readonly signal?: ReactNode;
  /** Master–detail selection. Adds `aria-current`, never a tint alone. */
  readonly selected?: boolean;
  readonly href: string;
  readonly openAriaLabel?: string;
  readonly muted?: boolean;
  readonly "data-testid"?: string;
};

export function ProgressRow({
  icon,
  title,
  headingLevel = 3,
  context,
  signal,
  progress,
  value,
  accent,
  colourSlot = null,
  selected = false,
  href,
  openAriaLabel,
  muted = false,
  "data-testid": testId,
}: ProgressRowProps) {
  const Heading = `h${headingLevel}` as const;

  // The ONE resolver. This component never maps a rank to a colour itself — a
  // card and the tile inside it agreeing depends on there being one mapping.
  const identity = resolveIdentity({ colourSlot, colourRank: accent ?? null });

  return (
    <article
      className={[
        "dh-mrow",
        "group relative flex min-w-0 items-start gap-3 px-4 py-3 transition duration-100 ease-linear",
        "hover:bg-primary_hover",
        // The master–detail's CURRENT row: Untitled's own selected surface, plus
        // a leading rail in the record's accent — so selection is a SHAPE as
        // well as a tone and survives forced colours.
        "data-[selected=true]:bg-active",
        "data-[selected=true]:before:absolute data-[selected=true]:before:inset-y-0 data-[selected=true]:before:left-0 data-[selected=true]:before:w-0.5 data-[selected=true]:before:bg-brand-solid data-[selected=true]:before:content-['']",
        // The whole row is the link's hit area, so the ring belongs to the row
        // rather than to the text inside it.
        "has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-focus-ring",
        muted ? "dh-mrow--muted opacity-70" : null,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={title}
      data-selected={selected ? "true" : undefined}
      {...identityAttribute(identity.slot)}
      data-testid={testId}
    >
      {icon ? (
        // Optically aligned to the title line rather than to the whole row,
        // which grows by a bar and would otherwise drag the mark below the name.
        <span className="dh-mrow__mark mt-px shrink-0" aria-hidden="true">
          {icon}
        </span>
      ) : null}

      <div className="dh-mrow__body flex min-w-0 flex-1 flex-col gap-1">
        <div className="dh-mrow__line flex min-w-0 items-baseline gap-3">
          <Heading className="dh-mrow__title min-w-0 flex-1 truncate text-sm font-semibold text-primary">
            <Link
              className="dh-mrow__open rounded-sm text-primary outline-hidden after:absolute after:inset-0 after:content-['']"
              to={href}
              // The row IS the current record of a master–detail pane, which is
              // what `page` means. It rides on the link rather than the article
              // so assistive tech announces it where the destination is.
              aria-current={selected ? "page" : undefined}
              aria-label={openAriaLabel ?? title}
              preventScrollReset
            >
              {title}
            </Link>
          </Heading>
          {/*
           * The honest value at the line's end — "83 / 78 kg", "12 / 24".
           *
           * Tabular figures, so a column of them lines up, and `shrink-0` so the
           * measure never wraps under the name it belongs to.
           */}
          {value ? (
            <p className="dh-mrow__value m-0 shrink-0 text-sm font-medium text-secondary tabular-nums">
              {value}
            </p>
          ) : null}
        </div>
        {context ? (
          <p className="dh-mrow__context m-0 truncate text-sm text-tertiary">
            {context}
          </p>
        ) : null}
        {/*
         * FOLLOW-02 — the row's derived SIGNAL slot.
         *
         * Unlike the context line above it, this WRAPS: it holds a sentence
         * rather than a label, and a truncated statement about whether a Goal
         * moved would be worse than a two-line one. The row's NAME still leads,
         * because the signal sits below it and never competes for its line.
         */}
        {signal ? (
          <div className="dh-mrow__signal mt-0.5 min-w-0">{signal}</div>
        ) : null}
        {progress ? (
          <ProgressTrack
            className="dh-mrow__track mt-1 h-1.5"
            label={`${title} progress`}
            percent={progress.percent}
            valueText={progress.valueText}
            status={progress.status}
          />
        ) : null}
      </div>
    </article>
  );
}

/**
 * The single surface the measured rows sit in — a labelled `<ul>`/`<li>`, so a
 * screen reader announces "Goals, list, 6 items" before any row is read.
 *
 * The hairlines belong to the LIST, exactly as in Untitled's own table body
 * (`application/table` → `divide-y divide-secondary`), so no row has to know
 * where it sits and two adjacent rows can never disagree about the line between
 * them.
 */
export function ProgressRowList({
  children,
  label,
  className,
  "data-testid": testId,
}: {
  readonly children: ReactNode;
  readonly label?: string;
  readonly className?: string;
  readonly "data-testid"?: string;
}) {
  return (
    <ul
      className={[
        "dh-mrow-list m-0 list-none divide-y divide-secondary p-0",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label={label}
      data-testid={testId}
    >
      {Children.map(children, (child) =>
        child === null || child === undefined || child === false ? null : (
          <li className="dh-mrow-list__item">{child}</li>
        ),
      )}
    </ul>
  );
}
