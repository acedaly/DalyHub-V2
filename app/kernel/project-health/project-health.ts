/**
 * PROJ-02 Project Health kernel — the pure, storage-independent health model.
 *
 * A DERIVED, NON-PERSISTED projection over the FND-07 spine, the TODAY-02/03/04
 * task-detail slice and the FND-05 Activity stream (ADR-035). Nothing here is stored
 * or cached: a project's health is recomputed from live facts every read, so it can
 * never drift from tasks, Activity or the rollup (mirroring the spine's "rollups are
 * derived, never cached" ethos, ADR-014 §4.6). This module owns ONLY the rules — the
 * facts are gathered by the workspace-scoped `ProjectHealthRepository`
 * (`project-health-repository.ts`), and every value it needs is a number, a `Date`
 * or a date-only string, never a display string.
 *
 * The evaluator is a pure function of (facts, clock): given the same facts and the
 * same injected clock it returns the same result, so the exhaustive rule matrix is
 * unit-tested WITHOUT a database, a React tree or the wall clock. Health decisions
 * are made from STRUCTURED fields only — a test never parses a user-facing string to
 * assert behaviour (roadmap §10).
 *
 * Calm, honest tone (PRODUCT_PRINCIPLES / PRODUCT_EXPERIENCE): reasons are factual
 * and non-judgmental, stronger tones are reserved for genuinely overdue or blocked
 * work, and ordinary inactivity never uses an aggressive red. Health never invents
 * status vocabulary that competes with the project's open/completed state or a task's
 * workflow status (PROJ-05 owns a richer project status model).
 */

import type { ProjectWorkflowStatus } from "~/kernel/project-settings";

/* -------------------------------------------------------------------------- */
/* Domain thresholds — named, documented constants (never buried in React)     */
/* -------------------------------------------------------------------------- */

/**
 * A project with open work but no meaningful activity for this many owner-calendar
 * days is STALE. Rationale: a fortnight is a calm review cadence — long enough that
 * a genuinely progressing project will have logged some momentum (a task created,
 * completed, planned or a note of progress), short enough that a truly dormant
 * project surfaces before it is forgotten. The boundary is INCLUSIVE: exactly
 * `STALE_AFTER_DAYS` days of inactivity reads as stale.
 */
export const STALE_AFTER_DAYS = 14;

/**
 * A task that has been waiting for at least this many owner-calendar days is a
 * LONG-RUNNING blocker worth surfacing on its own, even when the project still has
 * other actionable work. Same fortnight rationale as staleness: a wait measured in
 * weeks is no longer "just parked".
 */
export const LONG_WAIT_AFTER_DAYS = 14;

/**
 * Due/scheduled work falling within this many owner-calendar days (inclusive of
 * today) is "upcoming" — surfaced as calm on-track context, never as an attention
 * signal. A week ahead is the planning horizon the Today surface already uses.
 */
export const UPCOMING_WITHIN_DAYS = 7;

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The presentation tone of a health signal. A strict subset of the shared
 * `CardTone`/`RecordTone` vocabulary (identical string values, mapped 1:1 by the
 * view), so a health tone drops straight into a Card/Record status pill. `accent`
 * is deliberately excluded — it is an identity cue, never a status (DESIGN_SYSTEM).
 * Meaning is ALWAYS carried by the paired text label too, never by colour alone.
 */
export type HealthTone = "neutral" | "success" | "info" | "warning" | "danger";

/**
 * The stable, machine-readable primary health state. Chosen to NOT collide with
 * existing DalyHub vocabulary: `open`/`completed` is the project's completion state
 * (not health), `todo`/`in_progress` is a task's workflow status, and a richer
 * project status model is PROJ-05's. These five are health-only.
 *
 * - `on_track`  — open and progressing (or simply empty); no attention signal.
 * - `stale`     — open with work but no meaningful activity past the threshold.
 * - `blocked`   — open, and its remaining open work is effectively all waiting.
 * - `at_risk`   — open with overdue due work or slipped scheduled commitments.
 * - `completed` — the project itself is complete (calm; not an active warning).
 */
export const PROJECT_HEALTH_STATES = [
  "on_track",
  "stale",
  "blocked",
  "at_risk",
  "completed",
] as const;
export type ProjectHealthState = (typeof PROJECT_HEALTH_STATES)[number];

/**
 * A stable, machine-readable reason code. Every health result carries one or more,
 * primary reason first — the UI shows secondary causes without discarding them, and
 * tests assert on the code (and its structured numbers), never on display prose.
 */
export const HEALTH_REASON_CODES = [
  "no_tasks",
  "on_track",
  "overdue",
  "slipped",
  "blocked",
  "waiting",
  "long_waiting",
  "stale",
  "upcoming_due",
  "upcoming_scheduled",
  "completed",
  "completed_open_tasks",
] as const;
export type HealthReasonCode = (typeof HEALTH_REASON_CODES)[number];

/* -------------------------------------------------------------------------- */
/* Facts (the evaluator's input)                                               */
/* -------------------------------------------------------------------------- */

/**
 * The raw, workspace-scoped facts a single project's health is derived from —
 * gathered in bounded, N+1-free queries by the `ProjectHealthRepository`. Counts
 * follow the spine project-rollup definition exactly: ACTIVE (non-deleted) direct
 * child tasks linked by an active `task.belongs_to_project` link. The per-task
 * signal counts (`waitingOpen`/`overdueOpen`/…) count only OPEN (non-completed)
 * tasks — a completed task never triggers an open-work warning.
 *
 * No free-text waiting subject ever appears here (privacy: ADR-035 §35.6) — only
 * counts and the single oldest `waiting_since` instant.
 */
export type ProjectHealthFacts = {
  readonly projectId: string;
  /** The project's own completion instant, or null when open. */
  readonly completedAt: Date | null;
  readonly createdAt: Date;
  /** The project ENTITY's own `updated_at` (bumped by project rename/complete only). */
  readonly updatedAt: Date;
  /** Total active direct child tasks (matches the spine rollup). */
  readonly taskTotal: number;
  /** Completed active direct child tasks (matches the spine rollup). */
  readonly taskCompleted: number;
  /** Open tasks currently waiting (`waiting_since` set, not completed). */
  readonly waitingOpen: number;
  /** Open tasks whose due date is before today (owner calendar). */
  readonly overdueOpen: number;
  /** Open tasks whose scheduled (planned) date is before today. */
  readonly slippedOpen: number;
  /** Open tasks due within `UPCOMING_WITHIN_DAYS` (today inclusive). */
  readonly upcomingDueOpen: number;
  /** Open tasks scheduled within `UPCOMING_WITHIN_DAYS` (today inclusive). */
  readonly upcomingScheduledOpen: number;
  /** Oldest `waiting_since` among open waiting tasks, or null when none wait. */
  readonly oldestWaitingSince: Date | null;
  /**
   * The most recent MEANINGFUL activity instant across the project AND its child
   * tasks (see `MEANINGFUL_HEALTH_ACTIVITY_TYPES`), or null when none is recorded
   * (e.g. the project predates the Activity stream).
   */
  readonly lastMeaningfulActivityAt: Date | null;
};

/* -------------------------------------------------------------------------- */
/* Result (the evaluator's output — fully JSON-safe)                           */
/* -------------------------------------------------------------------------- */

/** One explained reason. Structured fields drive tests and the UI; `summary` is a
 * calm factual fallback string. */
export type HealthReason = {
  readonly code: HealthReasonCode;
  readonly tone: HealthTone;
  /** A calm, factual, non-judgmental one-liner. */
  readonly summary: string;
  /** A relevant count (tasks overdue / waiting / …), when the reason has one. */
  readonly count?: number;
  /** A relevant duration in owner-calendar days (since activity / longest wait). */
  readonly days?: number;
  /** A relevant owner-calendar date `YYYY-MM-DD` (e.g. last activity), when any. */
  readonly date?: string;
};

/** The supporting facts the UI renders alongside the reasons (all JSON-safe). */
export type ProjectHealthSummary = {
  readonly taskTotal: number;
  readonly taskCompleted: number;
  readonly openTotal: number;
  readonly actionableOpen: number;
  readonly waitingOpen: number;
  readonly overdueOpen: number;
  readonly slippedOpen: number;
  readonly upcomingDueOpen: number;
  readonly upcomingScheduledOpen: number;
  /** Owner-calendar days the longest-waiting open task has waited, or null. */
  readonly longestWaitingDays: number | null;
  /** The reference last-activity instant (ISO), or null when none is known. */
  readonly lastActivityIso: string | null;
  /** The owner-calendar date of the last activity `YYYY-MM-DD`, or null. */
  readonly lastActivityDate: string | null;
  /** Owner-calendar days since the last meaningful activity, or null. */
  readonly daysSinceActivity: number | null;
  /** Progress percent (0–100), or null for an empty project (never 100%). */
  readonly progressPercent: number | null;
};

/** A project's derived health — a stable state, a calm label, a tone, explained
 * reasons, supporting facts and the evaluation time. Entirely JSON-serialisable so
 * a loader returns it straight to the browser. */
export type ProjectHealth = {
  readonly state: ProjectHealthState;
  /** The calm user-facing label for the primary state. */
  readonly label: string;
  /** The presentation tone (the primary reason's tone). */
  readonly tone: HealthTone;
  /** One or more reasons, primary first. Never empty. */
  readonly reasons: readonly HealthReason[];
  readonly summary: ProjectHealthSummary;
  /** The instant health was evaluated (ISO-8601 UTC). */
  readonly evaluatedAtIso: string;
};

/**
 * Shared visibility rule for active-work health. A health warning is presented
 * only for a Project that is incomplete, non-archived and actively worked. Planned,
 * on-hold, completed and archived Projects may still have evaluated facts, but
 * they do not create an active warning on Project, Today, Area or Goal surfaces.
 */
export function isProjectHealthVisible(project: {
  readonly status: ProjectWorkflowStatus;
  readonly completedAt: unknown;
  readonly archivedAt: unknown;
}): boolean {
  return (
    project.status === "active" &&
    project.completedAt === null &&
    project.archivedAt === null
  );
}

/**
 * The injected clock + owner-calendar seam. Passed in (never read from the ambient
 * wall clock) so the rule matrix is deterministic: tests supply a fixed `now`,
 * `todayIso` and calendar mapping. In production the loader builds it from
 * `~/shared/datetime` (owner timezone), so "today"/"overdue"/"days since" match the
 * owner's calendar day, not the UTC runtime's.
 */
export type HealthEvaluationContext = {
  /** The instant health is evaluated at. */
  readonly now: Date;
  /** The owner's current calendar date `YYYY-MM-DD`. */
  readonly todayIso: string;
  /** Map an arbitrary instant to its owner-calendar date `YYYY-MM-DD`. */
  readonly calendarIsoOf: (instant: Date) => string;
};

/* -------------------------------------------------------------------------- */
/* Pure date-only helpers (no timezone — operate on `YYYY-MM-DD` calendar dates) */
/* -------------------------------------------------------------------------- */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Parse a `YYYY-MM-DD` calendar date to a UTC-midnight epoch-day count. Date-only
 * values are never routed through a timezone (ADR-030); UTC midnight is a stable,
 * DST-free anchor for day arithmetic. */
function epochDay(iso: string): number {
  if (!ISO_DATE.test(iso)) {
    throw new RangeError(`Not a YYYY-MM-DD calendar date: ${iso}`);
  }
  const [y, m, d] = iso.split("-").map((part) => Number(part));
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/**
 * Whole owner-calendar days from `fromIso` up to `toIso` (positive when `toIso` is
 * later). Both are date-only `YYYY-MM-DD`; the result is a stable integer day
 * difference used for staleness and wait durations.
 */
export function daysBetweenIsoDates(fromIso: string, toIso: string): number {
  return epochDay(toIso) - epochDay(fromIso);
}

/** Add `days` to a `YYYY-MM-DD` calendar date, returning a `YYYY-MM-DD` date. Used
 * to compute the inclusive upcoming-window boundary for the facts query. */
export function addDaysToIsoDate(iso: string, days: number): string {
  const date = new Date((epochDay(iso) + days) * 86_400_000);
  const y = date.getUTCFullYear().toString().padStart(4, "0");
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/* -------------------------------------------------------------------------- */
/* The evaluator                                                               */
/* -------------------------------------------------------------------------- */

function pluralTasks(n: number): string {
  return n === 1 ? "task" : "tasks";
}

/**
 * Derive a project's health from its facts and the injected clock.
 *
 * Precedence for the PRIMARY state (documented in ADR-035 §35.3):
 *   completed → at_risk → blocked → stale → on_track
 * A completed project never shows an active warning (only a calm note when open
 * tasks remain). For an open project, a missed commitment (overdue/slipped) is the
 * most urgent and concrete signal, then fully-blocked work, then prolonged
 * inactivity. Whichever state wins, EVERY applicable reason is preserved in
 * `reasons` (primary first) so the UI keeps the secondary causes.
 */
export function evaluateProjectHealth(
  facts: ProjectHealthFacts,
  ctx: HealthEvaluationContext,
): ProjectHealth {
  const openTotal = Math.max(0, facts.taskTotal - facts.taskCompleted);
  const actionableOpen = Math.max(0, openTotal - facts.waitingOpen);
  const evaluatedAtIso = ctx.now.toISOString();

  // Reference activity: prefer the aggregated meaningful activity across the project
  // and its child tasks; fall back to the project entity's own updated_at (always
  // present) when the Activity stream has no meaningful event yet.
  const referenceActivity = facts.lastMeaningfulActivityAt ?? facts.updatedAt;
  const lastActivityDate = ctx.calendarIsoOf(referenceActivity);
  const daysSinceActivity = daysBetweenIsoDates(lastActivityDate, ctx.todayIso);
  const longestWaitingDays =
    facts.oldestWaitingSince === null
      ? null
      : Math.max(
          0,
          daysBetweenIsoDates(
            ctx.calendarIsoOf(facts.oldestWaitingSince),
            ctx.todayIso,
          ),
        );
  const progressPercent =
    facts.taskTotal <= 0
      ? null
      : Math.round((facts.taskCompleted / facts.taskTotal) * 100);

  const summary: ProjectHealthSummary = {
    taskTotal: facts.taskTotal,
    taskCompleted: facts.taskCompleted,
    openTotal,
    actionableOpen,
    waitingOpen: facts.waitingOpen,
    overdueOpen: facts.overdueOpen,
    slippedOpen: facts.slippedOpen,
    upcomingDueOpen: facts.upcomingDueOpen,
    upcomingScheduledOpen: facts.upcomingScheduledOpen,
    longestWaitingDays,
    lastActivityIso: facts.lastMeaningfulActivityAt
      ? facts.lastMeaningfulActivityAt.toISOString()
      : null,
    lastActivityDate: facts.lastMeaningfulActivityAt ? lastActivityDate : null,
    daysSinceActivity: facts.lastMeaningfulActivityAt
      ? daysSinceActivity
      : null,
    progressPercent,
  };

  // --- Completed project: calm, never an active warning. -------------------
  if (facts.completedAt !== null) {
    const reasons: HealthReason[] = [];
    if (openTotal > 0) {
      reasons.push({
        code: "completed_open_tasks",
        tone: "info",
        summary: `Completed with ${openTotal} open ${pluralTasks(openTotal)} remaining`,
        count: openTotal,
      });
    }
    reasons.push({
      code: "completed",
      tone: "success",
      summary: "This project is complete",
    });
    return {
      state: "completed",
      label: "Completed",
      tone: reasons[0].tone,
      reasons,
      summary,
      evaluatedAtIso,
    };
  }

  // --- Empty open project: calm, not 100% and not at risk. -----------------
  if (facts.taskTotal <= 0) {
    return {
      state: "on_track",
      label: "No tasks yet",
      tone: "neutral",
      reasons: [
        {
          code: "no_tasks",
          tone: "neutral",
          summary: "No tasks yet",
        },
      ],
      summary,
      evaluatedAtIso,
    };
  }

  // --- Open project with tasks: collect every applicable reason. -----------
  const reasons: HealthReason[] = [];

  if (facts.overdueOpen > 0) {
    reasons.push({
      code: "overdue",
      tone: "danger",
      summary: `${facts.overdueOpen} ${pluralTasks(facts.overdueOpen)} past ${facts.overdueOpen === 1 ? "its" : "their"} due date`,
      count: facts.overdueOpen,
    });
  }
  if (facts.slippedOpen > 0) {
    reasons.push({
      code: "slipped",
      tone: "warning",
      summary: `${facts.slippedOpen} planned ${pluralTasks(facts.slippedOpen)} past ${facts.slippedOpen === 1 ? "its" : "their"} scheduled date`,
      count: facts.slippedOpen,
    });
  }

  const fullyBlocked =
    openTotal > 0 && actionableOpen === 0 && facts.waitingOpen > 0;
  if (fullyBlocked) {
    reasons.push({
      code: "blocked",
      tone: "warning",
      summary: `All ${openTotal} open ${pluralTasks(openTotal)} ${openTotal === 1 ? "is" : "are"} waiting on something else`,
      count: openTotal,
    });
  } else if (facts.waitingOpen > 0) {
    reasons.push({
      code: "waiting",
      tone: "info",
      summary: `${facts.waitingOpen} of ${openTotal} open ${pluralTasks(openTotal)} waiting`,
      count: facts.waitingOpen,
    });
  }
  if (
    longestWaitingDays !== null &&
    longestWaitingDays >= LONG_WAIT_AFTER_DAYS
  ) {
    reasons.push({
      code: "long_waiting",
      tone: "warning",
      summary: `Longest wait is ${longestWaitingDays} days`,
      days: longestWaitingDays,
    });
  }

  // Staleness only applies while there is OPEN work: a project whose active tasks are
  // all complete is on track, not "stale", however long ago that happened.
  const isStale = openTotal > 0 && daysSinceActivity >= STALE_AFTER_DAYS;
  if (isStale) {
    reasons.push({
      code: "stale",
      tone: "info",
      summary: `No progress in ${daysSinceActivity} days`,
      days: daysSinceActivity,
      date: summary.lastActivityDate ?? undefined,
    });
  }

  if (facts.upcomingDueOpen > 0) {
    reasons.push({
      code: "upcoming_due",
      tone: "neutral",
      summary: `${facts.upcomingDueOpen} ${pluralTasks(facts.upcomingDueOpen)} due soon`,
      count: facts.upcomingDueOpen,
    });
  }
  if (facts.upcomingScheduledOpen > 0) {
    reasons.push({
      code: "upcoming_scheduled",
      tone: "neutral",
      summary: `${facts.upcomingScheduledOpen} ${pluralTasks(facts.upcomingScheduledOpen)} scheduled soon`,
      count: facts.upcomingScheduledOpen,
    });
  }

  // Primary state by precedence.
  const atRisk = facts.overdueOpen > 0 || facts.slippedOpen > 0;
  let state: ProjectHealthState;
  let label: string;
  if (atRisk) {
    state = "at_risk";
    label = "At risk";
  } else if (fullyBlocked) {
    state = "blocked";
    label = "Blocked";
  } else if (isStale) {
    state = "stale";
    label = "Stale";
  } else {
    state = "on_track";
    label = "On track";
  }

  // Order reasons so the one matching the primary state leads; the rest keep their
  // collection order (severity-ish: overdue, slipped, blocked/waiting, long_waiting,
  // stale, upcoming). This never discards a secondary reason.
  const primaryCode: HealthReasonCode =
    state === "at_risk"
      ? facts.overdueOpen > 0
        ? "overdue"
        : "slipped"
      : state === "blocked"
        ? "blocked"
        : state === "stale"
          ? "stale"
          : "on_track";

  if (state === "on_track" && reasons.length === 0) {
    reasons.push({
      code: "on_track",
      tone: "success",
      summary:
        summary.progressPercent === 100
          ? "All tasks complete"
          : "Progressing with no attention signals",
    });
  } else if (state === "on_track") {
    // Only upcoming/waiting-context reasons apply; lead with a calm on-track note.
    reasons.unshift({
      code: "on_track",
      tone: "success",
      summary: "On track",
    });
  } else {
    const primaryIndex = reasons.findIndex((r) => r.code === primaryCode);
    if (primaryIndex > 0) {
      const [primary] = reasons.splice(primaryIndex, 1);
      reasons.unshift(primary);
    }
  }

  return {
    state,
    label,
    tone: reasons[0].tone,
    reasons,
    summary,
    evaluatedAtIso,
  };
}

/**
 * The MEANINGFUL activity event types that count as project momentum for staleness
 * (ADR-035 §35.4). Genuine progress, planning and workflow on the project or its
 * child tasks — creation, edits, completion/reopen, planning and waiting changes.
 * Deliberately EXCLUDED as not "momentum": structural `entity_link.*` plumbing,
 * `entity.deleted`/`entity.restored` (tidying, not progress) and events on unrelated
 * entity kinds. There are no read/view events in the model, so passive reads can
 * never inflate momentum.
 */
export const MEANINGFUL_HEALTH_ACTIVITY_TYPES = [
  "entity.created",
  "entity.updated",
  "project.completed",
  "project.reopened",
  "task.completed",
  "task.reopened",
  "task.planned",
  "task.rescheduled",
  "task.plan_cleared",
  "task.waiting_started",
  "task.waiting_changed",
  "task.waiting_cleared",
] as const;
