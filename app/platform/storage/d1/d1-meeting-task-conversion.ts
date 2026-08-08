/**
 * AUDIT-13 — the Meeting → Task conversion, as ONE D1 transaction.
 *
 * ## What it replaces
 *
 * The conversion used to be a saga in `app/platform/meetings/follow-up-operations.ts`:
 *
 * ```text
 *   scope.tasks.createTask(...)        // transaction 1
 *   scope.tasks.updateTask(status)     // transaction 2 (optional)
 *   scope.tasks.updateTask(description)// transaction 3 (optional)
 *   scope.meetings.linkFollowUpTask()  // transaction 4 — the "commit point"
 *   scope.entityLinks.create(...)      // transaction 5 — post-commit
 * ```
 *
 * with a compensating `spine.softDelete` if anything after the first failed. The
 * compensation narrowed the failure window; it could not close it. A process death
 * between transaction 1 and transaction 4 left a Task with no mapping — invisible
 * to the Follow-up surface, so a retry created a SECOND Task. That is the exact
 * finding in the August 2026 audit, and it is what this class removes: there is one
 * batch, and D1 rolls all of it back on any failure, so the orphan state has no
 * moment in which to exist.
 *
 * ## The batch
 *
 * ```text
 *   [0]     entities INSERT (the Task)              ← createTask's own statements,
 *   [1..]   entity.created Activity + subjects        unchanged, just not run alone
 *           spine_records INSERT
 *           structural link INSERT + its Activity   (only when a parent was chosen)
 *           task_details INSERT                      (status/description/planning)
 *           task_recurrence_rules INSERT             (only when a rule was supplied)
 *   ─────   stale-mapping DELETE                     (only when re-converting)
 *           meeting_item_tasks INSERT                ← the conversion itself
 *           meeting.item_converted_to_task Activity
 *           entity_links INSERT (task.relates_to)   ← the navigable relationship
 *           entity_link.created Activity
 * ```
 *
 * Every statement is a repository's own SQL — this class assembles, it does not
 * author Task, Meeting or EntityLink statements, so no authority is duplicated
 * (AGENTS.md §9.8). The Task's entity insert stays at index 0, which is what lets
 * the Task repository read the batch results and raise the same typed errors it
 * always raised for a missing/archived/cross-workspace parent.
 *
 * ## Idempotency
 *
 * A live mapping for the source item short-circuits BEFORE the batch and returns
 * the existing Task with `created: false`. Two conversions arriving at once both
 * reach the batch, and the `meeting_item_tasks (workspace_id, item_id)` unique
 * index decides: the loser's whole transaction rolls back — no Task, no Activity —
 * and it re-reads and returns the winner's Task. The constraint is the arbiter;
 * nothing catches a uniqueness error and pretends it did not happen.
 *
 * ## Workspace isolation
 *
 * Both repositories are workspace-bound at construction and every statement binds
 * `workspace_id`, so a meeting id, item id or parent id belonging to another
 * workspace simply matches nothing: the meeting read fails closed with
 * `MeetingNotFoundError`, and a foreign parent makes the Task's entity insert
 * change no row, which the Task repository turns into `SpineParentUnavailableError`.
 */

import {
  MeetingArchivedError,
  MeetingFollowUpConflictError,
  MeetingItemNotFoundError,
  MeetingNotFoundError,
  type MeetingTaskConversionInput,
  type MeetingTaskConversionRepository,
  type MeetingTaskConversionResult,
} from "~/kernel/meetings";
import { systemClock, type Clock } from "~/kernel/entities";
import { TASK_RELATES_TO } from "~/shared/task-record/task-view";

import type { D1EntityLinkRepository } from "./d1-entity-link-repository";
import type { D1MeetingRepository } from "./d1-meeting-repository";
import type { D1TaskRepository } from "./d1-task-repository";

/**
 * The Task surface this composer needs: the port's reads, plus the two statement
 * seams. Structural rather than the concrete class, so a test can substitute a
 * narrower stand-in without inheriting a 4,000-line adapter.
 */
type TaskSide = Pick<
  D1TaskRepository,
  "getTask" | "buildCreateTaskStatements" | "interpretCreateTaskResults"
>;
type MeetingSide = Pick<
  D1MeetingRepository,
  | "get"
  | "getFollowUpForItem"
  | "buildFollowUpLinkStatements"
  | "buildRemoveFollowUpStatement"
  | "buildConversionLifecycleGuard"
>;
type EntityLinkSide = Pick<
  D1EntityLinkRepository,
  "create" | "buildCreateLinkStatements"
>;

/** True when a raw D1 failure is a UNIQUE-constraint violation. */
function isUniqueConstraintViolation(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause);
  return /UNIQUE constraint failed/i.test(message);
}

export interface D1MeetingTaskConversionOptions {
  readonly clock?: Clock;
  /**
   * TEST-ONLY deterministic failure injection. Appends a statement guaranteed to
   * fail at the named point, so the fault-injection suite can prove that a failure
   * on either side of the conversion's commit leaves NO Task, NO mapping, NO
   * relationship and NO Activity. Never set in production.
   */
  readonly fault?: "after-task" | "after-mapping" | "after-link";
  /**
   * TEST-ONLY hook awaited AFTER the idempotency read and BEFORE the batch, so a
   * test can commit a competing conversion in the gap and prove the loser's whole
   * transaction rolls back.
   */
  readonly raceHook?: () => Promise<void>;
}

export class D1MeetingTaskConversionRepository implements MeetingTaskConversionRepository {
  readonly #db: D1Database;
  readonly #tasks: TaskSide;
  readonly #meetings: MeetingSide;
  readonly #entityLinks: EntityLinkSide;
  readonly #clock: Clock;
  readonly #fault?: D1MeetingTaskConversionOptions["fault"];
  readonly #raceHook?: () => Promise<void>;

  constructor(
    db: D1Database,
    repositories: {
      readonly tasks: TaskSide;
      readonly meetings: MeetingSide;
      readonly entityLinks: EntityLinkSide;
    },
    options: D1MeetingTaskConversionOptions = {},
  ) {
    this.#db = db;
    this.#tasks = repositories.tasks;
    this.#meetings = repositories.meetings;
    this.#entityLinks = repositories.entityLinks;
    this.#clock = options.clock ?? systemClock;
    this.#fault = options.fault;
    this.#raceHook = options.raceHook;
  }

  async convert(
    input: MeetingTaskConversionInput,
  ): Promise<MeetingTaskConversionResult> {
    const { meetingId, itemId } = input;

    // Lifecycle first: a missing, deleted, cross-workspace or ARCHIVED meeting
    // refuses before anything is planned, let alone written.
    const meeting = await this.#meetings.get(meetingId);
    if (!meeting) throw new MeetingNotFoundError();
    if (meeting.archivedAt) {
      throw new MeetingArchivedError(
        "This meeting is archived — restore it to create follow-up tasks.",
      );
    }
    const item =
      itemId === null ? null : meeting.items.find((i) => i.id === itemId);
    if (itemId !== null && !item) throw new MeetingItemNotFoundError();

    // Idempotency: a live conversion for this item short-circuits — no second Task,
    // no second event, no write at all.
    let staleTaskId: string | null = null;
    if (itemId !== null) {
      const existing = await this.#meetings.getFollowUpForItem(itemId);
      if (existing) {
        const existingTask = await this.#tasks.getTask(existing.taskId);
        if (existingTask) {
          // The relationship is self-healing: re-asserting it is idempotent and
          // repairs a link removed by hand without minting a second Task.
          await this.#entityLinks.create({
            sourceEntityId: existingTask.id,
            targetEntityId: meetingId,
            type: TASK_RELATES_TO,
          });
          return { taskId: existingTask.id, created: false };
        }
        // The converted Task was permanently deleted, so the item is convertible
        // again. The stale mapping is dropped INSIDE the re-conversion's batch.
        staleTaskId = existing.taskId;
      }
    }

    const now = this.#clock();
    /*
     * The lifecycle checks above happened BEFORE the batch, and a pre-read cannot
     * be trusted during it: the Meeting can be archived, or the source item
     * removed, in the gap. So the same conditions are re-asserted in SQL and
     * AND-ed into the Task's own create gate — the protection `addItem`,
     * `removeItem` and `markHeld` already apply on this repository. A Meeting that
     * became read-only, or an item that went away, therefore declines the WHOLE
     * batch: no Task, and nothing gated on that Task.
     */
    const lifecycleGuard = this.#meetings.buildConversionLifecycleGuard(
      meetingId,
      itemId,
    );
    const taskPlan = this.#tasks.buildCreateTaskStatements(
      {
        title: input.task.title,
        parent: input.task.parent,
        priority: input.task.priority ?? null,
        dueDate: input.task.dueDate ?? null,
        scheduledDate: input.task.scheduledDate ?? null,
        timeSector: input.task.timeSector ?? null,
        commitmentState: input.task.commitmentState ?? "active",
        // Both were follow-up `updateTask` calls before AUDIT-13 — two more
        // transactions, two more ways to half-convert.
        status: input.task.status ?? "todo",
        description: input.task.description ?? null,
      },
      { guard: lifecycleGuard },
    );

    const statements: D1PreparedStatement[] = [...taskPlan.statements];
    if (this.#fault === "after-task") statements.push(this.#forcedFailure());
    if (staleTaskId !== null) {
      statements.push(this.#meetings.buildRemoveFollowUpStatement(staleTaskId));
    }
    statements.push(
      ...this.#meetings.buildFollowUpLinkStatements(
        {
          meetingId,
          itemId,
          taskId: taskPlan.taskId,
          ...(item ? { itemKind: item.kind } : {}),
        },
        now,
      ),
    );
    if (this.#fault === "after-mapping") statements.push(this.#forcedFailure());
    statements.push(
      ...this.#entityLinks.buildCreateLinkStatements(
        {
          sourceEntityId: taskPlan.taskId,
          targetEntityId: meetingId,
          type: TASK_RELATES_TO,
        },
        now,
      ),
    );
    if (this.#fault === "after-link") statements.push(this.#forcedFailure());

    await this.#raceHook?.();

    let results: D1Result[];
    try {
      results = await this.#db.batch(statements);
    } catch (cause) {
      // A concurrent conversion claimed this item first. THIS transaction rolled
      // back in full — there is no Task of ours to compensate — so read the winner
      // and return it, which is the same answer a retry would get.
      if (itemId !== null && isUniqueConstraintViolation(cause)) {
        const winner = await this.#meetings.getFollowUpForItem(itemId);
        const winnerTask = winner
          ? await this.#tasks.getTask(winner.taskId)
          : null;
        if (winnerTask) {
          await this.#entityLinks.create({
            sourceEntityId: winnerTask.id,
            targetEntityId: meetingId,
            type: TASK_RELATES_TO,
          });
          return { taskId: winnerTask.id, created: false };
        }
        throw new MeetingFollowUpConflictError(itemId);
      }
      throw cause;
    }

    // A zero-row create has three possible causes now, and they are three
    // different answers for the owner. Diagnose before falling back to the Task
    // repository's own parent error, and diagnose from FRESH state — the reason
    // must still be true when it is reported (the same rule `addItem` follows).
    if ((results[0]?.meta?.changes ?? 0) === 0) {
      const fresh = await this.#meetings.get(meetingId);
      if (!fresh) throw new MeetingNotFoundError();
      if (fresh.archivedAt) {
        throw new MeetingArchivedError(
          "This meeting is archived — restore it to create follow-up tasks.",
        );
      }
      if (itemId !== null && !fresh.items.some((i) => i.id === itemId)) {
        throw new MeetingItemNotFoundError();
      }
      // The Meeting and the item are fine, so the create declined for its own
      // reason — an unavailable parent. Nothing was written either way.
    }
    // The Task's own typed errors, raised from the same batch's results — one
    // create, one set of failure semantics, wherever the batch was assembled.
    this.#tasks.interpretCreateTaskResults(taskPlan, results);

    return { taskId: taskPlan.taskId, created: true };
  }

  /** A statement guaranteed to fail, aborting and rolling back the batch (tests). */
  #forcedFailure(): D1PreparedStatement {
    return this.#db.prepare(
      "SELECT 1 FROM __dalyhub_forced_conversion_fault__",
    );
  }
}
