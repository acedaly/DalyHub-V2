/**
 * AI-01 / AI-02 — the proposal APPLY route: the only path from an AI proposal to
 * DalyHub data, and the one place the product's governing rule is enforced.
 *
 *   DalyHub selects evidence. AI returns a bounded proposal. The OWNER decides
 *   what becomes part of DalyHub.
 *
 * This file is the BOUNDARY only — authentication, the workspace scope, the
 * bounded request parse and the truthful outcome. What an accepted item actually
 * does lives in `../apply-proposal`, which is driven directly against real
 * repositories and real D1 constraints in the kernel suite.
 *
 * Consequences, all deliberate:
 *
 *   - the model never reaches this route, and its output is not accepted here.
 *     The browser sends the FIELDS the owner reviewed and possibly edited, and
 *     they are re-validated from scratch;
 *   - the browser sends the source record's ID, never its TYPE: the type is read
 *     from the row server-side, so a crafted request cannot choose which module's
 *     write path an item takes;
 *   - every write goes through the module's own repository (MEET-02's conversion
 *     authority, `scope.tasks`, `scope.entities` + `scope.noteDetails`,
 *     `scope.entityLinks`), so lifecycle guards, workspace scoping, atomicity and
 *     the ordinary Activity contract all apply unchanged;
 *   - the ACTOR is the authenticated owner. Activity says the owner created the
 *     Task or the Note, because the owner reviewed and approved it. AI is never
 *     the actor, and there is no extra "AI created this" event;
 *   - a target that has moved or been deleted since the proposal was generated is
 *     re-read here and refused rather than written against stale state.
 */

import { env } from "cloudflare:workers";

import { isAiProposalOutcome } from "~/kernel/ai";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import {
  MAX_ITEMS,
  applyProposalItems,
  proposalOutcome,
  resolveProposalSource,
} from "../apply-proposal";
import { aiJson } from "../ai-request";
import type { Route } from "./+types/apply";

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  const form = await request.formData();
  const usageId = String(form.get("usageId") ?? "").slice(0, 100);
  const intent = String(form.get("intent") ?? "");

  // Rejecting a proposal writes NOTHING to DalyHub data and records no Activity.
  // It updates one operational metadata field so the owner's usage detail is
  // truthful about what happened.
  if (intent === "reject") {
    if (usageId.length > 0) {
      await scope.aiUsage.recordProposalOutcome(usageId, "rejected");
    }
    return aiJson({ ok: true, applied: [] });
  }

  if (intent !== "accept") {
    return aiJson({ ok: false, message: "Unknown action." }, 400);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(String(form.get("items") ?? "[]")) as unknown;
  } catch {
    return aiJson(
      { ok: false, message: "That proposal couldn’t be read." },
      400,
    );
  }
  if (!Array.isArray(payload) || payload.length === 0) {
    return aiJson({ ok: false, message: "Nothing was selected." }, 400);
  }
  if (payload.length > MAX_ITEMS) {
    return aiJson({ ok: false, message: "Too many items at once." }, 400);
  }

  // The source record, read from storage. `sourceRecordId` is the ONLY thing the
  // browser gets to say about it; whether that id is a Meeting or a Note — and
  // therefore which write path its items take — is decided here.
  const source = await resolveProposalSource(scope, form.get("sourceRecordId"));

  const applied = await applyProposalItems({
    scope,
    source,
    items: payload,
    usageId,
    receipts: {
      db: env.DB,
      workspaceId: scope.context.workspaceId,
      ownerSubject: session.user.subject,
      now: new Date(),
    },
  });

  // A partial acceptance is recorded as a partial acceptance. It is never
  // rounded up to "accepted" because something worked.
  const outcome = proposalOutcome(applied);
  if (usageId.length > 0 && isAiProposalOutcome(outcome)) {
    await scope.aiUsage.recordProposalOutcome(usageId, outcome);
  }

  return aiJson({ ok: outcome !== "rejected", applied });
}
