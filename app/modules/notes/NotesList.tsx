/**
 * UIX-04 §5/§6 — the Notes collection as a list of DOCUMENTS.
 *
 * M3X-02 made this a gallery of tiles, on the reasoning that "an excerpt is
 * worth reading, and reading it wants a column, not a line". That reasoning is
 * right about excerpts and wrong about notes: a gallery is how you present
 * things you CHOOSE BETWEEN by looking at them, and notes are things you find by
 * their title. Three columns of equal-weight tiles gave a four-word capture the
 * same visual footprint as a nine-hundred-word document, put the title in a
 * bounded box where it wrapped to two and three lines, and — because a note's
 * excerpt is the same neutral grey on every tile — produced a page with no
 * hierarchy at all beyond reading order.
 *
 * A list is what every writing application the brief names uses, for the reason
 * §6 states plainly: the title should dominate. So a row is
 *
 *     TITLE                                            updated
 *     one line of preview                              tag, tag
 *
 * and nothing else. Not the link count (an integer nobody scans a list by), not
 * the "Note" type label (every row on this page is one), not the entity glyph
 * (ditto). The archived state stays, in words, because it is the one thing about
 * a row that changes what the row MEANS.
 *
 * Rows are real links, so keyboard, middle-click, Back and prefetch all work
 * with no interaction model of this component's own. The DELETED lifecycle view
 * has no link — a deleted entity's canonical route 404s everywhere in the kernel
 * — so those rows render their title as static text beside a Restore action,
 * exactly as the shared Card documented for the same case.
 */

import { Link } from "react-router";

import { formatCalendarDate } from "~/shared/task-record/task-view";

import type { SerializedNoteListItem } from "./note-view";

export interface NotesListProps {
  readonly notes: readonly SerializedNoteListItem[];
  readonly ariaLabel: string;
  /** The Deleted view: no open target, one Restore action per row. */
  readonly onRestore?: (id: string, title: string) => void;
  readonly pendingIds?: ReadonlySet<string>;
}

function updatedLabel(note: SerializedNoteListItem): string {
  return formatCalendarDate(note.effectiveUpdatedAt.slice(0, 10)) ?? "";
}

export function NotesList({
  notes,
  ariaLabel,
  onRestore,
  pendingIds,
}: NotesListProps) {
  const deleted = onRestore !== undefined;

  return (
    <ul className="dh-notes-list" aria-label={ariaLabel}>
      {notes.map((note) => {
        /*
         * The DATE comes last so it forms a right-hand column the eye can run
         * down. With it first, every row's date landed at a different x
         * (whatever the tags after it happened to measure), which is the same
         * information laid out so it cannot be scanned.
         */
        const meta = (
          <span className="dh-notes-list__meta">
            {note.archived ? (
              <span className="dh-notes-list__state">Archived</span>
            ) : null}
            {note.tags.length > 0 ? (
              <span className="dh-notes-list__tags">
                {note.tags.join(", ")}
              </span>
            ) : null}
            <span className="dh-notes-list__date">
              {deleted
                ? (formatCalendarDate(note.updatedAt.slice(0, 10)) ?? "")
                : updatedLabel(note)}
            </span>
          </span>
        );

        const body = (
          <>
            <span className="dh-notes-list__title">{note.title}</span>
            <span className="dh-notes-list__line">
              {note.excerpt ? (
                <span className="dh-notes-list__excerpt">{note.excerpt}</span>
              ) : (
                <span className="dh-notes-list__excerpt dh-notes-list__excerpt--empty">
                  No additional text
                </span>
              )}
              {meta}
            </span>
          </>
        );

        return (
          <li key={note.id} className="dh-notes-list__row">
            {deleted ? (
              <>
                <span className="dh-notes-list__item dh-notes-list__item--static">
                  {body}
                </span>
                <button
                  type="button"
                  className="dh-btn dh-btn--secondary dh-notes-list__restore"
                  disabled={pendingIds?.has(note.id)}
                  onClick={() => onRestore(note.id, note.title)}
                >
                  {pendingIds?.has(note.id) ? "Restoring…" : "Restore"}
                </button>
              </>
            ) : (
              <Link
                to={`/notes/${encodeURIComponent(note.id)}`}
                className="dh-notes-list__item"
                prefetch="intent"
              >
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ul>
  );
}
