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
 */

import { env } from "cloudflare:workers";
import { useMemo } from "react";
import { useSearchParams } from "react-router";

import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
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
import { EmptyState } from "~/shared/empty-state";

import { formatTodayDate, ownerCalendarIso } from "../date";
import { renderKeyboardHelpDrawer } from "../keyboard/KeyboardHelp";
import { TaskDrawerContent } from "../task/TaskDrawerContent";
import { toWaitingCardProps } from "../task/WaitingTaskCard";
import {
  serializeWaitingItem,
  toWaitingCardData,
  type SerializedWaitingTaskItem,
} from "../task/waiting-view";
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

/** How many waiting tasks the view loads. Bounded — never an unbounded list. */
const WAITING_LIMIT = 100;

export async function loader({ context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const now = new Date();
  let timezone = DEFAULT_APP_PREFERENCES.timezone;
  let date = formatTodayDate(now, timezone);
  let todayIso = ownerCalendarIso(now, timezone);

  let items: readonly SerializedWaitingTaskItem[];
  try {
    const scope = await resolveAuthenticatedWorkspaceScope(env, session);
    const preferences = await scope.appPreferences.get(session.user.subject);
    timezone = preferences.timezone;
    date = formatTodayDate(now, timezone);
    todayIso = ownerCalendarIso(now, timezone);
    const page = await scope.tasks.listWaitingTasks({
      limit: WAITING_LIMIT,
      todayIso,
    });
    items = page.items.map(serializeWaitingItem);
  } catch {
    // A scope/list failure degrades to an empty, clearly-labelled error state
    // rather than a 500 — the shell stays usable.
    return { items: [], date, todayIso, nowMs: now.getTime(), failed: true };
  }

  return { items, date, todayIso, nowMs: now.getTime(), failed: false };
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
    title: "Task",
    description: "Task record",
    // `isTop` gates the task's keyboard-shortcut ownership when another drawer stacks.
    children: <TaskDrawerContent taskId={id} isTop={entry.isTop} />,
  };
}

export default function WaitingRoute({ loaderData }: Route.ComponentProps) {
  return (
    <DrawerProvider renderDrawer={renderWaitingDrawer}>
      <WaitingCollection
        items={loaderData.items}
        nowMs={loaderData.nowMs}
        todayIso={loaderData.todayIso}
        failed={loaderData.failed}
      />
    </DrawerProvider>
  );
}

function WaitingCollection({
  items,
  nowMs,
  todayIso,
  failed,
}: {
  readonly items: readonly SerializedWaitingTaskItem[];
  readonly nowMs: number;
  readonly todayIso: string;
  readonly failed: boolean;
}) {
  const { openDrawer } = useDrawer();
  const [searchParams] = useSearchParams();

  const cards = useMemo(
    () => items.map((item) => toWaitingCardData(item, nowMs, todayIso)),
    [items, nowMs, todayIso],
  );

  const count = items.length;
  const subtitle = failed
    ? "We couldn’t load your waiting tasks."
    : count === 1
      ? "1 task is waiting on someone or something else."
      : `${count} tasks are waiting on someone or something else.`;

  const openProps = (key: string) => ({
    href: `?${withDrawerPushed(searchParams, key).toString()}`,
    onOpen: () => openDrawer(key),
  });

  return (
    <CollectionLayout
      title="Waiting"
      subtitle={subtitle}
      entityType="task"
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
          title="Nothing’s waiting"
          description="When a task is blocked on someone or something else, mark it as waiting from the task’s drawer and it will appear here."
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
    </CollectionLayout>
  );
}
