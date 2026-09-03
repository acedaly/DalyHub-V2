/**
 * TODAY-03 — the Waiting view (`/today/waiting`).
 *
 * A real, persistent sub-view of the Today module: the calm place to see every task
 * that is blocked on someone or something else. It reads the bounded, deterministic
 * Waiting collection through the trusted authenticated composition boundary
 * (`resolveAuthenticatedWorkspaceScope` → `tasks.listWaitingTasks`), composes the
 * shared PX-02 CollectionLayout over the shared Task row, and opens each task in
 * the SAME DS-03 Task Drawer used on Today — so opening a waiting task keeps the
 * owner on `/today/waiting` while the shared Drawer opens (Back/Forward/Escape all
 * work).
 *
 * The server's instant and the owner's calendar day are resolved HERE, once, so
 * the row's "since · elapsed" and follow-up wording are computed against one
 * clock and are hydration-stable (no client/server drift). Ordering is
 * deterministic: overdue first, then longest-waiting, then due date, then id
 * (ADR-029).
 *
 * ── V2.7 RECALL-03: the surface became honest, and askable (DEBT-232/DEBT-231) ──
 *
 * It used to read `LIMIT 100` with no cursor and render "100 tasks are waiting on
 * someone or something else." — the truncated number, stated as the whole
 * population, on the surface whose entire job is "what am I waiting on". Two
 * things changed and nothing else did:
 *
 *   1. **It pages.** The repository issues the standard keyset cursor and the
 *      shared `useKeysetPagination` + `LoadMore` accumulate pages without
 *      navigating, exactly as the Projects, Goals and Tasks collections do. Row
 *      101 is reachable, and the subtitle states what is LOADED plus whether more
 *      remain — it never states a bound as a total again.
 *   2. **It takes the follow-up filter.** `?followUp=` names a state from the ONE
 *      declarative Task vocabulary, resolved by the same repository predicate
 *      `/tasks?followUp=` resolves. It is the destination Today's attention rail
 *      links its "N follow-ups due" fact to, which is what makes the stated
 *      number and this list the same population by construction.
 *
 * ── V2.8 CONV-02: the rows are the SHARED Task row (DEBT-128) ──────────────
 *
 * The route reads the same list-item shape every other Task surface reads and
 * hands it to `WaitingTasks`, which renders the shared `TaskRow` inside the
 * shared `TaskList` with the shared host — so a waiting Task can be completed,
 * renamed, re-dated, re-prioritised, re-filed and opened HERE, and the waiting
 * fact it carries is the row's own optional slot rather than a Card's metadata
 * run. The read is widened, not multiplied: the page is still ONE statement,
 * and the parent candidates the row's inline Project editor offers are ONE
 * bounded read per surface load (never per row, never per "Load more" page).
 *
 * The deliberate absence of a navigation entry is unchanged: Waiting is reached
 * from the attention rail and the command palette (`routes.manifest.ts`).
 */

import { env } from "cloudflare:workers";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import {
  DrawerProvider,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { TASK_DRAWER_TITLE } from "~/shared/task-record/TaskRecordDrawer";
import type { TaskParentOption } from "~/shared/task-record/TaskRowFields";
import { loadTaskParentOptions } from "~/shared/task-record/task-parent-options.server";
import {
  serializeTaskListItem,
  type SerializedTaskListItem,
} from "~/shared/task-record/task-view";

import { formatTodayDate, ownerCalendarIso } from "../date";
import { renderKeyboardHelpDrawer } from "../keyboard/KeyboardHelp";
import { TaskDrawerContent } from "../task/TaskDrawerContent";
import { WaitingTasks } from "../task/WaitingTasks";
import {
  WAITING_CURSOR_PARAM,
  WAITING_FOLLOW_UP_PARAM,
  parseWaitingFollowUp,
} from "../waiting-destination";
import type { Route } from "./+types/waiting";

export function meta() {
  return [
    { title: "Waiting · DalyHub" },
    {
      name: "description",
      content: "Tasks blocked on someone or something else.",
    },
  ];
}

/**
 * How many waiting tasks ONE page loads.
 *
 * Still bounded — a page is always bounded — but no longer a ceiling: the page
 * carries a keyset cursor, so "Load more" walks past it as many times as the
 * collection needs. It is deliberately smaller than the old 100-row cap, because
 * a page is now the first screenful rather than the whole answer.
 */
export const WAITING_PAGE_SIZE = 50;

export async function loader({ context, request }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);
  const followUp = parseWaitingFollowUp(
    url.searchParams.get(WAITING_FOLLOW_UP_PARAM),
  );
  const cursor = url.searchParams.get(WAITING_CURSOR_PARAM) ?? undefined;
  const now = new Date();
  let timezone = DEFAULT_APP_PREFERENCES.timezone;
  let date = formatTodayDate(now, timezone);
  let todayIso = ownerCalendarIso(now, timezone);

  let items: readonly SerializedTaskListItem[];
  let nextCursor: string | null;
  let parents: readonly TaskParentOption[];
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const preferences = await scope.appPreferences.get(session.user.subject);
    timezone = preferences.timezone;
    date = formatTodayDate(now, timezone);
    todayIso = ownerCalendarIso(now, timezone);
    /*
     * V2.8 CONV-02 — the page, and (on a SURFACE load only) the parent
     * candidates, concurrently. A "Load more" request carries a cursor and
     * reads the page alone: the candidates do not change with the cursor, and
     * a read per page would be a read the row does not need.
     */
    const [page, candidates] = await Promise.all([
      scope.tasks.listWaitingTasks({
        limit: WAITING_PAGE_SIZE,
        todayIso,
        followUp,
        cursor,
      }),
      cursor === undefined
        ? loadTaskParentOptions(scope.tasks)
        : Promise.resolve<readonly TaskParentOption[]>([]),
    ]);
    items = page.items.map((item) => serializeTaskListItem(item));
    nextCursor = page.nextCursor;
    parents = candidates;
  } catch {
    // A scope/list failure degrades to an empty, clearly-labelled error state
    // rather than a 500 — the shell stays usable. A stale or tampered cursor
    // lands here too, which is the calm outcome: the owner sees the error state
    // and reloading `/today/waiting` returns page one.
    return {
      items: [],
      nextCursor: null,
      followUp: followUp ?? null,
      date,
      todayIso,
      nowMs: now.getTime(),
      parents: [],
      failed: true,
    };
  }

  return {
    items,
    nextCursor,
    followUp: followUp ?? null,
    date,
    todayIso,
    nowMs: now.getTime(),
    parents,
    failed: false,
  };
}

/** A Drawer renderer scoped to this view: it opens task records only. */
function renderWaitingDrawer(entry: DrawerEntry): DrawerRenderResult | null {
  // The keyboard-shortcuts reference (TODAY-05) is hosted by the same Drawer.
  const help = renderKeyboardHelpDrawer(entry);
  if (help !== null) {
    return help;
  }
  const separator = entry.key.indexOf(":");
  const kind = separator === -1 ? entry.key : entry.key.slice(0, separator);
  const id = separator === -1 ? "" : entry.key.slice(separator + 1);
  /*
   * V2.8 CONV-02 — `task-move:` resolves to the SAME record.
   *
   * The shared row's overflow carries "Move to Project or Area…", which opens
   * `task-move:<id>` — the key `/tasks`, Today, Plan and the Project record
   * have resolved to the Task's record since CONTROL-01 §4. There is no
   * Waiting-specific move surface.
   */
  if ((kind !== "task" && kind !== "task-move") || id.length === 0) {
    return null;
  }
  return {
    title: TASK_DRAWER_TITLE,
    // `isTop` gates the task's keyboard-shortcut ownership when another drawer stacks.
    children: <TaskDrawerContent taskId={id} isTop={entry.isTop} />,
  };
}

export default function WaitingRoute({ loaderData }: Route.ComponentProps) {
  return (
    <DrawerProvider renderDrawer={renderWaitingDrawer}>
      <WaitingTasks
        items={loaderData.items}
        nextCursor={loaderData.nextCursor}
        followUp={loaderData.followUp}
        nowMs={loaderData.nowMs}
        todayIso={loaderData.todayIso}
        parents={loaderData.parents}
        failed={loaderData.failed}
      />
    </DrawerProvider>
  );
}
