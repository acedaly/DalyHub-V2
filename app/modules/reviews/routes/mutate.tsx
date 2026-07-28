import { env } from "cloudflare:workers";

import {
  ReviewArchivedError,
  ReviewValidationError,
  type ReviewStatus,
  type ReviewSectionId,
} from "~/kernel/reviews";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import type { Route } from "./+types/mutate";

export type ReviewMutationResult =
  | { readonly kind: "rename"; readonly ok: true }
  | { readonly kind: "rename"; readonly ok: false; readonly formError: string }
  | { readonly kind: "update_section"; readonly ok: true }
  | {
      readonly kind: "update_section";
      readonly ok: false;
      readonly formError: string;
    }
  | { readonly kind: "lifecycle"; readonly ok: true }
  | {
      readonly kind: "lifecycle";
      readonly ok: false;
      readonly formError: string;
    }
  | { readonly kind: "delete"; readonly ok: true }
  | { readonly kind: "delete"; readonly ok: false; readonly formError: string }
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
      await scope.reviews.updateSection(
        reviewId,
        String(form.get("sectionId") ?? "") as ReviewSectionId,
        String(form.get("body") ?? ""),
      );
      return json({ kind: "update_section", ok: true });
    }
    if (intent === "set_status") {
      await scope.reviews.setStatus(
        reviewId,
        String(form.get("status") ?? "") as ReviewStatus,
      );
      return json({ kind: "lifecycle", ok: true });
    }
    if (intent === "complete") {
      await scope.reviews.complete(reviewId);
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
      await scope.reviews.permanentlyDelete(reviewId);
      return json({ kind: "delete", ok: true });
    }
  } catch (cause) {
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
