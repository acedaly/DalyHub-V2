import type { WorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

export interface ReviewContextItem {
  readonly id: string;
  readonly title: string;
  readonly dateLabel: string;
  readonly target:
    | { readonly kind: "route"; readonly to: string }
    | { readonly kind: "drawer"; readonly drawerKey: string };
}

export interface ReviewPeriodContext {
  readonly completedTasks: readonly ReviewContextItem[];
  readonly openTasks: readonly ReviewContextItem[];
  readonly diaryEntries: readonly ReviewContextItem[];
  readonly meetings: readonly ReviewContextItem[];
  readonly note: string;
}

function inPeriod(dateIso: string, start: string, end: string): boolean {
  return dateIso >= start && dateIso <= end;
}

function labelDate(dateIso: string): string {
  return dateIso;
}

export async function loadReviewPeriodContext(
  scope: WorkspaceScope,
  input: {
    readonly periodStart: string;
    readonly periodEnd: string;
    readonly today: string;
    readonly timezone: string;
  },
): Promise<ReviewPeriodContext> {
  const [
    completedTasks,
    overdueTasks,
    recentDiary,
    recentMeetings,
    upcomingMeetings,
  ] = await Promise.all([
    scope.tasks.listWorkspaceTasks({
      view: "completed",
      limit: 50,
      todayIso: input.today,
    }),
    scope.tasks.listWorkspaceTasks({
      view: "overdue",
      limit: 50,
      todayIso: input.today,
    }),
    scope.diary.list({ order: "newest", limit: 50 }),
    scope.meetings.list({ view: "recent", limit: 50 }),
    scope.meetings.list({ view: "upcoming", limit: 50 }),
  ]);

  const completed = completedTasks.items
    .filter((task) => {
      if (!task.completedAt) return false;
      return inPeriod(
        ownerCalendarIso(task.completedAt, input.timezone),
        input.periodStart,
        input.periodEnd,
      );
    })
    .map((task) => ({
      id: task.id,
      title: task.title,
      dateLabel: task.completedAt
        ? labelDate(ownerCalendarIso(task.completedAt, input.timezone))
        : "",
      target: { kind: "drawer" as const, drawerKey: `task:${task.id}` },
    }));

  const open = overdueTasks.items.map((task) => ({
    id: task.id,
    title: task.title,
    dateLabel: task.dueDate ? `Due ${task.dueDate}` : "Open",
    target: { kind: "drawer" as const, drawerKey: `task:${task.id}` },
  }));

  const diaryEntries = recentDiary.items
    .filter((entry) =>
      inPeriod(
        ownerCalendarIso(entry.occurredAt, input.timezone),
        input.periodStart,
        input.periodEnd,
      ),
    )
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      dateLabel: ownerCalendarIso(entry.occurredAt, input.timezone),
      target: {
        kind: "route" as const,
        to: `/diary?entry=${encodeURIComponent(entry.id)}`,
      },
    }));

  const meetings = [...recentMeetings.items, ...upcomingMeetings.items]
    .filter(
      (meeting, index, all) =>
        all.findIndex((m) => m.id === meeting.id) === index,
    )
    .filter((meeting) =>
      inPeriod(
        ownerCalendarIso(meeting.startsAt, input.timezone),
        input.periodStart,
        input.periodEnd,
      ),
    )
    .map((meeting) => ({
      id: meeting.id,
      title: meeting.title,
      dateLabel: ownerCalendarIso(meeting.startsAt, input.timezone),
      target: {
        kind: "route" as const,
        to: `/meeting/${encodeURIComponent(meeting.id)}`,
      },
    }));

  return {
    completedTasks: completed,
    openTasks: open,
    diaryEntries,
    meetings,
    note: "Live period context is read from the source modules. Review storage keeps authored reflection and links, not copied task, diary or meeting content.",
  };
}
