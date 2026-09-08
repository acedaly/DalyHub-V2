/**
 * AI-01 / V2.14 GROUND-03 — the single AI request route.
 *
 * Every AI capability enters here, by naming a FEATURE. There is no route that
 * takes a prompt, a model, a provider, a URL or a token; there is no route that
 * takes SQL; and there is no route a model can reach. Security properties are
 * therefore stated once:
 *
 *   - authentication is the shared request boundary's (FND-09);
 *   - the workspace comes from trusted server configuration, never a request;
 *   - AUDIT-FIX-04's same-origin mutation check runs at that same boundary, so a
 *     cross-origin POST is refused before this action executes;
 *   - the provider and model are resolved server-side from an allowlist;
 *   - responses are `private, no-store` and carry no CORS header;
 *   - no provider error, payload, endpoint or credential can cross the boundary.
 *
 * This route NEVER writes DalyHub data. Accepting a proposal is `apply.tsx`.
 *
 * ## What V2.14 added, and the rule it obeys
 *
 * Three grounded paths — a Report explanation, a grounded Ask, and the Weekly
 * Review — assemble a `FactBlock` here. In every one of them the ORDER is the
 * guarantee:
 *
 *     owner action → deterministic resolution → canonical reads → FactBlock →
 *     provider → validation against that same block
 *
 * The browser supplies an intent-shaped request and, for a Report, an
 * IDENTITY (the hash of the block it is looking at). It never supplies a
 * figure, a label, a title or a fact: a figure that came from a browser is not
 * a fact, and the one thing the client sends about the numbers on its screen is
 * whether they are still the same numbers.
 */

import { env } from "cloudflare:workers";

import {
  aiFeaturePolicy,
  identifyFactBlock,
  isAiFeatureId,
  AiError,
  type AiFeatureId,
  type FactBlock,
} from "~/kernel/ai";
import { REVIEW_SECTION_IDS, type ReviewSectionId } from "~/kernel/reviews";
import {
  parseReportDefinition,
  reportQuestion,
  reportResultDigest,
  findBuiltInReport,
  type ReportConfig,
} from "~/kernel/reports";
import {
  answerDeterministically,
  buildFinanceCategorisationFacts,
  buildGroundedFacts,
  buildObligationFollowUpFacts,
  classifyDeterministicIntent,
  reportFactBlock,
  resolveAiConfiguration,
  resolveAiContext,
  resolveGroundedAskIntent,
  retrieveAnswerEvidence,
  retrieveMeetingEvidence,
  retrieveNoteEvidence,
  runAiRequest,
  serializeCitations,
  EMPTY_CANDIDATES,
  type RetrievalResult,
} from "~/platform/ai";
import { runReport } from "~/platform/reports/report-execution.server";
import { requireAuthenticatedSession } from "~/platform/request";
import {
  resolveAuthenticatedWorkspaceScope,
  type WorkspaceScope,
} from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

import { aiErrorResponse, aiJson } from "../ai-request";
import { buildReviewFactBlock } from "../review-facts";
import type { Route } from "./+types/assist";

/*
 * A GET on this mutation endpoint renders DalyHub's error boundary rather
 * than React Router's internal error object and stack trace.
 */
import { actionOnlyLoader } from "~/platform/request";

export const loader = actionOnlyLoader;

/** The bounded request body. Anything else is rejected before any work happens. */
interface AssistBody {
  readonly feature: AiFeatureId;
  readonly recordId?: string;
  readonly question?: string;
  /** V2.14 — the serialised Report definition, parsed by the kernel's own codec. */
  readonly definition?: string;
  /** V2.14 — the built-in or saved report id, for the title and the link back. */
  readonly reportId?: string;
  /**
   * V2.14 — the identity of the RESULT the browser is looking at
   * (`reportResultDigest`). Never a figure: an identity is all a browser is
   * trusted to say about the numbers on its own screen.
   */
  readonly resultDigest?: string;
  /**
   * V2.14 — the Reports page the owner is actually looking at, so a citation
   * lands on the figures it cites.
   *
   * The AI module cannot build this itself: the report URL vocabulary (`src`,
   * `m`, `w`, `by`, …) belongs to the Reports module, and modules do not import
   * one another. Nor may it be trusted: it is validated to a `/reports` path
   * before it is ever used, so the worst a forged value can do is point the
   * owner's own citation at another report of theirs.
   */
  readonly reportHref?: string;
  /**
   * V2.15 — which Review reflection section a draft is for.
   *
   * Validated against the Review's own closed `REVIEW_SECTION_IDS` vocabulary
   * before it is used, so an unknown value is a refusal rather than a write to
   * a section that does not exist.
   */
  readonly sectionId?: string;
  readonly idempotencyKey: string;
  readonly deep?: boolean;
  /**
   * V2.14 GROUND-00 — which deterministic behaviour the DEVELOPMENT provider
   * should produce. Read only where the development provider is enabled, which
   * requires a development or test `ENVIRONMENT`; in production the field is
   * discarded before it reaches anything.
   */
  readonly scenario?: string;
}

/**
 * A path inside `/reports`, or nothing.
 *
 * Deliberately narrow rather than "a safe URL": the only link this route builds
 * from a client-supplied value is a citation back to a Report, so the value may
 * be a Reports path and nothing else. A protocol-relative `//host`, a
 * backslash, a control character, an absolute URL and any other section of the
 * product are all simply refused, and the caller falls back to a path it
 * derived itself.
 */
function safeReportsPath(value: string): string | null {
  const path = value.slice(0, 512);
  if (path !== "/reports" && !path.startsWith("/reports/")) return null;
  if (path.startsWith("//") || path.includes("\\")) return null;
  // eslint-disable-next-line no-control-regex -- refusing control characters is the point.
  if (/[\u0000-\u0020\u007f]/.test(path)) return null;
  return path;
}

/**
 * Narrow a browser value to one of the Review's own section ids, or `null`.
 *
 * The vocabulary is the Review kernel's, not a list retyped here, so a section
 * added or removed there cannot leave this route accepting a stale one.
 * Deliberately NOT the kernel's own `parseReviewSectionId`, which THROWS a
 * validation error: at this boundary an unknown section is an AI refusal with a
 * calm sentence, not a field-level form error about a field the owner never
 * filled in.
 */
function reviewSectionIdOrNull(value: unknown): ReviewSectionId | null {
  return typeof value === "string" &&
    (REVIEW_SECTION_IDS as readonly string[]).includes(value)
    ? (value as ReviewSectionId)
    : null;
}

/** Parse and bound the request. Never trusts a field it did not ask for. */
function parseBody(form: FormData): AssistBody | null {
  const feature = String(form.get("feature") ?? "");
  if (!isAiFeatureId(feature)) return null;
  const idempotencyKey = String(form.get("idempotencyKey") ?? "").slice(0, 200);
  if (idempotencyKey.length < 8) return null;
  const recordId = String(form.get("recordId") ?? "").slice(0, 100);
  const question = String(form.get("question") ?? "").slice(
    0,
    Math.max(aiFeaturePolicy(feature).maxOwnerInputCharacters, 400),
  );
  const definition = String(form.get("definition") ?? "").slice(0, 4_000);
  const reportId = String(form.get("reportId") ?? "").slice(0, 128);
  const digest = String(form.get("resultDigest") ?? "").slice(0, 128);
  const reportHref = safeReportsPath(String(form.get("reportHref") ?? ""));
  const scenario = String(form.get("scenario") ?? "").slice(0, 64);
  const sectionId = String(form.get("sectionId") ?? "").slice(0, 64);
  return {
    feature,
    sectionId: sectionId.length > 0 ? sectionId : undefined,
    recordId: recordId.length > 0 ? recordId : undefined,
    question: question.length > 0 ? question : undefined,
    definition: definition.length > 0 ? definition : undefined,
    reportId: reportId.length > 0 ? reportId : undefined,
    resultDigest: digest.length > 0 ? digest : undefined,
    reportHref: reportHref ?? undefined,
    idempotencyKey,
    // Deep analysis is only ever a deliberate, explicit flag on an owner action.
    deep: String(form.get("deep") ?? "") === "1",
    scenario: scenario.length > 0 ? scenario : undefined,
  };
}

/** What a feature's assembly step produces: evidence, candidates, and facts. */
interface Assembled extends RetrievalResult {
  readonly factBlock?: FactBlock;
  /** Set when DalyHub resolved the question into a different, grounded feature. */
  readonly featureOverride?: AiFeatureId;
  /** Deterministic assumptions the owner is told about, never hidden. */
  readonly assumptions?: readonly string[];
  /**
   * V2.15 — the CLOSED index spaces a proposal feature offers the model, and
   * the server-side lists those indexes resolve against.
   *
   * The lists never reach the browser as authority: the response carries
   * positions, this route resolves them into ids, and the SURFACE is handed
   * resolved rows. A browser that later submits an acceptance re-states the
   * resolved id, and `apply-proposal.ts` re-reads it from storage anyway.
   */
  readonly selection?: {
    readonly rowCount: number;
    readonly optionCount: number;
  };
  /** V2.15 — what a proposal surface renders beside the suggestion. */
  readonly proposalContext?: Record<string, unknown>;
}

/** An empty retrieval — the shape a fact-grounded feature uses. */
function factsOnly(
  factBlock: FactBlock,
  extra: Partial<Assembled> = {},
): Assembled {
  return {
    evidence: {
      items: [],
      truncated: false,
      consideredCount: 0,
      sensitiveCategories: [],
      excludedCategories: [],
      totalCharacters: 0,
    },
    candidates: EMPTY_CANDIDATES,
    derivedFacts: "",
    factBlock,
    ...extra,
  };
}

/* -------------------------------------------------------------------------- */
/* Report explanation                                                          */
/* -------------------------------------------------------------------------- */

/**
 * Build the facts for one Report, from a fresh execution of its definition.
 *
 * Two things are deliberately NOT done here. The browser's figures are not
 * trusted — it sends the definition and a hash, never a value. And the block is
 * not built from a cached result — it is built from an execution taken now, and
 * then CHECKED against the hash the browser holds, so an explanation is never
 * paired with numbers it was not written about. A mismatch is `result_stale`,
 * which the surface renders as "the figures changed; run it again".
 */
async function reportAssembly(
  scope: WorkspaceScope,
  body: AssistBody,
  todayIso: string,
  timeZone: string,
  hiddenModuleIds: readonly string[],
): Promise<Assembled> {
  if (body.definition === undefined) {
    throw new AiError("internal", undefined, "definition_missing");
  }
  let raw: unknown;
  try {
    raw = JSON.parse(body.definition);
  } catch {
    throw new AiError("internal", undefined, "definition_malformed");
  }
  const parsed = parseReportDefinition(raw);
  if (!parsed.ok) {
    throw new AiError(
      "evidence_unavailable",
      undefined,
      "definition_unreadable",
    );
  }
  const config: ReportConfig = parsed.config;

  const execution = await runReport(config, {
    scope,
    todayIso,
    timeZone,
    hiddenModuleIds,
  });
  if (!execution.ok) {
    throw new AiError("evidence_unavailable", undefined, "report_refused");
  }

  const builtIn =
    body.reportId === undefined ? null : findBuiltInReport(body.reportId);
  /*
   * Where a citation LANDS.
   *
   * The page's own URL, when the browser supplied a valid one, because that is
   * the report the owner is looking at and the figures being explained are the
   * ones on it -- controls they have changed included. A saved report opened
   * with modified controls lives at `/reports/<id>?src=…`, and linking to the
   * bare `/reports/<id>` would send the owner to DIFFERENT figures from the
   * ones the explanation cites, which is the one thing a citation must not do.
   *
   * Falling back to the report's own address rather than to a URL this module
   * assembles: the query vocabulary belongs to Reports, and a link built here
   * out of a parameter name this module guessed at is a link that silently
   * stops working the day that vocabulary changes.
   */
  const href =
    body.reportHref ??
    (body.reportId === undefined
      ? "/reports"
      : `/reports/${encodeURIComponent(body.reportId)}`);

  const block = await identifyFactBlock(
    reportFactBlock({
      result: execution.result,
      // The title and the question come from the SERVER — the built-in's own
      // words, or the vocabulary's — never from the browser. Owner-authored
      // report titles reach the block only through the row labels the executor
      // produced, where they are sanitised as data like every other label.
      title: builtIn?.title ?? reportQuestion(config),
      question: builtIn?.question ?? reportQuestion(config),
      href,
      maxFacts: aiFeaturePolicy("report-explanation").maxFacts,
    }),
  );

  /*
   * Freshness, checked against the RESULT rather than against the derived
   * block, because the result is what the owner is looking at. The digest is
   * Reports' own (`reportResultDigest`) and covers every row, total, remainder
   * and note — but deliberately not `computedAtIso`, so two executions a second
   * apart over unchanged data agree.
   */
  if (body.resultDigest !== undefined) {
    const digest = await reportResultDigest(execution.result);
    if (digest !== body.resultDigest) {
      throw new AiError("result_stale", undefined, "report_figures_changed");
    }
  }

  return factsOnly(block);
}

/* -------------------------------------------------------------------------- */
/* Assembly                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Assemble what one feature is allowed to send. Each branch reads through
 * DalyHub's own repositories; none of them is reachable by a model, and none of
 * them accepts a query the browser wrote.
 */
async function retrieveFor(
  scope: WorkspaceScope,
  ownerId: string,
  body: AssistBody,
  ai: Awaited<ReturnType<typeof resolveAiContext>>,
): Promise<Assembled> {
  // HARDEN-06C (F-14) — ONE preference read for the whole branch, so every
  // cited date is the OWNER's date rather than the runtime's UTC day.
  const preferences = await scope.appPreferences.get(ownerId);
  const { timezone } = preferences;
  const todayIso = ownerCalendarIso(new Date(), timezone);

  switch (body.feature) {
    case "meeting-action-extraction":
      return retrieveMeetingEvidence(
        scope,
        body.recordId ?? "",
        ai.limits,
        ai.allowedCategories,
        timezone,
      );
    case "note-action-extraction":
      return retrieveNoteEvidence(
        scope,
        body.recordId ?? "",
        ai.limits,
        ai.allowedCategories,
        timezone,
      );
    case "weekly-review-assistant": {
      const review = await scope.reviews.get(body.recordId ?? "");
      if (!review) throw new Response("Not Found", { status: 404 });
      const { block } = await buildReviewFactBlock(scope, {
        reviewId: review.id,
        periodStart: review.periodStart,
        periodEnd: review.periodEnd,
        todayIso,
        timezone,
        firstDayOfWeek: preferences.firstDayOfWeek,
      });
      return factsOnly(await identifyFactBlock(block));
    }
    case "report-explanation":
      return reportAssembly(
        scope,
        body,
        todayIso,
        timezone,
        preferences.navigation.hiddenModuleIds,
      );
    case "grounded-question-answer":
    case "workspace-question-answer": {
      const question = body.question ?? "";
      /*
       * The deterministic parser decides, before any repository is touched,
       * whether this is one of the four GROUNDED questions. If it is, DalyHub
       * resolves it into facts and the feature is upgraded; if it is not, the
       * evidence-backed Ask that has shipped since AI-01 answers it unchanged.
       *
       * A model is never asked which of these to use, and never sees the
       * question until the choice has already been made.
       */
      const resolved = resolveGroundedAskIntent(question, todayIso);
      if (resolved !== null) {
        const block = await buildGroundedFacts(resolved, {
          scope,
          todayIso,
          timeZone: timezone,
          hiddenModuleIds: preferences.navigation.hiddenModuleIds,
          question,
        });
        return factsOnly(await identifyFactBlock(block), {
          featureOverride: "grounded-question-answer",
          assumptions: resolved.assumptions,
        });
      }
      if (body.feature === "grounded-question-answer") {
        // The client asked for a grounded answer to a question the parser does
        // not recognise. Refusing is the honest outcome; the surface says what
        // Ask can do rather than answering something else.
        throw new AiError(
          "evidence_unavailable",
          undefined,
          "intent_unsupported",
        );
      }
      return retrieveAnswerEvidence(
        scope,
        question,
        ai.limits,
        ai.allowedCategories,
        timezone,
      );
    }
    /* ------------------------------------------------ V2.15 ASSISTED ---- */
    case "finance-categorisation": {
      const assembled = await buildFinanceCategorisationFacts(scope, {
        maxFacts: aiFeaturePolicy("finance-categorisation").maxFacts,
        allowedCategories: ai.allowedCategories,
      });
      if (assembled.rows.length === 0) {
        /*
         * Nothing to ask about. Either the queue is empty or the deterministic
         * rule already answers every row in it — and in the second case the
         * honest outcome is to say so and charge nothing, rather than send a
         * provider an empty batch and bill the owner for the round trip.
         */
        throw new AiError(
          "evidence_unavailable",
          undefined,
          "nothing_to_categorise",
        );
      }
      return factsOnly(await identifyFactBlock(assembled.block), {
        selection: {
          rowCount: assembled.rows.length,
          optionCount: assembled.options.length,
        },
        proposalContext: {
          rows: assembled.rows,
          options: assembled.options,
          deterministicallyAnswered: assembled.deterministicallyAnswered,
        },
      });
    }
    case "obligation-follow-up": {
      const assembled = await buildObligationFollowUpFacts(scope, {
        obligationId: body.recordId ?? "",
        todayIso,
        maxFacts: aiFeaturePolicy("obligation-follow-up").maxFacts,
        allowedCategories: ai.allowedCategories,
      });
      /*
       * `null` is every refusal at once — missing, another workspace's,
       * deleted, archived, not open, no due date, or not actually overdue —
       * and they are deliberately indistinguishable, as everywhere else in
       * DalyHub. A caller learns that no follow-up is available, never whether
       * an id exists.
       */
      if (assembled === null) {
        throw new AiError(
          "evidence_unavailable",
          undefined,
          "not_an_overdue_obligation",
        );
      }
      return factsOnly(await identifyFactBlock(assembled.block), {
        proposalContext: {
          obligationId: assembled.obligation.id,
          title: assembled.obligation.title,
          dueDate: assembled.obligation.dueDate,
          daysOverdue: assembled.daysOverdue,
          hasOpenTask: assembled.hasOpenTask,
        },
      });
    }
    case "review-reflection-draft": {
      const review = await scope.reviews.get(body.recordId ?? "");
      if (!review) throw new Response("Not Found", { status: 404 });
      const sectionId = reviewSectionIdOrNull(body.sectionId);
      if (sectionId === null) {
        throw new AiError("internal", undefined, "unknown_section");
      }
      /*
       * The SAME block V2.14's Weekly Review assistant reads, built by the same
       * builder. A period's facts do not change because the ask changed from
       * "explain this" to "draft something about this", and building a second
       * near-identical block for the draft is how two answers about one week
       * come to disagree.
       */
      const { block } = await buildReviewFactBlock(scope, {
        reviewId: review.id,
        periodStart: review.periodStart,
        periodEnd: review.periodEnd,
        todayIso,
        timezone,
        firstDayOfWeek: preferences.firstDayOfWeek,
      });
      const section =
        review.sections.find((entry) => entry.sectionId === sectionId) ?? null;
      return factsOnly(await identifyFactBlock(block), {
        proposalContext: {
          reviewId: review.id,
          sectionId,
          /*
           * The section's CURRENT body and its version, so the surface can show
           * `current → proposed` and carry the expectation into the acceptance.
           * Neither is trusted at apply time: `apply-proposal.ts` re-reads the
           * section and hands the version to REVIEW-02's own concurrency guard.
           */
          currentBody: section?.body ?? "",
          expectedUpdatedAt: section?.updatedAt.toISOString() ?? null,
        },
      });
    }
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const ownerId = session.user.subject;

  const form = await request.formData();
  const body = parseBody(form);
  if (body === null) {
    return aiJson(
      { ok: false, code: "internal", message: "Unknown request." },
      400,
    );
  }

  try {
    const ai = await resolveAiContext(scope, ownerId, body.feature, env);

    // Ask DalyHub answers deterministically wherever it can. A count is a count:
    // it is read from repositories, cited, and no provider is contacted.
    if (body.feature === "workspace-question-answer") {
      const question = body.question ?? "";
      const intent = classifyDeterministicIntent(question);
      if (intent !== null) {
        const preferences = await scope.appPreferences.get(ownerId);
        const todayIso = ownerCalendarIso(new Date(), preferences.timezone);
        const answer = await answerDeterministically(
          scope,
          intent,
          todayIso,
          preferences.timezone,
        );
        if (answer !== null) {
          return aiJson({ ok: true, source: "deterministic", answer });
        }
      }
    }

    const retrieval = await retrieveFor(scope, ownerId, body, ai);
    const feature = retrieval.featureOverride ?? body.feature;
    const policy = aiFeaturePolicy(feature);
    /*
     * From here on, the facts EXIST. Every remaining failure — AI turned off,
     * the feature not allowed, no provider configured, over budget, a timeout,
     * a refusal, a malformed answer, an answer DalyHub would not verify — is
     * answered with the block alongside the calm sentence, because the
     * deterministic half is DalyHub's own and there is no reason to withhold it
     * when the interpretation is unavailable.
     */
    const facts = retrieval.factBlock ?? null;

    /*
     * A grounded question resolved into a DIFFERENT feature, so its context —
     * budget period, allowed-feature check, evidence limits — must be the one
     * that feature declares rather than the one the request named.
     */
    const effective =
      feature === body.feature
        ? ai
        : await resolveAiContext(scope, ownerId, feature, env);

    /*
     * The provider call, and the ONE place a failure still answers with facts.
     *
     * Everything above this line is DalyHub's own work over the owner's own
     * records; everything below it is interpretation. So a failure here is
     * caught, the calm sentence is returned as it always was, and the block
     * rides beside it — which is what makes "AI explanation isn't enabled, and
     * here are the figures it would have used" a real state rather than a
     * sentence in a design document.
     */
    let outcome;
    try {
      outcome = await runAiRequest({
        featureId: feature,
        ownerId,
        preferences: effective.preferences,
        /*
         * GROUND-00 — the development provider's behaviour is chosen here, and
         * only here. `fakeScenario` is inert unless `AI_FAKE_PROVIDER=1` AND
         * the `ENVIRONMENT` is development or test, so in production this is
         * exactly the ordinary configuration and the field is discarded before
         * it reaches anything that could act on it.
         */
        configuration: resolveAiConfiguration(env, {
          fakeScenario: body.scenario,
        }),
        usage: scope.aiUsage,
        evidence: retrieval.evidence,
        candidates: retrieval.candidates,
        factBlock: retrieval.factBlock,
        derivedFacts: retrieval.derivedFacts,
        ownerInput:
          policy.maxOwnerInputCharacters > 0 ? body.question : undefined,
        selection: retrieval.selection ?? null,
        idempotencyKey: body.idempotencyKey,
        requestDeep: body.deep,
        signal: request.signal,
      });
    } catch (cause) {
      return aiErrorResponse(cause, facts);
    }

    return aiJson({
      ok: true,
      source: "ai",
      feature,
      usageId: outcome.usageId,
      result: outcome.result,
      detail: outcome.detail,
      citations: serializeCitations(retrieval.evidence),
      candidates: retrieval.candidates,
      // The facts are returned so the surface can render them BESIDE the prose,
      // resolve a citation to a chip, and stay useful when the explanation
      // itself is refused or unavailable.
      facts,
      assumptions: retrieval.assumptions ?? [],
      /*
       * V2.15 — what the proposal surface renders the suggestion AGAINST: the
       * rows and categories a categorisation batch was built from, the
       * obligation a follow-up is for, the Review section a draft would
       * replace. All of it is DalyHub's own, read under the same scope the
       * request was authenticated in, and none of it is authority at apply
       * time — every id is re-read from storage when the owner accepts.
       */
      proposal: retrieval.proposalContext ?? null,
      disclosure: {
        recordCount: retrieval.evidence.items.length,
        truncated: retrieval.evidence.truncated,
        excludedCategories: retrieval.evidence.excludedCategories,
        factCount: retrieval.factBlock?.facts.length ?? 0,
        factsTruncated: retrieval.factBlock?.truncated ?? false,
      },
    });
  } catch (cause) {
    return aiErrorResponse(cause);
  }
}
