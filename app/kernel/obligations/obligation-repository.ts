/**
 * V2.10 LIFE-01 Obligations kernel — the authoritative repository contract.
 *
 * The storage-independent interface that owns an Obligation: its subject, its
 * due date, its recurrence, its lifecycle, its amounts and its succession. It
 * speaks only domain terms and never exposes D1, SQL or Cloudflare types; the
 * D1 adapter implements it.
 *
 * WORKSPACE-BOUND (ADR-010): constructed with a single `WorkspaceContext`,
 * every method operates only within that workspace, no method accepts a
 * `workspaceId`, and the trusted Activity actor is bound at construction —
 * module code cannot pass, select or spoof scope or actor.
 *
 * ATOMICITY (ADR-012, ADR-083): every compound operation here is ONE
 * `D1Database.batch()`. `create` writes the `entities` row, the
 * `obligation_details` row, the `obligation.subject` link and one
 * `obligation.created` event together; `complete` closes the occurrence, writes
 * its proof, creates at most one successor, updates the subject's canonical
 * facts and completes the linked Task, or does none of it.
 *
 * THE SUBJECT'S TWO REPRESENTATIONS are this contract's one invariant. The
 * `subject_entity_id` foreign key is authoritative and every structural read
 * here uses it; the `obligation.subject` EntityLink is its projection, written
 * and cleared in the same batch, and reserved so nothing else can write it
 * (ADR-118 decision 1).
 */

import type { WorkspaceContext } from "~/kernel/workspaces";

import type { ObligationBand } from "./obligation-band";
import type {
  CompleteObligationInput,
  CreateObligationInput,
  ListObligationsInput,
  Obligation,
  ObligationFilters,
  ObligationAttentionInput,
  ObligationChangeResult,
  ObligationPage,
  ObligationSubject,
  ObligationTaskOutcome,
  UpdateObligationInput,
} from "./obligation";
import type { ObligationStatus } from "./obligation-status";

/** An obligation with its subject resolved, as a list or a record renders it. */
export type ObligationWithSubject = {
  readonly obligation: Obligation;
  /** Null when the obligation is about nothing, which is legitimate. */
  readonly subject: ObligationSubject | null;
  /** True when the linked Task exists and is still open. */
  readonly hasOpenTask: boolean;
};

/**
 * One obligation that needs attention, with the context a surface needs to
 * render it WITHOUT a second read. The meter reading is present only where the
 * subject carries one.
 */
export type ObligationAttentionItem = ObligationWithSubject & {
  readonly meterValue: number | null;
  readonly meterUnit: string | null;
  /**
   * The subject's own SUBTYPE where it has one — an Asset's `vehicle` or
   * `appliance`, which is what a surface draws its glyph from. It is not the
   * entity type: `subject.type` is `asset`, this is what KIND of asset.
   */
  readonly subjectSubtype: string | null;
};

/** A bounded page of obligations with their subjects. */
export type ObligationWithSubjectPage = ObligationPage<Obligation> & {
  readonly subjects: ReadonlyMap<string, ObligationSubject>;
  /** Obligation ids whose linked Task exists and is still open. */
  readonly openTaskIds: ReadonlySet<string>;
};

/** Which obligations to count, band by band. */
export type ObligationBandCountInput = {
  readonly filters?: ObligationFilters;
  /**
   * The same free text `list` takes. It is not optional in spirit: a count that
   * ignored the query would print "Overdue 24" above the two rows a search
   * actually found, which is a heading that describes a different list from the
   * one underneath it.
   */
  readonly query?: string;
  /**
   * The same three-way scope `list` takes: `undefined` counts the whole
   * workspace, a string one subject's, `null` only the ones about nothing.
   */
  readonly subjectEntityId?: string | null;
  /** Owner-calendar day, so the bands resolve in the owner's timezone. */
  readonly today: string;
};

/** How many obligations sit in each band. Every band is present, zeroes included. */
export type ObligationBandCounts = Readonly<Record<ObligationBand, number>>;

/** What a subject's obligations add up to, for a collection row. */
export type ObligationSummary = {
  readonly openCount: number;
  readonly overdueCount: number;
  readonly dueSoonCount: number;
  readonly nextDueDate: string | null;
  readonly nextTitle: string | null;
  readonly nextCategory: string | null;
  readonly needsMeterReading: boolean;
};

/** What completing an obligation actually produced. */
export type CompleteObligationResult = {
  readonly obligation: Obligation;
  /**
   * The proof entry the subject's own history gained, where the subject keeps
   * one. NULL for an obligation about nothing — a subject-less completion
   * writes its proof as the `obligation.completed` Activity event and its
   * `completedOn`/`completedAmountMinor` columns, and faking a history entry
   * for a history that does not exist would be the first lie in this domain.
   */
  readonly proof: ObligationProofRef | null;
  /** The single next occurrence, when the obligation recurs. */
  readonly successor: Obligation | null;
  /** How the linked Task was reconciled. */
  readonly taskOutcome: ObligationTaskOutcome;
};

/** A light reference to the proof entry a completion created. */
export type ObligationProofRef = {
  readonly id: string;
  readonly title: string;
  readonly date: string;
};

/** What linking a Task to an obligation produced. */
export type LinkObligationTaskResult = {
  readonly obligation: Obligation;
  readonly taskId: string;
  /** False when the obligation already pointed at this exact Task. */
  readonly created: boolean;
};

/** The outcome of reconciling an obligation against its linked Task. */
export type ObligationTaskReconciliation = {
  readonly obligation: Obligation;
  readonly taskId: string | null;
  /**
   *   - `open`      — the Task is still the actionable commitment.
   *   - `completed` — the owner ticked it off. The obligation stays OPEN:
   *                   ticking a Task is not proof that the work happened.
   *   - `missing`   — the Task is gone; the pointer was cleared so the
   *                   obligation can be given a fresh one.
   *   - `none`      — no Task was linked.
   */
  readonly taskState: "open" | "completed" | "missing" | "none";
  /** True when the pointer was cleared because the Task had gone. */
  readonly changed: boolean;
};

export interface ObligationRepository {
  /** The workspace this repository is bound to. */
  readonly context: WorkspaceContext;

  /**
   * Create an obligation, with or without a subject. Atomically writes the
   * entity, the detail row, the subject link where there is a subject, and one
   * `obligation.created` event.
   */
  create(input: CreateObligationInput): Promise<Obligation>;

  /**
   * Read one obligation by id within the bound workspace, or null. Returns null
   * for an id that exists in ANOTHER workspace — indistinguishable from "does
   * not exist", by design.
   */
  get(obligationId: string): Promise<Obligation | null>;

  /** Read one obligation with its subject and linked-Task state resolved. */
  getWithSubject(obligationId: string): Promise<ObligationWithSubject | null>;

  /**
   * A bounded page of obligations. `subjectEntityId` undefined reads the whole
   * workspace (Life Admin); a string reads one subject's (the Assets lens);
   * null reads only the ones about nothing.
   */
  list(input?: ListObligationsInput): Promise<ObligationWithSubjectPage>;

  /**
   * Edit an obligation. A change to the due date or the rule appends
   * `obligation.rescheduled` and, where a linked Task exists and is still open,
   * moves that Task's due date to match — the obligation is authoritative.
   */
  update(
    obligationId: string,
    changes: UpdateObligationInput,
  ): Promise<ObligationChangeResult>;

  /**
   * Set the lifecycle status directly — dismiss, hold, or reopen. Completion is
   * NOT reachable here: it goes through `complete` so it always produces its
   * proof and its successor.
   */
  setStatus(
    obligationId: string,
    status: Exclude<ObligationStatus, "completed">,
  ): Promise<ObligationChangeResult>;

  /**
   * Complete an obligation — one atomic transaction that closes the occurrence,
   * records the date and the actual amount, appends `obligation.completed`,
   * writes the subject's proof entry where the subject keeps a history, creates
   * AT MOST ONE successor, advances the subject's canonical facts, and
   * completes the linked Task.
   *
   * Completing an already-completed obligation is an idempotent no-op that
   * returns the existing completion.
   */
  complete(
    obligationId: string,
    input?: CompleteObligationInput,
  ): Promise<CompleteObligationResult>;

  /** Soft-delete an obligation. Its completed predecessors stay as history. */
  delete(obligationId: string): Promise<boolean>;

  /** Point an obligation at an existing Task. A pointer, never ownership. */
  linkTask(
    obligationId: string,
    taskId: string,
  ): Promise<LinkObligationTaskResult>;

  /** Clear the Task pointer. The Task itself is untouched. */
  unlinkTask(obligationId: string): Promise<ObligationChangeResult>;

  /** Read the linked Task's real state, clearing a pointer that has gone. */
  reconcileTask(obligationId: string): Promise<ObligationTaskReconciliation>;

  /**
   * The workspace-wide "what needs attention" read Today and the digest
   * consume. Bounded by a horizon in days and a hard item cap, in ONE
   * statement: the subject's title and the linked Task's open state arrive with
   * the row, so there is no per-obligation subject query and no per-obligation
   * Task query at any width.
   */
  listAttention(
    input: ObligationAttentionInput,
  ): Promise<readonly ObligationAttentionItem[]>;

  /**
   * What each subject's obligations add up to, for a collection row. One
   * grouped statement for the whole page, never one per row.
   */
  summariseBySubject(
    subjectIds: readonly string[],
    today: string,
  ): Promise<ReadonlyMap<string, ObligationSummary>>;

  /**
   * How many obligations fall in each band, over the WHOLE collection (D10).
   *
   * The Life Admin headings print a count, and a count taken over the loaded
   * page is a lie about the set — "Overdue 25" under a page of 25 that happens
   * to hold every overdue row is indistinguishable from "Overdue 200" when it
   * does not. So this is one grouped statement across everything the current
   * filter selects, before any pagination, and it stays one statement whether
   * the workspace holds one obligation or ten thousand.
   */
  countByBand(input: ObligationBandCountInput): Promise<ObligationBandCounts>;
}
