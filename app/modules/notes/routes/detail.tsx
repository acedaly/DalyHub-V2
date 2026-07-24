/**
 * NOTES-01B — canonical Note record route (`/notes/:noteId`).
 *
 * A full-page route, NOT a Drawer — long-form Note editing is
 * DESIGN_SYSTEM.md's flagged exception that warrants the full Record Layout
 * surface (mirrors how `~/modules/goals/routes/detail.tsx` and
 * `~/modules/projects/routes/detail.tsx` already host their canonical
 * records). The Drawer here hosts ONLY the "Rename" form, exactly like
 * Goals/Projects.
 */

import { env } from "cloudflare:workers";
import { useCallback, useMemo } from "react";
import {
  isRouteErrorResponse,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import {
  DrawerProvider,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";

import { NoteActivityTab } from "../NoteActivityTab";
import { NoteOverview } from "../NoteOverview";
import { RenameNoteForm } from "../RenameNoteForm";
import {
  effectiveNoteUpdatedAt,
  serializeNoteDetails,
  serializeNoteOverview,
} from "../note-view";
import type { Route } from "./+types/detail";

const RENAME_KEY = "rename";

export function meta() {
  return [{ title: "Note · DalyHub" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const noteId = params.noteId;
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const entity = await scope.entities.getById(noteId);
  if (!entity || entity.type !== "note") {
    throw new Response("Not Found", { status: 404 });
  }

  const details = await scope.noteDetails.get(noteId);

  return {
    overview: serializeNoteOverview(entity),
    details: serializeNoteDetails(details),
  };
}

export default function NoteDetailRoute({ loaderData }: Route.ComponentProps) {
  const renderDrawer = useMemo(
    () =>
      createNoteDrawerRenderer(
        loaderData.overview.id,
        loaderData.overview.title,
      ),
    [loaderData.overview.id, loaderData.overview.title],
  );

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <NoteDetail {...loaderData} />
    </DrawerProvider>
  );
}

function createNoteDrawerRenderer(noteId: string, title: string) {
  return function render(entry: DrawerEntry): DrawerRenderResult | null {
    if (entry.key === RENAME_KEY) {
      return {
        title: "Rename note",
        description: "Give this note a clearer title.",
        children: <RenameDrawerHost noteId={noteId} currentTitle={title} />,
      };
    }
    return null;
  };
}

function RenameDrawerHost({
  noteId,
  currentTitle,
}: {
  readonly noteId: string;
  readonly currentTitle: string;
}) {
  const { closeDrawer } = useDrawer();
  const revalidator = useRevalidator();
  return (
    <RenameNoteForm
      noteId={noteId}
      currentTitle={currentTitle}
      onDone={() => {
        revalidator.revalidate();
        closeDrawer();
      }}
      onCancel={closeDrawer}
    />
  );
}

function parseTab(value: string | null): "note" | "activity" {
  return value === "activity" ? value : "note";
}

function NoteDetail(props: Awaited<ReturnType<typeof loader>>) {
  const { openDrawer } = useDrawer();
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabId = parseTab(searchParams.get("tab"));

  const onTabChange = useCallback(
    (tabId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tabId === "note") {
            next.delete("tab");
          } else {
            next.set("tab", tabId);
          }
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  return (
    <NoteOverview
      overview={props.overview}
      details={props.details}
      onRename={() => openDrawer(RENAME_KEY)}
      onSaved={() => revalidator.revalidate()}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      activityTab={
        // `reloadKey` is the Note's EFFECTIVE updatedAt (the later of the
        // generic entity's own `updatedAt` and `noteDetails.contentUpdatedAt`
        // — NOTES_PERSISTENCE.md's content-timestamp contract explicitly
        // leaves this combination to the UI, mirrors ADR-037 §37.2 for
        // Projects/Goals): a rename bumps the entity's `updatedAt`, and a
        // content save bumps `contentUpdatedAt` instead, so either one
        // changes this key and revalidation re-reads the first Activity page
        // with the new event visible immediately.
        <NoteActivityTab
          noteId={props.overview.id}
          reloadKey={effectiveNoteUpdatedAt(
            props.overview.updatedAt,
            props.details.contentUpdatedAt,
          )}
        />
      }
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="dh-note-not-found">
        <EmptyState
          icon={<EntityIcon type="note" />}
          title="We couldn't find that note"
          description="It may have been deleted, or the link is out of date."
          primaryAction={
            <a className="dh-btn dh-btn--primary" href="/notes">
              Back to Notes
            </a>
          }
        />
      </div>
    );
  }
  throw error;
}
