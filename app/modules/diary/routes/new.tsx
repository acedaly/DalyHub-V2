/**
 * DIARY-01 — the quick-capture endpoint (`POST /diary/new`).
 *
 * An action-only resource route (no UI): the trusted server boundary for
 * capturing a Diary Entry. Authentication is re-checked
 * (`requireAuthenticatedSession`) and the workspace scope is resolved from
 * TRUSTED server configuration (`resolveAuthenticatedWorkspaceScope`) — the
 * client never supplies a workspace id (ADR-010/ADR-016 §5.6).
 *
 * Capture goes through the RESERVED `DiaryRepository.create` (never a bare
 * `entities.create` of a `diary` row — the generic repository refuses that): it
 * writes the entity row, the chronological detail row and the one
 * `diary_entry.created` Activity event atomically, so an entry can never exist
 * without its detail slice. The minimum viable capture is a type and a title;
 * `occurredAt` defaults to now, and only an explicit "when" backdates it. All
 * untrusted input is validated by the kernel's Diary validators — a
 * `DiaryValidationError` becomes a field error the form can show inline while
 * keeping the user's draft. Returns a real JSON Response so the DS-06 form posts
 * with a plain `fetch` (mirrors `~/modules/notes/routes/new.tsx`).
 */

import { env } from "cloudflare:workers";

import { DiaryValidationError } from "~/kernel/diary";
import {
  applyCaptureRelationship,
  compensateCapturedRecord,
  validateCaptureContextForCreate,
} from "~/platform/capture/capture-context.server";
import { readIdempotencyKey, withReplayGuard } from "~/platform/offline";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import { ownerLocalToUtc } from "../occurred-time";
import type { Route } from "./+types/new";

/** The default entry type when the quick-capture form names none — the neutral
 * built-in kind, consistent with DIARY-01A's backfill default. */
const DEFAULT_ENTRY_TYPE = "note";

/** The discriminated capture outcome the form consumes. */
export type CreateDiaryEntryResult =
  | { readonly ok: true; readonly entryId: string }
  | {
      readonly ok: false;
      readonly formError?: string;
      readonly fieldErrors?: Readonly<Record<string, string>>;
      readonly createdId?: string;
    };

function json(data: CreateDiaryEntryResult, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

/** Map a kernel validation field to the form's field name. */
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

/** Capture the entry. Unchanged DIARY-01 behaviour, extracted so the PWA-05
 * replay guard can wrap it without touching how an entry is captured. */
async function handleCreate(
  scope: Awaited<ReturnType<typeof resolveAuthenticatedWorkspaceScope>>,
  ownerSubject: string,
  form: FormData,
): Promise<CreateDiaryEntryResult> {
  const title = String(form.get("title") ?? "");
  const rawType = String(form.get("entryType") ?? "").trim();
  const entryType = rawType.length > 0 ? rawType : DEFAULT_ENTRY_TYPE;
  const rawBody = String(form.get("body") ?? "");
  const body = rawBody.length > 0 ? rawBody : null;
  const whenLocal = String(form.get("when") ?? "").trim();
  // AUDIT-14 — the owner's timezone from the ONE scope-level authority,
  // resolved once per request and shared with every other module that
  // asks what day it is. Degrades to the documented default on a read
  // failure, so a missing preference never takes the page down.
  const timezone = await scope.ownerTimeZone();

  // Backdating is optional: an explicit owner-local "when" is converted to the
  // UTC instant the kernel stores; an absent "when" leaves occurredAt to default
  // to the capture time. A malformed "when" is a calm field error, never a throw.
  let occurredAt: Date | undefined;
  if (whenLocal.length > 0) {
    const converted = ownerLocalToUtc(whenLocal, timezone);
    if (!converted) {
      return {
        ok: false,
        fieldErrors: { when: "Enter a valid date and time." },
      };
    }
    occurredAt = converted;
  }

  try {
    const captureContext = await validateCaptureContextForCreate(
      scope,
      "diary",
      form.get("captureContext"),
    );
    const entry = await scope.diary.create({
      entryType,
      title,
      body,
      timezone,
      ...(occurredAt ? { occurredAt } : {}),
    });
    try {
      await applyCaptureRelationship(scope, entry.id, captureContext);
    } catch {
      const compensated = await compensateCapturedRecord(
        scope,
        entry.id,
        "diary",
      );
      return {
        ok: false,
        createdId: entry.id,
        formError: compensated
          ? "The diary entry couldn’t be linked to that context, so it was not kept. Try again from the record or create it without the context."
          : "The diary entry was captured but could not be linked to that context. Open it and link it manually.",
      };
    }
    return { ok: true, entryId: entry.id };
  } catch (cause) {
    if (cause instanceof DiaryValidationError) {
      return {
        ok: false,
        fieldErrors: { [fieldNameFor(cause.field)]: cause.message },
      };
    }
    return {
      ok: false,
      formError: "That entry couldn’t be captured. Please try again.",
    };
  }
}

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const form = await request.formData();
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  // PWA-05 — a replayed offline capture carries the key it was queued with, so a
  // retry returns the already-captured entry instead of capturing a second one.
  return json(
    await withReplayGuard(
      {
        db: env.DB,
        workspaceId: scope.context.workspaceId,
        ownerSubject: session.user.subject,
        kind: "diary",
        now: new Date(),
      },
      readIdempotencyKey(form),
      () => handleCreate(scope, session.user.subject, form),
      (result) => (result.ok ? result.entryId : null),
      (entryId) => ({ ok: true, entryId }),
      (reason) => ({ ok: false, formError: reason }),
    ),
  );
}
