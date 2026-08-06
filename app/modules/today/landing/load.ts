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

import {
  DEFAULT_ATTENTION_HORIZON_DAYS,
  dedupeAttention,
  evaluateObligation,
  type AssetsTodayData,
  type AttentionInput,
} from "~/kernel/assets";
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
  deriveProductivityScore,
  deriveTaskSummary,
  greetingFor,
  dayPartForHour,
  productivityEncouragement,
} from "./insights";
import type {
  AreaHealthItem,
  DiaryMomentItem,
  DiaryWidgetData,
  GoalProgressItem,
  MeetingsWidgetData,
  RecentNoteItem,
  TodayLandingData,
  TodayMeetingItem,
} from "./types";

/** Bounds — a landing widget previews, it never lists everything. */
const NOTES_SHOWN = 5;
const DIARY_LIMIT = 12;
const DIARY_RECENT_SHOWN = 4;
const AREAS_SHOWN = 6;
const GOALS_LIMIT = 8;
const GOALS_SHOWN = 6;
/**
 * ASSET-02 — how far ahead Today looks for asset obligations. A renewal 30 days
 * out is worth knowing about; one 300 days out is not today's business (§8).
 */
const ASSETS_HORIZON_DAYS = DEFAULT_ATTENTION_HORIZON_DAYS;
/**
 * UX-01 — how many meetings each direction of "today" is read from. A day with
 * more than this many meetings is not a day the landing page can usefully
 * summarise anyway; the widget links to the full list.
 */
const MEETINGS_LIMIT = 12;
const MEETINGS_SHOWN = 6;

/** Operational facts already computed by the main loader from the planning read. */
export interface TodayLandingFacts {
  readonly now: Date;
  readonly timezone: string;
  readonly todayIso: string;
  readonly dateLong: string;
  /** The owner's first name for the hero greeting, or null when unknown. */
  readonly ownerName: string | null;
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
          const contribution = contributions.get(item.id);
          return {
            id: item.id,
            title: item.title,
            areaLabel: item.area?.title ?? null,
            alignmentState: alignment.state,
            alignmentLabel: alignment.label,
            atRisk: alignment.state === "neglected",
            // The SAME contribution read the alignment evaluation above already
            // performed — Today states the goal's roll-up, it never recomputes it.
            projectTotal: contribution?.total ?? 0,
            projectCompleted: contribution?.completed ?? 0,
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
            projectTotal,
            projectCompleted,
          }): GoalProgressItem => ({
            id,
            title,
            areaLabel,
            alignmentLabel,
            atRisk,
            projectTotal,
            projectCompleted,
          }),
        )
        .slice(0, GOALS_SHOWN)
    );
  } catch {
    return [];
  }
}

/** Owner-facing labels for a meeting's mode — the same words the record uses. */
const MEETING_MODE_LABELS: Record<string, string> = {
  in_person: "In person",
  phone: "Phone",
  online: "Online",
};

/**
 * UX-01 — the Meetings section: what is actually on today.
 *
 * TWO bounded reads, because a day has a before and an after: `recent` (started)
 * and `upcoming` (still to come) are the repository's existing views, split at
 * `now`. Both are filtered to the OWNER's calendar day — a meeting tomorrow is not
 * today's business, and the widget must never imply otherwise. Times are formatted
 * in the MEETING's own timezone (the same one its record shows), so a meeting
 * booked in another zone reads identically in both places.
 *
 * Degrades to an empty section on failure, like every other widget: Meetings being
 * unavailable must never blank Today.
 */
async function loadMeetings(
  scope: WorkspaceScope,
  todayIso: string,
  timeZone: string,
): Promise<MeetingsWidgetData> {
  try {
    const [started, upcoming] = await Promise.all([
      scope.meetings.list({ view: "recent", limit: MEETINGS_LIMIT }),
      scope.meetings.list({ view: "upcoming", limit: MEETINGS_LIMIT }),
    ]);
    const onToday = [...started.items, ...upcoming.items].filter(
      (meeting) => ownerCalendarIso(meeting.startsAt, timeZone) === todayIso,
    );
    onToday.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    const startedIds = new Set(started.items.map((meeting) => meeting.id));
    const meetings: TodayMeetingItem[] = onToday
      .slice(0, MEETINGS_SHOWN)
      .map((meeting) => ({
        id: meeting.id,
        title: meeting.title,
        timeLabel: new Intl.DateTimeFormat("en-AU", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
          timeZone: meeting.timezone,
        }).format(meeting.startsAt),
        context:
          meeting.location?.trim() ||
          (meeting.mode ? (MEETING_MODE_LABELS[meeting.mode] ?? null) : null),
        started: startedIds.has(meeting.id),
      }));

    return {
      meetings,
      remainingCount: onToday.filter((meeting) => !startedIds.has(meeting.id))
        .length,
    };
  } catch {
    return { meetings: [], remainingCount: 0 };
  }
}

/**
 * ASSET-02 — the Assets section: maintenance and renewals that need attention.
 *
 * ONE bounded, workspace-scoped repository read (never N reads for N assets), then
 * the SHARED kernel evaluator and the SHARED deduplication rule. Today never
 * re-derives obligation state and never imports the Assets module's internals — so
 * it can never disagree with the Asset record about whether the rego is overdue.
 */
async function loadAssets(
  scope: WorkspaceScope,
  todayIso: string,
): Promise<AssetsTodayData> {
  try {
    const attention = await scope.assetHistory.listAttention({
      today: todayIso,
      horizonDays: ASSETS_HORIZON_DAYS,
    });
    const inputs: AttentionInput[] = attention.map((item) => {
      const evaluation = evaluateObligation(
        item.obligation,
        todayIso,
        item.reading,
      );
      return {
        obligationId: item.obligation.id,
        assetId: item.assetId,
        assetTitle: item.assetTitle,
        assetType: item.assetType,
        title: item.obligation.title,
        category: item.obligation.category,
        state: evaluation.state,
        text: evaluation.text,
        hasOpenTask: item.hasOpenTask,
      };
    });
    return dedupeAttention(inputs);
  } catch {
    return { items: [], trackedAsTasksCount: 0, overdueCount: 0 };
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
  const [notes, diary, areas, goals, meetings, assets] = await Promise.all([
    loadNotes(scope, facts.todayIso, facts.timezone),
    loadDiary(scope, facts.todayIso, facts.timezone),
    loadAreas(scope),
    loadGoals(scope, facts.now),
    loadMeetings(scope, facts.todayIso, facts.timezone),
    loadAssets(scope, facts.todayIso),
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
      ownerName: facts.ownerName,
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
    meetings,
    insights: { signals: deriveInsights(insightsInput) },
    taskSummary: {
      ...deriveTaskSummary(insightsInput),
      dueTodayCount: facts.plannedTodayCount,
      overdueCount: facts.overdueCount,
    },
    productivity: {
      score: deriveProductivityScore(insightsInput),
      completedTodayCount: facts.completedTodayCount,
      overdueCount: facts.overdueCount,
      encouragement: productivityEncouragement(
        deriveProductivityScore(insightsInput),
        facts.completedTodayCount,
      ),
    },
    assets,
  };
}
