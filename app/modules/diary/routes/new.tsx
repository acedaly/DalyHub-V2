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
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
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

export async function action({ request, context }: Route.ActionArgs) {
  if (request.method !== "POST") {
    throw new Response("Method Not Allowed", { status: 405 });
  }
  const session = requireAuthenticatedSession(context);
  const form = await request.formData();

  const title = String(form.get("title") ?? "");
  const rawType = String(form.get("entryType") ?? "").trim();
  const entryType = rawType.length > 0 ? rawType : DEFAULT_ENTRY_TYPE;
  const rawBody = String(form.get("body") ?? "");
  const body = rawBody.length > 0 ? rawBody : null;
  const whenLocal = String(form.get("when") ?? "").trim();
  const scope = await resolveAuthenticatedWorkspaceScope(env, session);
  let timezone = DEFAULT_APP_PREFERENCES.timezone;
  try {
    timezone = (await scope.appPreferences.get(session.user.subject)).timezone;
  } catch {
    // Capture remains available with the deterministic default.
  }

  // Backdating is optional: an explicit owner-local "when" is converted to the
  // UTC instant the kernel stores; an absent "when" leaves occurredAt to default
  // to the capture time. A malformed "when" is a calm field error, never a throw.
  let occurredAt: Date | undefined;
  if (whenLocal.length > 0) {
    const converted = ownerLocalToUtc(whenLocal, timezone);
    if (!converted) {
      return json({
        ok: false,
        fieldErrors: { when: "Enter a valid date and time." },
      });
    }
    occurredAt = converted;
  }

  try {
    const entry = await scope.diary.create({
      entryType,
      title,
      body,
      timezone,
      ...(occurredAt ? { occurredAt } : {}),
    });
    return json({ ok: true, entryId: entry.id });
  } catch (cause) {
    if (cause instanceof DiaryValidationError) {
      return json({
        ok: false,
        fieldErrors: { [fieldNameFor(cause.field)]: cause.message },
      });
    }
    return json({
      ok: false,
      formError: "That entry couldn't be captured. Please try again.",
    });
  }
}
