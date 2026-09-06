/**
 * V2.10 LIFE-02 — the canonical Obligation record route
 * (`/obligations/:obligationId`).
 *
 * A full-page route hosting the shared DS-02 Record Layout for an obligation:
 * Overview, Linked and Activity. Data loading lives here (and in
 * `/obligations/:id/mutate`); the presentational `ObligationRecord` only renders
 * it. Fails closed with a 404 for a missing, wrong-type or cross-workspace id.
 *
 * The read is BOUNDED and flat: one statement for the obligation with its
 * subject, its subject's meter and its linked-Task state.
 */

import { env } from "cloudflare:workers";
import { useCallback } from "react";
import {
  isRouteErrorResponse,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { projectObligation } from "~/platform/obligations/obligation-facts.server";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { DrawerProvider } from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";

import { ObligationRecord } from "../ObligationRecord";
import type { Route } from "./+types/detail";

export function meta() {
  return [{ title: "Obligation · DalyHub" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const found = await scope.obligations.getWithSubject(params.obligationId);
  if (found === null) {
    throw new Response("Not Found", { status: 404 });
  }
  const todayIso = await scope.ownerTodayIso();
  return {
    obligation: projectObligation(found.obligation, todayIso, {
      subject: found.subject,
      taskOpen: found.hasOpenTask,
    }),
    todayIso,
  };
}

const TAB_IDS = ["summary", "linked", "activity"] as const;
type TabId = (typeof TAB_IDS)[number];

function parseTab(value: string | null): TabId {
  return (TAB_IDS as readonly string[]).includes(value ?? "")
    ? (value as TabId)
    : "summary";
}

export default function ObligationDetailRoute({
  loaderData,
}: Route.ComponentProps) {
  // The provider stays because the shared Linked Items surface and the command
  // palette both open Drawers from within this route's tree.
  return (
    <DrawerProvider renderDrawer={() => null}>
      <ObligationDetail {...loaderData} />
    </DrawerProvider>
  );
}

function ObligationDetail({
  obligation,
  todayIso,
}: Awaited<ReturnType<typeof loader>>) {
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabId = parseTab(searchParams.get("tab"));
  /*
   * `?complete=1` opens the record with its completion form already open. That
   * is how the collection's "Complete" reaches the ONE completion form without
   * growing a copy of it: the list navigates, the record opens the form.
   */
  const startCompleting = searchParams.get("complete") === "1";

  const onTabChange = useCallback(
    (tabId: string) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (tabId === "summary") next.delete("tab");
          else next.set("tab", tabId);
          return next;
        },
        { replace: true, preventScrollReset: true },
      );
    },
    [setSearchParams],
  );

  return (
    <ObligationRecord
      obligation={obligation}
      todayIso={todayIso}
      startCompleting={startCompleting}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      onSaved={() => revalidator.revalidate()}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="dh-obligation-not-found">
        <EmptyState
          icon={<EntityIcon type="obligation" />}
          title="We couldn’t find that obligation"
          description="It may have been deleted, or the link is out of date."
          primaryAction={
            <a className="dh-btn dh-btn--primary" href="/obligations">
              Back to Life Admin
            </a>
          }
        />
      </div>
    );
  }
  throw error;
}
