/**
 * AI-02 — the proposal ACCEPTANCE engine.
 *
 * `routes/apply.tsx` is the HTTP boundary; this is what it does. Extracted so the
 * whole of it can be driven against real repositories and real D1 constraints in
 * the kernel suite, rather than only through a route that needs a Worker `env`.
 *
 * The governing rule, restated where it is enforced:
 *
 *   DalyHub selects evidence. AI returns a bounded proposal. The OWNER decides
 *   what becomes part of DalyHub.
 *
 * Four properties follow, and each is a decision rather than an implementation
 * detail:
 *
 *   1. **The model's output never reaches here.** The browser submits the FIELDS
 *      the owner reviewed and possibly edited; every one is re-validated from
 *      scratch against DalyHub's own ceilings.
 *   2. **The source is resolved server-side.** The browser sends an id, never a
 *      type. `resolveProposalSource` reads the record and takes the type from
 *      the row, so a crafted `sourceType: "meeting"` on a Note cannot route a
 *      Note's Task through the Meeting conversion authority.
 *   3. **Every write goes through the module that owns it.** A Meeting-derived
 *      Task goes through MEET-02's `meeting_items` → Task conversion (DEBT-90);
 *      a Note goes through the canonical entity + note-details repositories; a
 *      relationship goes through FND-04 EntityLinks, using the SAME relationship
 *      vocabulary the ordinary capture-from-a-record path uses. Nothing here
 *      invents a second path, a second link type or a second Activity contract.
 *   4. **The actor is the authenticated owner**, on every event, because the
 *      owner reviewed and approved it. AI is never an Activity actor, and no
 *      "AI created this" event is written — an accepted proposal produces
 *      EXACTLY the events the same action taken by hand would produce.
 */

import { LIMITS, parseIsoCalendarDate, sha256Hex } from "~/kernel/ai";
import { EntityValidationError } from "~/kernel/entities";
import { MeetingArchivedError, MeetingNotFoundError } from "~/kernel/meetings";
import { NoteDetailsValidationError } from "~/kernel/notes";
import {
  SpineParentUnavailableError,
  SpineValidationError,
} from "~/kernel/spine";
import { TaskProjectArchivedError, TaskValidationError } from "~/kernel/tasks";
import {
  MeetingItemNotFoundError,
  convertMeetingProposalToTask,
} from "~/platform/meetings";
import { compensateCapturedRecord } from "~/platform/capture/capture-context.server";
import {
  withReplayGuard,
  type CaptureReceiptContext,
} from "~/platform/offline";
import type { WorkspaceScope } from "~/platform/workspaces";
import { captureRelationshipPlan } from "~/shared/capture/capture-context";
import { TASK_RELATES_TO } from "~/shared/task-record/task-view";

/** What one accepted item produced. */
export interface AppliedItem {
  readonly index: number;
  readonly kind: "task" | "note" | "link";
  readonly ok: boolean;
  readonly id?: string;
  /**
   * `false` when an existing record was returned idempotently rather than a new
   * one created — a replayed acceptance, or a meeting item that was already
   * converted. Present only on a successful item.
   */
  readonly created?: boolean;
  readonly message?: string;
}

/** The maximum items one acceptance may carry. Bounded like everything else. */
export const MAX_ITEMS = 20;

/** The Task description ceiling at acceptance. DalyHub's, not the provider's. */
const MAX_DESCRIPTION = LIMITS.summary;

/** The universal "related" relationship every Linked Items surface reads. */
const UNIVERSAL_RELATED_LINK = "link.related";

/**
 * The record a proposal was generated from, as READ BY THE SERVER.
 *
 * There is no constructor that takes a type from a request. The only way to
 * obtain one is `resolveProposalSource`, which reads the entity row.
 */
export interface ProposalSource {
  readonly kind: "meeting" | "note";
  readonly id: string;
  readonly title: string;
}

/**
 * Resolve the proposal's source record from an id alone.
 *
 * Returns `null` for anything that is not a live Meeting or Note in the bound
 * workspace — missing, soft-deleted, the wrong entity type and another
 * workspace's record are all indistinguishable, as everywhere else in DalyHub.
 * The caller then refuses the items that need a source; it does NOT fall back to
 * a browser-supplied type.
 */
export async function resolveProposalSource(
  scope: WorkspaceScope,
  rawId: unknown,
): Promise<ProposalSource | null> {
  const id = String(rawId ?? "").trim();
  if (id.length === 0 || id.length > 128) return null;
  const entity = await scope.entities.getById(id);
  if (entity === null) return null;
  if (entity.type === "meeting") {
    return { kind: "meeting", id: entity.id, title: entity.title };
  }
  if (entity.type === "note") {
    return { kind: "note", id: entity.id, title: entity.title };
  }
  return null;
}

/** Everything one acceptance needs. */
export interface ApplyProposalInput {
  readonly scope: WorkspaceScope;
  /** The server-resolved source, or `null` when the proposal names none. */
  readonly source: ProposalSource | null;
  /** The reviewed items, exactly as the browser submitted them. */
  readonly items: readonly unknown[];
  /**
   * The usage row this acceptance belongs to. Used ONLY to derive stable
   * idempotency keys — never trusted as evidence that a proposal existed.
   */
  readonly usageId: string;
  /**
   * The PWA-05 receipt context, when one is available. Absent (in a plain unit
   * setting) simply means no replay guard: creation still happens, so behaviour
   * degrades to "a retry may create a second record", which is exactly the
   * pre-existing behaviour rather than a new failure mode.
   */
  readonly receipts?: Omit<CaptureReceiptContext, "kind"> | null;
}

/**
 * Apply the owner's accepted items, in order, reporting each independently.
 *
 * Items are deliberately INDEPENDENT: one that fails does not abandon the rest,
 * and — this is the part that matters — a failure is reported as a failure. The
 * caller derives `accepted` / `partially_accepted` / `rejected` from these
 * results, so a partial acceptance can never be reported to the owner as a
 * complete one.
 */
export async function applyProposalItems(
  input: ApplyProposalInput,
): Promise<readonly AppliedItem[]> {
  const applied: AppliedItem[] = [];

  for (const [index, entry] of input.items.entries()) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      applied.push({
        index,
        kind: "task",
        ok: false,
        message: "Invalid item.",
      });
      continue;
    }
    const item = entry as Record<string, unknown>;
    const kind =
      item.kind === "link" ? "link" : item.kind === "note" ? "note" : "task";

    try {
      applied.push(await applyOne(input, index, kind, item));
    } catch (cause) {
      // The LAST resort. Every expected refusal is mapped to an owner-readable
      // sentence below; this catches the unexpected, and it deliberately says
      // nothing about the cause — no D1, SQLite, SQL, provider or stack text
      // reaches the browser (AGENTS.md §17).
      applied.push({
        index,
        kind,
        ok: false,
        message: refusalFor(cause),
      });
    }
  }

  return applied;
}

async function applyOne(
  input: ApplyProposalInput,
  index: number,
  kind: AppliedItem["kind"],
  item: Record<string, unknown>,
): Promise<AppliedItem> {
  if (kind === "link") return applyLink(input, index, item);
  if (kind === "note") return applyMeetingNote(input, index, item);
  if (input.source?.kind === "meeting") {
    return applyMeetingTask(input, index, item, input.source);
  }
  if (input.source?.kind === "note") {
    return applyNoteTask(input, index, item, input.source);
  }
  return applyUnsourcedTask(input, index, item);
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Field re-validation                                                        */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * The canonical identity of an accepted item: EVERY field the acceptance would
 * write, in a fixed order.
 *
 * This is what the replay key is derived from, and using the title alone was a
 * defect: an owner who fixed a date, chose a Project or rewrote a Note body and
 * resubmitted would have hit the same key, been handed the record the first
 * attempt created, and been told it succeeded — with their edits silently
 * discarded. A retry of the SAME acceptance still matches; a retry of a
 * DIFFERENT one is a different key and creates the record actually asked for.
 */
function identityOfTask(reviewed: ReviewedTask): string {
  return JSON.stringify([
    reviewed.title,
    reviewed.description,
    reviewed.dueDate,
    reviewed.scheduledDate,
    reviewed.parent?.kind ?? null,
    reviewed.parent?.id ?? null,
  ]);
}

function identityOfNote(reviewed: ReviewedNote): string {
  return JSON.stringify([reviewed.title, reviewed.body]);
}

/** One re-validated Task, as the owner left the review surface. */
interface ReviewedTask {
  readonly title: string;
  readonly description: string | null;
  readonly dueDate: string | null;
  readonly scheduledDate: string | null;
  readonly parent: {
    readonly kind: "area" | "project";
    readonly id: string;
  } | null;
}

/** A refusal carrying the sentence the owner sees. Never echoes a cause. */
class ItemRefused extends Error {}

function refuse(message: string): never {
  throw new ItemRefused(message);
}

/**
 * Re-validate the reviewed Task fields and re-read its Project.
 *
 * The Project is re-read through `getTaskParentCandidate` rather than trusted:
 * one archived or deleted between the proposal and the acceptance is refused,
 * not written to — the same rule ordinary Task creation applies.
 */
async function reviewedTask(
  scope: WorkspaceScope,
  item: Record<string, unknown>,
): Promise<ReviewedTask> {
  const title = String(item.title ?? "")
    .trim()
    .slice(0, LIMITS.title);
  if (title.length === 0) refuse("A title is required.");

  let dates: { due: string | null; scheduled: string | null };
  try {
    dates = {
      due: parseIsoCalendarDate(item.dueDate ?? null),
      scheduled: parseIsoCalendarDate(item.scheduledDate ?? null),
    };
  } catch {
    refuse("That date isn’t a real calendar date.");
  }

  const rawDescription = String(item.description ?? "").trim();
  if (rawDescription.length > MAX_DESCRIPTION) {
    refuse("That description is too long.");
  }

  const projectId = String(item.projectId ?? "").trim();
  let parent: ReviewedTask["parent"] = null;
  if (projectId.length > 0) {
    const candidate = await scope.tasks.getTaskParentCandidate(projectId);
    if (candidate === null) {
      refuse(
        "That Project is no longer available. The Task wasn’t created — choose another.",
      );
    }
    parent = { kind: candidate.kind, id: candidate.id };
  }

  return {
    title,
    description: rawDescription.length > 0 ? rawDescription : null,
    dueDate: dates.due,
    scheduledDate: dates.scheduled,
    parent,
  };
}

/** One re-validated Note, as the owner left the review surface. */
interface ReviewedNote {
  readonly title: string;
  readonly body: string;
}

/**
 * Re-validate the reviewed Note fields.
 *
 * The ceilings are DalyHub's own and are applied AGAIN here — the schema
 * validator bounded what the model returned, and this bounds what the owner
 * submits after editing it. Neither is a substitute for the other.
 */
function reviewedNote(item: Record<string, unknown>): ReviewedNote {
  const title = String(item.title ?? "").trim();
  if (title.length === 0) refuse("A title is required.");
  if (title.length > LIMITS.noteTitle) refuse("That title is too long.");

  const body = String(item.body ?? "");
  if (body.length > LIMITS.noteBody) refuse("That note is too long.");

  return { title, body };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Tasks                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * DEBT-90 — accept a Task proposed from a MEETING.
 *
 * This is the defect this release exists to fix. The Task no longer goes
 * straight to `scope.tasks.createTask`: it goes through MEET-02's conversion
 * authority, which creates or reuses the meeting action item, converts it, writes
 * the `meeting_item_tasks` mapping and the structural Activity in one batch, and
 * asserts the navigable `task.relates_to` link. The Task therefore appears in the
 * Meeting's Follow-up tab as CONVERTED, which it previously did not.
 *
 * The owner's reviewed values — title, description, due date, scheduled date and
 * the chosen Project (or Inbox) — are what is converted, not the model's.
 *
 * **When an existing conversion comes back, the report is checked against the
 * reviewed fields before it is called a success.** Action-item reuse is keyed on
 * the approved TEXT, which is what keeps the Meeting from accumulating duplicate
 * action items — but it means two accepted proposals sharing a title, or a title
 * matching an item converted weeks ago, resolve to the SAME already-converted
 * Task. MEET-02 then correctly returns that Task without applying this
 * proposal's dates, Project or description.
 *
 * Reporting that as `ok` would be a lie of exactly the kind this release exists
 * to remove: the owner would be told their reviewed values are in DalyHub when
 * they were discarded. Overwriting the existing Task would be worse — it is a
 * canonical Task the owner may have edited since, and an acceptance is not a
 * licence to rewrite one. So the difference is REPORTED, and the owner decides.
 */
async function applyMeetingTask(
  input: ApplyProposalInput,
  index: number,
  item: Record<string, unknown>,
  source: ProposalSource,
): Promise<AppliedItem> {
  const reviewed = await reviewedTask(input.scope, item);
  /*
   * The SAME replay guard the Note and unsourced paths use, and this path needs
   * it MORE than they do rather than less.
   *
   * Sequential replay is idempotent without it: the second attempt finds the
   * action item the first created, and the conversion finds that item's live
   * mapping. SIMULTANEOUS acceptance is not, and the conversion's own uniqueness
   * index cannot arbitrate it — both calls read the Meeting before either action
   * item exists, both find nothing to reuse, and `addItem` allocates each of them
   * a DIFFERENT ordinal and a DIFFERENT item id, so
   * `meeting_item_tasks (workspace_id, item_id)` sees two distinct items and
   * admits both. Two Tasks, one approved proposal.
   *
   * `guarded` closes that at the point the race actually starts: the claim is a
   * DATABASE row keyed on the acceptance's own deterministic key (usage id, item
   * index, kind, reviewed identity), so exactly one of two simultaneous accepts
   * proceeds and the other is answered with the first one's result. No new table,
   * no migration, no second idempotency mechanism — the one this file already
   * uses, applied to the path that was missing it.
   */
  return guarded(input, index, "task", identityOfTask(reviewed), async () => {
    const result = await convertMeetingProposalToTask(input.scope, source.id, {
      itemBody: reviewed.title,
      fields: {
        title: reviewed.title,
        parent: reviewed.parent,
        dueDate: reviewed.dueDate,
        scheduledDate: reviewed.scheduledDate,
        description: reviewed.description,
      },
    });
    if (!result.created) {
      const existing = await input.scope.tasks.getTask(result.taskId);
      if (existing !== null && !matchesReviewedTask(existing, reviewed)) {
        return {
          index,
          kind: "task",
          ok: false,
          id: result.taskId,
          message:
            "That action is already a Task on this meeting, and it doesn’t match what you reviewed. Nothing was changed — open the existing Task to edit it, or change the title to add a separate one.",
        };
      }
    }

    return {
      index,
      kind: "task",
      ok: true,
      id: result.taskId,
      created: result.created,
    };
  });
}

/**
 * True when an existing Task already holds exactly the reviewed values.
 *
 * Compared field by field rather than by a digest, because a Task carries more
 * than an acceptance sets (priority, sector, status, delegation) and those are
 * the owner's, set through the ordinary Task surfaces. Only the fields this path
 * would have written are compared.
 */
function matchesReviewedTask(
  existing: {
    readonly title: string;
    readonly dueDate: string | null;
    readonly scheduledDate: string | null;
    readonly description: unknown;
    readonly project: { readonly id: string } | null;
    readonly area: { readonly id: string } | null;
  },
  reviewed: ReviewedTask,
): boolean {
  const parentId = existing.project?.id ?? existing.area?.id ?? null;
  const description =
    typeof existing.description === "string" && existing.description.length > 0
      ? existing.description
      : null;
  return (
    existing.title === reviewed.title &&
    existing.dueDate === reviewed.dueDate &&
    existing.scheduledDate === reviewed.scheduledDate &&
    parentId === (reviewed.parent?.id ?? null) &&
    description === reviewed.description
  );
}

/**
 * Accept a Task proposed from a NOTE, and keep its source relationship.
 *
 * Deliberately NOT routed through the Meeting conversion authority: a Note has no
 * `meeting_items`, and forcing one through that path would be inventing a second
 * meaning for a Meeting-owned table. The relationship instead uses the canonical
 * capture vocabulary — a `task.relates_to` link from the Task to the Note, which
 * is exactly what "new Task, captured from this Note" already creates — so the
 * Note's Linked Items shows it with no new surface.
 */
async function applyNoteTask(
  input: ApplyProposalInput,
  index: number,
  item: Record<string, unknown>,
  source: ProposalSource,
): Promise<AppliedItem> {
  const reviewed = await reviewedTask(input.scope, item);

  return guarded(input, index, "task", identityOfTask(reviewed), async () => {
    // AUDIT-13 — the description is part of the create, not a second
    // transaction after it. `createTask` takes it, so an invalid one fails
    // BEFORE anything is written rather than needing to be compensated.
    const task = await input.scope.tasks.createTask({
      title: reviewed.title,
      parent: reviewed.parent,
      dueDate: reviewed.dueDate,
      scheduledDate: reviewed.scheduledDate,
      description: reviewed.description,
    });
    try {
      // Idempotent by relationship identity, so a retry re-asserts rather than
      // duplicating the link.
      await input.scope.entityLinks.create({
        sourceEntityId: task.id,
        targetEntityId: source.id,
        type: TASK_RELATES_TO,
      });
    } catch (cause) {
      // The Task without its source link is not what the owner accepted, so it
      // is compensated and the failure reported — never reported as saved.
      const compensated = await compensateCapturedRecord(
        input.scope,
        task.id,
        "task",
      );
      if (compensated) throw cause;
      return {
        index,
        kind: "task" as const,
        ok: false,
        id: task.id,
        message:
          "The Task was created but couldn’t be linked back to this Note. Open the Task and link it yourself.",
      };
    }
    return {
      index,
      kind: "task" as const,
      ok: true,
      id: task.id,
      created: true,
    };
  });
}

/**
 * Accept a Task with no resolvable source record.
 *
 * Reached when the proposal named no source, or named one that has since been
 * deleted. The Task is still the owner's to create — it is ordinary Task
 * creation through the canonical repository, exactly as before this release —
 * but nothing is linked and nothing is converted, because there is no live
 * record to link or convert against.
 */
async function applyUnsourcedTask(
  input: ApplyProposalInput,
  index: number,
  item: Record<string, unknown>,
): Promise<AppliedItem> {
  const reviewed = await reviewedTask(input.scope, item);
  // AUDIT-13 — one transaction, description included. This path has no
  // relationship to write afterwards, so accepting an unsourced Task is now
  // atomic outright: it either exists exactly as the owner approved it, or not
  // at all, with nothing to compensate.
  const created = await input.scope.tasks.createTask({
    title: reviewed.title,
    parent: reviewed.parent,
    dueDate: reviewed.dueDate,
    scheduledDate: reviewed.scheduledDate,
    description: reviewed.description,
  });
  return { index, kind: "task", ok: true, id: created.id, created: true };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Notes                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * AI-02 — accept a Note proposed from a Meeting.
 *
 * After this runs there is nothing "AI" about the result: an ordinary Note, with
 * ordinary Markdown content, linked to the Meeting by the ordinary `link.related`
 * relationship the capture path already uses for "a Note created from this
 * Meeting". No table stores the generated body, no event says a model wrote it,
 * and the owner is the actor on every event.
 *
 * The source Meeting is re-read at acceptance, so one archived or deleted since
 * the proposal was generated refuses rather than being linked to.
 */
async function applyMeetingNote(
  input: ApplyProposalInput,
  index: number,
  item: Record<string, unknown>,
): Promise<AppliedItem> {
  const source = input.source;
  if (source === null || source.kind !== "meeting") {
    return {
      index,
      kind: "note",
      ok: false,
      message:
        "That Meeting is no longer available, so the note wasn’t created.",
    };
  }
  const reviewed = reviewedNote(item);

  const meeting = await input.scope.meetings.get(source.id);
  if (meeting === null) {
    return {
      index,
      kind: "note",
      ok: false,
      message:
        "That Meeting is no longer available, so the note wasn’t created.",
    };
  }
  if (meeting.archivedAt !== null) {
    // An archived Meeting is read-only, and that has to mean the same thing for
    // every acceptance. A Task is refused by the conversion authority's own
    // lifecycle guard; a Note would otherwise slip past it, because creating a
    // Note and linking to a Meeting does not write to the Meeting at all. The
    // owner archived it — nothing new attaches to it until they restore it.
    return {
      index,
      kind: "note",
      ok: false,
      message:
        "This meeting is archived — restore it before keeping notes from it.",
    };
  }

  // The relationship comes from the canonical capture plan rather than a literal
  // typed here, so a Note created from a Meeting by acceptance and one created
  // from a Meeting by the New Note button carry the SAME relationship.
  const plan = captureRelationshipPlan("note", "meeting");
  if (plan.kind !== "entity_link") {
    return {
      index,
      kind: "note",
      ok: false,
      message: "That note couldn’t be linked to this Meeting.",
    };
  }

  return guarded(input, index, "note", identityOfNote(reviewed), async () => {
    const note = await input.scope.entities.create({
      type: "note",
      title: reviewed.title,
    });
    try {
      if (reviewed.body.length > 0) {
        await input.scope.noteDetails.update(note.id, reviewed.body);
      }
      const sourceEntityId =
        plan.direction === "captured_to_context" ? note.id : source.id;
      const targetEntityId =
        plan.direction === "captured_to_context" ? source.id : note.id;
      await input.scope.entityLinks.create({
        sourceEntityId,
        targetEntityId,
        type: plan.linkType,
      });
    } catch (cause) {
      const compensated = await compensateCapturedRecord(
        input.scope,
        note.id,
        "note",
      );
      if (compensated) throw cause;
      return {
        index,
        kind: "note" as const,
        ok: false,
        id: note.id,
        message:
          "The note was created but couldn’t be linked to this Meeting. Open it and link it yourself.",
      };
    }
    return {
      index,
      kind: "note" as const,
      ok: true,
      id: note.id,
      created: true,
    };
  });
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Links                                                                      */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Create one EntityLink from a reviewed suggestion.
 *
 * The SOURCE is the server-resolved source record wherever there is one — the
 * browser's value is used only when the proposal named no source, and even then
 * `entityLinks.create` validates both endpoints in the bound workspace. The type
 * is `link.related`, the universal relationship the Linked Items surfaces read;
 * AI-01 used a bare `relates_to` here, which was a type nothing else in DalyHub
 * speaks and which therefore never appeared in Linked Items.
 *
 * `create` is idempotent by relationship identity, so accepting the same link
 * twice is a no-op rather than a duplicate.
 */
async function applyLink(
  input: ApplyProposalInput,
  index: number,
  item: Record<string, unknown>,
): Promise<AppliedItem> {
  const sourceEntityId =
    input.source?.id ?? String(item.sourceEntityId ?? "").trim();
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
  const target = await input.scope.entities.getById(targetEntityId);
  if (target === null) {
    return {
      index,
      kind: "link",
      ok: false,
      message: "That record is no longer available.",
    };
  }
  const result = await input.scope.entityLinks.create({
    sourceEntityId,
    targetEntityId,
    type: UNIVERSAL_RELATED_LINK,
  });
  return {
    index,
    kind: "link",
    ok: true,
    id: result.link.id,
    created: result.outcome === "created",
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Idempotency                                                                */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Run a creation under the PWA-05 replay guard, keyed on this exact acceptance.
 *
 * The key is derived server-side from the usage row, the item's position and the
 * owner's own submitted text, so:
 *   - a retry of the SAME acceptance returns the record the first attempt
 *     created rather than a second one, arbitrated by the receipts table's
 *     primary key rather than by a read-then-write check;
 *   - an acceptance the owner EDITED first is a different key, and creates the
 *     different record they asked for.
 *
 * Meeting-derived Tasks deliberately do NOT come through here: their idempotency
 * is the `meeting_item_tasks` mapping and MEET-02's own conversion rules, which
 * is the stronger guarantee and the one DEBT-90 asked for.
 */
/** The stable key one accepted item is claimed under. Pure and deterministic. */
export async function acceptanceIdempotencyKey(
  usageId: string,
  index: number,
  kind: "task" | "note",
  identity: string,
): Promise<string> {
  // Hashed rather than concatenated: the owner's own title would otherwise sit
  // in a stored key, and the receipts table is not a place for record content.
  // A hex digest is also always a well-formed key, whatever the title contains.
  return sha256Hex(`ai-apply:${usageId}:${index}:${kind}:${identity}`);
}

async function guarded(
  input: ApplyProposalInput,
  index: number,
  kind: "task" | "note",
  identity: string,
  create: () => Promise<AppliedItem>,
): Promise<AppliedItem> {
  const receipts = input.receipts;
  if (!receipts || input.usageId.length === 0) return create();

  const key = await acceptanceIdempotencyKey(
    input.usageId,
    index,
    kind,
    identity,
  );

  return withReplayGuard(
    { ...receipts, kind },
    key,
    create,
    (result) => (result.id !== undefined && result.ok ? result.id : null),
    (recordId) => ({ index, kind, ok: true, id: recordId, created: false }),
    (reason) => ({ index, kind, ok: false, message: reason }),
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Refusals                                                                   */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * What the whole acceptance amounted to, from what each item actually did.
 *
 * The only interesting case is the middle one. An acceptance where some items
 * saved and some did not is `partially_accepted` — never rounded up to
 * `accepted` because something worked, and never down to `rejected` because
 * something did not. The owner's usage detail then says what really happened,
 * and the surface's own message lists the items that failed.
 *
 * An EMPTY list is `rejected`: nothing was written, so nothing was accepted.
 */
export function proposalOutcome(
  applied: readonly AppliedItem[],
): "accepted" | "partially_accepted" | "rejected" {
  const ok = applied.filter((entry) => entry.ok).length;
  if (ok === 0) return "rejected";
  return ok === applied.length ? "accepted" : "partially_accepted";
}

/**
 * The sentence the owner sees for a failed item.
 *
 * Every branch is a DalyHub domain error whose message is already owner-facing
 * and content-free. Anything unrecognised falls through to one fixed sentence:
 * a storage failure's own text can name a table or a constraint, and none of
 * that belongs in a browser.
 */
export function refusalFor(cause: unknown): string {
  if (cause instanceof ItemRefused) return cause.message;
  if (cause instanceof MeetingArchivedError) return cause.message;
  if (cause instanceof MeetingNotFoundError) {
    return "That Meeting is no longer available. Nothing was created for this item.";
  }
  if (cause instanceof MeetingItemNotFoundError) {
    return "That meeting item is no longer available. Nothing was created for this item.";
  }
  if (
    cause instanceof TaskProjectArchivedError ||
    cause instanceof SpineParentUnavailableError
  ) {
    return "That Project is no longer available. The Task wasn’t created — choose another.";
  }
  if (
    cause instanceof TaskValidationError ||
    cause instanceof SpineValidationError ||
    cause instanceof EntityValidationError ||
    cause instanceof NoteDetailsValidationError
  ) {
    return cause.message;
  }
  return "That couldn’t be saved. Nothing was changed for this item.";
}
