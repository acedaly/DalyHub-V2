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
 *
 * ── UNTITLED-12: the paint moves to Untitled, the composition does not ───────
 *
 * The rail was the largest surviving block of legacy paint in Notes: 110 lines
 * of `.dh-notes-rail*` in `notes.css` naming `--dh-color-surface-selected`,
 * `--dh-color-accent`, `--dh-color-bg-sunken`, `--dh-text-meta-size` and the
 * `--app-space-*` scale, which is the vocabulary the migration is removing. It
 * is a NAVIGATION LIST of links with one current item — exactly what Untitled's
 * own `application/app-navigation/base-components/nav-item` is — so the row now
 * takes that component's treatment (`bg-primary`, `hover:bg-primary_hover`, the
 * selected `bg-secondary`, the `rounded-md` box, the `text-sm font-semibold
 * text-secondary` label and its `truncate`), expressed as utilities because the
 * row's second line is a date and a preview rather than upstream's icon/badge
 * pair.
 *
 * The one deliberate ADDITION to upstream's selected arm is the leading accent
 * bar. Untitled marks a current nav item with a fill alone, which is correct in
 * a sidebar of eight items and is not enough down a column of forty near-
 * identical documents — §5's requirement is that the open note is obvious at a
 * glance, and a shape says that where a tint does not. It is drawn with the
 * brand ring role rather than with a legacy accent variable.
 */

import { NavLink } from "react-router";

import { formatCalendarDate } from "~/shared/task-record/task-view";
import { cx } from "~/shared/ui/untitled/utils/cx";

import type { SerializedNoteListItem } from "./note-view";

export interface NotesRailProps {
  readonly notes: readonly SerializedNoteListItem[];
  /** True when the rail is showing a bounded slice of a longer list. */
  readonly hasMore: boolean;
}

/**
 * One row. Untitled's `NavItemBase` geometry, with its label rules, plus the
 * second line §6 asks for and the leading bar §5 does.
 */
const ROW = cx(
  "group/item relative block rounded-md bg-primary px-3 py-2 no-underline outline-focus-ring",
  "transition duration-100 ease-linear select-none",
  "hover:bg-primary_hover focus-visible:z-10 focus-visible:outline-2 focus-visible:-outline-offset-2",
  // The current note: upstream's selected fill, and the bar that makes it a
  // shape as well as a tint.
  "aria-[current=page]:bg-secondary aria-[current=page]:hover:bg-secondary_hover",
  "aria-[current=page]:before:absolute aria-[current=page]:before:inset-y-1 aria-[current=page]:before:left-0",
  "aria-[current=page]:before:w-0.5 aria-[current=page]:before:rounded-full",
  "aria-[current=page]:before:bg-brand-solid aria-[current=page]:before:content-['']",
  // Forced colours draws neither a fill nor a background image, so the current
  // row would be indistinguishable. An outline is the one thing that survives.
  "forced-colors:aria-[current=page]:outline forced-colors:aria-[current=page]:outline-2",
);

export function NotesRail({ notes, hasMore }: NotesRailProps) {
  return (
    <nav className="dh-notes-rail" aria-label="Notes">
      <div className="dh-notes-rail__head flex items-center justify-between gap-2 px-3 pb-2">
        <span className="dh-notes-rail__heading text-sm font-semibold text-primary">
          Recent notes
        </span>
      </div>

      <ul className="dh-notes-rail__list m-0 min-h-0 flex-1 list-none space-y-0.5 overflow-y-auto p-0 pb-4">
        {notes.map((note) => (
          <li key={note.id}>
            <NavLink
              to={`/notes/${encodeURIComponent(note.id)}`}
              className={ROW}
              // The ROUTE is the selection, and `NavLink` derives `aria-current`
              // from it. Passing a selected id in as well would be a second
              // source of truth that `NavLink` would then override anyway.
              prefetch="intent"
            >
              <span className="dh-notes-rail__title block truncate text-sm font-semibold text-secondary group-hover/item:text-secondary_hover">
                {note.title}
              </span>
              {/* The date and the preview share ONE line, the way every list of
                  documents from Mail to Notes writes it: the date is fixed and
                  the preview takes the rest. */}
              <span className="dh-notes-rail__line mt-px flex min-w-0 items-baseline gap-2 text-xs text-tertiary">
                <span className="dh-notes-rail__date shrink-0">
                  {formatCalendarDate(note.effectiveUpdatedAt.slice(0, 10)) ??
                    ""}
                </span>
                {note.excerpt ? (
                  <span className="dh-notes-rail__excerpt min-w-0 flex-1 truncate">
                    {note.excerpt}
                  </span>
                ) : (
                  <span className="dh-notes-rail__excerpt dh-notes-rail__excerpt--empty min-w-0 flex-1 truncate text-quaternary italic">
                    No additional text
                  </span>
                )}
              </span>
            </NavLink>
          </li>
        ))}
      </ul>

      {/* The door to the collection. Untitled's quiet link role, not the legacy
          accent: this is where the rail admits it is bounded, and a loud link
          at the foot of a list of documents competes with the documents. */}
      <a
        className="dh-notes-rail__all shrink-0 border-t border-secondary px-3 py-2 text-xs font-semibold text-brand-secondary no-underline hover:text-brand-secondary_hover hover:underline"
        href="/notes"
      >
        {hasMore ? "All notes" : "Notes"}
      </a>
    </nav>
  );
}
