/**
 * TASKS-03 — the compact Tasks view switcher.
 *
 * **X-02 note.** The switcher itself is now the SHARED `SavedViewSwitcher`
 * (`~/shared/saved-views`), which was extracted from this file unchanged. What
 * remains here is the Tasks collection's own configuration of it — its route, its
 * copy and the BEM/test-id prefixes its stylesheet and end-to-end tests use — so
 * Tasks and cross-module views share one control instead of one each.
 */

import { SavedViewSwitcher } from "~/shared/saved-views";

import type { TasksViewOption } from "./tasks-contract";

/**
 * UIX-01 — the built-in views Tasks promotes to a permanent tab rail.
 *
 * The five an owner actually moves between during a day, in the order the
 * redesign reference puts them: what has not been filed, what is on today, what
 * is coming, everything actionable, and what is finished. The other five
 * built-ins (Overdue, Waiting, Delegated, Someday, Deleted) and every saved
 * view stay one click away in the same panel they were always in — this pins,
 * it does not hide.
 */
const PINNED_VIEW_IDS = [
  "inbox",
  "today",
  "upcoming",
  "default",
  "completed",
] as const;

export interface TasksViewSwitcherProps {
  readonly views: readonly TasksViewOption[];
  readonly activeViewId: string | null;
  readonly modified: boolean;
  /** The current configuration's query string — what "save" and "update" store. */
  readonly currentQuery: string;
  /** The shareable URL of the current configuration, for "Copy link". */
  readonly shareUrl: string;
}

export function TasksViewSwitcher({
  views,
  activeViewId,
  modified,
  currentQuery,
  shareUrl,
}: TasksViewSwitcherProps) {
  return (
    <SavedViewSwitcher
      views={views}
      activeViewId={activeViewId}
      modified={modified}
      currentQuery={currentQuery}
      shareUrl={shareUrl}
      basePath="/tasks"
      actionPath="/tasks/views"
      pinnedViewIds={PINNED_VIEW_IDS}
      collectionLabel="Tasks views"
      defaultViewLabel="Tasks view"
      newViewPlaceholder="My tasks"
      deleteExplanation="This deletes the saved view only. Your tasks are not affected, and you can save the same configuration again at any time."
      classPrefix="dh-tasks-views"
      testIdPrefix="tasks-view"
    />
  );
}
