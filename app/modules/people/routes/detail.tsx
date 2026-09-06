/**
 * PEOPLE-01 / PEOPLE-03 — canonical Person record route (`/person/:personId`).
 *
 * A full-page route hosting the shared DS-02 Record Layout for a Person: Summary,
 * Contact details, Timeline, Linked records, Notes and Settings. Data loading and
 * mutations live here (and in `/person/:id/mutate`); the presentational
 * `PersonRecord` only renders them. The Drawer hosts the "Rename" form. Fails
 * closed with a 404 for a missing/wrong-type/cross-workspace id (mirrors
 * `~/modules/notes/routes/detail.tsx`).
 *
 * PEOPLE-03 adds the DERIVED relationship: the loader gathers the Person's
 * relationship facts in one bounded, N+1-free read (`scope.relationships`) and
 * evaluates them with the owner-calendar clock. Nothing is stored — the summary and
 * the stay-in-touch state are recomputed on every load and every revalidation, so
 * they can never drift from the timeline on the Activity tab. A facts failure
 * degrades to the honest zero relationship rather than failing the record.
 */

import { env } from "cloudflare:workers";
import { useCallback } from "react";
import {
  isRouteErrorResponse,
  useRevalidator,
  useSearchParams,
} from "react-router";

import {
  emptyPersonRelationshipFacts,
  evaluatePersonRelationship,
  type PersonRelationship,
} from "~/kernel/relationships";
import { loadRecordAttachments } from "~/platform/attachments";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { createOwnerRelationshipContext } from "~/shared/relationships";
import { DrawerProvider } from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";

import { PersonRecord } from "../PersonRecord";
import { serializePerson } from "../person-view";
import type { PersonMutationResult } from "./mutate";
import type { Route } from "./+types/detail";

export function meta() {
  return [{ title: "Person · DalyHub" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const personId = params.personId;
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const person = await scope.people.get(personId);
  if (!person) {
    throw new Response("Not Found", { status: 404 });
  }

  // AUDIT-14 — the owner's timezone from the ONE scope-level authority,
  // resolved once per request and shared with every other module that
  // asks what day it is. Degrades to the documented default on a read
  // failure, so a missing preference never takes the page down.
  const timezone = await scope.ownerTimeZone();

  // The DERIVED relationship (PEOPLE-03): one bounded, grouped facts read over the
  // Person's EntityLinks and the Activity those linked records wrote, evaluated
  // with the owner-calendar clock and the Person's own follow-up settings. Never
  // cached, never stored — see `~/kernel/relationships`.
  let facts = emptyPersonRelationshipFacts(personId);
  try {
    facts = await scope.relationships.getPersonRelationshipFacts(personId);
  } catch {
    // A facts failure must never take the record down: the relationship simply
    // reads as "no shared history yet" until the next load. The timeline on the
    // Activity tab remains the authoritative history either way.
  }
  const relationship: PersonRelationship = evaluatePersonRelationship(
    facts,
    createOwnerRelationshipContext(new Date(), timezone, {
      followUpFrequency: person.followUpFrequency,
      nextFollowUpIso: person.nextFollowUp,
    }),
  );

  // Linked records across every module are loaded client-side by the shared
  // Linked Items section (the universal `/links` endpoint), so no per-module link
  // loading lives here anymore.
  return {
    person: serializePerson(person),
    relationship,
    // V2.11 FILE-01 — a document about this person, kept privately.
    attachments: await loadRecordAttachments(scope, person.id),
  };
}

export default function PersonDetailRoute({
  loaderData,
}: Route.ComponentProps) {
  // EDIT-02 — the Person record no longer opens any Drawer of its own (the
  // rename form was the only one). The provider stays because the shared
  // Linked Items surface and the command palette both open Drawers from within
  // this route's tree.
  return (
    <DrawerProvider renderDrawer={() => null}>
      <PersonDetail {...loaderData} />
    </DrawerProvider>
  );
}

const TAB_IDS = [
  "summary",
  "contact",
  "linked",
  "evidence",
  "notes",
  "activity",
  "settings",
] as const;
type TabId = (typeof TAB_IDS)[number];

function parseTab(value: string | null): TabId {
  return (TAB_IDS as readonly string[]).includes(value ?? "")
    ? (value as TabId)
    : "summary";
}

function PersonDetail({
  person,
  relationship,
  attachments,
}: Awaited<ReturnType<typeof loader>>) {
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabId = parseTab(searchParams.get("tab"));

  const onTabChange = useCallback(
    (tabId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tabId === "summary") {
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
   * DS-16 — the Person rename, driven from the record heading.
   *
   * The SAME `rename` intent, the SAME trusted endpoint, the SAME server-side
   * checks (an active Person in this workspace, `EntityValidationError` for a
   * bad title). Only the surface — and the failure behaviour — changed.
   */
  const personId = person.id;
  const onRename = useCallback(
    async (title: string) => {
      const body = new FormData();
      body.set("intent", "rename");
      body.set("title", title);
      let result: PersonMutationResult;
      try {
        const response = await fetch(
          `/person/${encodeURIComponent(personId)}/mutate`,
          { method: "POST", body },
        );
        result = (await response.json()) as PersonMutationResult;
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
    [personId, revalidator],
  );

  return (
    <PersonRecord
      person={person}
      relationship={relationship}
      attachments={attachments}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      onRename={onRename}
      onSaved={() => revalidator.revalidate()}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="dh-person-not-found">
        <EmptyState
          icon={<EntityIcon type="person" />}
          title="We couldn’t find that person"
          description="They may have been deleted, or the link is out of date."
          primaryAction={
            <a className="dh-btn dh-btn--primary" href="/people">
              Back to People
            </a>
          }
        />
      </div>
    );
  }
  throw error;
}
