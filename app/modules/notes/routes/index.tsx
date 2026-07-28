/**
 * NOTES-01B/NOTES-01C/NOTES-03 — the real Notes collection route (`/notes`).
 *
 * The trusted server boundary for the bounded, workspace-scoped Note
 * collection. NOTES-03 moved the read from the generic `entities.list` onto the
 * Notes READ projection (`scope.notes.list`), so filtering, ordering, the
 * excerpt and the relationship count all resolve in ONE bounded SQL statement
 * instead of listing Notes and sifting them here.
 *
 * URL is the state, in full: `?state=active|archived|deleted`, `?q=`, `?tag=`,
 * `?project=`, `?area=`, `?links=linked|unlinked`, `?sort=recent`, `?cursor=`.
 * Every filtered view is therefore shareable, Back/Forward-correct and
 * restorable, and each filter combination is its OWN bound cursor scope.
 *
 * A scope/list failure degrades to a calm error state so the shell stays usable
 * — never a 500 (mirrors `~/modules/projects/routes/index.tsx`).
 */

import { env } from "cloudflare:workers";

import type { ShouldRevalidateFunctionArgs } from "react-router";

import { InvalidNoteCursorError } from "~/kernel/notes";
import { requireAuthenticatedSession } from "~/platform/request";
import {
  resolveAuthenticatedWorkspaceScope,
  type WorkspaceScope,
} from "~/platform/workspaces";

import { NotesCollectionView } from "../NotesCollection";
import {
  parseNoteFilters,
  parseNoteState,
  serializeNoteListItem,
  type NoteFilterOption,
  type NoteFilterValues,
  type SerializedNoteListItem,
} from "../note-view";
import type { Route } from "./+types/index";

/** How many Projects/Areas the filter selects offer. Bounded, never "all". */
const FILTER_OPTION_LIMIT = 50;

export function meta() {
  return [
    { title: "Notes · DalyHub" },
    {
      name: "description",
      content: "Markdown records that document any entity in DalyHub.",
    },
  ];
}

/** Every search param this loader actually depends on. */
const LOADER_PARAMS = [
  "state",
  "cursor",
  "q",
  "tag",
  "project",
  "area",
  "links",
  "sort",
] as const;

/**
 * Opening or closing the "New Note" Drawer only toggles the `drawer` search
 * param — which this loader does not read — yet React Router would still
 * revalidate the collection on that navigation. That in-flight loader fetch can
 * race, and drop, the create-form's own navigation to the freshly-created
 * record (leaving the URL stuck on `/notes?drawer=new-note`). Skip revalidation
 * when nothing this loader actually depends on changed; every real change still
 * revalidates via the default.
 */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs): boolean {
  if (
    currentUrl.pathname === nextUrl.pathname &&
    LOADER_PARAMS.every(
      (param) =>
        currentUrl.searchParams.get(param) === nextUrl.searchParams.get(param),
    )
  ) {
    return false;
  }
  return defaultShouldRevalidate;
}

/**
 * The bounded option lists the filter selects offer. Read once per collection
 * load in three small queries; a failure degrades to an empty option list (the
 * filter simply offers less) rather than failing the whole page.
 */
async function loadFilterOptions(scope: WorkspaceScope): Promise<{
  tags: NoteFilterOption[];
  projects: NoteFilterOption[];
  areas: NoteFilterOption[];
}> {
  const [tags, projects, areas] = await Promise.all([
    scope.notes.listTags().catch(() => []),
    scope.projects
      .listProjects({ limit: FILTER_OPTION_LIMIT })
      .then((page) => page.items)
      .catch(() => []),
    scope.areas
      .listAreas({ limit: FILTER_OPTION_LIMIT })
      .then((page) => page.items)
      .catch(() => []),
  ]);
  return {
    tags: tags.map((facet) => ({
      value: facet.tag,
      label: `${facet.tag} (${facet.count})`,
    })),
    projects: projects.map((project) => ({
      value: project.id,
      label: project.title,
    })),
    areas: areas.map((area) => ({ value: area.id, label: area.title })),
  };
}

async function listNotes(
  scope: WorkspaceScope,
  state: ReturnType<typeof parseNoteState>,
  filters: NoteFilterValues,
  cursor: string | undefined,
) {
  const input = {
    state,
    sort: filters.sort,
    links: filters.links,
    ...(filters.q ? { query: filters.q } : {}),
    ...(filters.tag ? { tag: filters.tag } : {}),
    ...(filters.project ? { projectId: filters.project } : {}),
    ...(filters.area ? { areaId: filters.area } : {}),
  };
  try {
    return await scope.notes.list({ ...input, ...(cursor ? { cursor } : {}) });
  } catch (cause) {
    // A cursor is bound to the filter scope that issued it. Changing a filter
    // while a `?cursor=` is still in the URL is an ordinary thing for a user to
    // do (the state segment preserves unrelated params), and the honest answer
    // is the FIRST page of the newly-chosen scope — not an error page.
    if (cause instanceof InvalidNoteCursorError) {
      return await scope.notes.list(input);
    }
    throw cause;
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const state = parseNoteState(url.searchParams.get("state"));
  const filters = parseNoteFilters(url.searchParams);

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const [page, options] = await Promise.all([
      listNotes(scope, state, filters, cursor),
      loadFilterOptions(scope),
    ]);
    return {
      notes: page.items.map(serializeNoteListItem),
      nextCursor: page.nextCursor,
      state,
      filters,
      options,
      failed: false,
    };
  } catch {
    return {
      notes: [] as SerializedNoteListItem[],
      nextCursor: null as string | null,
      state,
      filters,
      options: {
        tags: [] as NoteFilterOption[],
        projects: [] as NoteFilterOption[],
        areas: [] as NoteFilterOption[],
      },
      failed: true,
    };
  }
}

export default function NotesRoute({ loaderData }: Route.ComponentProps) {
  return (
    <NotesCollectionView
      notes={loaderData.notes}
      nextCursor={loaderData.nextCursor}
      state={loaderData.state}
      filters={loaderData.filters}
      options={loaderData.options}
      failed={loaderData.failed}
    />
  );
}

// Re-exported so `../NotesCollection` and other callers can share the exact
// loader-data shape without re-declaring it.
export type { SerializedNoteListItem };
