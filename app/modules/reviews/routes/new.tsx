import { env } from "cloudflare:workers";
import { redirect } from "react-router";

import {
  ReviewValidationError,
  reviewTemplateId,
  type ReviewType,
} from "~/kernel/reviews";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

import { NewReviewForm } from "../NewReviewForm";
import type { Route } from "./+types/new";

export type NewReviewActionData =
  { readonly ok: true } | { readonly ok: false; readonly message: string };

function json(data: NewReviewActionData, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

export function meta() {
  return [{ title: "New Review · DalyHub" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const preferences = await scope.appPreferences.get(session.user.subject);
  return {
    defaults: {
      today: ownerCalendarIso(new Date(), preferences.timezone),
      firstDayOfWeek: preferences.firstDayOfWeek,
      dateFormat: preferences.dateFormat,
      timezone: preferences.timezone,
    },
  };
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  const form = await request.formData();
  const type = String(form.get("reviewType") ?? "") as ReviewType;
  const periodStart = String(form.get("periodStart") ?? "");
  const periodEnd = String(form.get("periodEnd") ?? "");
  const title = String(form.get("title") ?? "");

  try {
    const result = await scope.reviews.create({
      type,
      periodStart,
      periodEnd,
      title,
      templateId: reviewTemplateId(type),
    });
    return redirect(`/reviews/${encodeURIComponent(result.review.id)}`);
  } catch (cause) {
    if (cause instanceof ReviewValidationError) {
      return json({ ok: false, message: cause.message }, 400);
    }
    return json(
      {
        ok: false,
        message: "That review couldn't be created. Please try again.",
      },
      500,
    );
  }
}

export default function NewReviewRoute({ loaderData }: Route.ComponentProps) {
  return <NewReviewForm defaults={loaderData.defaults} />;
}
