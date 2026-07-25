/**
 * DIARY-01B — the visual timeline body.
 *
 * A real timeline, not a stack of independent cards: a continuous vertical rule with
 * icon-based nodes, a fixed time gutter, and compact rows aligned to their occurred
 * time. Each row shows the type glyph, a strong title, an optional one-line plain-text
 * excerpt and a restrained type badge — the FULL Markdown body belongs to the details
 * panel, never the row, so the timeline stays scannable.
 *
 * Accessibility: the chronology is a semantic ordered list; in Timeline mode each
 * local day is a heading. The row's primary action is a single title button that
 * stretches over the whole row (so the row is clickable) while the separate Edit
 * button stays independently operable — no interactive control is nested inside
 * another. The open entry is marked with `aria-current` (not colour alone) and a
 * visible selected treatment.
 */

import type { DiaryMode } from "./routes/index";
import { entryTypeIcon } from "./diary-icons";
import type { SerializedDayGroup, SerializedDiaryEntry } from "./diary-view";
import { diaryDayHeading } from "./occurred-time";

/** How many characters of the body to show as the row's one-line excerpt. */
const EXCERPT_CHARS = 140;

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
        <li key={group.day} className="dh-diary-day">
          {/* The day heading stays an h2 in BOTH modes so the outline is
           * h1 → h2 → h3 (no skipped level). In Day mode the date already lives in
           * the navigator, so the heading is visually hidden but kept for the
           * document outline and screen readers. */}
          <h2
            className={
              mode === "timeline"
                ? "dh-diary-day__heading"
                : "dh-diary-day__heading dh-visually-hidden"
            }
          >
            {diaryDayHeading(group.day, todayKey)}
          </h2>
          <ol className="dh-diary-day__entries">
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
    <li className="dh-diary-entry" data-selected={selected ? "true" : "false"}>
      <time className="dh-diary-entry__time" dateTime={entry.occurredAtIso}>
        {entry.occurredTimeLabel}
      </time>
      <span className="dh-diary-entry__node" aria-hidden="true">
        <Icon />
      </span>
      <div className="dh-diary-entry__main">
        <h3 className="dh-diary-entry__title">
          <button
            type="button"
            className="dh-diary-entry__select"
            aria-current={selected ? "true" : undefined}
            onClick={() => onSelect(entry.id)}
          >
            {entry.title}
          </button>
        </h3>
        {excerpt !== null ? (
          <p className="dh-diary-entry__excerpt">{excerpt}</p>
        ) : null}
        <div className="dh-diary-entry__meta">
          <span className="dh-diary-entry__type">{entry.entryTypeLabel}</span>
          {entry.backdated ? (
            <span className="dh-diary-entry__backdated">Backdated</span>
          ) : null}
        </div>
      </div>
      <button
        type="button"
        className="dh-diary-entry__edit"
        aria-label={`Edit ${entry.title}`}
        onClick={() => onEdit(entry.id)}
      >
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
          <path
            d="M11.5 3.5l3 3L7 14l-3.5.5.5-3.5 7.5-7.5z"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
        </svg>
      </button>
    </li>
  );
}
