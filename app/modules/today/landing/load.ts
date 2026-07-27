/**
 * TODAY-08 — assemble the command-centre landing payload from REAL workspace reads.
 *
 * One place that turns workspace-scoped repository reads (notes, diary, areas,
 * goals-with-alignment) into the calm, serialised widget payloads the surface
 * renders. Everything is bounded, degrades to an empty section on failure (never a
 * 500), and reuses the SHARED derivations (`~/shared/alignment` alignment evaluator)
 * — never a Today-only re-derivation. Today reads other modules' data only through
 * these workspace-scoped repositories and the shared kernel, never by importing a
 * module's internals (the module import boundary holds).
 */

import type { WorkspaceScope } from "~/platform/workspaces";
import {
  composeGoalAlignmentFacts,
  createOwnerAlignmentContext,
  evaluateGoalAlignment,
} from "~/shared/alignment";
import { ownerCalendarIso } from "~/shared/datetime";

import {
  briefFocusLine,
  deriveInsights,
  greetingFor,
  dayPartForHour,
} from "./insights";
import type {
  AreaHealthItem,
  DiaryMomentItem,
  DiaryWidgetData,
  GoalProgressItem,
  RecentNoteItem,
  TodayLandingData,
} from "./types";

/** Bounds — a landing widget previews, it never lists everything. */
const NOTES_SHOWN = 5;
const DIARY_LIMIT = 12;
const DIARY_RECENT_SHOWN = 4;
const AREAS_SHOWN = 6;
const GOALS_LIMIT = 8;
const GOALS_SHOWN = 6;

/** Operational facts already computed by the main loader from the planning read. */
export interface TodayLandingFacts {
  readonly now: Date;
  readonly timezone: string;
  readonly todayIso: string;
  readonly dateLong: string;
  readonly plannedTodayCount: number;
  readonly overdueCount: number;
  readonly inboxCount: number;
  readonly waitingCount: number;
  readonly completedTodayCount: number;
  readonly activeProjectCount: number;
  readonly projectsNeedingAttentionCount: number;
}

/** The owner-local hour (0–23), for the greeting — never the UTC runtime hour. */
function ownerLocalHour(now: Date, timeZone: string): number {
  const raw = new Intl.DateTimeFormat("en-AU", {
    hour: "numeric",
    hour12: false,
    timeZone,
  }).format(now);
  return Number.parseInt(raw, 10) % 24;
}

/** The owner-local wall-clock time of an instant ("11:15"). */
function ownerLocalTime(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  }).format(instant);
}

/** A calm relative label for how recently a record was created. */
function relativeDayLabel(
  instant: Date,
  todayIso: string,
  timeZone: string,
): string {
  const iso = ownerCalendarIso(instant, timeZone);
  if (iso === todayIso) {
    return "Today";
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.round(
    (Date.parse(`${todayIso}T00:00:00Z`) - Date.parse(`${iso}T00:00:00Z`)) /
      dayMs,
  );
  if (diff === 1) {
    return "Yesterday";
  }
  if (diff > 1 && diff < 7) {
    return `${diff} days ago`;
  }
  return new Intl.DateTimeFormat("en-AU", {
    day: "numeric",
    month: "short",
    timeZone,
  }).format(instant);
}

/** Humanise a diary entry-type token ("phone_call" → "Phone call"). */
function humaniseType(entryType: string): string {
  const spaced = entryType.replace(/[_-]+/g, " ").trim();
  return spaced.length === 0
    ? "Moment"
    : spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

async function loadNotes(
  scope: WorkspaceScope,
  todayIso: string,
  timeZone: string,
): Promise<readonly RecentNoteItem[]> {
  try {
    // The TRUE newest notes (dedicated newest-first bounded projection) — never the
    // oldest `entities.list` page re-sorted, which would be wrong once a workspace
    // has more than `NOTES_SHOWN` notes.
    const notes = await scope.entities.listRecentByType("note", NOTES_SHOWN);
    return notes.map((note) => ({
      id: note.id,
      title: note.title,
      createdLabel: `Created ${relativeDayLabel(note.createdAt, todayIso, timeZone)}`,
    }));
  } catch {
    return [];
  }
}

async function loadDiary(
  scope: WorkspaceScope,
  todayIso: string,
  timeZone: string,
): Promise<DiaryWidgetData> {
  try {
    const page = await scope.diary.list({
      limit: DIARY_LIMIT,
      order: "newest",
    });
    const moments: DiaryMomentItem[] = page.items.map((entry) => ({
      id: entry.id,
      title: entry.title,
      typeLabel: humaniseType(entry.entryType),
      timeLabel: ownerLocalTime(entry.occurredAt, timeZone),
      isToday: ownerCalendarIso(entry.occurredAt, timeZone) === todayIso,
    }));
    const today = moments.filter((moment) => moment.isToday);
    const recent = moments
      .filter((moment) => !moment.isToday)
      .slice(0, DIARY_RECENT_SHOWN);
    return { today, recent, capturedToday: today.length > 0 };
  } catch {
    return { today: [], recent: [], capturedToday: false };
  }
}

async function loadAreas(
  scope: WorkspaceScope,
): Promise<readonly AreaHealthItem[]> {
  try {
    const page = await scope.areas.listAreas({ limit: AREAS_SHOWN });
    return page.items.map((area) => ({
      id: area.id,
      title: area.title,
      goalTotal: area.rollup.goals.total,
      activeProjectCount: area.activeProjectCount,
      openProjectCount:
        area.rollup.projects.total - area.rollup.projects.completed,
      // A quiet, non-alarming "review" cue: an area with no active project has no
      // work in motion. Never rendered as danger/red (the anti-guilt mandate).
      needsReview: area.activeProjectCount === 0,
    }));
  } catch {
    return [];
  }
}

async function loadGoals(
  scope: WorkspaceScope,
  now: Date,
): Promise<readonly GoalProgressItem[]> {
  try {
    const { evaluation, recentWindowStartIso, recentBoundaryStartIso } =
      createOwnerAlignmentContext(now);
    const page = await scope.goals.listGoalsByAlignment({
      activeBoundaryIso: recentBoundaryStartIso,
    });
    const items = page.items.slice(0, GOALS_LIMIT);
    const ids = items.map((item) => item.id);
    const [contributions, activityFacts] = await Promise.all([
      scope.goals.listGoalProjectContributions(ids),
      scope.alignment.listGoalAlignmentFacts(ids, { recentWindowStartIso }),
    ]);
    return (
      items
        .map((item) => {
          const facts = composeGoalAlignmentFacts({
            goalId: item.id,
            completedAt: item.completedAt,
            contribution: contributions.get(item.id) ?? {
              total: 0,
              completed: 0,
              incomplete: 0,
              active: 0,
              planned: 0,
              onHold: 0,
              archived: 0,
            },
            activity: activityFacts.get(item.id),
          });
          const alignment = evaluateGoalAlignment(facts, evaluation);
          return {
            id: item.id,
            title: item.title,
            areaLabel: item.area?.title ?? null,
            alignmentState: alignment.state,
            alignmentLabel: alignment.label,
            atRisk: alignment.state === "neglected",
          };
        })
        // The widget is "Goals in progress": drop completed goals so they never fill
        // it in a workspace with few open goals (`listGoalsByAlignment` returns
        // completed goals too, ranked last).
        .filter((goal) => goal.alignmentState !== "completed")
        .map(
          ({
            id,
            title,
            areaLabel,
            alignmentLabel,
            atRisk,
          }): GoalProgressItem => ({
            id,
            title,
            areaLabel,
            alignmentLabel,
            atRisk,
          }),
        )
        .slice(0, GOALS_SHOWN)
    );
  } catch {
    return [];
  }
}

/**
 * Load the whole landing payload. Each section degrades independently, so one
 * module's read failing never blanks the others; the Morning Brief and Insights are
 * computed from the facts the caller already read + the derived section results.
 */
export async function loadTodayLanding(
  scope: WorkspaceScope,
  facts: TodayLandingFacts,
): Promise<TodayLandingData> {
  const [notes, diary, areas, goals] = await Promise.all([
    loadNotes(scope, facts.todayIso, facts.timezone),
    loadDiary(scope, facts.todayIso, facts.timezone),
    loadAreas(scope),
    loadGoals(scope, facts.now),
  ]);

  const areasNeedingReviewCount = areas.filter(
    (area) => area.needsReview,
  ).length;
  const goalsAtRiskCount = goals.filter((goal) => goal.atRisk).length;

  const insightsInput = {
    overdueCount: facts.overdueCount,
    plannedTodayCount: facts.plannedTodayCount,
    inboxCount: facts.inboxCount,
    waitingCount: facts.waitingCount,
    completedTodayCount: facts.completedTodayCount,
    activeProjectCount: facts.activeProjectCount,
    projectsNeedingAttentionCount: facts.projectsNeedingAttentionCount,
    areasNeedingReviewCount,
    goalsAtRiskCount,
    hasDiaryToday: diary.capturedToday,
  };

  return {
    morningBrief: {
      greeting: greetingFor(
        dayPartForHour(ownerLocalHour(facts.now, facts.timezone)),
      ),
      dateLong: facts.dateLong,
      focusLine: briefFocusLine(insightsInput),
      plannedTodayCount: facts.plannedTodayCount,
      overdueCount: facts.overdueCount,
      inboxCount: facts.inboxCount,
    },
    notes,
    diary,
    areas,
    goals: { goals },
    insights: { signals: deriveInsights(insightsInput) },
  };
}
