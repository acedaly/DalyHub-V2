/**
 * V2.14 GROUND-03 — the FACT BUILDERS for Ask DalyHub's grounded intents.
 *
 * One builder per intent, each reading canonical repositories under the caller's
 * workspace scope. There is deliberately no `loadEverythingForAI()`: a builder
 * that carried everything would have no bound, no budget and no privacy story
 * anybody could reason about, and its facts would be selected by whatever
 * happened to be cheap rather than by what the question needs.
 *
 * ## Why three of the four execute Reports
 *
 * `runReport` is already the deterministic, bounded, per-currency, caveat-
 * carrying way to ask DalyHub a question over a period. Reusing it means a
 * grounded answer and the Report the owner opens to check it are computed by the
 * SAME code and cannot disagree — which is the whole point of a citation that
 * links back. It also means these builders inherit every bound and every
 * standing note V2.13 already writes, rather than restating them.
 *
 * ## What DalyHub calculates, and the model therefore does not
 *
 * Differences, directions, per-category deltas, counts, horizons and orderings
 * are computed HERE, arrive as facts with their own ids, and are restated. The
 * model is never handed two totals and asked which is bigger, and never handed
 * four hundred transactions and asked why a month cost more.
 *
 * ## Workspace scope
 *
 * Every read goes through the `WorkspaceScope` the request boundary resolved
 * from trusted server configuration. No builder takes a record id from the
 * browser, so there is no id to forge: the intents are period-shaped, and the
 * records they reach are the ones the scope's own queries return.
 */

import {
  aiFeaturePolicy,
  buildFactBlock,
  type FactBlock,
  type FactBound,
  type FactDraft,
  type FactPeriod,
} from "~/kernel/ai";
import { formatMinorUnits } from "~/kernel/money";
import {
  ACROSS_REVIEWS_SERIES_LENGTH,
  readAcrossReviews,
  type GoalContributionAcrossReviews,
  type ProjectHealthAcrossReviews,
} from "~/kernel/review-insights";
import {
  REPORT_CONFIG_VERSION,
  type ReportBlock,
  type ReportConfig,
  type ReportResult,
} from "~/kernel/reports";
import { readObligationPage } from "~/platform/obligations/obligation-facts.server";
import { runReport } from "~/platform/reports/report-execution.server";
import type { WorkspaceScope } from "~/platform/workspaces";

import type { AskPeriod, GroundedAskRequest } from "./ask-intents";
import { horizonPeriod, lookbackPeriod } from "./ask-intents";

/** What every builder needs about the owner before it reads anything. */
export interface GroundedFactsInput {
  readonly scope: WorkspaceScope;
  readonly todayIso: string;
  readonly timeZone: string;
  readonly hiddenModuleIds?: readonly string[];
  /** The owner's question, carried onto the block so the answer addresses it. */
  readonly question: string;
  readonly now?: Date;
}

/**
 * The feature's own ceiling on facts, read from the policy table rather than
 * restated here — one number, in the place that already declares every other
 * bound this feature obeys.
 */
const MAX_FACTS = aiFeaturePolicy("grounded-question-answer").maxFacts;

/** How many category deltas one comparison names. Product-defined, and stated. */
const MAX_CATEGORY_DELTAS = 8;
/** How many Goals or Projects one movement answer names. */
const MAX_NAMED_SUBJECTS = 8;
/** How many obligations one horizon answer names. */
const MAX_NAMED_OBLIGATIONS = 12;
/** The bounded page a subject read may return. */
const SUBJECT_PAGE = 50;

/* -------------------------------------------------------------------------- */
/* Entry point                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * Build the facts for one resolved question.
 *
 * The switch is total over the closed intent set, so adding an intent without a
 * builder does not compile — which is the only way a "grounded" surface can be
 * kept from quietly acquiring an ungrounded branch.
 */
export async function buildGroundedFacts(
  request: GroundedAskRequest,
  input: GroundedFactsInput,
): Promise<FactBlock> {
  switch (request.intent) {
    case "finance_comparison":
      return financeComparisonFacts(request, input);
    case "goal_movement":
      return goalMovementFacts(request, input);
    case "project_health":
      return projectHealthFacts(request, input);
    case "obligation_horizon":
      return obligationHorizonFacts(request, input);
  }
}

/* -------------------------------------------------------------------------- */
/* Finance comparison                                                          */
/* -------------------------------------------------------------------------- */

function spendConfig(period: AskPeriod): ReportConfig {
  return {
    version: REPORT_CONFIG_VERSION,
    source: "finance",
    measure: "money_out",
    window: {
      kind: "custom",
      startIso: period.startIso,
      endIso: period.endIso,
    },
    breakdown: { by: "group", group: "category" },
    filters: {},
    sort: "value_desc",
    visual: "bars",
  };
}

function periodOf(period: AskPeriod): FactPeriod {
  return {
    startIso: period.startIso,
    endIso: period.endIso,
    label: period.label,
  };
}

/** The rows of one currency block, keyed by the row's label. */
function rowsByLabel(block: ReportBlock): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of block.rows) {
    map.set(row.label, (map.get(row.label) ?? 0) + (row.value ?? 0));
  }
  return map;
}

function blockFor(
  result: ReportResult,
  currencyCode: string,
): ReportBlock | undefined {
  return result.blocks.find((block) => block.currencyCode === currencyCode);
}

/**
 * "Why was August more expensive than July?"
 *
 * DalyHub computes both totals, the difference, the direction and the per-
 * category deltas, per currency, and hands them over as facts. The model
 * explains WHICH categories drove the change; it is never asked to work out
 * whether one number is larger than another, and it never sees a transaction.
 */
async function financeComparisonFacts(
  request: Extract<GroundedAskRequest, { intent: "finance_comparison" }>,
  input: GroundedFactsInput,
): Promise<FactBlock> {
  const context = {
    scope: input.scope,
    todayIso: input.todayIso,
    timeZone: input.timeZone,
    hiddenModuleIds: input.hiddenModuleIds,
    now: input.now,
  };
  const [later, earlier] = await Promise.all([
    runReport(spendConfig(request.later), context),
    runReport(spendConfig(request.earlier), context),
  ]);

  const bounds: FactBound[] = request.assumptions.map((text) => ({
    code: "selection" as const,
    text,
  }));

  if (!later.ok || !earlier.ok) {
    return buildFactBlock({
      intent: "finance_comparison",
      question: input.question,
      subject: `Spending: ${request.earlier.label} and ${request.later.label}`,
      facts: [],
      bounds: [
        ...bounds,
        {
          code: "no_records",
          text: "One of the two periods could not be read, so there is nothing to compare.",
        },
      ],
    });
  }

  for (const note of [...later.result.notes, ...earlier.result.notes]) {
    if (!bounds.some((bound) => bound.text === note.text)) {
      bounds.push({
        code: note.code === "standing" ? "standing" : "bounded",
        text: note.text,
      });
    }
  }

  const currencies = [
    ...new Set([
      ...later.result.blocks.map((block) => block.currencyCode),
      ...earlier.result.blocks.map((block) => block.currencyCode),
    ]),
  ]
    .filter((code): code is string => code !== null)
    .sort();

  if (currencies.length > 1) {
    bounds.push({
      code: "mixed_currency",
      text: `More than one currency is present (${currencies.join(", ")}). Each is compared separately and none is converted or combined.`,
    });
  }

  const facts: FactDraft[] = [];
  for (const currency of currencies) {
    const laterBlock = blockFor(later.result, currency);
    const earlierBlock = blockFor(earlier.result, currency);
    const laterTotal = laterBlock?.total ?? 0;
    const earlierTotal = earlierBlock?.total ?? 0;
    const suffix = currencies.length > 1 ? ` (${currency})` : "";

    facts.push({
      label: `Total spending in ${request.later.label}${suffix}`,
      value: { kind: "money", minorUnits: laterTotal, currencyCode: currency },
      display: formatMinorUnits(laterTotal, currency),
      period: periodOf(request.later),
      reference: {
        kind: "finance_month",
        id: request.later.startIso.slice(0, 7),
        href: `/finance?month=${request.later.startIso.slice(0, 7)}`,
        label: request.later.label,
      },
    });
    facts.push({
      label: `Total spending in ${request.earlier.label}${suffix}`,
      value: {
        kind: "money",
        minorUnits: earlierTotal,
        currencyCode: currency,
      },
      display: formatMinorUnits(earlierTotal, currency),
      period: periodOf(request.earlier),
      reference: {
        kind: "finance_month",
        id: request.earlier.startIso.slice(0, 7),
        href: `/finance?month=${request.earlier.startIso.slice(0, 7)}`,
        label: request.earlier.label,
      },
    });

    // The DIFFERENCE is DalyHub's arithmetic, stated as a fact with a direction
    // in words. The model is never asked to subtract, and never asked to turn a
    // difference into a percentage — the product has no canonical authority for
    // one, so there is no fact that could license it.
    const delta = laterTotal - earlierTotal;
    facts.push({
      label:
        delta === 0
          ? `Change from ${request.earlier.label} to ${request.later.label}: no change${suffix}`
          : `Change from ${request.earlier.label} to ${request.later.label}: ${delta > 0 ? "higher" : "lower"}${suffix}`,
      value: {
        kind: "money",
        minorUnits: Math.abs(delta),
        currencyCode: currency,
      },
      display: formatMinorUnits(Math.abs(delta), currency),
      period: {
        startIso: request.earlier.startIso,
        endIso: request.later.endIso,
        label: `${request.earlier.label} to ${request.later.label}`,
      },
    });

    const laterRows =
      laterBlock === undefined ? new Map() : rowsByLabel(laterBlock);
    const earlierRows =
      earlierBlock === undefined ? new Map() : rowsByLabel(earlierBlock);
    const labels = [...new Set([...laterRows.keys(), ...earlierRows.keys()])];
    const deltas = labels
      .map((label) => {
        const a = laterRows.get(label) ?? 0;
        const b = earlierRows.get(label) ?? 0;
        return { label, later: a, earlier: b, delta: a - b };
      })
      .filter((entry) => entry.delta !== 0)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

    const named = deltas.slice(0, MAX_CATEGORY_DELTAS);
    if (deltas.length > named.length) {
      bounds.push({
        code: "bounded",
        text: `The ${MAX_CATEGORY_DELTAS} categories that moved most are listed; ${deltas.length - named.length} smaller movements are not.`,
      });
    }

    for (const entry of named) {
      facts.push({
        label: `${entry.label} — ${request.later.label}${suffix}`,
        value: {
          kind: "money",
          minorUnits: entry.later,
          currencyCode: currency,
        },
        display: formatMinorUnits(entry.later, currency),
        period: periodOf(request.later),
      });
      facts.push({
        label: `${entry.label} — ${request.earlier.label}${suffix}`,
        value: {
          kind: "money",
          minorUnits: entry.earlier,
          currencyCode: currency,
        },
        display: formatMinorUnits(entry.earlier, currency),
        period: periodOf(request.earlier),
      });
      facts.push({
        label: `${entry.label} — ${entry.delta > 0 ? "higher" : "lower"} in ${request.later.label}${suffix}`,
        value: {
          kind: "money",
          minorUnits: Math.abs(entry.delta),
          currencyCode: currency,
        },
        display: formatMinorUnits(Math.abs(entry.delta), currency),
      });
    }
  }

  if (facts.length === 0) {
    bounds.push({
      code: "no_records",
      text: "No spending is recorded in either period.",
    });
  }

  return buildFactBlock({
    intent: "finance_comparison",
    question: input.question,
    subject: `Spending: ${request.earlier.label} compared with ${request.later.label}`,
    period: {
      startIso: request.earlier.startIso,
      endIso: request.later.endIso,
      label: `${request.earlier.label} and ${request.later.label}`,
    },
    facts,
    maxFacts: MAX_FACTS,
    bounds,
    currencies,
  });
}

/* -------------------------------------------------------------------------- */
/* Goal movement                                                               */
/* -------------------------------------------------------------------------- */

/**
 * "Which Goals haven't moved recently?"
 *
 * Two canonical reads, both already the product's own: the batched measurement
 * summary (GOAL-02's authority for a Goal's current value) and the across-
 * Reviews contribution classification (INS-02's authority for whether work
 * reached a Goal). Nothing here decides whether a Goal is good, healthy or
 * successful — those are not facts DalyHub holds, so they are not facts the
 * answer can state.
 */
async function goalMovementFacts(
  request: Extract<GroundedAskRequest, { intent: "goal_movement" }>,
  input: GroundedFactsInput,
): Promise<FactBlock> {
  const window = lookbackPeriod(input.todayIso, request.days);
  const bounds: FactBound[] = request.assumptions.map((text) => ({
    code: "selection" as const,
    text,
  }));

  const page = await input.scope.goals.listGoals({ limit: SUBJECT_PAGE });
  const open = page.items.filter((goal) => goal.completedAt === null);
  if (open.length === 0) {
    return buildFactBlock({
      intent: "goal_movement",
      question: input.question,
      subject: "Goal movement",
      period: periodOf(window),
      facts: [],
      bounds: [
        ...bounds,
        { code: "no_records", text: "There are no open Goals to report on." },
      ],
    });
  }
  if (page.items.length >= SUBJECT_PAGE) {
    bounds.push({
      code: "bounded",
      text: `Only the first ${SUBJECT_PAGE} Goals were read.`,
    });
  }

  const summaries = await input.scope.goalMeasurements.listMeasurementSummaries(
    open.map((goal) => goal.id),
    { comparisonFromIso: window.startIso },
  );

  const contributions = await acrossReviewsGoals(
    input.scope,
    open.map((goal) => ({ id: goal.id, title: goal.title })),
  );
  const byGoal = new Map(contributions.map((row) => [row.goalId, row]));

  // Selection is DalyHub's and is stated: Goals with NO reading inside the
  // window come first, because those are what the question asks about, and the
  // rest follow in the collection's own order.
  const ranked = [...open].sort((a, b) => {
    const aMoved = movedInWindow(summaries.get(a.id), window.startIso);
    const bMoved = movedInWindow(summaries.get(b.id), window.startIso);
    if (aMoved !== bMoved) return aMoved ? 1 : -1;
    return a.title < b.title ? -1 : 1;
  });
  const named = ranked.slice(0, MAX_NAMED_SUBJECTS);
  if (ranked.length > named.length) {
    bounds.push({
      code: "bounded",
      text: `${named.length} of ${ranked.length} open Goals are listed, those with the least recent movement first.`,
    });
  }

  const facts: FactDraft[] = [];
  for (const goal of named) {
    const summary = summaries.get(goal.id);
    const latest = summary?.latest ?? null;
    const href = `/goals/${goal.id}`;
    if (latest === null) {
      facts.push({
        label: `${goal.title} — measurements recorded`,
        value: { kind: "count", count: 0 },
        display: "none",
        reference: { kind: "goal", id: goal.id, href, label: goal.title },
        note: "No measurement has ever been recorded for this Goal.",
      });
    } else {
      facts.push({
        label: `${goal.title} — latest measurement`,
        value: { kind: "value", amount: latest.value, unit: null },
        display: new Intl.NumberFormat("en-AU", {
          maximumFractionDigits: 3,
        }).format(latest.value),
        period: {
          startIso: latest.measuredOn,
          endIso: latest.measuredOn,
          label: latest.measuredOn,
        },
        reference: { kind: "goal", id: goal.id, href, label: goal.title },
        note:
          latest.measuredOn < window.startIso
            ? `The most recent reading is from ${latest.measuredOn}, before ${window.label} began.`
            : null,
      });
    }
    const contribution = byGoal.get(goal.id);
    if (contribution !== undefined) {
      facts.push({
        label: `${goal.title} — recorded as "${contribution.state}" at Reviews`,
        value: {
          kind: "ratio",
          numerator: contribution.count,
          denominator: contribution.of,
        },
        display: `${contribution.count} of ${contribution.of} Reviews`,
        reference: { kind: "goal", id: goal.id, href, label: goal.title },
        note: `Out of ${contribution.reviews} Reviews in the series, since ${contribution.sinceIso}.`,
      });
    }
  }

  return buildFactBlock({
    intent: "goal_movement",
    question: input.question,
    subject: "Goal movement",
    period: periodOf(window),
    facts,
    maxFacts: MAX_FACTS,
    bounds,
    consideredCount: ranked.length,
  });
}

function movedInWindow(
  summary:
    { readonly latest: { readonly measuredOn: string } | null } | undefined,
  fromIso: string,
): boolean {
  const latest = summary?.latest ?? null;
  return latest !== null && latest.measuredOn >= fromIso;
}

/* -------------------------------------------------------------------------- */
/* Project health across Reviews                                               */
/* -------------------------------------------------------------------------- */

/**
 * "Which Projects have been at risk recently?"
 *
 * Read from the Review SNAPSHOTS, which is the only place DalyHub records what
 * a Project's state WAS. There is no invented health score and no percentage:
 * "at risk at 3 of the last 4 Reviews" is a count of Reviews, carried as a
 * single `ratio` fact so the pair cannot be recombined into a claim the record
 * does not make.
 */
async function projectHealthFacts(
  request: Extract<GroundedAskRequest, { intent: "project_health" }>,
  input: GroundedFactsInput,
): Promise<FactBlock> {
  const bounds: FactBound[] = request.assumptions.map((text) => ({
    code: "selection" as const,
    text,
  }));

  const page = await input.scope.projects.listProjects({ limit: SUBJECT_PAGE });
  const subjects = page.items.map((project) => ({
    id: project.id,
    title: project.title,
  }));
  const facts: FactDraft[] = [];
  const rows = await acrossReviewsProjects(input.scope, subjects);

  if (rows.length === 0) {
    bounds.push({
      code: "no_records",
      text: "Your recent Reviews have not recorded a state that changed for any Project.",
    });
  }

  for (const row of rows.slice(0, MAX_NAMED_SUBJECTS)) {
    facts.push({
      label: `${row.title} — recorded "${row.state}" at Reviews`,
      value: { kind: "ratio", numerator: row.count, denominator: row.of },
      display: `${row.count} of ${row.of} Reviews`,
      reference: {
        kind: "project",
        id: row.projectId,
        href: `/projects/${row.projectId}`,
        label: row.title,
      },
      note: `The series holds ${row.reviews} Reviews, the oldest beginning ${row.sinceIso}.`,
    });
  }

  bounds.push({
    code: "bounded",
    text: `This reads the last ${ACROSS_REVIEWS_SERIES_LENGTH} weekly Reviews, and says nothing about any period they do not cover.`,
  });

  return buildFactBlock({
    intent: "project_health",
    question: input.question,
    subject: "Project state across recent Reviews",
    facts,
    maxFacts: MAX_FACTS,
    bounds,
    consideredCount: rows.length,
  });
}

/* -------------------------------------------------------------------------- */
/* Obligation horizon                                                          */
/* -------------------------------------------------------------------------- */

/**
 * "What do I need to deal with in the next 60 days?"
 *
 * The obligations DalyHub actually holds, inside the horizon — never a forecast.
 * An expected amount is what a commitment is expected to cost and is labelled as
 * such; the block carries no total across them and no projection beyond the
 * horizon, because DalyHub has no authority for either.
 */
async function obligationHorizonFacts(
  request: Extract<GroundedAskRequest, { intent: "obligation_horizon" }>,
  input: GroundedFactsInput,
): Promise<FactBlock> {
  const window = horizonPeriod(input.todayIso, request.days);
  const bounds: FactBound[] = request.assumptions.map((text) => ({
    code: "selection" as const,
    text,
  }));

  const page = await readObligationPage({
    scope: input.scope,
    today: input.todayIso,
    limit: SUBJECT_PAGE,
  });

  const due = page.items.filter(
    (item) => item.dueDate !== null && item.dueDate <= window.endIso,
  );
  const inHorizon = due.slice(0, MAX_NAMED_OBLIGATIONS);

  const facts: FactDraft[] = [
    {
      label: `Known commitments falling due in ${window.label}`,
      value: { kind: "count", count: due.length },
      display: new Intl.NumberFormat("en-AU").format(due.length),
      period: periodOf(window),
    },
  ];

  for (const item of inHorizon) {
    facts.push({
      label: `${item.title} — due`,
      value: { kind: "date", iso: item.dueDate ?? window.endIso },
      display: item.dueDate ?? "no date",
      reference: {
        kind: "obligation",
        id: item.id,
        href: item.href,
        label: item.title,
      },
      note:
        item.expectedAmountDisplay === null
          ? `${item.categoryLabel}. No expected amount is recorded. ${item.recurrenceLabel}`
          : `${item.categoryLabel}. Expected to cost ${item.expectedAmountDisplay}. ${item.recurrenceLabel}`,
    });
  }

  if (due.length > inHorizon.length) {
    bounds.push({
      code: "bounded",
      text: `${inHorizon.length} of ${due.length} commitments are listed by name.`,
    });
  }
  bounds.push({
    code: "horizon",
    text: `These are the commitments DalyHub has recorded for ${window.label}. They are not a forecast of everything you will spend, and nothing here projects beyond that horizon.`,
  });
  if (page.hasMore) {
    bounds.push({
      code: "bounded",
      text: `Only the first ${SUBJECT_PAGE} commitments were read.`,
    });
  }
  if (due.length === 0) {
    bounds.push({
      code: "no_records",
      text: `Nothing DalyHub has recorded falls due in ${window.label}.`,
    });
  }

  return buildFactBlock({
    intent: "obligation_horizon",
    question: input.question,
    subject: `Commitments due in ${window.label}`,
    period: periodOf(window),
    facts,
    maxFacts: MAX_FACTS,
    bounds,
    consideredCount: due.length,
  });
}

/* -------------------------------------------------------------------------- */
/* Shared across-Reviews reads                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The across-Reviews series, anchored the way every other surface anchors it.
 *
 * The anchor is the most recent completed WEEKLY Review and the length is
 * `ACROSS_REVIEWS_SERIES_LENGTH`, exactly as Analytics and the guided Review
 * use — so a Goal cannot be "moving at 3 of the last 4" here and something else
 * two clicks away. A failed read returns nothing rather than an absence claim.
 */
async function acrossReviewsSeries(
  scope: WorkspaceScope,
  projects: readonly { readonly id: string; readonly title: string }[],
  goals: readonly { readonly id: string; readonly title: string }[],
) {
  const anchors = await scope.reviews.list({
    view: "completed",
    type: "weekly",
    sort: "period",
    limit: 1,
  });
  const anchor = anchors.items[0];
  if (anchor === undefined) return null;
  const series = await scope.reviewInsights.listSnapshotSeries(
    anchor.id,
    ACROSS_REVIEWS_SERIES_LENGTH,
  );
  return readAcrossReviews({ series, projects, goals, tasks: [] });
}

async function acrossReviewsGoals(
  scope: WorkspaceScope,
  goals: readonly { readonly id: string; readonly title: string }[],
): Promise<readonly GoalContributionAcrossReviews[]> {
  try {
    return (await acrossReviewsSeries(scope, [], goals))?.goals ?? [];
  } catch {
    return [];
  }
}

async function acrossReviewsProjects(
  scope: WorkspaceScope,
  projects: readonly { readonly id: string; readonly title: string }[],
): Promise<readonly ProjectHealthAcrossReviews[]> {
  try {
    return (await acrossReviewsSeries(scope, projects, []))?.projects ?? [];
  } catch {
    return [];
  }
}
