import { env } from "cloudflare:workers";

import {
  ReviewArchivedError,
  ReviewConflictError,
  ReviewValidationError,
  type ReviewStatus,
  type ReviewSectionId,
} from "~/kernel/reviews";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { lifecycleBlockedByLinks } from "~/shared/record-lifecycle";

import { captureSnapshotForCompletedReview } from "../insights/review-insights-context";
import type { Route } from "./+types/mutate";

export type ReviewMutationResult =
  | { readonly kind: "rename"; readonly ok: true }
  | { readonly kind: "rename"; readonly ok: false; readonly formError: string }
  | {
      readonly kind: "update_section";
      readonly ok: true;
      /** The section's new stored `updatedAt`, so the editor can keep quoting a
       * current base version without a full reload (REVIEW-02). */
      readonly updatedAt: string;
    }
  | {
      readonly kind: "update_section";
      readonly ok: false;
      readonly formError: string;
      /** Set when a NEWER version of this section already exists (REVIEW-02). */
      readonly conflict?: true;
      /** The newer stored text, so the owner can see what they would have lost. */
      readonly currentBody?: string;
      readonly currentUpdatedAt?: string;
    }
  | { readonly kind: "lifecycle"; readonly ok: true }
  | {
      readonly kind: "lifecycle";
      readonly ok: false;
      readonly formError: string;
    }
  | { readonly kind: "delete"; readonly ok: true }
  | {
      readonly kind: "delete";
      readonly ok: false;
      readonly formError: string;
      /** Set when active relationships refused the purge (AUDIT-04 / DEBT-80). */
      readonly blockedReason?: "has_links";
      /** How many active relationships block it, so the UI can say how many. */
      readonly linkCount?: number;
    }
  | {
      readonly kind: "unknown";
      readonly ok: false;
      readonly formError: string;
    };

function json(data: ReviewMutationResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const reviewId = params.reviewId;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  const existing =
    intent === "delete"
      ? await scope.reviews.get(reviewId, { includeDeleted: true })
      : await scope.reviews.get(reviewId);
  if (!existing) throw new Response("Not Found", { status: 404 });

  try {
    if (intent === "rename") {
      await scope.reviews.updateTitle(
        reviewId,
        String(form.get("title") ?? ""),
      );
      return json({ kind: "rename", ok: true });
    }
    if (intent === "update_section") {
      const sectionId = String(form.get("sectionId") ?? "") as ReviewSectionId;
      /*
       * REVIEW-02 — optimistic concurrency for authored reflection.
       *
       * A caller that knows which version it loaded quotes it back as
       * `expectedUpdatedAt`; the repository then refuses to overwrite a newer
       * one. Callers that do not (the Review record's own section editors)
       * simply omit it and behave exactly as before, so nothing existing
       * changes behaviour.
       */
      const expectedRaw = form.get("expectedUpdatedAt");
      const expected =
        typeof expectedRaw === "string" && expectedRaw.length > 0
          ? new Date(expectedRaw)
          : null;
      const result = await scope.reviews.updateSection(
        reviewId,
        sectionId,
        String(form.get("body") ?? ""),
        expected !== null && !Number.isNaN(expected.getTime())
          ? { expectedUpdatedAt: expected }
          : {},
      );
      const stored = result.review.sections.find(
        (section) => section.sectionId === sectionId,
      );
      return json({
        kind: "update_section",
        ok: true,
        updatedAt: (stored?.updatedAt ?? new Date(0)).toISOString(),
      });
    }
    if (intent === "set_status") {
      await scope.reviews.setStatus(
        reviewId,
        String(form.get("status") ?? "") as ReviewStatus,
      );
      return json({ kind: "lifecycle", ok: true });
    }
    if (intent === "complete") {
      const result = await scope.reviews.complete(reviewId);
      // REVIEW-03 — record what was true at this Review point, so the NEXT
      // Review can say what changed. Best-effort by design: a failed capture
      // never turns a completion the owner made into an error.
      await captureSnapshotForCompletedReview(
        scope,
        session.user.subject,
        result.review,
      );
      return json({ kind: "lifecycle", ok: true });
    }
    if (intent === "reopen") {
      await scope.reviews.reopen(reviewId);
      return json({ kind: "lifecycle", ok: true });
    }
    if (intent === "archive") {
      await scope.reviews.archive(reviewId);
      return json({ kind: "lifecycle", ok: true });
    }
    if (intent === "restore") {
      await scope.reviews.restore(reviewId);
      return json({ kind: "lifecycle", ok: true });
    }
    if (intent === "delete") {
      const result = await scope.reviews.permanentlyDelete(reviewId);
      if (result.deleted) {
        return json({ kind: "delete", ok: true });
      }
      if (result.blockedReason === "has_links") {
        // A live relationship still points at this Review. Refusing is the
        // correct outcome, not an error — say what to do first (AUDIT-04).
        return json({
          kind: "delete",
          ok: false,
          blockedReason: "has_links",
          linkCount: result.linkCount,
          formError: lifecycleBlockedByLinks("review", result.linkCount),
        });
      }
      // Already gone (or a concurrent purge won): the caller's intent is
      // satisfied, so a repeat request is a calm success, never a 500.
      return json({ kind: "delete", ok: true });
    }
  } catch (cause) {
    if (cause instanceof ReviewConflictError) {
      // Someone else — another tab, the phone — wrote this section after the
      // version this request quoted. Refusing is the correct outcome: report the
      // newer text so nothing the owner wrote is lost, and never present it as a
      // storage failure.
      const current = await scope.reviews.get(reviewId);
      const sectionId = String(form.get("sectionId") ?? "") as ReviewSectionId;
      const stored = current?.sections.find(
        (section) => section.sectionId === sectionId,
      );
      return json(
        {
          kind: "update_section",
          ok: false,
          conflict: true,
          currentBody: stored?.body ?? "",
          currentUpdatedAt: (stored?.updatedAt ?? new Date(0)).toISOString(),
          formError:
            "This reflection was changed somewhere else. Your text was not saved over it — copy what you want to keep, then reload.",
        },
        409,
      );
    }
    if (cause instanceof ReviewValidationError) {
      return json(
        {
          kind: intent === "update_section" ? "update_section" : "rename",
          ok: false,
          formError: cause.message,
        },
        400,
      );
    }
    if (cause instanceof ReviewArchivedError) {
      return json(
        {
          kind: intent === "update_section" ? "update_section" : "lifecycle",
          ok: false,
          formError: cause.message,
        },
        409,
      );
    }
    return json(
      {
        kind: intent === "delete" ? "delete" : "lifecycle",
        ok: false,
        formError: "That change couldn’t be saved. Please try again.",
      },
      500,
    );
  }

  return json(
    { kind: "unknown", ok: false, formError: "Unknown action." },
    400,
  );
}
