/**
 * NOTES-03 — the Notes collection filter bar.
 *
 * Notes had exactly one control (the Active/Deleted segment) and were therefore
 * the least findable records in DalyHub. This adds the organisation the module
 * was missing — search, tag, Project, Area, relationship state and ordering —
 * WITHOUT inventing a Notes-only filtering system:
 *
 *   - the lifecycle state is the shared VIEW SWITCHER, in the pane header's own
 *     view slot (UIQ-013) — it selects which principal collection of Notes is
 *     shown, which is a different question from the filters here;
 *   - everything else is ONE ordinary GET `<form>` whose controls are native
 *     `<input>`/`<select>` elements. That is a deliberate accessibility and
 *     mobile choice: native controls give a real on-screen keyboard and a native
 *     picker on a phone, work with no JavaScript, are keyboard-complete for
 *     free, and every filter ends up in the URL — so a filtered view is
 *     shareable, Back/Forward-correct and restorable.
 *
 * There is no auto-submit on change: arrowing through a `<select>` must not
 * navigate away under a keyboard user. "Apply" is the single, predictable commit
 * (DS-07's restraint rule), and "Clear" is offered only when something is set.
 *
 * A full DS-07 clause builder would be the wrong tool here — these are six
 * fixed, server-side dimensions, not an open predicate language.
 */

import { Link, useSearchParams } from "react-router";

import type { ViewSwitcherOption } from "~/shared/view-switcher";

import type {
  NoteCollectionState,
  NoteFilterOption,
  NoteFilterValues,
} from "./note-view";

/**
 * UIQ-013 — the three lifecycle states are the collection's principal MODE, so
 * they render through the shared view switcher in the pane header's view slot,
 * not inside this filter bar. Exported for the collection to place.
 */
export const NOTE_STATE_OPTIONS: readonly ViewSwitcherOption[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "deleted", label: "Deleted" },
];

export interface NotesFilterBarProps {
  readonly state: NoteCollectionState;
  readonly filters: NoteFilterValues;
  readonly tags: readonly NoteFilterOption[];
  readonly projects: readonly NoteFilterOption[];
  readonly areas: readonly NoteFilterOption[];
}

/** True when any non-default filter is set (drives the Clear affordance). */
export function hasActiveFilters(filters: NoteFilterValues): boolean {
  return (
    filters.q !== "" ||
    filters.tag !== "" ||
    filters.project !== "" ||
    filters.area !== "" ||
    filters.links !== "all" ||
    filters.sort !== "created"
  );
}

function Select({
  id,
  name,
  label,
  value,
  placeholder,
  options,
}: {
  readonly id: string;
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly options: readonly NoteFilterOption[];
}) {
  return (
    <p className="dh-notes-filters__field">
      <label className="dh-notes-filters__label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        defaultValue={value}
        className="dh-notes-filters__control"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </p>
  );
}

export function NotesFilterBar({
  state,
  filters,
  tags,
  projects,
  areas,
}: NotesFilterBarProps) {
  const [searchParams] = useSearchParams();
  // Preserve unrelated params (the DS-03 `drawer` stack) when clearing, and
  // always drop `cursor` — a cursor is bound to the filter scope that issued it.
  const clearParams = new URLSearchParams();
  const drawer = searchParams.get("drawer");
  if (drawer) clearParams.set("drawer", drawer);
  if (state !== "active") clearParams.set("state", state);
  const clearQuery = clearParams.toString();

  // Every dimension the form's defaults are derived from.
  const scopeKey = [
    state,
    filters.q,
    filters.tag,
    filters.project,
    filters.area,
    filters.links,
    filters.sort,
  ].join("\u0000");

  return (
    <div className="dh-notes-filters">
      {/*
        `key` remounts the form whenever the applied filter scope changes.
        The controls are deliberately UNCONTROLLED (that is what lets them work
        with no JavaScript), and React applies `defaultValue` only on mount — so
        without this, Clear, Back, Forward or a state-segment navigation would
        leave the previous values displayed, and pressing Apply again would
        silently restore filters the URL and the results had already moved past.
        Remounting is the smallest fix that keeps the no-JS behaviour intact.
      */}
      <form
        key={scopeKey}
        method="get"
        action="/notes"
        role="search"
        className="dh-notes-filters__form"
        aria-label="Filter and search notes"
      >
        {/* The lifecycle state is owned by the segment above; carry it through
            so applying a filter never silently returns the user to Active. */}
        {state !== "active" ? (
          <input type="hidden" name="state" value={state} />
        ) : null}
        {drawer ? <input type="hidden" name="drawer" value={drawer} /> : null}

        {/*
          UIX-04 §7/§37 — the search field's visible label is its placeholder.

          The control is still named for assistive tech (the label element is
          only visually hidden, never removed), and the placeholder repeats the
          same words, so nothing is lost to anyone — but the band stops spending
          a stacked label row on a control whose purpose a search input already
          announces by its shape. That is most of the height §7 objects to.
        */}
        <p className="dh-notes-filters__field dh-notes-filters__field--grow">
          <label
            className="dh-notes-filters__label dh-visually-hidden"
            htmlFor="notes-filter-q"
          >
            Search notes
          </label>
          <input
            id="notes-filter-q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Search notes"
            className="dh-notes-filters__control"
            autoComplete="off"
          />
        </p>

        <Select
          id="notes-filter-sort"
          name="sort"
          label="Sort"
          value={filters.sort === "created" ? "" : filters.sort}
          placeholder="Newest first"
          options={[{ value: "recent", label: "Recently updated" }]}
        />

        {/*
         * M3X-02 — the four NARROWING dimensions move behind a disclosure.
         *
         * Search and Sort are what a Notes directory is used with every time;
         * Tag, Project, Area and link state are what it is used with
         * occasionally. Six native selects in one band spent ~150px of the
         * widest module in the product on controls that are usually all set to
         * "Any" (audit H8), and on a phone it collapsed into a full viewport of
         * chrome before the first note (M4).
         *
         * A native `<details>`, INSIDE the same form. That matters:
         *   - a control inside a closed `<details>` is still submitted, so
         *     "Apply" behaves identically and the no-JS path is untouched;
         *   - it is keyboard-complete and screen-reader-announced with no ARIA
         *     and no JavaScript, which is why it is not a bespoke popover;
         *   - `open` is driven by the APPLIED filters, so a narrowed result set
         *     never hides the reason it is narrowed.
         */}
        <details
          className="dh-notes-filters__more"
          open={
            filters.tag !== "" ||
            filters.project !== "" ||
            filters.area !== "" ||
            filters.links !== "all"
          }
        >
          <summary className="dh-notes-filters__more-summary">
            More filters
          </summary>
          <div className="dh-notes-filters__more-fields">
            <Select
              id="notes-filter-tag"
              name="tag"
              label="Tag"
              value={filters.tag}
              placeholder="Any tag"
              options={tags}
            />
            <Select
              id="notes-filter-project"
              name="project"
              label="Project"
              value={filters.project}
              placeholder="Any project"
              options={projects}
            />
            <Select
              id="notes-filter-area"
              name="area"
              label="Area"
              value={filters.area}
              placeholder="Any area"
              options={areas}
            />
            <Select
              id="notes-filter-links"
              name="links"
              label="Links"
              value={filters.links === "all" ? "" : filters.links}
              placeholder="Any"
              options={[
                { value: "linked", label: "Linked to something" },
                { value: "unlinked", label: "Unlinked" },
              ]}
            />
          </div>
        </details>

        <p className="dh-notes-filters__actions">
          <button type="submit" className="dh-btn dh-btn--secondary">
            Apply
          </button>
          {hasActiveFilters(filters) ? (
            <Link
              to={clearQuery.length > 0 ? `/notes?${clearQuery}` : "/notes"}
              className="dh-notes-filters__clear"
              preventScrollReset
            >
              Clear filters
            </Link>
          ) : null}
        </p>
      </form>
    </div>
  );
}
