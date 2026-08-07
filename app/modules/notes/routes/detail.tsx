/**
 * NOTES-01B/NOTES-02/NOTES-03 — canonical Note record route (`/notes/:noteId`).
 *
 * A full-page route, NOT a Drawer — long-form Note editing is
 * DESIGN_SYSTEM.md's flagged exception that warrants the full Record Layout
 * surface (mirrors how `~/modules/goals/routes/detail.tsx` and
 * `~/modules/projects/routes/detail.tsx` already host their canonical
 * records). The Drawer here hosts the "Edit tags" form; the title is edited in
 * place on the heading (EDIT-02), so there is no rename form left to host.
 *
 * The loader server-renders the FIRST page of the note's backlinks and outgoing
 * links, so the relationship tabs are populated without JavaScript and without a
 * loading flash; `/notes/:noteId/references` serves any further page. Both go
 * through the same trusted composition, and an archived note still opens (only a
 * DELETED note 404s — the kernel's own contract).
 */

import { env } from "cloudflare:workers";
import { useCallback, useMemo } from "react";
import {
  isRouteErrorResponse,
  useRevalidator,
  useSearchParams,
} from "react-router";

import type { SanitizedMarkdownHtml } from "~/kernel/markdown";
import {
  DEFAULT_REFERENCE_PAGE,
  loadNoteReferences,
} from "~/platform/entity-links/note-references";
import { renderMarkdownSource } from "~/platform/markdown";
import { readAiAvailability } from "~/platform/ai";
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
import { AiExtractionSurface } from "~/shared/ai";
import { LinkedItemsTab } from "~/shared/linked-items";
import type { ReferencePage } from "~/shared/references";

import { NoteActivityTab } from "../NoteActivityTab";
import { NoteBacklinksTab, NoteLinksTab } from "../NoteReferences";
import { NoteOverview } from "../NoteOverview";
import { NoteTagsForm } from "../NoteTagsForm";
import {
  effectiveNoteUpdatedAt,
  serializeNoteDetails,
  serializeNoteOverview,
} from "../note-view";
import type { NoteMutationResult } from "./mutate";
import type { Route } from "./+types/detail";

const TAGS_KEY = "tags";

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
  const content = details?.content ?? "";

  // Both directions in parallel. Each is one bounded EntityLink page plus (for
  // note counterparts) ONE batched context query — never a query per row.
  // A relationship failure must not cost the user their note, so each degrades
  // to an empty page and the tab shows its calm empty state.
  const [backlinks, outgoing] = await Promise.all([
    loadNoteReferences(scope, noteId, "incoming", {
      limit: DEFAULT_REFERENCE_PAGE,
      anchorTitle: entity.title,
    }).catch<ReferencePage>(() => ({ items: [], nextCursor: null })),
    loadNoteReferences(scope, noteId, "outgoing", {
      limit: DEFAULT_REFERENCE_PAGE,
      anchorTitle: entity.title,
      anchorSource: content,
    }).catch<ReferencePage>(() => ({ items: [], nextCursor: null })),
  ]);

  // NOTES-05 §21 — the print-only body, rendered here through the ONE FND-08
  // pipeline. Rendering it server-side keeps printing instantaneous and keeps
  // the renderer out of the client bundle for this route; a render failure
  // degrades to no printable body rather than costing the user the record.
  let printHtml: SanitizedMarkdownHtml | null = null;
  if (content.trim() !== "") {
    try {
      printHtml = renderMarkdownSource(content).html;
    } catch {
      printHtml = null;
    }
  }

  return {
    // AI-01 — availability only: whether the action can run, never a credential.
    aiAvailability: await readAiAvailability(
      scope,
      session.user.subject,
      "note-action-extraction",
      env,
    ),
    overview: serializeNoteOverview(entity),
    details: serializeNoteDetails(details),
    backlinks,
    outgoing,
    printHtml,
  };
}

export default function NoteDetailRoute({ loaderData }: Route.ComponentProps) {
  const renderDrawer = useMemo(
    () =>
      createNoteDrawerRenderer(loaderData.overview.id, loaderData.details.tags),
    [loaderData.overview.id, loaderData.details.tags],
  );

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <NoteDetail {...loaderData} />
    </DrawerProvider>
  );
}

function createNoteDrawerRenderer(noteId: string, tags: readonly string[]) {
  return function render(entry: DrawerEntry): DrawerRenderResult | null {
    if (entry.key === TAGS_KEY) {
      return {
        title: "Edit tags",
        description: "Tags group notes across projects and areas.",
        children: <TagsDrawerHost noteId={noteId} currentTags={tags} />,
      };
    }
    return null;
  };
}

function TagsDrawerHost({
  noteId,
  currentTags,
}: {
  readonly noteId: string;
  readonly currentTags: readonly string[];
}) {
  const { closeDrawer } = useDrawer();
  const revalidator = useRevalidator();
  return (
    <NoteTagsForm
      noteId={noteId}
      currentTags={currentTags}
      onDone={() => {
        revalidator.revalidate();
        closeDrawer();
      }}
      onCancel={closeDrawer}
    />
  );
}

/**
 * The tab is CONTROLLED from the URL, so this allowlist is what a tab can be.
 * A tab missing from it is unreachable — clicking it writes `?tab=…` and this
 * immediately maps the value back to "note" — which is why "ai" belongs here
 * alongside the rest rather than only in the tab list.
 */
function parseTab(
  value: string | null,
): "note" | "backlinks" | "linked" | "ai" | "activity" {
  return value === "activity" ||
    value === "linked" ||
    value === "backlinks" ||
    value === "ai"
    ? value
    : "note";
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

  /**
   * DS-16 — the Note rename, driven from the record heading.
   *
   * It posts the SAME `rename` intent to the SAME trusted endpoint the Drawer
   * form used, so every server-side rule is untouched: the workspace is resolved
   * server-side, the id is verified to be an active Note in it, and an
   * `EntityValidationError` still produces the field message. Only the surface
   * changed — and with it the failure behaviour, since `useInlineEdit` keeps the
   * typed title in the field where closing the Drawer used to discard it.
   */
  const noteId = props.overview.id;
  const onRename = useCallback(
    async (title: string) => {
      const body = new FormData();
      body.set("intent", "rename");
      body.set("title", title);
      let result: NoteMutationResult;
      try {
        const response = await fetch(
          `/notes/${encodeURIComponent(noteId)}/mutate`,
          { method: "POST", body, headers: { accept: "application/json" } },
        );
        result = (await response.json()) as NoteMutationResult;
      } catch {
        return {
          ok: false,
          message: "That couldn’t be saved. Your text is safe — try again.",
        } as const;
      }
      if (result.kind === "rename" && result.ok) {
        revalidator.revalidate();
        return { ok: true } as const;
      }
      return {
        ok: false,
        message:
          (result.kind === "rename" && !result.ok
            ? (result.fieldErrors?.title ?? result.formError)
            : undefined) ??
          "That couldn’t be saved. Your text is safe — try again.",
      } as const;
    },
    [noteId, revalidator],
  );

  return (
    <NoteOverview
      overview={props.overview}
      details={props.details}
      onRename={onRename}
      onEditTags={() => openDrawer(TAGS_KEY)}
      onSaved={() => revalidator.revalidate()}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      printHtml={props.printHtml}
      backlinksTab={
        <NoteBacklinksTab noteId={props.overview.id} page={props.backlinks} />
      }
      linksTab={
        <NoteLinksTab
          noteId={props.overview.id}
          page={props.outgoing}
          linkedItems={
            <LinkedItemsTab
              anchorId={props.overview.id}
              anchorType="note"
              readOnly={props.details.archivedAt !== null}
              linkCommandTarget={{
                kind: "route",
                to: `/notes/${props.overview.id}?tab=linked`,
              }}
            />
          }
        />
      }
      aiTab={
        <AiExtractionSurface
          feature="note-action-extraction"
          recordId={props.overview.id}
          recordLabel="Note"
          availability={props.aiAvailability}
          readOnly={props.details.archivedAt !== null}
        />
      }
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
          title="We couldn’t find that note"
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
