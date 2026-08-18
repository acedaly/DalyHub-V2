/**
 * TASKS-05 — the ONE client-side seam between a DS-16 inline field and the canonical
 * Task routes.
 *
 * Every inline Task edit in the product — the Drawer's title, priority and dates, and
 * (new in V2.2) the same four plus the structural parent ON THE LIST ROW — goes
 * through these three functions. They exist because DS-16 fields want a
 * promise-returning `onSave` that resolves to an {@link InlineSaveOutcome}, while
 * React Router's fetchers are fire-and-forget: without a shared seam each surface
 * grows its own `fetch` + result-shape + error-wording, which is exactly how "change
 * this value where it is shown" ends up behaving differently in three places.
 *
 * What they are NOT:
 *
 *   - **not an authority.** They POST to `/tasks/:id` and `/tasks/bulk` — the same
 *     routes the Drawer, the bulk bar, Review Inbox and the quick-edit panel use.
 *     Validation, workspace scoping, atomicity and Activity all stay server-side.
 *   - **not optimistic.** A refusal is returned as `{ ok: false, message }` with the
 *     server's own wording, so the field keeps the previous value and the owner's
 *     draft. Whether a CALLER paints the new value while waiting is the caller's
 *     decision (ADR-086); nothing here applies anything, and nothing here reports an
 *     outcome the server did not give.
 *   - **not a revalidation policy.** The caller decides what to refresh, because a
 *     Drawer and a list row need different things reloaded.
 *
 * `basePath` exists only so a surface mounted under a different route prefix can say
 * so; it defaults to the canonical `/tasks`.
 */

import type { OfflineMutationOperation } from "~/kernel/offline";
import type { InlineSaveOutcome } from "~/shared/inline-edit";
import {
  enqueueTaskMutation,
  type TaskMutationIntent,
} from "~/shared/offline/mutation-queue";

import type { TaskActionData } from "./contract";

/** The wording used when the server said no but said nothing useful about why. */
const GENERIC_REFUSAL =
  "That change couldn’t be saved. Nothing was changed — try again.";

/* -------------------------------------------------------------------------- */
/* PWA-12 — the offline seam                                                  */
/* -------------------------------------------------------------------------- */

/**
 * The outcome of a Task mutation that could not reach DalyHub.
 *
 * A THIRD state beside "saved" and "refused", and the whole point of PWA-12:
 * the change is real, it is on this device, and it has NOT been confirmed by the
 * server. Every caller must be able to tell it apart from success, because the
 * one thing the interface must never do is claim a server mutation succeeded
 * when it has only been queued locally.
 */
export interface TaskQueuedOutcome {
  readonly ok: true;
  /** True when the change is queued locally rather than confirmed by DalyHub. */
  readonly queued: true;
}

/** What a Task mutation can conclude, online or offline. */
export type TaskSaveOutcome =
  | { readonly ok: true; readonly queued?: false }
  | TaskQueuedOutcome
  | { readonly ok: false; readonly message: string };

/**
 * What a caller must supply for a mutation to be queueable when it cannot be
 * sent.
 *
 * Absence is meaningful: a mutation with no `offline` descriptor is NOT part of
 * the PWA-12 slice, and a transport failure on it is reported as an ordinary
 * refusal exactly as it was before. That is how the slice stays bounded — a Task
 * operation becomes offline-capable by being described here, never by being
 * near one that is.
 */
export interface TaskOfflineIntent {
  readonly operation: OfflineMutationOperation;
  /** TASKS-13 — the checklist item a tick addresses, for operations that name one. */
  readonly targetId?: string | null;
  /** The intended value, already canonical (a date is `YYYY-MM-DD`, never "tomorrow"). */
  readonly value?: string | null;
  /** The value the surface was showing. The base the server compares against. */
  readonly baseValue?: string | null;
  readonly baseUpdatedAt?: string | null;
}

/**
 * True when a `fetch` rejection means "this device could not reach DalyHub".
 *
 * `fetch` rejects with a `TypeError` for every transport failure — no network,
 * DNS, TLS, a refused connection — and those are one fact from here. An `AbortError`
 * is deliberately NOT one of them: an aborted request was cancelled by DalyHub
 * itself (a page navigating away), and queueing a change the owner may not have
 * finished making would be inventing intent.
 */
function isTransportFailure(cause: unknown): boolean {
  return !(cause instanceof DOMException && cause.name === "AbortError");
}

/**
 * Queue a Task mutation that could not be sent, and report it truthfully.
 *
 * A refusal here is reported with its REAL reason — no prior authenticated
 * session on this device, no usable storage, or the queue is at its bound — so
 * the owner is never told "try again" about something trying again will not fix.
 */
async function queueUnsent(
  taskId: string,
  offline: TaskOfflineIntent,
): Promise<TaskSaveOutcome> {
  const intent: TaskMutationIntent = {
    entityId: taskId,
    targetId: offline.targetId ?? null,
    operation: offline.operation,
    value: offline.value ?? null,
    baseValue: offline.baseValue ?? null,
    baseUpdatedAt: offline.baseUpdatedAt ?? null,
  };
  const result = await enqueueTaskMutation(intent);
  return result.ok
    ? { ok: true, queued: true }
    : { ok: false, message: result.reason };
}

/** What a Task record mutation concluded, including the offline third state. */
export type TaskRecordOutcome =
  /** DalyHub answered. `data` is its own result, success or refusal. */
  | { readonly kind: "server"; readonly data: TaskActionData }
  /** Unreachable, and the intent is now on this device. NOT confirmed. */
  | { readonly kind: "queued" }
  /** Unreachable, and it could not be queued either. */
  | { readonly kind: "refused"; readonly message: string };

/**
 * POST a canonical Task intent, queueing it if this device cannot reach DalyHub.
 *
 * The seam PWA-12 hangs on. It is an ATTEMPT-THEN-QUEUE, deliberately, rather
 * than a check of `navigator.onLine` before deciding: the request outcome is the
 * only trustworthy evidence of reachability (`offline-connection.ts` explains at
 * length why the browser's flag is not), and this way the ONLINE path is exactly
 * the request it always was — no probe, no storage read, no queue bookkeeping,
 * nothing added before the fetch (§40).
 *
 * The cost of attempting first is one failed request, which offline is immediate.
 */
export async function postTaskRecordActionOffline(
  taskId: string,
  fields: Readonly<Record<string, string>>,
  offline: TaskOfflineIntent,
  basePath = "/tasks",
): Promise<TaskRecordOutcome> {
  try {
    return {
      kind: "server",
      data: await postTaskRecordAction(taskId, fields, basePath),
    };
  } catch (cause) {
    if (!isTransportFailure(cause)) {
      return { kind: "refused", message: GENERIC_REFUSAL };
    }
    const queued = await queueUnsent(taskId, offline);
    return queued.ok
      ? { kind: "queued" }
      : { kind: "refused", message: queued.message };
  }
}

/**
 * POST an intent to the canonical Task record route and return its typed outcome.
 * Never throws for a rejected mutation — a transport failure is the only throw, and
 * the wrappers below turn that into a refusal too.
 */
export async function postTaskRecordAction(
  taskId: string,
  fields: Readonly<Record<string, string>>,
  basePath = "/tasks",
): Promise<TaskActionData> {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  const response = await fetch(`${basePath}/${encodeURIComponent(taskId)}`, {
    method: "POST",
    body,
  });
  return (await response.json()) as TaskActionData;
}

/**
 * A record-route mutation as a DS-16 save outcome. `field` names the `fieldErrors`
 * key to prefer, so a rejected title shows the title's message rather than a generic
 * one.
 */
export async function saveTaskRecordField(
  taskId: string,
  fields: Readonly<Record<string, string>>,
  options: {
    readonly basePath?: string;
    readonly field?: string;
    readonly fallback?: string;
    /**
     * PWA-12 — how to queue this edit if the device cannot reach DalyHub. Omit
     * for any Task operation outside the offline slice: its transport failure is
     * then reported as an ordinary refusal, exactly as before.
     */
    readonly offline?: TaskOfflineIntent;
  } = {},
): Promise<InlineSaveOutcome> {
  const fallback = options.fallback ?? GENERIC_REFUSAL;
  try {
    const result = await postTaskRecordAction(
      taskId,
      fields,
      options.basePath ?? "/tasks",
    );
    if (
      (result.kind === "update" ||
        result.kind === "planning" ||
        result.kind === "waiting") &&
      result.status === "success"
    ) {
      return { ok: true };
    }
    if (
      (result.kind === "update" ||
        result.kind === "planning" ||
        result.kind === "waiting") &&
      result.status === "error"
    ) {
      const named =
        options.field === undefined
          ? undefined
          : result.fieldErrors?.[options.field];
      return { ok: false, message: named ?? result.formError ?? fallback };
    }
    return { ok: false, message: fallback };
  } catch (cause) {
    if (options.offline && isTransportFailure(cause)) {
      const queued = await queueUnsent(taskId, options.offline);
      // `queued` is reported as a SUCCESS to the field, because the owner's edit
      // was accepted and the control must show the new value. It is not reported
      // as a server success anywhere: the pending state that says so is driven by
      // the queue itself, not by this return.
      return queued.ok ? { ok: true } : { ok: false, message: queued.message };
    }
    return { ok: false, message: fallback };
  }
}

/**
 * The typed outcome of a `/tasks/bulk` mutation, as a client sees it. Never throws:
 * a transport failure becomes a refusal with the fallback wording, because a surface
 * that has just painted an optimistic row needs an answer either way.
 */
export type TaskBulkOutcome =
  | { readonly ok: true; readonly changed: number; readonly unchanged: number }
  | { readonly ok: false; readonly message: string };

/**
 * POST an intent to the canonical `/tasks/bulk` route for one or more ids.
 *
 * It is a plain `fetch` rather than a router fetcher deliberately: a fetcher is one
 * in-flight request per hook instance, and a second submission supersedes the first.
 * That was tolerable while every row mutation blocked the surface behind it; once the
 * list stopped blocking (ADR-086), two rows completed in quick succession became an
 * ordinary thing to do, and each one needs its own request and its own answer.
 */
export async function postTaskBulkAction(
  ids: readonly string[],
  fields: Readonly<Record<string, string>>,
  options: { readonly basePath?: string; readonly fallback?: string } = {},
): Promise<TaskBulkOutcome> {
  const fallback = options.fallback ?? GENERIC_REFUSAL;
  const body = new FormData();
  for (const id of ids) body.append("id", id);
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  try {
    const response = await fetch(`${options.basePath ?? "/tasks"}/bulk`, {
      method: "POST",
      body,
    });
    const result = (await response.json()) as {
      readonly ok?: boolean;
      readonly formError?: string;
      readonly changed?: number;
      readonly unchanged?: number;
    };
    return result.ok === true
      ? {
          ok: true,
          changed: result.changed ?? 0,
          unchanged: result.unchanged ?? 0,
        }
      : { ok: false, message: result.formError ?? fallback };
  } catch {
    return { ok: false, message: fallback };
  }
}

/**
 * A SINGLE-ID `/tasks/bulk` field change as a DS-16 save outcome — the same trusted,
 * atomic, Activity-correct authority the bulk bar uses for a whole selection. Using
 * it for one task is deliberate: a field edited from a row and the same field edited
 * for fourteen rows then travel one code path, so they cannot drift.
 */
export async function saveTaskBulkField(
  taskId: string,
  fields: Readonly<Record<string, string>>,
  options: {
    readonly basePath?: string;
    readonly fallback?: string;
    /** PWA-12 — how to queue this edit if the device cannot reach DalyHub. */
    readonly offline?: TaskOfflineIntent;
  } = {},
): Promise<InlineSaveOutcome> {
  const fallback = options.fallback ?? GENERIC_REFUSAL;
  const body = new FormData();
  body.append("id", taskId);
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  try {
    const response = await fetch(`${options.basePath ?? "/tasks"}/bulk`, {
      method: "POST",
      body,
    });
    const result = (await response.json()) as {
      readonly ok?: boolean;
      readonly formError?: string;
    };
    return result.ok
      ? { ok: true }
      : { ok: false, message: result.formError ?? fallback };
  } catch (cause) {
    // The ONLINE path for a row field stays on `/tasks/bulk` — the same atomic
    // authority the bulk bar uses, unchanged. Only the OFFLINE replay of that
    // same edit travels through `/tasks/:id`, because a queued intent addresses
    // exactly one Task and the record route is where a single Task's conflict
    // can be arbitrated field by field. Both endpoints reach the same Task
    // domain; neither is a second authority.
    if (options.offline && isTransportFailure(cause)) {
      const queued = await queueUnsent(taskId, options.offline);
      return queued.ok ? { ok: true } : { ok: false, message: queued.message };
    }
    return { ok: false, message: fallback };
  }
}
