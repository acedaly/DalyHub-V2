/**
 * DIARY-01 — the entry-edit endpoint (`POST /diary/:entryId/mutate`).
 *
 * An action-only resource route (no UI). The `entryId` is verified to be an
 * ACTIVE `diary` entity in THIS workspace BEFORE any write, so a note/task/
 * project id (or a cross-workspace id) can never reach `entities.update` /
 * `diary.update` — it gets the calm 404 and nothing is mutated (mirrors the
 * Notes mutate guard).
 *
 * Ownership is split exactly as ADR-041 requires and the two writes are NOT
 * pretended to be one transaction:
 *   - TITLE (identity/lifecycle) goes through the generic `EntityRepository`.
 *   - the DETAIL slice (type, body, occurred-at, timezone) goes through the
 *     reserved `DiaryRepository`, atomic with its own `diary_entry.updated`
 *     event; it is idempotent, so an unchanged edit writes nothing and appends
 *     no duplicate event.
 *
 * Every field is validated with the kernel's Diary validators BEFORE either
 * write, so a validation failure rejects the whole edit with the user's draft
 * intact and no partial write. If a write nonetheless fails after another
 * succeeds (a storage/conflict fault), the response names which parts persisted
 * so the state is visible and the user can retry — the two repositories are
 * honestly two writes, not a forged atomic pair.
 */

import { env } from "cloudflare:workers";

import {
  DiaryConflictError,
  DiaryNotFoundError,
  DiaryValidationError,
  validateDiaryBody,
  validateDiaryEntryType,
  validateDiaryTitle,
  validateOccurredAt,
  validateTimezone,
} from "~/kernel/diary";
import { EntityValidationError } from "~/kernel/entities";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { DIARY_DISPLAY_TIME_ZONE, ownerLocalToUtc } from "../occurred-time";
import type { Route } from "./+types/mutate";

/** Which parts of an edit were persisted (for honest partial-failure reporting). */
export type DiarySavedPart = "title" | "detail";

/** The discriminated edit outcome the editor consumes. */
export type DiaryMutationResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
      /** Parts that DID persist before a later part failed (recoverable). */
      readonly savedParts?: readonly DiarySavedPart[];
    };

function json(data: DiaryMutationResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function fieldNameFor(field: string): string {
  switch (field) {
    case "title":
      return "title";
    case "entryType":
      return "entryType";
    case "body":
      return "body";
    case "occurredAt":
    case "timezone":
      return "when";
    default:
      return "when";
  }
}

export async function action({ request, params, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const entryId = params.entryId;
  const form = await request.formData();

  const scope = await resolveAuthenticatedWorkspaceScope(env, session);

  // The anchor must be an ACTIVE `diary` entity in THIS workspace. `getById`
  // returns null for a missing id, a soft-deleted entity and a cross-workspace
  // id alike; the explicit type check stops a wrong-type id from ever being
  // mutated through this endpoint.
  const entity = await scope.entities.getById(entryId);
  if (!entity || entity.type !== "diary") {
    throw new Response("Not Found", { status: 404 });
  }

  const rawTitle = String(form.get("title") ?? "");
  const rawType = String(form.get("entryType") ?? "").trim();
  const rawBody = String(form.get("body") ?? "");
  const whenLocal = String(form.get("when") ?? "").trim();
  const timezone = DIARY_DISPLAY_TIME_ZONE;

  // Validate EVERY field up front, collecting field errors, so a validation
  // failure rejects the whole edit before any write (no partial writes on a
  // validation error).
  const fieldErrors: Record<string, string> = {};
  let title = "";
  let entryType = "";
  let body: string | null = null;
  let occurredAt: Date | undefined;

  try {
    title = validateDiaryTitle(rawTitle);
  } catch (cause) {
    if (cause instanceof DiaryValidationError)
      fieldErrors.title = cause.message;
    else throw cause;
  }
  try {
    entryType = validateDiaryEntryType(rawType);
  } catch (cause) {
    if (cause instanceof DiaryValidationError)
      fieldErrors.entryType = cause.message;
    else throw cause;
  }
  try {
    body = validateDiaryBody(rawBody.length > 0 ? rawBody : null);
  } catch (cause) {
    if (cause instanceof DiaryValidationError) fieldErrors.body = cause.message;
    else throw cause;
  }
  if (whenLocal.length === 0) {
    fieldErrors.when = "A date and time is required.";
  } else {
    const converted = ownerLocalToUtc(whenLocal, timezone);
    if (!converted) {
      fieldErrors.when = "Enter a valid date and time.";
    } else {
      try {
        occurredAt = validateOccurredAt(converted);
        validateTimezone(timezone);
      } catch (cause) {
        if (cause instanceof DiaryValidationError)
          fieldErrors.when = cause.message;
        else throw cause;
      }
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    return json({ ok: false, fieldErrors });
  }

  const savedParts: DiarySavedPart[] = [];

  // TITLE — only when it actually changed, so an unchanged title never appends a
  // spurious rename Activity event.
  if (title !== entity.title) {
    try {
      await scope.entities.update(entryId, { title });
      savedParts.push("title");
    } catch (cause) {
      if (cause instanceof EntityValidationError) {
        return json({ ok: false, fieldErrors: { title: cause.message } });
      }
      return json({
        ok: false,
        formError: "That entry couldn't be saved. Please try again.",
      });
    }
  }

  // DETAIL — idempotent: an unchanged detail slice writes nothing and appends no
  // event. A `DiaryNotFoundError` here means the entry was removed between the
  // guard and the write (fail closed); a validation error is surfaced inline.
  try {
    await scope.diary.update(entryId, {
      entryType,
      body,
      ...(occurredAt ? { occurredAt } : {}),
      timezone,
    });
    savedParts.push("detail");
  } catch (cause) {
    if (cause instanceof DiaryValidationError) {
      // The title may already have persisted; report both the field error and
      // what was saved so the state is visible and recoverable.
      return json({
        ok: false,
        fieldErrors: { [fieldNameFor(cause.field)]: cause.message },
        ...(savedParts.length > 0 ? { savedParts } : {}),
      });
    }
    if (cause instanceof DiaryNotFoundError) {
      // The title may already have persisted before the detail row vanished;
      // report what was saved so the honest partial-failure contract holds.
      return json({
        ok: false,
        formError: "That entry is no longer available.",
        ...(savedParts.length > 0 ? { savedParts } : {}),
      });
    }
    if (cause instanceof DiaryConflictError) {
      return json({
        ok: false,
        formError: "That entry changed elsewhere. Reopen it and try again.",
        ...(savedParts.length > 0 ? { savedParts } : {}),
      });
    }
    return json({
      ok: false,
      formError: "The details couldn't be saved. Please try again.",
      ...(savedParts.length > 0 ? { savedParts } : {}),
    });
  }

  return json({ ok: true });
}
