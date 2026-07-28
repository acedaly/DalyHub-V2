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
import { useCallback, useMemo } from "react";
import {
  isRouteErrorResponse,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import {
  emptyPersonRelationshipFacts,
  evaluatePersonRelationship,
  type PersonRelationship,
} from "~/kernel/relationships";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { createOwnerRelationshipContext } from "~/shared/relationships";
import {
  DrawerProvider,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";

import { PersonRecord } from "../PersonRecord";
import { RenamePersonForm } from "../RenamePersonForm";
import { serializePerson } from "../person-view";
import type { Route } from "./+types/detail";

const RENAME_KEY = "rename";

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

  let timezone = DEFAULT_APP_PREFERENCES.timezone;
  try {
    timezone = (await scope.appPreferences.get(session.user.subject)).timezone;
  } catch {
    // Keep the record reachable with the deterministic owner-calendar default.
  }

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
  };
}

export default function PersonDetailRoute({
  loaderData,
}: Route.ComponentProps) {
  const renderDrawer = useMemo(
    () =>
      createPersonDrawerRenderer(loaderData.person.id, loaderData.person.title),
    [loaderData.person.id, loaderData.person.title],
  );

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <PersonDetail {...loaderData} />
    </DrawerProvider>
  );
}

function createPersonDrawerRenderer(personId: string, title: string) {
  return function render(entry: DrawerEntry): DrawerRenderResult | null {
    if (entry.key === RENAME_KEY) {
      return {
        title: "Rename person",
        description: "Update this person’s display name.",
        children: <RenameDrawerHost personId={personId} currentTitle={title} />,
      };
    }
    return null;
  };
}

function RenameDrawerHost({
  personId,
  currentTitle,
}: {
  readonly personId: string;
  readonly currentTitle: string;
}) {
  const { closeDrawer } = useDrawer();
  const revalidator = useRevalidator();
  return (
    <RenamePersonForm
      personId={personId}
      currentTitle={currentTitle}
      onDone={() => {
        revalidator.revalidate();
        closeDrawer();
      }}
      onCancel={closeDrawer}
    />
  );
}

const TAB_IDS = [
  "summary",
  "contact",
  "linked",
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
}: Awaited<ReturnType<typeof loader>>) {
  const { openDrawer } = useDrawer();
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

  return (
    <PersonRecord
      person={person}
      relationship={relationship}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      onRename={() => openDrawer(RENAME_KEY)}
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
