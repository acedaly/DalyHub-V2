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
 *     TITLE                                            tag  tag  updated
 *     two lines of preview, clamped at the list's
 *     own measure
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
import { TagChipList } from "~/shared/ui";

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
        const meta =
          (
            /*
             * A DIV, not a span, and the same one line below.
             *
             * Tags are now a real `<ul>`/`<li>` (that is what makes a run of chips
             * a list to a screen reader rather than three loose words), and a `ul`
             * inside a `span` is invalid: `span` is phrasing content. The row's
             * `<a>` has a transparent content model and sits in an `<li>`, so flow
             * content inside it is correct — only these two wrappers had to change,
             * and no layout rule did.
             */
            <div className="dh-notes-list__meta">
              {note.archived ? (
                <span className="dh-notes-list__state">Archived</span>
              ) : null}
              {/*
               * CONVERGE-01 §6 — tags are CHIPS, through the one shared
               * `TagChip`, where they used to be `tags.join(", ")`.
               *
               * A comma-joined string is one run of grey text that reads as a
               * sentence fragment, so a note tagged "research, draft" and a note
               * whose excerpt happens to end in a comma look the same at a glance.
               * Chips make each tag a countable object, which is how a tag is
               * actually used.
               *
               * Bounded at three: this list is a ROW with a fixed metadata column,
               * and a note carrying twelve tags must not push the date out of the
               * column the whole layout exists to keep straight. The remainder is
               * stated as a count and named in full for assistive tech — never a
               * silent truncation.
               */}
              <TagChipList
                tags={note.tags}
                label={`Tags on ${note.title}`}
                max={3}
                className="dh-notes-list__tags"
              />
              <span className="dh-notes-list__date">
                {deleted
                  ? (formatCalendarDate(note.updatedAt.slice(0, 10)) ?? "")
                  : updatedLabel(note)}
              </span>
            </div>
          );

        const body = (
          <>
            <span className="dh-notes-list__title">{note.title}</span>
            <div className="dh-notes-list__line">
              {note.excerpt ? (
                <span className="dh-notes-list__excerpt">{note.excerpt}</span>
              ) : (
                <span className="dh-notes-list__excerpt dh-notes-list__excerpt--empty">
                  No additional text
                </span>
              )}
              {meta}
            </div>
          </>
        );

        return (
          <li key={note.id} className="dh-notes-list__row">
            {deleted ? (
              <>
                <div className="dh-notes-list__item dh-notes-list__item--static">
                  {body}
                </div>
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
                /*
                 * Without this the link's accessible name is everything inside
                 * it — title, excerpt, tag list and relative date run together —
                 * so a screen-reader user hears the whole row read out as the
                 * name of the thing they are about to activate, and the name
                 * changes whenever the excerpt or the date does. Every other
                 * collection in the product (Projects, Goals, Tasks, and the
                 * Project → Knowledge tab, which lists these same notes) names
                 * its open affordance `Open <title>`; the Notes list was the one
                 * that did not. Naming it explicitly is the UIX-06 convergence
                 * contract applied to the surface that was missed by it.
                 */
                aria-label={`Open ${note.title}`}
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
