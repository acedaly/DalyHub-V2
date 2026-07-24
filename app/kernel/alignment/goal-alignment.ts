/**
 * AREA-03 Alignment kernel — the pure, storage-independent Goal alignment
 * evaluator (ADR-040).
 *
 * A DERIVED, NON-PERSISTED projection over the FND-07 spine (via the existing
 * AREA-02 `GoalProjectContribution` boundary), structural `entity_links` and the
 * FND-05 Activity stream. Nothing here is stored or cached: alignment is
 * recomputed from live facts every read, exactly mirroring Project Health
 * (ADR-035) and Area momentum (ADR-038). This module owns ONLY the rules — the
 * facts are gathered by the workspace-scoped `AlignmentRepository`
 * (`~/platform/storage/d1/d1-alignment-repository.ts`) and the existing
 * `GoalRepository`; every value this evaluator consumes is a number, a `Date` or
 * a date-only string, never a display string.
 *
 * The evaluator is a pure function of `(facts, injected clock)`: given the same
 * facts and the same clock it returns the same result, so the exhaustive rule
 * matrix is unit-tested WITHOUT a database, a React tree or the wall clock.
 *
 * Calm, honest tone (PRODUCT_PRINCIPLES' anti-guilt mandate, ADR-040 §40.5):
 * unlike Project Health, alignment never uses a `warning`/`danger` tone — even a
 * long-neglected Goal is presented in calm `info` tone. Reasons never report a
 * meaningless zero count.
 */

import type { GoalProjectContribution } from "~/kernel/goals";

/* -------------------------------------------------------------------------- */
/* Domain threshold — a single, named, documented constant                    */
/* -------------------------------------------------------------------------- */

/**
 * A Goal whose most recent qualifying Task contribution is at least this many
 * owner-calendar days old reads as `neglected` rather than `active`. The SAME
 * fortnight cadence ADR-035 already validated for `STALE_AFTER_DAYS` — a calm
 * review rhythm, long enough that genuinely progressing work will have logged
 * something, short enough that true dormancy surfaces before it is forgotten.
 * The boundary is INCLUSIVE, matching `STALE_AFTER_DAYS`: a contribution
 * exactly `RECENT_ACTION_WINDOW_DAYS` days old is no longer "recent".
 */
export const RECENT_ACTION_WINDOW_DAYS = 14;

/* -------------------------------------------------------------------------- */
/* Pure date-only helpers (duplicated from `~/kernel/project-health` — a small */
/* pure date helper, deliberately kept local rather than cross-kernel-imported */
/* per the established `goal-details.ts`/`project-view` precedent)            */
/* -------------------------------------------------------------------------- */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function epochDay(iso: string): number {
  if (!ISO_DATE.test(iso)) {
    throw new RangeError(`Not a YYYY-MM-DD calendar date: ${iso}`);
  }
  const [y, m, d] = iso.split("-").map((part) => Number(part));
  return Math.floor(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** Whole owner-calendar days from `fromIso` up to `toIso` (positive when
 * `toIso` is later). Both are date-only `YYYY-MM-DD`. */
export function daysBetweenIsoDates(fromIso: string, toIso: string): number {
  return epochDay(toIso) - epochDay(fromIso);
}

/** Add `days` to a `YYYY-MM-DD` calendar date, returning a `YYYY-MM-DD` date. */
export function addDaysToIsoDate(iso: string, days: number): string {
  const date = new Date((epochDay(iso) + days) * 86_400_000);
  const y = date.getUTCFullYear().toString().padStart(4, "0");
  const m = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const d = date.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * The inclusive UTC-instant lower bound used ONLY for the SUPPORTING "recent
 * contributing Task count" evidence read — a deliberately approximate window
 * (the owner-calendar day converted at UTC midnight, so up to ~11h more
 * inclusive than an exact owner-timezone-midnight boundary). The STATE
 * boundary (active vs neglected) never uses this: it compares the single
 * most-recent contribution's owner-calendar date against today directly (see
 * `evaluateGoalAlignment`), matching ADR-035's staleness precedent exactly. A
 * few hours of slack on a supporting count is immaterial and can never flip
 * the classification itself.
 */
export function recentWindowStartIso(todayIso: string): string {
  return `${addDaysToIsoDate(todayIso, -(RECENT_ACTION_WINDOW_DAYS - 1))}T00:00:00.000Z`;
}

/* -------------------------------------------------------------------------- */
/* Vocabulary                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The presentation tone of an alignment signal. Deliberately excludes
 * `warning`/`danger` — a Goal receiving no recent attention is not a missed
 * deadline (PROJECT_HEALTH's `at_risk`/`blocked` describe those), and colouring
 * it alarmingly would be exactly the "guilt-oriented warning" PRODUCT_PRINCIPLES
 * forbids. Meaning is ALWAYS carried by the paired text label too, never by
 * colour alone.
 */
export type AlignmentTone = "neutral" | "info" | "success";

/**
 * The stable, machine-readable alignment state. Precedence (ADR-040 §40.5):
 * `completed` → `no_structure` → `unreachable` → `active`-or-`neglected`.
 *
 * - `completed`    — the Goal itself is already complete (spine authority
 *                     only; never inferred from Task/Project activity).
 * - `no_structure` — no Project has ever advanced this Goal.
 * - `unreachable`  — Projects advance this Goal, but every one is archived
 *                     (the only STRUCTURALLY enforced block on new Task work).
 * - `active`       — a reachable structure exists AND the most recent
 *                     qualifying contribution is within the recent window.
 * - `neglected`    — a reachable structure exists AND the most recent
 *                     qualifying contribution (if any) is outside the window.
 */
export const GOAL_ALIGNMENT_STATES = [
  "completed",
  "no_structure",
  "unreachable",
  "active",
  "neglected",
] as const;
export type GoalAlignmentState = (typeof GOAL_ALIGNMENT_STATES)[number];

/** A stable, machine-readable reason code. Every alignment result carries one
 * or more, primary first — tests assert on the code (and its structured
 * counts/days), never on display prose. */
export const GOAL_ALIGNMENT_REASON_CODES = [
  "completed",
  "no_structure",
  "unreachable_archived",
  "recent_activity",
  "structure_without_recent_activity",
  "no_contribution_recorded",
  "last_contribution",
  "contributing_projects",
] as const;
export type GoalAlignmentReasonCode =
  (typeof GOAL_ALIGNMENT_REASON_CODES)[number];

/* -------------------------------------------------------------------------- */
/* Facts (the evaluator's input)                                              */
/* -------------------------------------------------------------------------- */

/**
 * The NEW facts `AlignmentRepository` actually reads: the complete,
 * workspace-scoped Task-activity aggregate for one Goal (ADR-040 §40.6). This
 * is deliberately narrower than `GoalAlignmentFacts` below — it owns ONLY the
 * activity-traversal facts. Goal completion and Project contribution already
 * have their own authorities (`GoalRepository`); the route composes all three
 * into a `GoalAlignmentFacts` before calling the evaluator, exactly how
 * `AreaDetailRoute` composes rollup + momentum facts + health facts.
 */
export type GoalAlignmentActivityFacts = {
  readonly goalId: string;
  /** Distinct Tasks with qualifying meaningful activity within the
   * SUPPORTING (approximate) recent window — evidence only, never the
   * classification boundary itself (see `recentWindowStartIso`). */
  readonly recentContributingTaskCount: number;
  /** The most recent qualifying activity instant across every Task
   * contributing to this Goal, UNBOUNDED by the window — null when none has
   * ever been recorded. This is what the active/neglected boundary is
   * actually computed from. */
  readonly lastContributingActivityAt: Date | null;
};

/**
 * The complete facts a single Goal's alignment is derived from — the
 * evaluator's actual input, composed by the ROUTE from three independent
 * authorities: `completedAt` (the spine, via `GoalOverview`/`GoalListItem`),
 * `contribution` (the EXISTING, already-complete AREA-02 boundary,
 * `GoalRepository.getGoalProjectContribution`/`listGoalProjectContributions`
 * — never recomputed here) and the activity aggregate
 * (`AlignmentRepository`, above). No single repository owns this composed
 * shape — that would duplicate an existing authority.
 */
export type GoalAlignmentFacts = GoalAlignmentActivityFacts & {
  /** The Goal's own completion instant, or null when open. Spine authority
   * only — never derived from Project/Task activity (ADR-039 §39.5). */
  readonly completedAt: Date | null;
  /** The exact, complete Project-contribution boundary (AREA-02 / ADR-039
   * §39.6), reused unchanged — never a second contribution model. */
  readonly contribution: GoalProjectContribution;
};

/**
 * One piece of DISPLAY evidence — a Task whose meaningful activity
 * contributed to the Goal via its Project's `project.advances_goal` link.
 * Bounded, single-Goal, for the Goal record's Summary panel ONLY (ADR-040
 * §40.6/§40.7) — never the classification boundary (`GoalAlignmentFacts`
 * above is what the evaluator actually reads).
 */
export type GoalAlignmentEvidence = {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly projectId: string;
  readonly projectTitle: string;
  readonly activityType: string;
  readonly occurredAt: Date;
};

/* -------------------------------------------------------------------------- */
/* Result (the evaluator's output — fully JSON-safe)                          */
/* -------------------------------------------------------------------------- */

/** One explained reason. Structured fields drive tests and the UI; `summary`
 * is a calm, factual, non-judgemental fallback string. */
export type GoalAlignmentReason = {
  readonly code: GoalAlignmentReasonCode;
  readonly tone: AlignmentTone;
  readonly summary: string;
  /** A relevant count (contributing Tasks / Projects), when the reason has
   * one. Never present with a value of 0 — a zero-count reason is simply
   * omitted rather than shown. */
  readonly count?: number;
  /** Owner-calendar days since the most recent qualifying contribution, when
   * the reason has one. */
  readonly days?: number;
};

/** A Goal's derived alignment — a stable state, a calm label, a tone,
 * explained reasons and the evaluation time. Entirely JSON-serialisable so a
 * loader returns it straight to the browser. */
export type GoalAlignment = {
  readonly state: GoalAlignmentState;
  readonly label: string;
  readonly tone: AlignmentTone;
  /** One or more reasons, primary first. Never empty. */
  readonly reasons: readonly GoalAlignmentReason[];
  readonly evaluatedAtIso: string;
};

/**
 * The injected clock + owner-calendar seam. Passed in (never read from the
 * ambient wall clock) so the rule matrix is deterministic — mirrors
 * `HealthEvaluationContext` exactly.
 */
export type AlignmentEvaluationContext = {
  readonly now: Date;
  readonly todayIso: string;
  readonly calendarIsoOf: (instant: Date) => string;
};

/* -------------------------------------------------------------------------- */
/* The evaluator                                                              */
/* -------------------------------------------------------------------------- */

function contributingProjectsReason(
  contribution: GoalProjectContribution,
): GoalAlignmentReason | null {
  const contributing =
    contribution.active + contribution.planned + contribution.onHold;
  if (contributing <= 0) {
    return null;
  }
  return {
    code: "contributing_projects",
    tone: "neutral",
    summary:
      contributing === 1
        ? "1 Project is currently able to advance this Goal."
        : `${contributing} Projects are currently able to advance this Goal.`,
    count: contributing,
  };
}

/**
 * Derive a Goal's alignment from its facts and the injected clock. See the
 * module doc comment and ADR-040 §40.5 for the full precedence rationale.
 */
export function evaluateGoalAlignment(
  facts: GoalAlignmentFacts,
  ctx: AlignmentEvaluationContext,
): GoalAlignment {
  const evaluatedAtIso = ctx.now.toISOString();

  // --- Completed: calm, always wins, independent of everything else. -------
  if (facts.completedAt !== null) {
    return {
      state: "completed",
      label: "Completed",
      tone: "neutral",
      reasons: [
        {
          code: "completed",
          tone: "neutral",
          summary: "This Goal is already completed.",
        },
      ],
      evaluatedAtIso,
    };
  }

  const { contribution } = facts;

  // --- No structure: zero Projects have ever advanced this Goal. -----------
  if (contribution.total === 0) {
    return {
      state: "no_structure",
      label: "No contribution path",
      tone: "neutral",
      reasons: [
        {
          code: "no_structure",
          tone: "neutral",
          summary: "No Projects currently advance this Goal.",
        },
      ],
      evaluatedAtIso,
    };
  }

  // --- Unreachable: every linked Project is archived (the only structurally
  // enforced block on new Task activity). -----------------------------------
  if (contribution.archived === contribution.total) {
    return {
      state: "unreachable",
      label: "Structure archived",
      tone: "neutral",
      reasons: [
        {
          code: "unreachable_archived",
          tone: "neutral",
          summary:
            contribution.total === 1
              ? "The one Project linked to this Goal is archived."
              : `All ${contribution.total} Projects linked to this Goal are archived.`,
          count: contribution.total,
        },
      ],
      evaluatedAtIso,
    };
  }

  // --- Active vs neglected: governed by the single most recent contributing
  // activity, mapped to the owner's calendar day (ADR-035 §35.4 precedent). -
  const daysSinceLastContribution =
    facts.lastContributingActivityAt === null
      ? null
      : Math.max(
          0,
          daysBetweenIsoDates(
            ctx.calendarIsoOf(facts.lastContributingActivityAt),
            ctx.todayIso,
          ),
        );
  const isRecent =
    daysSinceLastContribution !== null &&
    daysSinceLastContribution < RECENT_ACTION_WINDOW_DAYS;

  const contextReason = contributingProjectsReason(contribution);

  if (isRecent) {
    const reasons: GoalAlignmentReason[] = [
      {
        code: "last_contribution",
        tone: "success",
        summary:
          daysSinceLastContribution === 0
            ? "Contributing Task activity was recorded today."
            : daysSinceLastContribution === 1
              ? "Contributing Task activity was recorded yesterday."
              : `Contributing Task activity was recorded ${daysSinceLastContribution} days ago.`,
        days: daysSinceLastContribution ?? undefined,
      },
    ];
    if (facts.recentContributingTaskCount > 0) {
      reasons.push({
        code: "recent_activity",
        tone: "success",
        summary:
          facts.recentContributingTaskCount === 1
            ? `1 Task has contributed in the last ${RECENT_ACTION_WINDOW_DAYS} days.`
            : `${facts.recentContributingTaskCount} Tasks have contributed in the last ${RECENT_ACTION_WINDOW_DAYS} days.`,
        count: facts.recentContributingTaskCount,
      });
    }
    if (contextReason) {
      reasons.push(contextReason);
    }
    return {
      state: "active",
      label: "Recently active",
      tone: "success",
      reasons,
      evaluatedAtIso,
    };
  }

  // --- Neglected. ------------------------------------------------------------
  const reasons: GoalAlignmentReason[] = [
    {
      code: "structure_without_recent_activity",
      tone: "info",
      summary: "Projects exist, but no recent Task activity was found.",
    },
    daysSinceLastContribution === null
      ? {
          code: "no_contribution_recorded",
          tone: "info",
          summary: "No contributing Task activity has been recorded yet.",
        }
      : {
          code: "last_contribution",
          tone: "info",
          summary: `Most recent contributing Task activity was ${daysSinceLastContribution} days ago.`,
          days: daysSinceLastContribution,
        },
  ];
  if (contextReason) {
    reasons.push(contextReason);
  }
  return {
    state: "neglected",
    label: "No recent action",
    tone: "info",
    reasons,
    evaluatedAtIso,
  };
}

/**
 * Compose the evaluator's full input from three independent authorities (the
 * spine's `completedAt`, the existing Project-contribution boundary, and the
 * new activity aggregate). A Goal with no gathered activity facts (e.g. no
 * qualifying Task has ever existed) composes to the honest zero/null shape —
 * never a missing-facts error. Pure and total, so route composition is
 * directly unit-testable without a database.
 */
export function composeGoalAlignmentFacts(input: {
  readonly goalId: string;
  readonly completedAt: Date | null;
  readonly contribution: GoalProjectContribution;
  readonly activity: GoalAlignmentActivityFacts | undefined;
}): GoalAlignmentFacts {
  return {
    goalId: input.goalId,
    completedAt: input.completedAt,
    contribution: input.contribution,
    recentContributingTaskCount:
      input.activity?.recentContributingTaskCount ?? 0,
    lastContributingActivityAt:
      input.activity?.lastContributingActivityAt ?? null,
  };
}

/**
 * De-duplicate a Goal's evidence rows by Task id — defence in depth, mirroring
 * `evaluateGoalProjectContribution`'s own stance (ADR-040 §40.8): the spine's
 * partial-unique structural-link index already makes a Task appearing under
 * two Projects, or a Project advancing two Goals, structurally impossible, but
 * this evaluator never trusts a future migration or bug to preserve that
 * invariant silently.
 */
export function deduplicateGoalIds(ids: readonly string[]): readonly string[] {
  return [...new Set(ids)];
}
