/**
 * V2.11 FILE-00 — the attachment purge sweep, on the Worker's existing cron.
 *
 * The purge ledger is a SAFETY NET, not a queue. A row appears in it only when
 * an object delete has already failed once — a transient R2 fault, a delete that
 * raced a deploy — or when a destructive restore made a whole workspace's
 * objects unreachable at once. So the sweep is deliberately small and slow:
 *
 *   - it runs on the SAME fifteen-minute trigger the calendar refresh and the
 *     notification tick already use, because a byte that has been owed for
 *     fourteen minutes can be owed for one more and a second cron would be a
 *     second thing to operate;
 *   - it drains at most {@link ATTACHMENT_PURGE_SWEEP_LIMIT} keys per tick,
 *     because a sweep that tried to be fast would be a sweep that could delete a
 *     lot of the wrong thing quickly;
 *   - it is INERT when the ledger is empty, which is the ordinary case, so a
 *     deployment that has never had a storage fault does no work at all;
 *   - it never throws. A failed tick costs one tick, the attempt is recorded on
 *     the row, and the next tick is fifteen minutes away.
 *
 * It is also inert when there is no object store bound, which is what makes the
 * optional binding safe: a deployment with no bucket has no objects to purge.
 */

import { ATTACHMENT_PURGE_SWEEP_LIMIT } from "~/kernel/attachments";
import {
  bindWorkspaceRepositories,
  createWorkspaceContextResolver,
  type WorkspaceScopeEnv,
} from "~/platform/workspaces";
import { createSystemActorContext } from "~/kernel/activity";

import { resolveAttachmentObjectStore } from "./r2-object-store";
import { sweepAttachmentPurges } from "./attachment-service";

/** What the sweep needs. Deliberately the same shape the scope boundary reads. */
export type ScheduledAttachmentPurgeEnv = WorkspaceScopeEnv;

/** What one tick did, for the log and for the test. */
export interface AttachmentPurgeSweepSummary {
  readonly ran: boolean;
  readonly attempted: number;
  readonly cleared: number;
}

const IDLE: AttachmentPurgeSweepSummary = {
  ran: false,
  attempted: 0,
  cleared: 0,
};

/**
 * Drain the oldest queued objects for the configured workspace.
 *
 * The SYSTEM actor, because a sweep is the system finishing a delete the owner
 * already asked for — not the owner acting again. Nothing here appends Activity
 * in any case: the `attachment.removed` event was written when the metadata
 * went, and a second event when the bytes catch up would be noise about an
 * implementation detail.
 */
export async function runScheduledAttachmentPurge(
  env: ScheduledAttachmentPurgeEnv,
): Promise<AttachmentPurgeSweepSummary> {
  const objects = resolveAttachmentObjectStore(env);
  if (objects === null) return IDLE;

  try {
    const context = await createWorkspaceContextResolver(env).resolve();
    const scope = bindWorkspaceRepositories(
      env,
      context,
      createSystemActorContext(),
    );
    const queued = await scope.attachments.listPurges({ limit: 1 });
    // Inert in the ordinary case: one bounded read and nothing else.
    if (queued.length === 0) return IDLE;

    const result = await sweepAttachmentPurges(
      {
        attachments: scope.attachments,
        objects,
        workspaceId: context.workspaceId,
      },
      { limit: ATTACHMENT_PURGE_SWEEP_LIMIT },
    );
    return { ran: true, ...result };
  } catch (error) {
    /*
     * A failed tick is a failed tick. The names only — never the error object,
     * never a key beyond what `drainPurge` already records on the row itself.
     */
    console.error(
      "[attachments] purge sweep failed:",
      error instanceof Error ? `${error.name}: ${error.message}` : "unknown",
    );
    return IDLE;
  }
}
