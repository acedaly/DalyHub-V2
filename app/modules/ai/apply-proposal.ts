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
 *
 * ## V2.15 — three things this file gained, and why each is here rather than
 * ## anywhere else
 *
 * **1. The vocabulary is closed and typed.** The kind used to be decided by a
 * ternary that fell through to `task`, so a browser payload naming a kind that
 * does not exist produced a Task. It now goes through
 * `parseProposalKind`, and an unknown kind is REFUSED. The registry
 * (`app/kernel/ai/proposal-kinds.ts`) also says which FEATURE may produce each
 * kind, and that is checked against the ledger row the acceptance names — not
 * against anything the browser says, because a browser that could choose the
 * feature could choose the permission.
 *
 * **2. Every kind carries a stale guard, and the two UPDATE kinds require one.**
 * A proposal is generated against state X and accepted against state Y. For a
 * creation that is harmless; for a change to a record the owner may have edited
 * since, it is how a suggestion silently overwrites their own work. Acceptance
 * therefore carries the state the proposal was generated against, the server
 * re-reads the target, and a mismatch is REFUSED with a sentence saying so.
 * There is no force flag. A stale refusal is always preferred to overwriting
 * the owner.
 *
 * **3. Undo lives here, through the same authority.** Every applied item
 * returns the payload that reverses it, and `undoProposalItems` dispatches
 * those payloads back through the same registry to the same canonical
 * operations. It is not a second write path — an undo of a category change IS
 * a category change, and it is validated exactly as one, expectation and all.
 * A kind with no undo strategy cannot be registered, because the descriptor
 * type has no member for it.
 */

import {
  LIMITS,
  parseIsoCalendarDate,
  parseProposalKind,
  proposalKindAllowedForFeature,
  proposalKindDescriptor,
  sha256Hex,
  UNTRACEABLE_PROPOSAL_KINDS,
  type AiFeatureId,
  type ProposalKind,
} from "~/kernel/ai";
import { EntityValidationError } from "~/kernel/entities";
import { FinanceRefusedError, FinanceValidationError } from "~/kernel/finance";
import {
  OBLIGATION_LINKED_TASK,
  ObligationValidationError,
  type Obligation,
} from "~/kernel/obligations";
import {
  parseReviewSectionId,
  ReviewArchivedError,
  ReviewConflictError,
  ReviewNotFoundError,
  ReviewValidationError,
  type ReviewSectionId,
} from "~/kernel/reviews";
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

/**
 * V2.15 — the payload that REVERSES one applied item.
 *
 * It is an ordinary proposal item of the same kind, carrying the inverse
 * values and an expectation of what the forward apply left behind. That is not
 * a convenience: it means undo travels the SAME dispatch, the SAME validation
 * and the SAME canonical operations as the acceptance did, so there is one
 * apply authority rather than an apply authority and an undo authority that
 * eventually disagree.
 *
 * It is handed to the browser, and the browser hands it back. That is safe for
 * the reason every other reversible action in DalyHub is safe: the owner could
 * perform the inverse by hand through the ordinary surface anyway, the server
 * re-validates every field, and the expectation refuses the write outright if
 * the record has moved since.
 */
export type ProposalUndo = Readonly<Record<string, unknown>> & {
  readonly kind: ProposalKind;
};

/**
 * V2.15 — what an item DID, beyond succeeding or failing.
 *
 * `unchanged` is the one that earns its place. A replayed acceptance of a
 * category that is already set is neither a success that wrote something nor a
 * failure; reporting it as either would be a lie in a surface whose whole job
 * is telling the owner exactly what happened.
 */
export type AppliedOutcome = "created" | "updated" | "unchanged" | "stale";

/** What one accepted item produced. */
export interface AppliedItem {
  readonly index: number;
  readonly kind: ProposalKind;
  readonly ok: boolean;
  readonly id?: string;
  /**
   * `false` when an existing record was returned idempotently rather than a new
   * one created — a replayed acceptance, or a meeting item that was already
   * converted. Present only on a successful item.
   */
  readonly created?: boolean;
  /** V2.15 — the finer-grained outcome, where the kind has one. */
  readonly outcome?: AppliedOutcome;
  /**
   * V2.15 — how to reverse this item. Present only on a successful item that
   * actually changed something: there is nothing to undo about a no-op.
   */
  readonly undo?: ProposalUndo;
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
  /**
   * V2.15 — the FEATURE recorded on the usage row this acceptance names, or
   * `null` when no row resolved.
   *
   * Read from storage by the route, never from the request. It decides which
   * proposal kinds this acceptance may carry: a Finance categorisation payload
   * submitted under a Meeting extraction's usage id is refused, and an
   * acceptance with no traceable generation may carry only the three CREATE
   * kinds (see {@link UNTRACEABLE_PROPOSAL_KINDS}).
   */
  readonly feature?: AiFeatureId | null;
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
    /*
     * V2.15 — the kind is PARSED, not coerced.
     *
     * The code this replaces read `item.kind === "link" ? … : "task"`, so
     * `{ kind: "transaction_categry" }` (or `{}`, or `{ kind: 42 }`) created a
     * Task. An unrecognised kind is now a refusal, which is the only honest
     * answer to a payload DalyHub does not understand.
     */
    const kind = parseProposalKind(item.kind);
    if (kind === null) {
      applied.push({
        index,
        kind: "task",
        ok: false,
        message: "That isn’t something DalyHub can apply.",
      });
      continue;
    }
    const permitted = permits(input.feature ?? null, kind);
    if (!permitted) {
      /*
       * Deliberately the SAME sentence as an unknown kind. A caller learns that
       * the item was refused, never whether the kind exists but was not allowed
       * for this feature — which would be a small oracle for what the ledger row
       * says.
       */
      applied.push({
        index,
        kind,
        ok: false,
        message: "That isn’t something DalyHub can apply.",
      });
      continue;
    }

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

/**
 * Whether this acceptance may carry `kind`, given the feature its ledger row
 * names.
 *
 * Two rules, and the second is the interesting one. With a feature, the
 * registry decides. WITHOUT one — no usage id, or a row that no longer resolves
 * — only the three CREATE kinds are permitted. A creation with no traceable
 * generation is an ordinary record the owner asked for; a CHANGE to a record
 * that already exists, with nothing behind it, is a mutation nothing can audit.
 */
function permits(feature: AiFeatureId | null, kind: ProposalKind): boolean {
  if (feature === null) return UNTRACEABLE_PROPOSAL_KINDS.includes(kind);
  return proposalKindAllowedForFeature(kind, feature);
}

async function applyOne(
  input: ApplyProposalInput,
  index: number,
  kind: ProposalKind,
  item: Record<string, unknown>,
): Promise<AppliedItem> {
  switch (kind) {
    case "link":
      return applyLink(input, index, item);
    case "note":
      return applyMeetingNote(input, index, item);
    case "transaction_category":
      return applyTransactionCategory(input, index, item);
    case "obligation_task":
      return applyObligationTask(input, index, item);
    case "review_reflection":
      return applyReviewReflection(input, index, item);
    case "task": {
      if (input.source?.kind === "meeting") {
        return applyMeetingTask(input, index, item, input.source);
      }
      if (input.source?.kind === "note") {
        return applyNoteTask(input, index, item, input.source);
      }
      return applyUnsourcedTask(input, index, item);
    }
  }
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
/* V2.15 — Finance categorisation                                             */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Read an optional record id from the payload. `""` and absent both mean null.
 *
 * Bounded at 128 characters for the same reason `resolveProposalSource` bounds
 * its id: an unbounded string reaching a `WHERE id = ?` is a string somebody
 * eventually tries to make interesting.
 */
function optionalId(item: Record<string, unknown>, key: string): string | null {
  const value = String(item[key] ?? "").trim();
  if (value.length === 0 || value.length > 128) return null;
  return value;
}

/**
 * The ONE place a transaction's category moves for a proposal, forward or back.
 *
 * Every rule the owner's own manual change obeys applies here unchanged,
 * because it IS the owner's change: `updateTransaction` is the canonical
 * mutation the drawer, the row and the queue all post to, and setting a
 * category through it stamps `categoryConfirmedAt` — which is what the
 * deterministic suggestion rule learns from. An accepted suggestion therefore
 * teaches DalyHub exactly as much as a manual tap does, and a suggestion nobody
 * accepted teaches it nothing.
 *
 * The stale guard is the whole reason this function takes an `expected`:
 *
 *   - the proposal was generated when the transaction was uncategorised;
 *   - the owner categorised it themselves before accepting;
 *   - applying anyway would silently overwrite a decision they had already
 *     made, with one they had merely been offered.
 *
 * So the CURRENT category is re-read and compared. A mismatch is `stale` and
 * writes nothing. An `expected` that already equals the target is `unchanged`,
 * which is what makes a replayed acceptance a no-op rather than a second write.
 */
async function setProposedCategory(
  scope: WorkspaceScope,
  index: number,
  input: {
    readonly transactionId: string;
    /** The category to set. `null` clears it, which is what an undo may need. */
    readonly next: string | null;
    /** The category the proposal was generated against. */
    readonly expected: string | null;
  },
): Promise<AppliedItem> {
  const view = await scope.finance.getTransaction(input.transactionId);
  /*
   * Missing, soft-deleted and another workspace's transaction are ONE answer.
   * A distinguishable "that exists but is not yours" would let an acceptance
   * enumerate a second workspace's ids one refusal at a time.
   */
  if (view === null || view.transaction.deletedAt !== null) {
    return {
      index,
      kind: "transaction_category",
      ok: false,
      message: "That transaction is no longer available.",
    };
  }

  const current = view.transaction.categoryId;
  /*
   * ALREADY THERE is checked BEFORE staleness, and the order is the whole of
   * what makes a replay safe.
   *
   * A replayed acceptance arrives with `expected: null` against a transaction
   * whose category is now set — which, read as a staleness question, looks
   * exactly like the owner having categorised it themselves. It is not: the
   * value it finds is the value it wanted. Checking staleness first would
   * report a replay as a conflict and tell the owner their own choice had been
   * protected from a change they had already made.
   *
   * Nothing is written either way, so the only thing at stake is which true
   * sentence the owner reads — and "this is already done" is the true one.
   */
  if (current === input.next) {
    return {
      index,
      kind: "transaction_category",
      ok: true,
      outcome: "unchanged",
      id: input.transactionId,
      created: false,
    };
  }
  if (current !== input.expected) {
    return {
      index,
      kind: "transaction_category",
      ok: false,
      outcome: "stale",
      id: input.transactionId,
      message:
        "This transaction’s category changed after the suggestion was made, so it wasn’t applied. Your own choice is still there.",
    };
  }

  if (input.next !== null) {
    /*
     * The category is re-read too, and three things are checked that the
     * repository does not check for us: it exists in THIS workspace, it is not
     * archived, and its KIND matches the transaction's direction. The third is
     * the one a model gets wrong: a refund is money in, and putting it in a
     * "Money out" category is how a month's spending quietly stops adding up.
     */
    const categories = await scope.finance.listCategories({
      includeArchived: true,
    });
    const category = categories.find((entry) => entry.id === input.next);
    if (category === undefined) {
      return {
        index,
        kind: "transaction_category",
        ok: false,
        message: "That category is no longer available.",
      };
    }
    if (category.archivedAt !== null) {
      return {
        index,
        kind: "transaction_category",
        ok: false,
        message: "That category is archived. Choose another.",
      };
    }
    const amount = view.transaction.amountMinor;
    const wantsIncome = category.kind === "income";
    if (amount > 0 !== wantsIncome && amount !== 0) {
      return {
        index,
        kind: "transaction_category",
        ok: false,
        message: wantsIncome
          ? "That is a money-in category, and this is money out."
          : "That is a money-out category, and this is money in.",
      };
    }
  }

  await scope.finance.updateTransaction(input.transactionId, {
    categoryId: input.next,
  });

  return {
    index,
    kind: "transaction_category",
    ok: true,
    outcome: "updated",
    id: input.transactionId,
    created: false,
    /*
     * The inverse: put the category back where it was, expecting to find the
     * one we just set. If the owner re-categorises between the apply and the
     * undo, the undo refuses rather than reverting their newer decision — which
     * is the same protection in the opposite direction.
     */
    undo: {
      kind: "transaction_category",
      transactionId: input.transactionId,
      categoryId: input.expected,
      expectedCategoryId: input.next,
    },
  };
}

/**
 * Accept ONE proposed transaction category.
 *
 * No replay guard, and it needs none: this is an UPDATE, and the guarantee a
 * receipt would buy is already owned by the comparison above. A second apply
 * finds the category equal and reports `unchanged` — the database arbitrates
 * it, not a disabled button and not a stored key.
 */
async function applyTransactionCategory(
  input: ApplyProposalInput,
  index: number,
  item: Record<string, unknown>,
): Promise<AppliedItem> {
  const transactionId = optionalId(item, "transactionId");
  const categoryId = optionalId(item, "categoryId");
  if (transactionId === null) {
    return {
      index,
      kind: "transaction_category",
      ok: false,
      message: "That suggestion is incomplete.",
    };
  }
  if (categoryId === null) {
    // Forward acceptance always names a category. Clearing one is an UNDO, and
    // reaches `setProposedCategory` through `undoProposalItems` instead.
    return {
      index,
      kind: "transaction_category",
      ok: false,
      message: "Choose a category before applying this suggestion.",
    };
  }
  return setProposedCategory(input.scope, index, {
    transactionId,
    next: categoryId,
    expected: optionalId(item, "expectedCategoryId"),
  });
}

/* ────────────────────────────────────────────────────────────────────────── */
/* V2.15 — Obligation follow-up Tasks                                         */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * True when an obligation is still a legitimate subject for a follow-up.
 *
 * The SAME condition the fact builder used to decide there was anything to
 * propose, applied again at acceptance — because between the two the owner may
 * have paid the bill, dismissed the commitment or deleted it, and a follow-up
 * for a settled obligation is the exact class of stale action V2.15 exists to
 * refuse.
 */
function stillOpen(obligation: Obligation): boolean {
  return (
    obligation.status === "open" &&
    obligation.deletedAt === null &&
    obligation.archivedAt === null
  );
}

/**
 * Accept ONE proposed follow-up Task for an overdue obligation.
 *
 * Three writes, and they are the SAME three the existing `create-task` intent
 * on `/obligations/mutate` performs — the canonical Task repository, the
 * obligation's Task pointer, and the shared `obligation.linked_task`
 * relationship. Nothing here is an AI-specific path: an accepted follow-up and
 * one the owner made by hand are indistinguishable afterwards, which is the
 * point.
 *
 * The pointer is what makes replay safe at the domain level: an obligation
 * holds AT MOST ONE Task, so a second acceptance finds the first one's Task
 * already linked and returns it rather than creating a second. The replay guard
 * is still applied on top of that, because two SIMULTANEOUS accepts both read
 * the obligation before either Task exists.
 */
async function applyObligationTask(
  input: ApplyProposalInput,
  index: number,
  item: Record<string, unknown>,
): Promise<AppliedItem> {
  const obligationId = optionalId(item, "obligationId");
  if (obligationId === null) {
    return {
      index,
      kind: "obligation_task",
      ok: false,
      message: "That suggestion is incomplete.",
    };
  }

  const title = String(item.title ?? "")
    .trim()
    .slice(0, LIMITS.title);
  if (title.length === 0) {
    return {
      index,
      kind: "obligation_task",
      ok: false,
      message: "A title is required.",
    };
  }

  const obligation = await input.scope.obligations.get(obligationId);
  if (obligation === null) {
    return {
      index,
      kind: "obligation_task",
      ok: false,
      message: "That commitment is no longer available.",
    };
  }
  if (!stillOpen(obligation)) {
    return {
      index,
      kind: "obligation_task",
      ok: false,
      outcome: "stale",
      id: obligationId,
      message:
        "This commitment isn’t open any more, so the follow-up wasn’t created.",
    };
  }

  /*
   * The obligation already points at a Task. Creating a second one and moving
   * the pointer would orphan the first — a Task the owner can no longer reach
   * from the commitment it is about — so this is reported rather than done.
   */
  if (obligation.taskId !== null) {
    return {
      index,
      kind: "obligation_task",
      ok: false,
      id: obligation.taskId,
      message:
        "There is already a Task for this commitment. Open it rather than adding another.",
    };
  }

  return guardedKind(
    input,
    index,
    "obligation_task",
    JSON.stringify([obligationId, title]),
    async () => {
      const task = await input.scope.tasks.createTask({
        title,
        // The obligation stays authoritative for WHEN, exactly as the manual
        // path has it: the Task inherits the due date and no model supplies one.
        dueDate: obligation.dueDate,
      });
      await input.scope.obligations.linkTask(obligationId, task.id);
      try {
        await input.scope.entityLinks.create({
          sourceEntityId: obligationId,
          targetEntityId: task.id,
          type: OBLIGATION_LINKED_TASK,
        });
      } catch {
        /*
         * Not fatal, and the manual path takes the same view: the POINTER is
         * the authority and the EntityLink is the generic projection beside it.
         * A Task that really was created must not be undone by a duplicate or
         * last-mile link failure.
         */
      }
      return {
        index,
        kind: "obligation_task" as const,
        ok: true,
        outcome: "created" as const,
        id: task.id,
        created: true,
        undo: {
          kind: "obligation_task" as const,
          obligationId,
          taskId: task.id,
        },
      };
    },
  );
}

/* ────────────────────────────────────────────────────────────────────────── */
/* V2.15 — Review reflection                                                  */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Accept ONE reviewed reflection draft into the owner's own Review section.
 *
 * This is the only V2.15 kind that writes over the owner's own WRITING, so it
 * carries the strongest guard in the programme — and, deliberately, not a new
 * one: REVIEW-02 already gave `updateSection` optimistic concurrency for
 * exactly this hazard (a second tab, a phone and a desktop each holding an
 * older copy). Supplying `expectedUpdatedAt` turns the write into a
 * compare-and-set, and a section the owner has typed into since the draft was
 * generated raises `ReviewConflictError` and keeps THEIR text.
 *
 * The body written is the one the owner left the review surface with — their
 * edits, not the model's draft — and it is bounded again here.
 */
async function applyReviewReflection(
  input: ApplyProposalInput,
  index: number,
  item: Record<string, unknown>,
): Promise<AppliedItem> {
  const reviewId = optionalId(item, "reviewId");
  if (reviewId === null) {
    return {
      index,
      kind: "review_reflection",
      ok: false,
      message: "That draft is incomplete.",
    };
  }

  let sectionId: ReviewSectionId;
  try {
    sectionId = parseReviewSectionId(item.sectionId);
  } catch {
    return {
      index,
      kind: "review_reflection",
      ok: false,
      message: "That isn’t a section of this Review.",
    };
  }

  const body = String(item.body ?? "");
  if (body.length > LIMITS.noteBody) {
    return {
      index,
      kind: "review_reflection",
      ok: false,
      message: "That reflection is too long.",
    };
  }

  const review = await input.scope.reviews.get(reviewId);
  if (review === null || review.deletedAt !== null) {
    return {
      index,
      kind: "review_reflection",
      ok: false,
      message: "That Review is no longer available.",
    };
  }
  if (review.archivedAt !== null) {
    return {
      index,
      kind: "review_reflection",
      ok: false,
      message: "This Review is archived — restore it before writing in it.",
    };
  }

  const section =
    review.sections.find((entry) => entry.sectionId === sectionId) ?? null;
  const currentBody = section?.body ?? "";

  const expectedIso = String(item.expectedUpdatedAt ?? "").trim();
  const expectedUpdatedAt =
    expectedIso.length === 0 ? null : new Date(expectedIso);
  if (expectedUpdatedAt !== null && Number.isNaN(expectedUpdatedAt.getTime())) {
    return {
      index,
      kind: "review_reflection",
      ok: false,
      message: "That draft couldn’t be read.",
    };
  }

  /*
   * ALREADY THERE first, for the same reason the Finance path checks it first:
   * a replayed acceptance finds the section holding exactly the text it wanted
   * to write, and reporting that as a conflict would tell the owner their
   * writing had been protected from themselves.
   */
  if (currentBody === body) {
    return {
      index,
      kind: "review_reflection",
      ok: true,
      outcome: "unchanged",
      id: reviewId,
      created: false,
    };
  }

  /*
   * An expectation is REQUIRED for a section that already holds writing.
   *
   * A blank section has nothing to lose, and requiring a version for it would
   * make the first draft of a Review harder to accept than the second. A
   * section with text in it is the owner's writing, and accepting a draft over
   * it without a version is precisely the blind write REVIEW-02 removed.
   */
  if (currentBody.trim().length > 0 && expectedUpdatedAt === null) {
    return {
      index,
      kind: "review_reflection",
      ok: false,
      outcome: "stale",
      id: reviewId,
      message:
        "This reflection already has writing in it. Re-open it so DalyHub can see what is there before replacing it.",
    };
  }

  let updated;
  try {
    updated = await input.scope.reviews.updateSection(
      reviewId,
      sectionId,
      body,
      expectedUpdatedAt === null ? undefined : { expectedUpdatedAt },
    );
  } catch (cause) {
    if (cause instanceof ReviewConflictError) {
      return {
        index,
        kind: "review_reflection",
        ok: false,
        outcome: "stale",
        id: reviewId,
        message:
          "You wrote in this reflection after the draft was made, so nothing was replaced. Your own writing is still there.",
      };
    }
    throw cause;
  }

  const written =
    updated.review.sections.find((entry) => entry.sectionId === sectionId) ??
    null;

  return {
    index,
    kind: "review_reflection",
    ok: true,
    outcome: "updated",
    id: reviewId,
    created: false,
    /*
     * The inverse carries the owner's PREVIOUS text and the version the write
     * just produced. Undoing therefore restores exactly what was there — and
     * refuses if the owner has typed since, so an undo cannot eat writing that
     * came after the thing it is undoing.
     */
    undo: {
      kind: "review_reflection",
      reviewId,
      sectionId,
      body: currentBody,
      expectedUpdatedAt: written?.updatedAt.toISOString() ?? null,
    },
  };
}

/* ────────────────────────────────────────────────────────────────────────── */
/* V2.15 — Undo                                                               */
/* ────────────────────────────────────────────────────────────────────────── */

/**
 * Reverse previously applied items.
 *
 * The SAME shape as `applyProposalItems`, dispatched through the SAME registry,
 * ending in the SAME canonical repository operations — because an undo is an
 * ordinary owner mutation and nothing about it deserves a second write path.
 *
 * Every undo is guarded in the direction that matters: it states what it
 * expects to find, and refuses if the record has moved on. An owner who undoes
 * a categorisation an hour after re-categorising the row by hand gets a
 * refusal, not a silent reversion of their newer decision.
 *
 * Undoing something already undone is a no-op that reports `unchanged`, so the
 * whole path is replay-safe for the same reason the forward one is.
 */
export async function undoProposalItems(
  input: ApplyProposalInput,
): Promise<readonly AppliedItem[]> {
  const undone: AppliedItem[] = [];

  for (const [index, entry] of input.items.entries()) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      undone.push({
        index,
        kind: "task",
        ok: false,
        message: "That couldn’t be undone.",
      });
      continue;
    }
    const item = entry as Record<string, unknown>;
    const kind = parseProposalKind(item.kind);
    if (kind === null || !permits(input.feature ?? null, kind)) {
      undone.push({
        index,
        kind: kind ?? "task",
        ok: false,
        message: "That couldn’t be undone.",
      });
      continue;
    }

    try {
      undone.push(await undoOne(input, index, kind, item));
    } catch (cause) {
      undone.push({ index, kind, ok: false, message: refusalFor(cause) });
    }
  }

  return undone;
}

async function undoOne(
  input: ApplyProposalInput,
  index: number,
  kind: ProposalKind,
  item: Record<string, unknown>,
): Promise<AppliedItem> {
  const strategy = proposalKindDescriptor(kind).undo;
  switch (strategy) {
    case "restore_previous":
      return kind === "transaction_category"
        ? undoTransactionCategory(input, index, item)
        : undoReviewReflection(input, index, item);
    case "remove_link":
      return undoLink(input, index, item);
    case "unlink_and_delete":
      return undoObligationTask(input, index, item);
    case "delete_created":
      return undoCreatedRecord(input, index, kind, item);
  }
}

/** Put a transaction's category back, refusing if it has moved since. */
async function undoTransactionCategory(
  input: ApplyProposalInput,
  index: number,
  item: Record<string, unknown>,
): Promise<AppliedItem> {
  const transactionId = optionalId(item, "transactionId");
  if (transactionId === null) {
    return {
      index,
      kind: "transaction_category",
      ok: false,
      message: "That change couldn’t be undone.",
    };
  }
  return setProposedCategory(input.scope, index, {
    transactionId,
    next: optionalId(item, "categoryId"),
    expected: optionalId(item, "expectedCategoryId"),
  });
}

/** Put a Review section's previous text back, refusing if the owner has typed. */
async function undoReviewReflection(
  input: ApplyProposalInput,
  index: number,
  item: Record<string, unknown>,
): Promise<AppliedItem> {
  /*
   * Deliberately the FORWARD applier, unchanged.
   *
   * Restoring the previous text IS writing a reflection, and it must obey every
   * rule writing one obeys: the Review must be live and unarchived, the section
   * must exist, the body must be bounded, and the version must still match. One
   * function, one set of rules, no drift.
   */
  return applyReviewReflection(input, index, item);
}

/** Unlink a relationship an acceptance asserted. */
async function undoLink(
  input: ApplyProposalInput,
  index: number,
  item: Record<string, unknown>,
): Promise<AppliedItem> {
  const linkId = optionalId(item, "linkId");
  if (linkId === null) {
    return {
      index,
      kind: "link",
      ok: false,
      message: "That link couldn’t be undone.",
    };
  }
  const result = await input.scope.entityLinks.unlink(linkId);
  return {
    index,
    kind: "link",
    ok: true,
    id: linkId,
    created: false,
    outcome: result.changed ? "updated" : "unchanged",
  };
}

/**
 * Reverse a follow-up: clear the obligation's pointer, then delete the Task.
 *
 * In that order, and the order is the guarantee. Clearing the pointer first
 * means a failure between the two leaves an obligation with no Task and a Task
 * with no obligation — untidy, and completely recoverable. Deleting first would
 * leave the obligation pointing at a deleted record.
 *
 * The pointer is also the EXPECTATION: an obligation that no longer points at
 * this Task has been changed by the owner since, and the undo refuses rather
 * than deleting a Task the owner may have detached and kept on purpose.
 */
async function undoObligationTask(
  input: ApplyProposalInput,
  index: number,
  item: Record<string, unknown>,
): Promise<AppliedItem> {
  const obligationId = optionalId(item, "obligationId");
  const taskId = optionalId(item, "taskId");
  if (obligationId === null || taskId === null) {
    return {
      index,
      kind: "obligation_task",
      ok: false,
      message: "That follow-up couldn’t be undone.",
    };
  }

  const obligation = await input.scope.obligations.get(obligationId);
  if (obligation === null) {
    return {
      index,
      kind: "obligation_task",
      ok: false,
      message: "That commitment is no longer available.",
    };
  }
  if (obligation.taskId !== taskId) {
    return {
      index,
      kind: "obligation_task",
      ok: false,
      outcome: "stale",
      id: taskId,
      message:
        "That commitment doesn’t point at this Task any more, so nothing was removed.",
    };
  }

  await input.scope.obligations.unlinkTask(obligationId);
  const removed = await compensateCapturedRecord(input.scope, taskId, "task");
  if (!removed) {
    return {
      index,
      kind: "obligation_task",
      ok: false,
      id: taskId,
      message:
        "The commitment was unlinked, but the Task is still there. Delete it yourself if you meant to.",
    };
  }
  return {
    index,
    kind: "obligation_task",
    ok: true,
    id: taskId,
    created: false,
    outcome: "updated",
  };
}

/** Soft-delete a Task or a Note an acceptance created. */
async function undoCreatedRecord(
  input: ApplyProposalInput,
  index: number,
  kind: ProposalKind,
  item: Record<string, unknown>,
): Promise<AppliedItem> {
  const id = optionalId(item, "id");
  if (id === null) {
    return { index, kind, ok: false, message: "That couldn’t be undone." };
  }
  /*
   * The SAME compensation the acceptance path already uses when a link fails
   * after a record was created — the spine's soft delete for a Task, the
   * entity's for a Note. Reversible in the ordinary way: an undone Task is a
   * deleted Task, and a deleted Task restores.
   */
  const removed = await compensateCapturedRecord(
    input.scope,
    id,
    kind === "note" ? "note" : "task",
  );
  return removed
    ? { index, kind, ok: true, id, created: false, outcome: "updated" }
    : { index, kind, ok: false, id, message: "That couldn’t be undone." };
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
 * Meeting-derived Tasks come through here TOO, as of AUDIT-13. The
 * `meeting_item_tasks` mapping is the stronger guarantee for a SEQUENTIAL replay
 * — the second attempt finds the first's action item and its live mapping — but
 * it cannot arbitrate two SIMULTANEOUS accepts, because both read the Meeting
 * before either item exists and each is then allocated a distinct item id. See
 * the long note on `applyMeetingTask`.
 */
/** The stable key one accepted item is claimed under. Pure and deterministic. */
export async function acceptanceIdempotencyKey(
  usageId: string,
  index: number,
  kind: ProposalKind,
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
  return guardedKind(input, index, kind, identity, create);
}

/**
 * The same guard, for any CREATE kind.
 *
 * `withReplayGuard` takes a receipt `kind`, and the receipts table's own
 * vocabulary is the capture one (`task`, `note`) rather than the proposal one.
 * A V2.15 `obligation_task` creates a Task, so it claims a `task` receipt — the
 * key it is claimed under already carries the proposal kind, so two different
 * proposal kinds creating a Task at the same index of the same acceptance still
 * take different keys.
 */
async function guardedKind(
  input: ApplyProposalInput,
  index: number,
  kind: ProposalKind,
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
  const receiptKind = kind === "note" ? "note" : "task";

  return withReplayGuard(
    { ...receipts, kind: receiptKind },
    key,
    create,
    (result) => (result.id !== undefined && result.ok ? result.id : null),
    (recordId) => ({
      index,
      kind,
      ok: true,
      id: recordId,
      created: false,
      outcome: "unchanged" as const,
    }),
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
    cause instanceof NoteDetailsValidationError ||
    cause instanceof ObligationValidationError ||
    cause instanceof ReviewValidationError ||
    cause instanceof FinanceValidationError
  ) {
    return cause.message;
  }
  // V2.15 — the domain refusals the new kinds can raise. Each already carries an
  // owner-facing, content-free sentence, which is why it is passed through
  // rather than translated a second time here.
  if (cause instanceof FinanceRefusedError) return cause.message;
  if (cause instanceof ReviewConflictError) {
    return "That Review changed before this was applied. Nothing was replaced.";
  }
  if (cause instanceof ReviewArchivedError) return cause.message;
  if (cause instanceof ReviewNotFoundError) {
    return "That Review is no longer available.";
  }
  return "That couldn’t be saved. Nothing was changed for this item.";
}
