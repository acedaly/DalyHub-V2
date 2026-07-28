/**
 * NOTES-01B/NOTES-01C — the real Notes collection route (`/notes`).
 *
 * Replaces the PX-03 `ModuleComingSoon` placeholder. The trusted server
 * boundary for the bounded, workspace-scoped Note collection: it reads the
 * generic `EntityRepository`'s Note projection through the authenticated
 * composition boundary (`resolveAuthenticatedWorkspaceScope`), then renders
 * the presentational `NotesCollectionView`. A scope/list failure degrades to
 * a calm error state so the shell stays usable — never a 500 (mirrors
 * `~/modules/projects/routes/index.tsx`).
 *
 * NOTES-01C adds the `?state=active|deleted` lifecycle filter (mirroring
 * Projects' `?state=` `SegmentedFilter` pattern): `deleted` lists ONLY
 * soft-deleted Notes (`entities.list({ deletedOnly: true })`) — the honest
 * "Deleted Notes" view lifecycle §F requires, with the same bounded cursor
 * pagination as the default active listing.
 */

import { env } from "cloudflare:workers";

import type { ShouldRevalidateFunctionArgs } from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import {
  NotesCollectionView,
  type NoteCollectionState,
} from "../NotesCollection";
import {
  serializeNoteListItem,
  type SerializedNoteListItem,
} from "../note-view";
import type { Route } from "./+types/index";

export function meta() {
  return [
    { title: "Notes · DalyHub" },
    {
      name: "description",
      content: "Markdown records that document any entity in DalyHub.",
    },
  ];
}

/**
 * Opening or closing the "New Note" Drawer only toggles the `drawer` search
 * param — which this loader does not read — yet React Router would still
 * revalidate the collection on that navigation. That in-flight loader fetch can
 * race, and drop, the create-form's own navigation to the freshly-created
 * record (leaving the URL stuck on `/notes?drawer=new-note`). Skip revalidation
 * when nothing this loader actually depends on (`state`, `cursor`, the path)
 * changed; every real change still revalidates via the default.
 */
export function shouldRevalidate({
  currentUrl,
  nextUrl,
  defaultShouldRevalidate,
}: ShouldRevalidateFunctionArgs): boolean {
  if (
    currentUrl.pathname === nextUrl.pathname &&
    currentUrl.searchParams.get("state") ===
      nextUrl.searchParams.get("state") &&
    currentUrl.searchParams.get("cursor") === nextUrl.searchParams.get("cursor")
  ) {
    return false;
  }
  return defaultShouldRevalidate;
}

function parseState(value: string | null): NoteCollectionState {
  return value === "deleted" ? "deleted" : "active";
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const state = parseState(url.searchParams.get("state"));

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const page = await scope.entities.list({
      type: "note",
      cursor,
      deletedOnly: state === "deleted",
    });
    return {
      notes: page.items.map(serializeNoteListItem),
      nextCursor: page.nextCursor,
      state,
      failed: false,
    };
  } catch {
    return {
      notes: [] as SerializedNoteListItem[],
      nextCursor: null as string | null,
      state,
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
      failed={loaderData.failed}
    />
  );
}

// Re-exported so `../NotesCollection` and other callers can share the exact
// loader-data shape without re-declaring it.
export type { SerializedNoteListItem };
