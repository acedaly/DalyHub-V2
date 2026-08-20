/**
 * AI-01 — the single AI request route.
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
 */

import { env } from "cloudflare:workers";

import { aiFeaturePolicy, isAiFeatureId, type AiFeatureId } from "~/kernel/ai";
import {
  answerDeterministically,
  classifyDeterministicIntent,
  retrieveAnswerEvidence,
  retrieveMeetingEvidence,
  retrieveNoteEvidence,
  retrieveWeeklyReviewEvidence,
  resolveAiContext,
  runAiRequest,
  serializeCitations,
} from "~/platform/ai";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

import { aiErrorResponse, aiJson } from "../ai-request";
import { computeWeeklyReviewFacts } from "../review-facts";
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
  readonly idempotencyKey: string;
  readonly deep?: boolean;
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
    aiFeaturePolicy(feature).maxOwnerInputCharacters,
  );
  return {
    feature,
    recordId: recordId.length > 0 ? recordId : undefined,
    question: question.length > 0 ? question : undefined,
    idempotencyKey,
    // Deep analysis is only ever a deliberate, explicit flag on an owner action.
    deep: String(form.get("deep") ?? "") === "1",
  };
}

/**
 * Assemble the evidence for one feature. Each branch reads through DalyHub's own
 * repositories; none of them is reachable by a model, and none of them accepts a
 * query the browser wrote.
 */
async function retrieveFor(
  scope: Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>,
  ownerId: string,
  body: AssistBody,
  ai: Awaited<ReturnType<typeof resolveAiContext>>,
) {
  // HARDEN-06C (F-14) — ONE preference read for the whole branch, so every
  // cited date is the OWNER's date rather than the runtime's UTC day.
  const { timezone } = await scope.appPreferences.get(ownerId);
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
      const todayIso = ownerCalendarIso(new Date(), timezone);
      const facts = await computeWeeklyReviewFacts(
        scope,
        review.periodStart,
        review.periodEnd,
        todayIso,
        timezone,
      );
      return retrieveWeeklyReviewEvidence(
        scope,
        facts,
        ai.limits,
        ai.allowedCategories,
      );
    }
    case "workspace-question-answer":
      return retrieveAnswerEvidence(
        scope,
        body.question ?? "",
        ai.limits,
        ai.allowedCategories,
        timezone,
      );
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
    const policy = aiFeaturePolicy(body.feature);

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
          return aiJson({
            ok: true,
            source: "deterministic",
            answer,
          });
        }
      }
    }

    const retrieval = await retrieveFor(scope, ownerId, body, ai);

    const outcome = await runAiRequest({
      featureId: body.feature,
      ownerId,
      preferences: ai.preferences,
      configuration: ai.configuration,
      usage: scope.aiUsage,
      evidence: retrieval.evidence,
      candidates: retrieval.candidates,
      derivedFacts: retrieval.derivedFacts,
      ownerInput:
        policy.maxOwnerInputCharacters > 0 ? body.question : undefined,
      idempotencyKey: body.idempotencyKey,
      requestDeep: body.deep,
      signal: request.signal,
    });

    return aiJson({
      ok: true,
      source: "ai",
      usageId: outcome.usageId,
      result: outcome.result,
      detail: outcome.detail,
      citations: serializeCitations(retrieval.evidence),
      candidates: retrieval.candidates,
      disclosure: {
        recordCount: retrieval.evidence.items.length,
        truncated: retrieval.evidence.truncated,
        excludedCategories: retrieval.evidence.excludedCategories,
      },
    });
  } catch (cause) {
    return aiErrorResponse(cause);
  }
}
