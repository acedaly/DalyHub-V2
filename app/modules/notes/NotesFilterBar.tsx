/**
 * NOTES-03 — the Notes collection filter bar.
 *
 * Notes had exactly one control (the Active/Deleted segment) and were therefore
 * the least findable records in DalyHub. This adds the organisation the module
 * was missing — search, tag, Project, Area, relationship state and ordering —
 * WITHOUT inventing a Notes-only filtering system:
 *
 *   - the lifecycle state stays the shared `SegmentedFilter` (now three states);
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

import {
  SegmentedFilter,
  type SegmentedFilterOption,
} from "~/shared/segmented-filter";

import type {
  NoteCollectionState,
  NoteFilterOption,
  NoteFilterValues,
} from "./note-view";

const STATE_OPTIONS: readonly SegmentedFilterOption[] = [
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

  return (
    <div className="dh-notes-filters">
      <SegmentedFilter
        param="state"
        options={STATE_OPTIONS}
        value={state}
        label="Filter notes by state"
      />
      <form
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

        <p className="dh-notes-filters__field dh-notes-filters__field--grow">
          <label className="dh-notes-filters__label" htmlFor="notes-filter-q">
            Search notes
          </label>
          <input
            id="notes-filter-q"
            name="q"
            type="search"
            defaultValue={filters.q}
            placeholder="Title, content or tag"
            className="dh-notes-filters__control"
            autoComplete="off"
          />
        </p>

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
        <Select
          id="notes-filter-sort"
          name="sort"
          label="Sort"
          value={filters.sort === "created" ? "" : filters.sort}
          placeholder="Newest first"
          options={[{ value: "recent", label: "Recently updated" }]}
        />

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
