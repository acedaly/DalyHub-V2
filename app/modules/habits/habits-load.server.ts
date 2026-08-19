/**
 * HABITS-01 / UX-02 — the Habits collection's ONE loader body.
 *
 * `/habits`, `/habits?scope=all` and `/habits/archived` are the same read with a
 * different scope, so they share this function rather than each growing their own
 * copy of the preference read, the calendar resolution and the failure behaviour.
 *
 * A scope, preference or list failure degrades to a calm error state so the
 * shell stays usable — never a 500, exactly as every other collection route
 * behaves.
 *
 * ── The three scopes, and why the default changed ───────────────────────────
 * UX-02 (Mockup 8) puts a **Today** tab first, and it is the default:
 *
 *   today     every active Habit, the ones this day ASKS FOR first. Bounded by
 *             `HABIT_OVERVIEW_LIMIT` and not paginated — it is a view of a set
 *             the page has already read in full.
 *   all       the paginated, searchable collection, unchanged from HABITS-01.
 *   archived  the same, over archived Habits.
 *
 * The default tab still shows every active Habit — nothing disappeared, the
 * ORDER changed — which is what makes the new default safe: an owner who opens
 * `/habits` sees the same records, with the day's work at the top.
 *
 * ── The query budget ────────────────────────────────────────────────────────
 * Four bounded statements, whatever the workspace holds: the preference read,
 * then `readHabitOverview`'s two, then — for `all` and `archived` only — the
 * page's two. The `today` scope draws from the overview it already has and makes
 * no page read at all. `test/unit/habits/habit-query-bounds.test.ts` asserts it.
 */

import type { AuthenticatedSession } from "~/kernel/auth";
import type { FirstDayOfWeek } from "~/kernel/preferences";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import {
  readHabitOverview,
  readHabitPage,
  type HabitOverview,
} from "~/platform/habits/habit-facts.server";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import type { WorkspaceScopeEnv } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";
import { habitDueToday, type SerializedHabit } from "~/shared/habits";

/** Which set of Habits the collection is showing. */
export type HabitCollectionScope = "today" | "all" | "archived";

export interface HabitsCollectionData {
  readonly habits: readonly SerializedHabit[];
  readonly nextCursor: string | null;
  readonly scope: HabitCollectionScope;
  readonly query: string;
  readonly todayIso: string;
  readonly firstDayOfWeek: FirstDayOfWeek;
  /** The workspace-level figures the stat row and the rail print. */
  readonly overview: HabitOverview | null;
  readonly failed: boolean;
}

/** An empty overview, for the failure state — never a set of zeroes that lie. */
function emptyData(input: {
  readonly scope: HabitCollectionScope;
  readonly query: string;
  readonly todayIso: string;
  readonly firstDayOfWeek: FirstDayOfWeek;
}): HabitsCollectionData {
  return {
    habits: [],
    nextCursor: null,
    scope: input.scope,
    query: input.query,
    todayIso: input.todayIso,
    firstDayOfWeek: input.firstDayOfWeek,
    overview: null,
    failed: true,
  };
}

/**
 * The `today` scope's order: what the day asks for, then everything else.
 *
 * Stable inside each group — the repository's own order is preserved — so the
 * list does not reshuffle when a check-in lands. Ticking a Habit must not move
 * it; that is why the partition is on `habitDueToday` (a property of the
 * SCHEDULE) rather than on whether today is done.
 */
function todayFirst(
  habits: readonly SerializedHabit[],
): readonly SerializedHabit[] {
  const due = habits.filter((habit) => habitDueToday(habit));
  const rest = habits.filter((habit) => !habitDueToday(habit));
  return [...due, ...rest];
}

/** Case-insensitive title match, for the `today` scope's bounded search. */
function matchesQuery(habit: SerializedHabit, query: string): boolean {
  return habit.title.toLowerCase().includes(query.toLowerCase());
}

export async function loadHabitsCollection(input: {
  readonly env: WorkspaceScopeEnv;
  readonly session: AuthenticatedSession;
  readonly request: Request;
  /** `archived` is decided by the ROUTE; `today` vs `all` by `?scope=`. */
  readonly archived?: boolean;
}): Promise<HabitsCollectionData> {
  const url = new URL(input.request.url);
  const query = (url.searchParams.get("q") ?? "").trim();
  const cursor = url.searchParams.get("cursor") ?? undefined;
  const scope: HabitCollectionScope =
    input.archived === true
      ? "archived"
      : url.searchParams.get("scope") === "all"
        ? "all"
        : "today";
  const now = new Date();

  let todayIso = ownerCalendarIso(now, DEFAULT_APP_PREFERENCES.timezone);
  let firstDayOfWeek = DEFAULT_APP_PREFERENCES.firstDayOfWeek;
  try {
    const workspace = await resolveAuthenticatedWorkspaceScope(
      input.env,
      input.session,
    );
    const preferences = await workspace.appPreferences.get(
      input.session.user.subject,
    );
    todayIso = ownerCalendarIso(now, preferences.timezone);
    firstDayOfWeek = preferences.firstDayOfWeek;
    const calendar = { todayIso, firstDayOfWeek };

    const overview = await readHabitOverview(workspace, calendar);

    // The `today` scope IS the overview, ordered and (when searching) narrowed.
    // No second read, and no cursor: it is a bounded set the page already holds.
    if (scope === "today") {
      const rows = todayFirst(
        query === ""
          ? overview.habits
          : overview.habits.filter((habit) => matchesQuery(habit, query)),
      );
      return {
        habits: rows,
        nextCursor: null,
        scope,
        query,
        todayIso,
        firstDayOfWeek,
        overview,
        failed: false,
      };
    }

    const page = await readHabitPage(workspace, calendar, {
      status: scope === "archived" ? "archived" : "active",
      weekHistory: true,
      ...(query === "" ? {} : { query }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    return {
      habits: page.items,
      nextCursor: page.nextCursor,
      scope,
      query,
      todayIso,
      firstDayOfWeek,
      overview,
      failed: false,
    };
  } catch {
    return emptyData({ scope, query, todayIso, firstDayOfWeek });
  }
}
