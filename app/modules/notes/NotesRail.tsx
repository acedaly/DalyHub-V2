/**
 * UIX-04 §5 — the Notes RAIL: the list of notes, beside the one being written.
 *
 * The brief's question is "does Notes feel like a writing application, not a
 * table of records?", and the honest answer for a full-page record route with no
 * list on it was no: opening a note meant leaving the collection, and getting
 * back to it meant a breadcrumb and a full navigation. Every application the
 * brief names — Apple Notes, Bear, Craft — answers that with the same
 * composition, a list column that STAYS beside the document, and so does this.
 *
 * It is deliberately thin:
 *
 *   - it renders links, not a selection model. Choosing a note is an ordinary
 *     navigation to that note's canonical route, so Back works, a middle-click
 *     opens a tab, and the rail needs no client state at all;
 *   - the selected row is marked with `aria-current="page"`, which `NavLink`
 *     derives from the ROUTE — so the strong selected state (§5) reaches
 *     assistive tech as well as the eye, and there is no second source of truth
 *     about which note is open;
 *   - it is BOUNDED and says so. It holds the most recently touched notes, and
 *     its footer link goes to the full collection where search, tags, projects,
 *     areas and the archived/deleted views live. A rail that silently showed the
 *     first N of an unknown number would be the dishonest version of this;
 *   - it is hidden below the desktop breakpoint (in CSS), because a phone gets
 *     the list screen → note screen flow §13 asks for instead.
 *
 * §6 governs what a row shows: title, a short preview, and the updated date.
 * Not the tags, not the link count, not the archived state — those are the
 * collection's job, and a rail that repeats them turns the writing surface back
 * into a table of records.
 */

import { NavLink } from "react-router";

import { formatCalendarDate } from "~/shared/task-record/task-view";

import type { SerializedNoteListItem } from "./note-view";

export interface NotesRailProps {
  readonly notes: readonly SerializedNoteListItem[];
  /** True when the rail is showing a bounded slice of a longer list. */
  readonly hasMore: boolean;
}

export function NotesRail({ notes, hasMore }: NotesRailProps) {
  return (
    <nav className="dh-notes-rail" aria-label="Notes">
      <div className="dh-notes-rail__head">
        <span className="dh-notes-rail__heading">Recent notes</span>
      </div>

      <ul className="dh-notes-rail__list">
        {notes.map((note) => (
          <li key={note.id}>
            <NavLink
              to={`/notes/${encodeURIComponent(note.id)}`}
              className="dh-notes-rail__item"
              // The ROUTE is the selection, and `NavLink` derives `aria-current`
              // from it. Passing a selected id in as well would be a second
              // source of truth that `NavLink` would then override anyway.
              prefetch="intent"
            >
              <span className="dh-notes-rail__title">{note.title}</span>
              <span className="dh-notes-rail__line">
                <span className="dh-notes-rail__date">
                  {formatCalendarDate(note.effectiveUpdatedAt.slice(0, 10)) ??
                    ""}
                </span>
                {note.excerpt ? (
                  <span className="dh-notes-rail__excerpt">{note.excerpt}</span>
                ) : (
                  <span className="dh-notes-rail__excerpt dh-notes-rail__excerpt--empty">
                    No additional text
                  </span>
                )}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>

      <a className="dh-notes-rail__all" href="/notes">
        {hasMore ? "All notes" : "Notes"}
      </a>
    </nav>
  );
}
