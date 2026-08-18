/**
 * HABITS-01 — the canonical Habit record route (`/habits/:habitId`).
 *
 * A full-page route hosting the shared DS-02 Record Layout for a Habit: Summary,
 * Schedule, Linked and Activity. Data loading lives here (and in
 * `/habits/:id/mutate` and `/habits/:id/check-in`); the presentational
 * `HabitRecord` only renders it. Fails closed with a 404 for a missing,
 * wrong-type or cross-workspace id (mirrors `~/modules/people/routes/detail.tsx`).
 *
 * The record's history is a BOUNDED read: the Habit plus four weeks of
 * completions, two statements whatever the history holds.
 */

import { env } from "cloudflare:workers";
import { useCallback } from "react";
import {
  isRouteErrorResponse,
  useRevalidator,
  useSearchParams,
} from "react-router";

import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { readHabitRecord } from "~/platform/habits/habit-facts.server";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { DrawerProvider } from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { ownerCalendarIso } from "~/shared/datetime";

import { HabitRecord } from "../HabitRecord";
import type { Route } from "./+types/detail";

export function meta() {
  return [{ title: "Habit · DalyHub" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  let preferences = DEFAULT_APP_PREFERENCES;
  try {
    preferences = await scope.appPreferences.get(session.user.subject);
  } catch {
    // A missing preference row must never take the record down; the documented
    // defaults are the honest fallback (AUDIT-14).
  }
  const todayIso = ownerCalendarIso(new Date(), preferences.timezone);
  const habit = await readHabitRecord(scope, params.habitId, {
    todayIso,
    firstDayOfWeek: preferences.firstDayOfWeek,
  });
  if (habit === null) {
    throw new Response("Not Found", { status: 404 });
  }
  return { habit, todayIso, firstDayOfWeek: preferences.firstDayOfWeek };
}

const TAB_IDS = ["summary", "schedule", "linked", "activity"] as const;
type TabId = (typeof TAB_IDS)[number];

function parseTab(value: string | null): TabId {
  return (TAB_IDS as readonly string[]).includes(value ?? "")
    ? (value as TabId)
    : "summary";
}

export default function HabitDetailRoute({ loaderData }: Route.ComponentProps) {
  // The provider stays because the shared Linked Items surface and the command
  // palette both open Drawers from within this route's tree.
  return (
    <DrawerProvider renderDrawer={() => null}>
      <HabitDetail {...loaderData} />
    </DrawerProvider>
  );
}

function HabitDetail({
  habit,
  todayIso,
  firstDayOfWeek,
}: Awaited<ReturnType<typeof loader>>) {
  const revalidator = useRevalidator();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTabId = parseTab(searchParams.get("tab"));

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
    <HabitRecord
      habit={habit}
      todayIso={todayIso}
      firstDayOfWeek={firstDayOfWeek}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      onSaved={() => revalidator.revalidate()}
    />
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="dh-habit-not-found">
        <EmptyState
          icon={<EntityIcon type="habit" />}
          title="We couldn’t find that habit"
          description="It may have been deleted, or the link is out of date."
          primaryAction={
            <a className="dh-btn dh-btn--primary" href="/habits">
              Back to Habits
            </a>
          }
        />
      </div>
    );
  }
  throw error;
}
