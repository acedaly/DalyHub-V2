/**
 * TODAY-03 — the Waiting view (`/today/waiting`).
 *
 * A real, persistent sub-view of the Today module: the calm place to see every task
 * that is blocked on someone or something else. It reads the bounded, deterministic
 * Waiting collection through the trusted authenticated composition boundary
 * (`resolveAuthenticatedWorkspaceScope` → `tasks.listWaitingTasks`), composes the
 * shared PX-02 CollectionLayout + DS-04 Cards, and opens each task in the SAME DS-03
 * Task Drawer used on Today — so opening a waiting task keeps the owner on
 * `/today/waiting` while the shared Drawer opens (Back/Forward/Escape all work).
 *
 * "Since" and elapsed-duration labels are computed SERVER-side against one clock, so
 * they are hydration-stable (no client/server drift). Ordering is deterministic:
 * overdue first, then longest-waiting, then due date, then id (ADR-029).
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
 * The deliberate absence of a navigation entry is unchanged: Waiting is reached
 * from the attention rail and the command palette (`routes.manifest.ts`).
 */

import { env } from "cloudflare:workers";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import type { TaskFollowUpState } from "~/kernel/tasks";
import { Card, CardCollection } from "~/shared/card";
import { CollectionLayout } from "~/shared/collection-layout";
import {
  DrawerProvider,
  useDrawer,
  withDrawerPushed,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EntityIcon } from "~/shared/entity";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import { TASK_DRAWER_TITLE } from "~/shared/task-record/TaskRecordDrawer";
import { EmptyState } from "~/shared/empty-state";
import { ButtonLink } from "~/shared/ui";

import { formatTodayDate, ownerCalendarIso } from "../date";
import { renderKeyboardHelpDrawer } from "../keyboard/KeyboardHelp";
import { TaskDrawerContent } from "../task/TaskDrawerContent";
import { toWaitingCardProps } from "../task/WaitingTaskCard";
import {
  serializeWaitingItem,
  toWaitingCardData,
  type SerializedWaitingTaskItem,
} from "../task/waiting-view";
import {
  WAITING_CURSOR_PARAM,
  WAITING_FOLLOW_UP_PARAM,
  WAITING_HREF,
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
const WAITING_PAGE_SIZE = 50;

/** How each follow-up state describes the population it narrows the page to. */
const FOLLOW_UP_SUBTITLES: Record<TaskFollowUpState, string> = {
  due: "with a follow-up due",
  due_today: "with a follow-up due today",
  overdue: "with an overdue follow-up",
  upcoming: "with a follow-up still to come",
  none: "with no follow-up date",
};

export async function loader({ context, request }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);
  const followUp = parseWaitingFollowUp(url.searchParams.get(WAITING_FOLLOW_UP_PARAM));
  const cursor = url.searchParams.get(WAITING_CURSOR_PARAM) ?? undefined;
  const now = new Date();
  let timezone = DEFAULT_APP_PREFERENCES.timezone;
  let date = formatTodayDate(now, timezone);
  let todayIso = ownerCalendarIso(now, timezone);

  let items: readonly SerializedWaitingTaskItem[];
  let nextCursor: string | null;
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const preferences = await scope.appPreferences.get(session.user.subject);
    timezone = preferences.timezone;
    date = formatTodayDate(now, timezone);
    todayIso = ownerCalendarIso(now, timezone);
    const page = await scope.tasks.listWaitingTasks({
      limit: WAITING_PAGE_SIZE,
      todayIso,
      followUp,
      cursor,
    });
    items = page.items.map(serializeWaitingItem);
    nextCursor = page.nextCursor;
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
  if (kind !== "task" || id.length === 0) {
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
      <WaitingCollection
        items={loaderData.items}
        nextCursor={loaderData.nextCursor}
        followUp={loaderData.followUp}
        nowMs={loaderData.nowMs}
        todayIso={loaderData.todayIso}
        failed={loaderData.failed}
      />
    </DrawerProvider>
  );
}

/** The subset of this loader's payload a "Load more" fetch reads back. */
interface WaitingPageData {
  readonly items: readonly SerializedWaitingTaskItem[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
}

/** Stable module-level selector, so the shared hook's memo identity is stable. */
function selectWaitingPage(data: WaitingPageData) {
  return {
    items: data.items,
    nextCursor: data.nextCursor,
    failed: data.failed,
  };
}

function waitingItemId(item: SerializedWaitingTaskItem): string {
  return item.id;
}

/**
 * The subtitle, which may only ever state a number the surface can actually
 * show.
 *
 * This is the whole of DEBT-232. The old line said "`${count} tasks are waiting`"
 * over a page capped at 100, so a workspace with 150 waiting tasks was told it
 * had 100. It now counts what is LOADED and says so when more remain — a
 * statement that is true after the first page, true after "Load more", and true
 * once the collection is exhausted, without a second COUNT query to keep in step.
 */
export function waitingSubtitle(input: {
  readonly loaded: number;
  readonly hasMore: boolean;
  readonly followUp: TaskFollowUpState | null;
  readonly failed: boolean;
}): string {
  if (input.failed) return "We couldn’t load your waiting tasks.";
  const qualifier =
    input.followUp === null ? "" : ` ${FOLLOW_UP_SUBTITLES[input.followUp]}`;
  if (input.hasMore) {
    return `Showing the first ${input.loaded} waiting tasks${qualifier} — load more to see the rest.`;
  }
  if (input.loaded === 1) {
    return `1 task is waiting on someone or something else${qualifier}.`;
  }
  return `${input.loaded} tasks are waiting on someone or something else${qualifier}.`;
}

function WaitingCollection({
  items: firstPage,
  nextCursor,
  followUp,
  nowMs,
  todayIso,
  failed,
}: {
  readonly items: readonly SerializedWaitingTaskItem[];
  readonly nextCursor: string | null;
  readonly followUp: TaskFollowUpState | null;
  readonly nowMs: number;
  readonly todayIso: string;
  readonly failed: boolean;
}) {
  const { openDrawer } = useDrawer();
  const [searchParams] = useSearchParams();

  // The follow-up filter is part of the cursor's SCOPE, so it must be part of the
  // path a later page is requested from — a cursor issued under one filter is
  // rejected under another rather than reinterpreted.
  const path = useMemo(
    () =>
      followUp === null
        ? WAITING_HREF
        : `${WAITING_HREF}?${WAITING_FOLLOW_UP_PARAM}=${encodeURIComponent(followUp)}`,
    [followUp],
  );

  const { items, hasMore, loading, loadFailed, loadMore } = useKeysetPagination<
    SerializedWaitingTaskItem,
    WaitingPageData
  >({
    firstPage,
    initialCursor: nextCursor,
    path,
    select: selectWaitingPage,
    getId: waitingItemId,
  });

  const cards = useMemo(
    () => items.map((item) => toWaitingCardData(item, nowMs, todayIso)),
    [items, nowMs, todayIso],
  );

  const count = items.length;
  const subtitle = waitingSubtitle({
    loaded: count,
    hasMore,
    followUp,
    failed,
  });

  const openProps = useCallback(
    (key: string) => ({
      href: `?${withDrawerPushed(searchParams, key).toString()}`,
      onOpen: () => openDrawer(key),
    }),
    [searchParams, openDrawer],
  );

  return (
    <CollectionLayout
      title="Waiting"
      subtitle={subtitle}
      error={
        failed ? (
          <EmptyState
            title="We couldn’t load your waiting tasks"
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      isEmpty={!failed && count === 0}
      emptySlot={
        <EmptyState
          icon={<EntityIcon type="task" />}
          title={
            followUp === null
              ? "Nothing’s waiting"
              : "No follow-ups match this filter"
          }
          description={
            followUp === null
              ? "When a task is blocked on someone or something else, mark it as waiting from the task’s drawer and it will appear here."
              : "Every waiting task with a follow-up date has been dealt with. Open Waiting without a filter to see them all."
          }
          primaryAction={
            followUp === null ? undefined : (
              <ButtonLink href={WAITING_HREF} variant="secondary">
                Show all waiting tasks
              </ButtonLink>
            )
          }
        />
      }
    >
      <CardCollection
        items={cards}
        getItemId={(card) => card.id}
        ariaLabel="Waiting tasks"
        presentation="list"
        density="comfortable"
        renderCard={(card) => <Card {...toWaitingCardProps(card, openProps)} />}
      />
      {hasMore ? (
        <LoadMore
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={loadMore}
          label="Load more waiting tasks"
        />
      ) : null}
    </CollectionLayout>
  );
}
