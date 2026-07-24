/**
 * NOTES-01B — the real Notes collection route (`/notes`).
 *
 * Replaces the PX-03 `ModuleComingSoon` placeholder. The trusted server
 * boundary for the bounded, workspace-scoped Note collection: it reads the
 * generic `EntityRepository`'s Note projection through the authenticated
 * composition boundary (`resolveAuthenticatedWorkspaceScope`), then renders
 * the presentational `NotesCollectionView`. A scope/list failure degrades to
 * a calm error state so the shell stays usable — never a 500 (mirrors
 * `~/modules/projects/routes/index.tsx`).
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { NotesCollectionView } from "../NotesCollection";
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

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const page = await scope.entities.list({ type: "note", cursor });
    return {
      notes: page.items.map(serializeNoteListItem),
      nextCursor: page.nextCursor,
      failed: false,
    };
  } catch {
    return {
      notes: [] as SerializedNoteListItem[],
      nextCursor: null as string | null,
      failed: true,
    };
  }
}

export default function NotesRoute({ loaderData }: Route.ComponentProps) {
  return (
    <NotesCollectionView
      notes={loaderData.notes}
      nextCursor={loaderData.nextCursor}
      failed={loaderData.failed}
    />
  );
}

// Re-exported so `../NotesCollection` and other callers can share the exact
// loader-data shape without re-declaring it.
export type { SerializedNoteListItem };
