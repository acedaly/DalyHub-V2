/**
 * MOBILE-03 — capturing during a meeting with no signal.
 *
 * A meeting is the workflow where DalyHub is most likely to be in a hand and
 * least likely to have a connection: a meeting room, a basement, a train.
 * `DALYHUB_MOBILE_FOUNDATION.md` §3.3 named Meetings the most valuable
 * extension to the offline slice for exactly that reason, and the 3.1 brief
 * (§35) asked for it bounded to "operations that can use clear idempotency and
 * conflict semantics".
 *
 * This is the Meeting half of the seam `task-inline-edit.ts` already holds for
 * Tasks, and it is deliberately the same shape:
 *
 *   **ATTEMPT, THEN QUEUE.** The request goes out first; only a transport
 *   failure queues. Nothing consults `navigator.onLine` before deciding, for
 *   the reason `offline-connection.ts` sets out at length — the flag reports
 *   whether the device has a link, not whether DalyHub is reachable through it,
 *   and a captive portal or a dead tunnel is online by that measure. The
 *   consequence that matters here is that the ONLINE path is exactly the
 *   request it always was: no probe, no storage read, no queue bookkeeping
 *   before the `fetch`.
 *
 * ── What is queueable, and what is not ───────────────────────────────────────
 * The four structured APPENDS — an agenda item, a decision, an outcome, an
 * action. Each adds one new row and overwrites nothing, so it cannot conflict
 * with another device, and its duplicate risk (a lost response) is answered by
 * the idempotency receipt the queue already mints. See
 * `app/kernel/offline/offline-mutation.ts` for the full argument.
 *
 * The meeting's NOTES body is NOT queueable, and that is a decision rather than
 * an omission. `notesMarkdown` is a single long string saved WHOLE under an
 * optimistic version precondition, so two devices appending to it offline would
 * each send a complete document that silently discards the other's paragraph —
 * the §4.7 problem `DALYHUB_MOBILE_FOUNDATION.md` explicitly says not to solve
 * by accident. Offline, the capture bar says so and offers the structured
 * types, which carry the same thought to the same meeting and do reconcile.
 */

import {
  isAppendOperation,
  type OfflineAppendOperation,
} from "~/kernel/offline";
import type { MeetingItemKind } from "~/kernel/meetings";
import { enqueueOfflineMutation } from "~/shared/offline";

/**
 * The append operation that creates each meeting item kind.
 *
 * The inverse of the kernel's `OFFLINE_APPEND_ITEM_KIND`, and the direction the
 * INTERFACE needs: the capture bar knows which list the owner chose, and has to
 * name the operation that writes it. Kept as an explicit map rather than
 * derived, so the compiler checks both directions are total and a unit test can
 * assert the two agree.
 */
export const MEETING_APPEND_OPERATION = {
  agenda: "add_agenda_item",
  decision: "add_decision",
  outcome: "add_outcome",
  action: "add_action",
} as const satisfies Record<MeetingItemKind, OfflineAppendOperation>;

/** What a capture attempt concluded. */
export type MeetingCaptureOutcome =
  /** DalyHub answered and accepted it. */
  | { readonly kind: "saved" }
  /** Unreachable, and the capture is now on this device. NOT confirmed. */
  | { readonly kind: "queued" }
  /** Refused — by DalyHub, or because it could not be queued either. */
  | { readonly kind: "refused"; readonly message: string };

/** The wording for a refusal DalyHub itself made, with no detail to disclose. */
const GENERIC_REFUSAL =
  "That couldn’t be saved. Your text is safe — try again.";

/**
 * True when a `fetch` rejection means "this device could not reach DalyHub".
 *
 * `fetch` rejects with a `TypeError` for every transport failure — no network,
 * DNS, TLS, a refused connection — and those are one fact from here. An
 * `AbortError` is deliberately NOT one of them: an aborted request was
 * cancelled by DalyHub itself (a page navigating away), and queueing a capture
 * the owner may not have finished making would be inventing intent.
 */
function isTransportFailure(cause: unknown): boolean {
  return !(cause instanceof DOMException && cause.name === "AbortError");
}

/**
 * Add one structured item to a meeting, queueing it if the device cannot reach
 * DalyHub.
 *
 * `body` is sent verbatim. It is NOT trimmed here: the canonical authority
 * (`scope.meetings.addItem`) owns what an acceptable body is, and a second
 * opinion formed on the client is the start of a second validator.
 */
export async function captureMeetingItem(
  meetingId: string,
  kind: MeetingItemKind,
  body: string,
): Promise<MeetingCaptureOutcome> {
  const form = new FormData();
  form.set("intent", "add_item");
  form.set("kind", kind);
  form.set("body", body);
  try {
    const response = await fetch(
      `/meeting/${encodeURIComponent(meetingId)}/mutate`,
      { method: "POST", body: form },
    );
    return response.ok
      ? { kind: "saved" }
      : { kind: "refused", message: GENERIC_REFUSAL };
  } catch (cause) {
    if (!isTransportFailure(cause)) {
      return { kind: "refused", message: GENERIC_REFUSAL };
    }
    return queueUnsentItem(meetingId, kind, body);
  }
}

/**
 * Queue a capture that could not be sent, and report it truthfully.
 *
 * A refusal here carries its REAL reason — no prior authenticated session on
 * this device, no usable storage, or the queue is at its bound — so the owner is
 * never told "try again" about something trying again will not fix.
 */
async function queueUnsentItem(
  meetingId: string,
  kind: MeetingItemKind,
  body: string,
): Promise<MeetingCaptureOutcome> {
  const operation = MEETING_APPEND_OPERATION[kind];
  /*
   * Defensive, and cheap: the map above is total over `MeetingItemKind`, but a
   * `kind` that arrived as an unchecked string from somewhere would otherwise
   * queue `undefined` as an operation and fail much later, inside replay, with
   * nothing to point at.
   */
  if (!isAppendOperation(operation)) {
    return { kind: "refused", message: GENERIC_REFUSAL };
  }
  const result = await enqueueOfflineMutation({
    entityId: meetingId,
    operation,
    value: body,
    // No base: an append replaces nothing. `createMutationRecord` enforces this
    // too, so a caller cannot give an append a base the server might compare.
  });
  return result.ok
    ? { kind: "queued" }
    : { kind: "refused", message: result.reason };
}
