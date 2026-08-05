/**
 * AI-01 — the proposal APPLY route: the only path from an AI proposal to DalyHub
 * data, and the one place the product's governing rule is enforced in code.
 *
 *   DalyHub selects evidence. AI returns a bounded proposal. The OWNER decides
 *   what becomes part of DalyHub.
 *
 * Consequences, all deliberate:
 *
 *   - the model never reaches this route, and its output is not accepted here.
 *     The browser sends the FIELDS the owner reviewed and possibly edited, and
 *     they are re-validated from scratch;
 *   - every write goes through the module's own repository (`scope.tasks`,
 *     `scope.entityLinks`), so lifecycle guards, workspace scoping, atomicity and
 *     the ordinary Activity contract all apply unchanged;
 *   - the ACTOR is the authenticated owner. Activity says the owner created the
 *     Task, because the owner reviewed and approved it. AI is never the actor;
 *   - a target that has moved or been deleted since the proposal was generated is
 *     re-read here and refused rather than written against stale state.
 */

import { env } from "cloudflare:workers";

import { isAiProposalOutcome, parseIsoCalendarDate } from "~/kernel/ai";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { aiJson } from "../ai-request";
import type { Route } from "./+types/apply";

/** What one accepted item produced. */
interface AppliedItem {
  readonly index: number;
  readonly kind: "task" | "link";
  readonly ok: boolean;
  readonly id?: string;
  readonly message?: string;
}

/** The maximum items one acceptance may carry. Bounded like everything else. */
const MAX_ITEMS = 20;

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

  const applied: AppliedItem[] = [];

  for (const [index, entry] of payload.entries()) {
    if (typeof entry !== "object" || entry === null) {
      applied.push({
        index,
        kind: "task",
        ok: false,
        message: "Invalid item.",
      });
      continue;
    }
    const item = entry as Record<string, unknown>;
    const kind = item.kind === "link" ? "link" : "task";

    try {
      if (kind === "task") {
        applied.push(await applyTask(scope, index, item));
      } else {
        applied.push(await applyLink(scope, index, item));
      }
    } catch {
      applied.push({
        index,
        kind,
        ok: false,
        message: "That couldn’t be saved. Nothing was changed for this item.",
      });
    }
  }

  const anyOk = applied.some((entry) => entry.ok);
  const allOk = applied.every((entry) => entry.ok);
  if (usageId.length > 0) {
    const outcome = allOk
      ? "accepted"
      : anyOk
        ? "partially_accepted"
        : "rejected";
    if (isAiProposalOutcome(outcome)) {
      await scope.aiUsage.recordProposalOutcome(usageId, outcome);
    }
  }

  return aiJson({ ok: anyOk, applied });
}

/**
 * Create one Task from a reviewed proposal.
 *
 * The title and dates are the OWNER'S values as they left the review surface —
 * edited or not — and every one is re-validated here. A suggested Project is
 * re-read through `getTaskParentCandidate`, so a Project archived or deleted
 * between the proposal and the acceptance is refused rather than written to.
 */
async function applyTask(
  scope: Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>,
  index: number,
  item: Record<string, unknown>,
): Promise<AppliedItem> {
  const title = String(item.title ?? "")
    .trim()
    .slice(0, 200);
  if (title.length === 0) {
    return { index, kind: "task", ok: false, message: "A title is required." };
  }

  let dueDate: string | null;
  let scheduledDate: string | null;
  try {
    dueDate = parseIsoCalendarDate(item.dueDate ?? null);
    scheduledDate = parseIsoCalendarDate(item.scheduledDate ?? null);
  } catch {
    return {
      index,
      kind: "task",
      ok: false,
      message: "That date isn’t a real calendar date.",
    };
  }

  const projectId = String(item.projectId ?? "").trim();
  let parent: { kind: "area" | "project"; id: string } | null = null;
  if (projectId.length > 0) {
    const candidate = await scope.tasks.getTaskParentCandidate(projectId);
    if (candidate === null) {
      return {
        index,
        kind: "task",
        ok: false,
        message:
          "That Project is no longer available. The Task wasn’t created — choose another.",
      };
    }
    parent = { kind: candidate.kind, id: candidate.id };
  }

  const created = await scope.tasks.createTask({
    title,
    parent,
    dueDate,
    scheduledDate,
  });
  return { index, kind: "task", ok: true, id: created.id };
}

/**
 * Create one EntityLink from a reviewed proposal. `entityLinks.create` validates
 * both endpoints in the bound workspace and is idempotent by relationship
 * identity, so accepting the same link twice is a no-op rather than a duplicate.
 */
async function applyLink(
  scope: Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>,
  index: number,
  item: Record<string, unknown>,
): Promise<AppliedItem> {
  const sourceEntityId = String(item.sourceEntityId ?? "").trim();
  const targetEntityId = String(item.targetEntityId ?? "").trim();
  if (sourceEntityId.length === 0 || targetEntityId.length === 0) {
    return {
      index,
      kind: "link",
      ok: false,
      message: "That link is incomplete.",
    };
  }
  // Re-read the target: a record deleted since the proposal was generated must
  // not be linked to.
  const target = await scope.entities.getById(targetEntityId);
  if (target === null) {
    return {
      index,
      kind: "link",
      ok: false,
      message: "That record is no longer available.",
    };
  }
  const result = await scope.entityLinks.create({
    sourceEntityId,
    targetEntityId,
    type: "relates_to",
  });
  return { index, kind: "link", ok: true, id: result.link.id };
}
