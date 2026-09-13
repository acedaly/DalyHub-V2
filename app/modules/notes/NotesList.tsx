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
 *
 * ── UNTITLED-12: the two things the design fixture made visible ──────────────
 *
 * Both are defects the empty state had been hiding, not regressions:
 *
 *   - **The excerpt had no MEASURE.** At 1440 the preview line ran the full
 *     1,400px of the card, so a "two-line clamp" was roughly ninety words on one
 *     row and the page read as a wall. Prose needs a column whatever it is
 *     sitting in; the row keeps its full-width metadata column (that is what
 *     makes the dates scannable) and caps the TEXT stack at the product's prose
 *     measure.
 *   - **The date and the ORDER disagreed.** The collection sorts by `created`
 *     unless asked otherwise, and every row printed its effective UPDATED
 *     moment — so the default view showed 12 Sep, 11 Sep, 9 Sep, 7 Sep, 12 Sep,
 *     30 Aug and looked broken. A list's date column has to be the thing the
 *     list is ordered by, or it is not a column, so the row now takes the active
 *     `sort` and prints the matching moment, named for assistive tech because
 *     "12 Sep 2026" does not say which of the two it is.
 */

import { Link } from "react-router";

import type { NoteSortOrder } from "~/kernel/notes";
import { formatCalendarDate } from "~/shared/task-record/task-view";
import { Button, TagChipList } from "~/shared/ui";

import type { SerializedNoteListItem } from "./note-view";

export interface NotesListProps {
  readonly notes: readonly SerializedNoteListItem[];
  readonly ariaLabel: string;
  /**
   * The order the collection is showing, so the row's date can BE that order.
   * Defaults to the collection's own default rather than to a third answer.
   */
  readonly sort?: NoteSortOrder;
  /** The Deleted view: no open target, one Restore action per row. */
  readonly onRestore?: (id: string, title: string) => void;
  readonly pendingIds?: ReadonlySet<string>;
}

/**
 * The moment this row states, and the word for it.
 *
 * A Deleted row is a special case and always shows `updatedAt`: the Deleted view
 * is ordered by when things were removed, and "Created" on a row you are about
 * to restore answers a question nobody asked.
 */
function rowDate(
  note: SerializedNoteListItem,
  sort: NoteSortOrder,
  deleted: boolean,
): { readonly label: string; readonly iso: string; readonly name: string } {
  const iso = deleted
    ? note.updatedAt
    : sort === "recent"
      ? note.effectiveUpdatedAt
      : note.createdAt;
  return {
    iso,
    label: formatCalendarDate(iso.slice(0, 10)) ?? "",
    name: deleted || sort === "recent" ? "Updated" : "Created",
  };
}

export function NotesList({
  notes,
  ariaLabel,
  sort = "created",
  onRestore,
  pendingIds,
}: NotesListProps) {
  const deleted = onRestore !== undefined;

  return (
    /*
     * UNTITLED-04 — the list is a bounded Untitled surface, in the same card
     * grammar the migrated collection tables and entity lists carry, and it
     * draws the hairlines so no row has to know where it sits.
     *
     * The row's own composition is unchanged and is what makes Notes Notes: the
     * title leads, the excerpt takes the width, and the metadata forms a
     * right-hand column the eye can run down.
     */
    <ul
      className="dh-notes-list m-0 list-none overflow-hidden rounded-xl bg-primary p-0 shadow-xs ring-1 ring-secondary"
      aria-label={ariaLabel}
    >
      {notes.map((note) => {
        const date = rowDate(note, sort, deleted);
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
            <div className="dh-notes-list__meta flex shrink-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 max-md:justify-start">
              {note.archived ? (
                <span className="dh-notes-list__state rounded-full bg-secondary px-2 py-0.5 text-xs font-medium text-tertiary">
                  Archived
                </span>
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
              <time
                className="dh-notes-list__date shrink-0 text-sm whitespace-nowrap text-tertiary tabular-nums"
                dateTime={date.iso}
              >
                {/* The word, for anyone who cannot see which column this is. */}
                <span className="dh-visually-hidden">{`${date.name} `}</span>
                {date.label}
              </time>
            </div>
          );

        const body = (
          <>
            <span className="dh-notes-list__title text-md font-semibold text-primary">
              {note.title}
            </span>
            <div className="dh-notes-list__line flex min-w-0 items-baseline justify-between gap-4 max-md:flex-col max-md:items-start max-md:gap-1">
              {/*
               * The prose MEASURE. Everything to the right of it is metadata,
               * which is why the cap sits on the excerpt rather than on the row:
               * the date column has to stay where it is at every width.
               */}
              {note.excerpt ? (
                <span className="dh-notes-list__excerpt line-clamp-2 min-w-0 max-w-[var(--app-width-prose)] text-sm text-tertiary">
                  {note.excerpt}
                </span>
              ) : (
                <span className="dh-notes-list__excerpt dh-notes-list__excerpt--empty min-w-0 text-sm text-quaternary italic">
                  No additional text
                </span>
              )}
              {meta}
            </div>
          </>
        );

        return (
          <li
            key={note.id}
            className="dh-notes-list__row relative flex items-center gap-3 border-b border-secondary px-5 last:border-b-0 hover:bg-secondary max-md:px-4"
          >
            {deleted ? (
              <>
                <div className="dh-notes-list__item dh-notes-list__item--static flex min-w-0 flex-1 flex-col gap-1 py-3">
                  {body}
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="dh-notes-list__restore relative z-10 shrink-0"
                  disabled={pendingIds?.has(note.id)}
                  onClick={() => onRestore(note.id, note.title)}
                >
                  {pendingIds?.has(note.id) ? "Restoring…" : "Restore"}
                </Button>
              </>
            ) : (
              <Link
                to={`/notes/${encodeURIComponent(note.id)}`}
                className="dh-notes-list__item flex min-w-0 flex-1 flex-col gap-1 py-3 outline-focus-ring after:absolute after:inset-0 after:content-[''] focus-visible:outline-2 focus-visible:-outline-offset-2"
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
