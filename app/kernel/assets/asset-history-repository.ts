/**
 * ASSET-02 Assets kernel — the authoritative Asset history & obligations contract.
 *
 * One workspace-bound repository owns BOTH halves of an Asset's ownership record:
 * what happened (`asset_events`) and what is due (`asset_obligations`). They share
 * a repository because the interesting operations span both — completing an
 * obligation writes an event, advances a canonical Asset fact, creates at most one
 * successor and reconciles a Task, and every part of that must commit or none of
 * it (ADR-012). Splitting them would force a caller to orchestrate a transaction
 * across two repositories, which is exactly the route-level coordination the
 * architecture forbids (§22).
 *
 * WORKSPACE-BOUND (ADR-010): constructed with one `WorkspaceContext`, no method
 * accepts a `workspaceId`, and the trusted Activity actor is bound at construction.
 * Every read fails closed — an Asset in another workspace is indistinguishable
 * from one that does not exist.
 *
 * BOUNDED (AGENTS.md §16): every list method is cursor-paged with a hard cap. The
 * Assets collection never loads history; the record loads one page at a time;
 * Today reads a capped, horizon-limited slice.
 *
 * AUTHORITY (§7): the Obligation owns the asset-specific due date, recurrence and
 * maintenance meaning. A linked Task is the actionable commitment. Completing a
 * Task never asserts through this repository that the work happened — only
 * `completeObligation` or an explicit `recordEvent` does.
 */

import type {
  AssetCostSummary,
  AssetEvent,
  AssetEventChangeResult,
  AssetEventPage,
  AssetValuationPoint,
  CreateAssetEventInput,
  ListAssetEventsInput,
  UpdateAssetEventInput,
} from "./asset-event";
import type {
  AssetAttentionInput,
  AssetAttentionItem,
  AssetObligation,
  AssetObligationChangeResult,
  AssetObligationPage,
  AssetObligationStatus,
  CompleteAssetObligationInput,
  CompleteAssetObligationResult,
  CreateAssetObligationInput,
  ListAssetObligationsInput,
  UpdateAssetObligationInput,
} from "./asset-obligation";

/**
 * The narrow write port this repository uses to RESCHEDULE a linked Task.
 *
 * Tasks are the Task repository's to own (§22), so rather than writing Task SQL
 * here the adapter asks through this port, and the composition root wires it to
 * the real, workspace-bound `TaskRepository`.
 *
 * Reads of a Task's state are NOT here: they are ordinary joins the adapter does
 * itself, which is what keeps the Today query to a single bounded statement.
 *
 * **`completeTask` is deliberately absent (AUDIT-13).** It used to live here, and
 * having it here is what made obligation completion two transactions: close the
 * Task through this port, then open the obligation's batch, and lose the pair if
 * the second half failed. Completing the linked Task is now part of the
 * obligation's OWN batch, planned through a storage-level seam that hands back
 * statements rather than performing a write — see
 * `ObligationTaskCompletionPlanner` in `app/platform/storage/d1`. Re-adding a
 * `completeTask` method here would re-open exactly that failure mode.
 */
export interface ObligationTaskGateway {
  /** Move a Task's due date to match its obligation. False when the Task is gone. */
  rescheduleTask(taskId: string, dueDate: string | null): Promise<boolean>;
}

/** What linking a Task to an obligation produced. */
export type LinkObligationTaskResult = {
  readonly obligation: AssetObligation;
  readonly taskId: string;
  /** False when the obligation already pointed at this exact Task (idempotent). */
  readonly created: boolean;
};

/** The outcome of reconciling an obligation against its linked Task's real state. */
export type ObligationTaskReconciliation = {
  readonly obligation: AssetObligation;
  /**
   * What the linked Task actually is right now:
   *   - `open`      — still an outstanding commitment.
   *   - `completed` — the owner ticked it off. The obligation stays OPEN: ticking a
   *                   Task is not proof the servicing happened (§7). The record
   *                   surfaces "record what happened" instead.
   *   - `missing`   — the Task was deleted. The pointer is cleared so the
   *                   obligation can be given a fresh Task.
   *   - `none`      — no Task was ever linked.
   */
  readonly taskState: "open" | "completed" | "missing" | "none";
  /** True when the stored pointer changed as a result of reconciling. */
  readonly changed: boolean;
};

/** A meter reading recorded directly (rather than as a side effect of an event). */
export type RecordMeterReadingInput = {
  readonly assetId: string;
  readonly value: string | number;
  readonly unit: string;
  /** The day the reading was taken. Defaults to the owner-calendar day. */
  readonly readingDate?: string;
  readonly note?: string | null;
};

/** What recording a meter reading produced. */
export type RecordMeterReadingResult = {
  readonly event: AssetEvent;
  /**
   * False when the reading did NOT advance the Asset's canonical meter — because
   * it was older than the current reading, or in a different unit. The event is
   * still kept as history; the canonical fact simply did not move (§3).
   */
  readonly advancedCurrentReading: boolean;
};

export interface AssetHistoryRepository {
  /* ---------------------------------------------------------------------- */
  /* Events — what happened                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Record one event against an Asset. Atomically writes the event row, applies
   * any canonical fact it asserts (warranty expiry, next due date, meter reading —
   * meter forward-only), and appends `asset.event_created`.
   *
   * Rejects a cross-workspace, deleted or missing Asset, and a linked
   * Person/Task/Note that does not resolve in this workspace.
   */
  recordEvent(
    assetId: string,
    input: CreateAssetEventInput,
  ): Promise<AssetEvent>;

  /** Read one event by id within the bound workspace, or null. */
  getEvent(eventId: string): Promise<AssetEvent | null>;

  /**
   * Edit an event. An update that changes nothing after normalisation is an
   * idempotent no-op that appends no Activity. Editing an event does NOT
   * retroactively rewrite canonical facts it once asserted — history is corrected,
   * current facts are set deliberately (§3).
   */
  updateEvent(
    eventId: string,
    changes: UpdateAssetEventInput,
  ): Promise<AssetEventChangeResult>;

  /** Archive an event: it leaves the default timeline but is never destroyed. */
  archiveEvent(eventId: string): Promise<AssetEventChangeResult>;

  /** Restore an archived event to the default timeline. */
  restoreEvent(eventId: string): Promise<AssetEventChangeResult>;

  /**
   * Soft-delete an event. Deleting an event must never corrupt an obligation's
   * recurrence: an obligation whose completion proof is deleted keeps its
   * completed status and its series position, and simply loses the pointer (§18).
   */
  deleteEvent(eventId: string): Promise<boolean>;

  /** A bounded, newest-first page of an Asset's history. */
  listEvents(input: ListAssetEventsInput): Promise<AssetEventPage>;

  /**
   * The recorded-cost summary for one Asset, aggregated in SQL over the FULL
   * history (never over a loaded page). Reports mixed currencies honestly rather
   * than converting (ADR-049).
   */
  costSummary(assetId: string): Promise<AssetCostSummary>;

  /**
   * The Asset's recorded value history, oldest first, bounded. Only valuation
   * events with a recorded value appear. No market value is ever inferred (§29).
   */
  valuationHistory(
    assetId: string,
    limit?: number,
  ): Promise<readonly AssetValuationPoint[]>;

  /**
   * Record a meter reading. A thin, deliberate front door over `recordEvent` so
   * the common "just update the odometer" action is one call and one event, not a
   * generic form (§13).
   */
  recordMeterReading(
    input: RecordMeterReadingInput,
  ): Promise<RecordMeterReadingResult>;

  /* ---------------------------------------------------------------------- */
  /* Obligations — what is due                                              */
  /* ---------------------------------------------------------------------- */

  /** Create an obligation against an Asset, atomic with `asset.obligation_created`. */
  createObligation(
    assetId: string,
    input: CreateAssetObligationInput,
  ): Promise<AssetObligation>;

  /** Read one obligation by id within the bound workspace, or null. */
  getObligation(obligationId: string): Promise<AssetObligation | null>;

  /**
   * Edit an obligation. A change to the due date or the rule appends
   * `asset.obligation_rescheduled` and, when a linked Task exists and is still
   * open, moves that Task's due date to match — the obligation is authoritative
   * for the date, so the two can never permanently diverge (§7).
   */
  updateObligation(
    obligationId: string,
    changes: UpdateAssetObligationInput,
  ): Promise<AssetObligationChangeResult>;

  /**
   * Set an obligation's lifecycle status directly — dismiss it, put it on hold, or
   * reopen it. `completed` is NOT accepted here: completion must go through
   * `completeObligation` so it always produces the event that proves the work
   * happened.
   */
  setObligationStatus(
    obligationId: string,
    status: Exclude<AssetObligationStatus, "completed">,
  ): Promise<AssetObligationChangeResult>;

  /**
   * Complete an obligation — one atomic transaction that:
   *   1. writes the Asset Event proving what happened;
   *   2. marks this occurrence completed and points it at that event;
   *   3. advances the Asset's canonical fact for the category (renewal date,
   *      warranty expiry or next service date) and its meter, forward-only;
   *   4. creates AT MOST ONE successor when the obligation recurs, guarded by the
   *      `(workspace_id, series_id, sequence)` uniqueness constraint so a retry or
   *      a concurrent completion can never produce two;
   *   5. reconciles the linked Task — completing it when it is still open.
   *
   * Completing an already-completed obligation is an idempotent no-op that returns
   * the existing completion rather than writing a second event.
   */
  completeObligation(
    obligationId: string,
    input?: CompleteAssetObligationInput,
  ): Promise<CompleteAssetObligationResult>;

  /** Soft-delete an obligation. Its completed predecessors stay as history. */
  deleteObligation(obligationId: string): Promise<boolean>;

  /** A bounded page of one Asset's obligations. */
  listObligations(
    input: ListAssetObligationsInput,
  ): Promise<AssetObligationPage>;

  /* ---------------------------------------------------------------------- */
  /* Task integration                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Point an obligation at an existing Task, atomic with `asset.task_linked`. The
   * Task must exist in this workspace; a cross-workspace id is rejected. Pointing
   * at the Task already linked is an idempotent no-op.
   *
   * NOTE: this repository never CREATES a Task — Tasks are the Task repository's
   * to own (§22, no duplicated authority). The route composes the two: create the
   * Task, then link it.
   */
  linkObligationTask(
    obligationId: string,
    taskId: string,
  ): Promise<LinkObligationTaskResult>;

  /** Clear an obligation's Task pointer without touching the Task itself. */
  unlinkObligationTask(
    obligationId: string,
  ): Promise<AssetObligationChangeResult>;

  /**
   * Reconcile one obligation against its linked Task's REAL current state, healing
   * a pointer to a deleted Task. Never completes the obligation from a completed
   * Task — that inference is exactly the false assertion the authority contract
   * forbids (§7).
   */
  reconcileObligationTask(
    obligationId: string,
  ): Promise<ObligationTaskReconciliation>;

  /* ---------------------------------------------------------------------- */
  /* Cross-asset reads (Today, the collection)                              */
  /* ---------------------------------------------------------------------- */

  /**
   * Every OPEN obligation in the workspace that needs attention within the
   * horizon, with the Asset context and current reading needed to evaluate it —
   * one bounded query, so Today never issues N reads for N assets (§27).
   *
   * Archived Assets are excluded: putting a record away means it stops asking for
   * things (§18). Soft-deleted Assets are excluded everywhere.
   */
  listAttention(
    input: AssetAttentionInput,
  ): Promise<readonly AssetAttentionItem[]>;

  /**
   * Per-Asset obligation counts for a bounded set of Asset ids, so the collection
   * can show "2 overdue" on a card without loading any obligation rows (§12, §27).
   * Returns a map keyed by Asset id; assets with no obligations are absent.
   */
  summariseObligations(
    assetIds: readonly string[],
    today: string,
  ): Promise<ReadonlyMap<string, AssetObligationSummary>>;
}

/** The compact per-Asset obligation signal a collection card renders. */
export type AssetObligationSummary = {
  readonly openCount: number;
  readonly overdueCount: number;
  readonly dueSoonCount: number;
  /** The soonest open due date, for the card's "next obligation" line. */
  readonly nextDueDate: string | null;
  readonly nextTitle: string | null;
  readonly nextCategory: string | null;
  /** True when at least one open obligation is meter-based with no reading. */
  readonly needsMeterReading: boolean;
};
