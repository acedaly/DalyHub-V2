/**
 * HABITS-01 — the Habits collection's ONE loader body.
 *
 * `/habits` and `/habits/archived` are the same read with a different lifecycle
 * scope, so they share this function rather than each growing their own copy of
 * the preference read, the calendar resolution and the failure behaviour.
 *
 * A scope, preference or list failure degrades to a calm error state so the
 * shell stays usable — never a 500, exactly as every other collection route
 * behaves.
 */

import type { AuthenticatedSession } from "~/kernel/auth";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { readHabitPage } from "~/platform/habits/habit-facts.server";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { WorkspaceScopeEnv } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";
import type { SerializedHabit } from "~/shared/habits";

export interface HabitsCollectionData {
  readonly habits: readonly SerializedHabit[];
  readonly nextCursor: string | null;
  readonly status: "active" | "archived";
  readonly query: string;
  readonly todayIso: string;
  readonly failed: boolean;
}

export async function loadHabitsCollection(input: {
  readonly env: WorkspaceScopeEnv;
  readonly session: AuthenticatedSession;
  readonly request: Request;
  readonly status: "active" | "archived";
}): Promise<HabitsCollectionData> {
  const url = new URL(input.request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const now = new Date();

  let todayIso = ownerCalendarIso(now, DEFAULT_APP_PREFERENCES.timezone);
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(
      input.env,
      input.session,
    );
    const preferences = await scope.appPreferences.get(
      input.session.user.subject,
    );
    todayIso = ownerCalendarIso(now, preferences.timezone);
    const page = await readHabitPage(
      scope,
      { todayIso, firstDayOfWeek: preferences.firstDayOfWeek },
      {
        status: input.status,
        ...(query === "" ? {} : { query }),
        ...(cursor === undefined ? {} : { cursor }),
      },
    );
    return {
      habits: page.items,
      nextCursor: page.nextCursor,
      status: input.status,
      query,
      todayIso,
      failed: false,
    };
  } catch {
    return {
      habits: [],
      nextCursor: null,
      status: input.status,
      query,
      todayIso,
      failed: true,
    };
  }
}
