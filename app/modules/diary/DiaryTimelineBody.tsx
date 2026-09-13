/**
 * DIARY-01B — the chronology.
 *
 * A diary is read in one direction, so this is a semantic ordered list of days,
 * each an ordered list of entries. Each row shows the time it happened, the type
 * glyph, a strong title, an optional two-line plain-text excerpt and the quiet
 * facts that qualify it — the FULL Markdown body belongs to the details panel,
 * never the row, so the chronology stays scannable.
 *
 * Accessibility: in Timeline mode each local day is a heading; in Day mode the
 * navigator already names the day, so the heading is visually hidden and kept for
 * the document outline. The row's primary action is a single title button that
 * stretches over the whole row (so the row is clickable) while the separate Edit
 * button stays independently operable — no interactive control is nested inside
 * another. The open entry is marked with `aria-current` (not colour alone) and a
 * visible selected treatment.
 *
 * ── UNTITLED-12: the timeline theatre is gone ───────────────────────────────
 *
 * This drew a continuous 2px vertical rule down a node column, with every entry
 * carrying a 28px bordered ring around its glyph, on a rounded filled slab per
 * day. That is the "giant dots, heavy vertical lines, timeline theatre" the
 * brief rules out by name, and the measurement was worse than the look: at 393px
 * the time gutter, the node column, their two gaps and an always-visible 44px
 * Edit button left the entry's own CONTENT 168px — under half a phone screen for
 * the only thing on the row anyone reads.
 *
 * Untitled's own chronology (the `informational-02/13` activity feed) does none
 * of it. A row is a leading glyph, a strong name, a quiet timestamp and the
 * content, and what separates one row from the next is a HAIRLINE. That is what
 * this is now, inside `application/table`'s card anatomy — the same bounded
 * card, in-card header and divided body that Habits and Today already draw —
 * with three things that are the product's rather than Untitled's:
 *
 *   - **The time leads the row.** Untitled's feed puts the timestamp beside the
 *     actor's name because the actor is what its rows are about. A diary's rows
 *     are about WHEN, so the time is a fixed tabular column the eye runs down —
 *     the one piece of the old timeline that was earning its place.
 *   - **The glyph column drops below `sm`.** It is decorative (the type is named
 *     in the meta line, which is what assistive tech reads), so on a phone it is
 *     28px plus a gap spent on something that carries nothing. Dropping it and
 *     tightening the time gutter is most of the 168px defect above.
 *   - **The day card has no header in Day mode.** The navigator names the day
 *     directly above it; a card header repeating it is the same date twice.
 */

import { NOTE_ENTRY } from "~/kernel/diary";
import { EditIcon } from "~/shared/icons";
import { IconButton } from "~/shared/ui";
import { cx } from "~/shared/ui/untitled/utils/cx";

import type { DiaryMode } from "./routes/index";
import { entryTypeIcon } from "./diary-icons";
import type { SerializedDayGroup, SerializedDiaryEntry } from "./diary-view";
import { diaryDayHeading } from "./occurred-time";

/**
 * How many characters of the body the row previews.
 *
 * UIX-04 §19 puts the entry BODY among the things a Diary row should prioritise,
 * and 140 characters clipped almost every real reflection mid-clause. The row
 * shows two lines now (the CSS clamps it), so the budget is the two lines' worth
 * — still a preview, never the full entry, which belongs to the panel.
 */
const EXCERPT_CHARS = 260;

export interface DiaryTimelineBodyProps {
  readonly groups: readonly SerializedDayGroup[];
  readonly mode: DiaryMode;
  readonly todayKey: string;
  /** The id of the entry whose details panel is open, or null. */
  readonly selectedId: string | null;
  readonly onSelect: (entryId: string) => void;
  readonly onEdit: (entryId: string) => void;
}

export function DiaryTimelineBody({
  groups,
  mode,
  todayKey,
  selectedId,
  onSelect,
  onEdit,
}: DiaryTimelineBodyProps) {
  return (
    <ol className="dh-diary-timeline" aria-label="Diary timeline">
      {groups.map((group) => (
        <li
          key={group.day}
          /*
           * `application/table`'s `TableCard.Root`: one bounded surface with the
           * card's own ring, radius and lift, clipping its divided body.
           */
          className="dh-diary-day overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary"
        >
          {/* The day heading stays an h2 in BOTH modes so the outline is
           * h1 → h2 → h3 (no skipped level). In Day mode the date already lives in
           * the navigator, so the heading is visually hidden but kept for the
           * document outline and screen readers. */}
          <h2
            className={
              mode === "timeline"
                ? "dh-diary-day__heading m-0 border-b border-secondary px-5 py-3 text-sm font-semibold text-primary max-md:px-4"
                : "dh-diary-day__heading dh-visually-hidden"
            }
          >
            {diaryDayHeading(group.day, todayKey)}
          </h2>
          <ol className="dh-diary-day__entries m-0 list-none p-0">
            {group.entries.map((entry) => (
              <DiaryEntryRow
                key={entry.id}
                entry={entry}
                selected={entry.id === selectedId}
                onSelect={onSelect}
                onEdit={onEdit}
              />
            ))}
          </ol>
        </li>
      ))}
    </ol>
  );
}

function excerptOf(source: string | null): string | null {
  if (source === null) return null;
  const collapsed = source.replace(/\s+/g, " ").trim();
  if (collapsed.length === 0) return null;
  return collapsed.length > EXCERPT_CHARS
    ? `${collapsed.slice(0, EXCERPT_CHARS)}…`
    : collapsed;
}

/**
 * The row.
 *
 * `grid`, not `flex`, because the time column has to be the SAME width on every
 * row for the eye to run down it — which is the entire argument for keeping a
 * time gutter at all. Below `md` the glyph column is removed from the template
 * rather than hidden, so it costs no track and no gap.
 */
const ROW = cx(
  "dh-diary-entry group/entry relative grid items-start gap-x-3 px-5 py-3",
  "grid-cols-[3.25rem_1.25rem_minmax(0,1fr)_auto]",
  "max-md:grid-cols-[2.75rem_minmax(0,1fr)_auto] max-md:gap-x-2 max-md:px-4",
  "border-b border-secondary last:border-b-0",
  // Untitled's own row hover. The selected row is the ACTIVE surface — a real
  // container change, so it survives forced colours and is visible without a
  // pointer (and it is not the legacy accent tint this row used to carry).
  "hover:bg-secondary",
  "data-[selected=true]:bg-active data-[selected=true]:hover:bg-active",
);

function DiaryEntryRow({
  entry,
  selected,
  onSelect,
  onEdit,
}: {
  readonly entry: SerializedDiaryEntry;
  readonly selected: boolean;
  readonly onSelect: (entryId: string) => void;
  readonly onEdit: (entryId: string) => void;
}) {
  const Icon = entryTypeIcon(entry.entryType);
  const excerpt = excerptOf(entry.bodySource);
  return (
    <li className={ROW} data-selected={selected ? "true" : "false"}>
      <time
        className="dh-diary-entry__time pt-px text-right text-sm font-medium whitespace-nowrap text-tertiary tabular-nums"
        dateTime={entry.occurredAtIso}
      >
        {entry.occurredTimeLabel}
      </time>
      {/*
        The glyph, at Untitled's quaternary foreground: decorative, subordinate
        to the words, and gone below `md` where the column it needs is worth more
        to the entry than to the ornament.
      */}
      <span
        className="dh-diary-entry__node mt-0.5 inline-flex size-5 shrink-0 items-center justify-center text-fg-quaternary *:size-4 max-md:hidden"
        aria-hidden="true"
      >
        <Icon />
      </span>
      <div className="dh-diary-entry__main flex min-w-0 flex-col gap-1">
        <h3 className="dh-diary-entry__title m-0 text-sm leading-snug font-semibold text-primary">
          <button
            type="button"
            className="dh-diary-entry__select cursor-pointer border-0 bg-transparent p-0 text-left font-inherit text-inherit [overflow-wrap:anywhere] after:absolute after:inset-0 after:content-['']"
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(entry.id)}
          >
            {entry.title}
          </button>
        </h3>
        {excerpt !== null ? (
          <p className="dh-diary-entry__excerpt m-0 line-clamp-2 text-sm text-tertiary">
            {excerpt}
          </p>
        ) : null}
        {/*
          UIX-04 §19 — the entry TYPE is named once per row, not twice.

          The row carried a filled type badge under the excerpt AND the same
          subtype glyph on its timeline node, so every entry in a diary of notes
          said "Note" twice. The glyph is decorative (`aria-hidden`), so the
          badge is what carries the type to assistive tech and it stays — as
          plain text in the meta line rather than as a chip, because a chip on
          every row of a chronology is a column of pills where the eye wants a
          column of prose.

          Backdating is different and keeps its emphasis: it is the one thing on
          a row that contradicts where the row is SITTING.
        */}
        <div className="dh-diary-entry__meta flex flex-wrap items-center gap-2">
          {/*
            "NOTE" on every row of a diary of notes is a word that never varies,
            and a chronology reads worse for it. The NEUTRAL default type is
            therefore announced but not drawn; every other type — Meeting,
            Decision, Reflection, Travel — is genuinely distinguishing and is
            shown. Nothing is lost to assistive tech either way, which matters
            because the row's glyph is decorative.
          */}
          <span
            className={cx(
              "dh-diary-entry__type text-xs font-medium text-tertiary",
              entry.entryType === NOTE_ENTRY && "dh-visually-hidden",
            )}
          >
            {entry.entryTypeLabel}
          </span>
          {entry.backdated ? (
            <span className="dh-diary-entry__backdated rounded-full px-2 text-xs text-tertiary ring-1 ring-secondary ring-inset">
              Backdated
            </span>
          ) : null}
        </div>
      </div>
      {/*
        The Edit affordance, as the product's own icon button rather than a
        hand-rolled 44px circle around a hand-drawn `<svg>` pencil — which is
        what this was, the last inline path data in the module.

        It is never hover-only: `opacity-0` with a hover/focus reveal fails a
        touch user and a keyboard user alike unless every state is remembered,
        and this one only remembered because `@media (hover: none)` had been
        patched in afterwards. It is simply always there, at the quaternary
        weight an always-present secondary action should carry.
      */}
      <IconButton
        icon={<EditIcon />}
        label={`Edit ${entry.title}`}
        size="sm"
        className="dh-diary-entry__edit relative z-10"
        onClick={() => onEdit(entry.id)}
      />
    </li>
  );
}
