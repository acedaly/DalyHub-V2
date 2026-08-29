/**
 * CAPTURE-01 — the universal capture application service.
 *
 * ONE function turns a validated {@link CaptureRequest} into a DalyHub record,
 * and every transport calls it: the HTTP endpoint an Apple Shortcut posts to,
 * Siri (which is that Shortcut, invoked by voice), the iOS Share Sheet (that
 * Shortcut again, invoked with page context) and inbound email. A future browser
 * extension, macOS Shortcut, Raycast command or native iOS client feeds this
 * same function; none of them gets a capture backend of its own (CAPTURE-01 §46).
 *
 * ── What it does NOT do ─────────────────────────────────────────────────────
 * It creates nothing itself. A captured Task is created by `TaskRepository
 * .createTask` — the same atomic create `/tasks/new` uses, with the same
 * validation, the same Activity and the same `task_details` write. A captured
 * Note is `EntityRepository.create` plus the Note's own canonical content
 * mutation, exactly as the Notes editor writes it. There is no second create
 * path and no capture-owned table (AGENTS.md CAPTURE-01 §9.8).
 *
 * ── The order, and why it is the order ──────────────────────────────────────
 *   1. classify (deterministic, conservative, Inbox on doubt);
 *   2. check the credential may create that kind — BEFORE any write, so a
 *      refusal writes nothing at all;
 *   3. claim the idempotency key, if one was sent, through the EXISTING PWA-05
 *      receipt protocol. `create` runs at most once per key per workspace, and
 *      the database arbitrates under concurrency, not application code;
 *   4. create the record;
 *   5. append `capture.received` INSIDE the claim, so a replay does not append a
 *      second provenance event for one effective capture (CAPTURE-01 §53).
 */

import {
  CAPTURE_RECEIVED,
  CaptureFailedError,
  CapturePermissionError,
  CaptureReplayConflictError,
  capturePathFor,
  captureTokenAllows,
  classifyCapture,
  composeCaptureNoteBody,
  composeCaptureTaskDescription,
  deriveCaptureTitle,
  truncateCaptureTitle,
  type CaptureCapability,
  type CaptureOutcome,
  type CaptureReceivedPayload,
  type CaptureRequest,
} from "~/kernel/capture";
import { withCaptureIdempotency } from "~/platform/offline";
import type { WorkspaceScope } from "~/platform/workspaces";
import {
  interpretationIsMeaningful,
  parseQuickCapture,
  resolveCapturedRecurrenceAnchor,
} from "~/shared/task-record/quick-capture";

/**
 * The verified provenance of a capture — who is capturing and from where.
 *
 * Resolved SERVER-SIDE from the credential, never from the request body. This is
 * the value that makes workspace isolation structural rather than checked: the
 * scope handed in is the credential's workspace, and there is no parameter here
 * through which another one could be named (CAPTURE-01 §36).
 */
export type CaptureCredentialContext = {
  /** The capture credential's stable id, or `"email"` for inbound email. */
  readonly identity: string;
  /** The credential id recorded in Activity, or null for email. */
  readonly captureTokenId: string | null;
  /** The owner-facing device name, or null. */
  readonly deviceName: string | null;
  /** What this credential may create. */
  readonly capabilities: readonly CaptureCapability[];
};

/** Everything the service needs beyond the scope and the request. */
export type CaptureExecution = {
  readonly credential: CaptureCredentialContext;
  /**
   * The D1 binding, for the PWA-05 idempotency receipts only.
   *
   * Passed explicitly rather than reached for through the scope: the receipt
   * protocol is a platform mechanism operating BESIDE the domain repositories,
   * and giving `WorkspaceScope` a raw database handle would hand every module a
   * way around the repositories it exists to route through.
   */
  readonly db: D1Database;
  /** The instant the capture is being processed. Injected so tests are deterministic. */
  readonly now: Date;
  /** The owner's calendar day, for the deterministic date grammar. */
  readonly todayIso: string;
};

/** The receipt `record_kind` a capture claims, matching the PWA-05 closed set. */
const RECEIPT_KIND = { task: "task", note: "note" } as const;

/**
 * The idempotency key actually stored, namespaced by credential.
 *
 * Namespacing is what makes "same credential + same clientCaptureId = the same
 * capture" true and its converse safe: two DIFFERENT devices that happen to send
 * the same client id never collide, so one phone can never replay another's
 * capture or be told its own is a duplicate (CAPTURE-01 §10). The bounds are arranged so the
 * composed value always satisfies the existing receipt-key grammar.
 */
export function namespacedCaptureKey(
  identity: string,
  clientCaptureId: string,
): string {
  return `cap-${identity}-${clientCaptureId}`;
}

/** True when the deterministic Task parser recognised real planning grammar. */
function planningGrammarProbe(todayIso: string): (text: string) => boolean {
  return (text: string) =>
    interpretationIsMeaningful(parseQuickCapture(text, { todayIso }));
}

/**
 * Run a capture. Throws only typed {@link CaptureError}s, so the transport can
 * always build a safe response from the failure.
 */
export async function runCapture(
  scope: WorkspaceScope,
  request: CaptureRequest,
  execution: CaptureExecution,
): Promise<CaptureOutcome> {
  const classification = classifyCapture(
    request,
    planningGrammarProbe(execution.todayIso),
  );
  const kind = classification.kind;

  if (!captureTokenAllows(execution.credential, kind)) {
    throw new CapturePermissionError(
      kind === "task"
        ? "This capture device is not allowed to create tasks."
        : "This capture device is not allowed to create notes.",
    );
  }

  const create = async (): Promise<{
    readonly recordId: string;
    readonly title: string;
  }> =>
    kind === "task"
      ? await createCapturedTask(scope, request, execution)
      : await createCapturedNote(scope, request);

  const finish = async (
    recordId: string,
    title: string,
    replayed: boolean,
  ): Promise<CaptureOutcome> => ({
    id: recordId,
    kind,
    title,
    destination: classification.destination,
    path: capturePathFor(kind, recordId),
    replayed,
  });

  // No idempotency key: create directly. This is the DalyHub-internal and
  // best-effort case; a Shortcut always sends one.
  if (request.clientCaptureId === null) {
    const created = await guarded(create);
    await recordCaptureActivity(
      scope,
      request,
      execution,
      classification.destination,
      kind,
    );
    return finish(created.recordId, created.title, false);
  }

  const key = namespacedCaptureKey(
    execution.credential.identity,
    request.clientCaptureId,
  );

  // The title is needed for the response even on a replay, where nothing is
  // created. It is derived from the request, which is by definition identical for
  // a replay of the same capture, so the answer is stable without a read.
  let createdTitle: string | null = null;

  const result = await withCaptureIdempotency(
    {
      db: execution.db,
      workspaceId: scope.context.workspaceId,
      ownerSubject: `capture:${execution.credential.identity}`,
      kind: RECEIPT_KIND[kind],
      now: execution.now,
    },
    key,
    async () => {
      const created = await guarded(create);
      createdTitle = created.title;
      // Inside the claim: appended exactly once per effective capture, never
      // again on a replay (CAPTURE-01 §53).
      await recordCaptureActivity(
        scope,
        request,
        execution,
        classification.destination,
        kind,
      );
      return { recordId: created.recordId };
    },
  );

  if (!result.ok) {
    throw new CaptureReplayConflictError(result.reason);
  }
  return finish(
    result.recordId,
    createdTitle ?? fallbackTitle(request, kind, execution),
    result.replayed,
  );
}

/** Wrap a creation so a storage failure becomes the one safe capture failure. */
async function guarded<T>(create: () => Promise<T>): Promise<T> {
  try {
    return await create();
  } catch (cause) {
    throw new CaptureFailedError({ cause });
  }
}

/**
 * The title a replay reports when this request did not create the record.
 *
 * A replay reads nothing back — the receipt holds an id, not a title — so the
 * title is RE-DERIVED from the request. That is sound precisely because both
 * derivations are deterministic: a Note's title comes from the same pure
 * function, and a Task's from the same parser against the same owner day. A
 * replay therefore reports the title the record actually has, without a read.
 */
function fallbackTitle(
  request: CaptureRequest,
  kind: "task" | "note",
  execution: CaptureExecution,
): string {
  if (kind === "note") return deriveCaptureTitle(request);
  const parsed = parseQuickCapture(taskTitleFor(request), {
    todayIso: execution.todayIso,
  });
  return truncateCaptureTitle(parsed.title, 512);
}

/** The raw text a Task's title is derived from before the parser runs. */
function taskTitleFor(request: CaptureRequest): string {
  if (request.title !== null && request.title.length > 0) return request.title;
  const firstLine = request.text
    .split("\n")
    .find((line) => line.trim().length > 0);
  return (firstLine ?? request.text).trim();
}

/* -------------------------------------------------------------------------- */
/* Task capture                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Create a captured Task through the SAME atomic `createTask` the application's
 * own capture surfaces use, with the SAME deterministic parser (CAPTURE-01 §7).
 *
 * A Task captured externally is always UNASSIGNED — an Inbox Task. No Project or
 * Area is resolved, because the parser has no reliable Project grammar and a
 * fuzzy match that files work under the wrong Project is worse than an Inbox
 * that needs triage (CAPTURE-01 §39).
 *
 * A recurrence phrase is submitted only when the capture carries the date it
 * would repeat from, mirroring `applyRecurrenceFields`: recognising "every
 * Monday" without an anchor and inventing one would be the parser guessing.
 */
async function createCapturedTask(
  scope: WorkspaceScope,
  request: CaptureRequest,
  execution: CaptureExecution,
): Promise<{ readonly recordId: string; readonly title: string }> {
  const source = taskTitleFor(request);
  /*
   * V2.6 FIND-04 — the workspace's tag vocabulary, so an external capture of
   * `#ERRAND` attaches the tag the owner already has rather than a second one.
   *
   * One bounded read, on the capture path only. It fails SOFT: a vocabulary
   * that could not be read leaves every recognised tag "new", which is what an
   * offline replay gets too — the tag still attaches, under the spelling the
   * sentence used, because the storage layer canonicalises either way.
   */
  const knownTags = await scope.tags
    .listVocabulary()
    .catch(() => [] as readonly { key: string; label: string }[]);
  const interpretation = parseQuickCapture(source, {
    todayIso: execution.todayIso,
    knownTags,
  });

  // The SAME anchor resolution the in-app surfaces use, rather than a second copy of
  // it here. This transport carries no date controls of its own, so the dates it
  // merges are exactly the ones the sentence named.
  const recurrence = interpretation.recurrence;
  const anchor = resolveCapturedRecurrenceAnchor(
    recurrence,
    {
      scheduledDate: interpretation.scheduledDate,
      dueDate: interpretation.dueDate,
    },
    execution.todayIso,
  );
  const scheduledDate =
    interpretation.scheduledDate ?? anchor?.impliedScheduledDate ?? null;

  const description = composeCaptureTaskDescription(request, source);

  const task = await scope.tasks.createTask({
    title: interpretation.title,
    parent: null,
    ...(interpretation.priority ? { priority: interpretation.priority } : {}),
    ...(interpretation.timeSector
      ? { timeSector: interpretation.timeSector }
      : {}),
    ...(interpretation.commitmentState !== "active"
      ? { commitmentState: interpretation.commitmentState }
      : {}),
    ...(interpretation.dueDate ? { dueDate: interpretation.dueDate } : {}),
    ...(scheduledDate ? { scheduledDate } : {}),
    ...(recurrence !== null && anchor !== null
      ? {
          recurrence: {
            frequency: recurrence.frequency,
            dateKind: anchor.dateKind,
            interval: recurrence.interval,
            // TASKS-11 — the scheduling mode the phrase selected, carried through the
            // transport unchanged. `POST /api/capture` gains no recurrence FIELD for
            // this: the endpoint's contract is natural-language capture through the
            // shared parser, so the sentence is the whole input (CAPTURE-01 §7).
            mode: recurrence.mode,
            weekdays: [...recurrence.weekdays],
          },
        }
      : {}),
    ...(description === null ? {} : { description }),
    // V2.6 FIND-04 — the recognised tags, written in the SAME create batch as
    // the Task, so a captured `#errand` either commits with its tag or not at
    // all. The recorded unknown-tag decision applies here without a preview to
    // offer creation in: an external capture has no surface to confirm on, so
    // the tag it names is the tag it gets, and the owner sees it on the Task.
    ...(interpretation.tags.length > 0
      ? { tags: interpretation.tags.map((tag) => tag.label) }
      : {}),
  });

  return { recordId: task.id, title: task.title };
}

/* -------------------------------------------------------------------------- */
/* Note capture                                                               */
/* -------------------------------------------------------------------------- */

/**
 * Create a captured Note: the generic entity, then the Note's OWN canonical
 * content mutation, so the body lands in the same Markdown source and the same
 * `note.content_updated` Activity as text typed in the editor (CAPTURE-01 §40). A quick
 * Note is still a Note — there is no reduced capture-only note entity.
 *
 * D1 has no interactive transaction spanning two repositories, so a failure
 * between them is COMPENSATED: the empty Note is soft-deleted and the capture
 * fails, which leaves the owner's text on their phone where the Shortcut's
 * failure path can offer it back (CAPTURE-01 §30). A half-written note the owner never
 * learns about would be the worse outcome.
 */
async function createCapturedNote(
  scope: WorkspaceScope,
  request: CaptureRequest,
): Promise<{ readonly recordId: string; readonly title: string }> {
  const title = deriveCaptureTitle(request);
  const note = await scope.entities.create({ type: "note", title });
  const body = composeCaptureNoteBody(request);
  if (body.length > 0) {
    try {
      await scope.noteDetails.update(note.id, body);
    } catch (cause) {
      try {
        await scope.entities.softDelete(note.id);
      } catch {
        // Compensation itself failed. The Note exists with its title and no
        // body; the capture still fails, so the owner keeps their text and can
        // see the titled Note. Nothing is silently reported as saved.
      }
      throw cause;
    }
  }
  return { recordId: note.id, title: note.title };
}

/* -------------------------------------------------------------------------- */
/* Activity                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Append the `capture.received` provenance event.
 *
 * DalyHub's own in-app capture records nothing here — the PWA is DalyHub, and an
 * event saying a DalyHub record arrived via DalyHub is noise. Everything that
 * came from OUTSIDE does, so the workspace feed can honestly say "Task created
 * via Apple Shortcut" (CAPTURE-01 §18).
 *
 * A failure is swallowed. The event explains a record that already exists and
 * already has its own `entity.created` history; losing the annotation is a small
 * harm, and failing the owner's capture to preserve it is a large one. This
 * mirrors how SET-03 treats its own workspace events at the call site.
 */
async function recordCaptureActivity(
  scope: WorkspaceScope,
  request: CaptureRequest,
  execution: CaptureExecution,
  destination: CaptureOutcome["destination"],
  kind: CaptureOutcome["kind"],
): Promise<void> {
  if (request.source === "dalyhub") return;
  const payload: CaptureReceivedPayload = {
    source: request.source,
    kind,
    destination,
    captureTokenId: execution.credential.captureTokenId,
    deviceName: execution.credential.deviceName,
  };
  try {
    await scope.workspaceEvents.record({
      type: CAPTURE_RECEIVED,
      payload: { ...payload },
    });
  } catch {
    // Deliberately swallowed — see above.
  }
}
