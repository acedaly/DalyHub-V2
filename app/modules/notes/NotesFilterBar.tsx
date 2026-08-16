/**
 * NOTES-03 — the Notes collection filter bar.
 *
 * Notes had exactly one control (the Active/Deleted segment) and were therefore
 * the least findable records in DalyHub. This is the organisation the module was
 * missing — search, tag, Project, Area, relationship state and ordering.
 *
 * ── CONTROL-01: it stopped being Notes' own filtering system ─────────────────
 * It used to be an ordinary GET `<form>` of native `<select>`s with an "Apply"
 * button, and the reasoning was written down: native controls give a real phone
 * picker, work with no JavaScript, and every filter lands in the URL. All true,
 * and it still produced a filtering interaction nothing else in DalyHub had.
 * Tasks, People, Assets, Meetings and Reviews narrow the moment you choose;
 * Notes made you choose, then press Apply, then look. It also meant six
 * different controls in one band — a search input, five selects and a submit —
 * where every other collection has a search field and one "Filter & sort".
 *
 * The dimensions are unchanged and the URL is unchanged. What changed is that
 * they are now declared as the SHARED `CollectionControlGroup` model, so they
 * render through the same control surface as every other collection: a
 * live-applying anchored popover on a pointer device, the shared sheet on a
 * phone, and the shared removable chips underneath. Search moves to the shared
 * debounced `CollectionSearchField`, which is the same 250ms commit the other
 * five modules use.
 *
 * What is genuinely lost is the no-JavaScript path for filtering. That is a real
 * cost and it is deliberate: the rest of the collection — the rows, the state
 * switcher, pagination — is React-rendered already, so a JavaScript-less Notes
 * page could not display results to filter in the first place.
 *
 * The lifecycle state is NOT here. It is the shared VIEW SWITCHER in the pane
 * header's view slot (UIQ-013): it selects which principal collection of Notes
 * is shown, which is a different question from the filters below it.
 */

import type { ViewSwitcherOption } from "~/shared/view-switcher";
import type { CollectionControlGroup } from "~/shared/collection-layout";

import type { NoteSortOrder } from "~/kernel/notes";

import type { NoteFilterOption, NoteFilterValues } from "./note-view";

/**
 * UIQ-013 — the three lifecycle states are the collection's principal MODE, so
 * they render through the shared view switcher in the pane header's view slot,
 * not among the filters. Exported for the collection to place.
 */
export const NOTE_STATE_OPTIONS: readonly ViewSwitcherOption[] = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
  { value: "deleted", label: "Deleted" },
];

/** The order the collection falls back to when `?sort=` is absent. */
export const DEFAULT_NOTE_SORT: NoteSortOrder = "created";

/** True when any non-default filter is set (drives the Clear affordance). */
export function hasActiveFilters(filters: NoteFilterValues): boolean {
  return (
    filters.q !== "" ||
    filters.tag !== "" ||
    filters.project !== "" ||
    filters.area !== "" ||
    filters.links !== "all" ||
    filters.sort !== DEFAULT_NOTE_SORT
  );
}

/**
 * The Notes control groups, in the shared model.
 *
 * The four narrowing dimensions are OPTION SETS the loader already resolved
 * from real records — a Note's tags, the Projects and Areas it can be linked to
 * — so they are closed sets by the time they reach here and belong in the
 * shared control surface rather than behind a server-backed picker.
 *
 * A dimension with nothing to choose from is omitted entirely: a workspace with
 * no tags yet should not be offered a "Tag" group containing only "Any tag",
 * which is a control that cannot do anything.
 */
export function noteControlGroups(inputs: {
  readonly tags: readonly NoteFilterOption[];
  readonly projects: readonly NoteFilterOption[];
  readonly areas: readonly NoteFilterOption[];
}): readonly CollectionControlGroup[] {
  const groups: CollectionControlGroup[] = [];

  if (inputs.tags.length > 0) {
    groups.push({
      id: "tag",
      label: "Tag",
      param: "tag",
      options: [{ value: "", label: "Any tag" }, ...inputs.tags],
    });
  }
  if (inputs.projects.length > 0) {
    groups.push({
      id: "project",
      label: "Project",
      param: "project",
      options: [{ value: "", label: "Any Project" }, ...inputs.projects],
    });
  }
  if (inputs.areas.length > 0) {
    groups.push({
      id: "area",
      label: "Area",
      param: "area",
      options: [{ value: "", label: "Any Area" }, ...inputs.areas],
    });
  }

  groups.push({
    id: "links",
    label: "Links",
    param: "links",
    // `all` is the URL's own name for "not narrowed", so it is the default
    // rather than the empty string: selecting it removes the param.
    defaultValue: "all",
    options: [
      { value: "all", label: "Any link state" },
      { value: "linked", label: "Linked to something" },
      { value: "unlinked", label: "Unlinked" },
    ],
  });

  groups.push({
    id: "sort",
    label: "Sort",
    param: "sort",
    // A sort is not a filter: it narrows nothing, so it must not count on the
    // trigger's active-filter badge or appear as a removable chip.
    kind: "sort",
    defaultValue: DEFAULT_NOTE_SORT,
    options: [
      { value: DEFAULT_NOTE_SORT, label: "Newest first" },
      { value: "recent", label: "Recently updated" },
    ],
  });

  return groups;
}
