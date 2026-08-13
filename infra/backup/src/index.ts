/**
 * BACKUP-01 — entrypoint for `dalyhub-v2-backup`.
 *
 * This Worker has NO application role. It does not serve DalyHub traffic, does
 * not share the main Worker's routes, bindings, Access policy or Cron Trigger,
 * and exists only so the production backup Workflow has somewhere to live. It is
 * deployed with `workers_dev: false`, no route and no custom domain, so nothing
 * on the public internet can reach the `fetch` handler below.
 *
 * ── Why there is a `scheduled()` handler here ─────────────────────────────────
 * The design intent was to put the nightly cron on the Workflow binding itself
 * (`schedules`), which creates an instance per firing with no handler at all.
 * Cloudflare rejects that on the free Workers plan:
 *
 *     Workflow "dalyhub-production-backup" has "schedules" configured, but
 *     scheduled Workflows require a paid Workers plan.
 *
 * Plain Cron Triggers ARE free-tier, so the schedule lives on this Worker's own
 * `triggers.crons` and the handler below creates the instance. Nothing else
 * changes: the backup is still the same Workflow with the same four durable
 * steps, the same retry policy and the same memoised object key. The only
 * difference is who asks for the instance.
 *
 * This is emphatically NOT the application Worker's scheduled handler. That one
 * belongs to the CAL-01 calendar refresh in `dalyhub-v2-production` and is
 * untouched — the whole point of a separate backup Worker is that the two jobs
 * cannot interfere with each other. If the account later moves to Workers Paid,
 * this handler and `triggers.crons` can be deleted in favour of `schedules` with
 * no change to the backup logic.
 *
 * The `fetch` handler exists because a module Worker needs a default export, and
 * because a Worker that is *supposed* to be unreachable should say so plainly if
 * it ever is reached — a silent 200 would make an accidental route-binding
 * invisible. It returns 404 and nothing else: no version, no configuration, no
 * bucket contents, and above all no way to trigger a backup. Manual runs go
 * through `wrangler workflows trigger`, which is authenticated by the operator's
 * own Cloudflare credentials rather than by an HTTP endpoint this Worker would
 * have to protect.
 */

import type { BackupEnv } from "./config";
import { logError, logInfo } from "./logging";

export { ProductionBackupWorkflow } from "./backup-workflow";

export default {
  fetch(): Response {
    return new Response("Not found.\n", {
      status: 404,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  },

  /**
   * Create one backup Workflow instance per cron firing.
   *
   * Deliberately thin. It performs no backup work of its own and holds no
   * fallback path: if instance creation fails, the run fails loudly rather than
   * quietly doing something less durable. Everything that could go wrong with a
   * backup is the Workflow's business, where it gets steps and retries.
   *
   * `params.trigger` is `daily` because this IS the nightly series — it is the
   * `production/daily/` 90-day retention tier. A manual run comes through
   * `wrangler workflows trigger` instead and lands under `production/manual/`.
   *
   * `event.scheduledTime` is passed through so the instance is named for its
   * cron slot rather than for the moment it happened to start, which is what
   * keeps exactly one object per night even if a firing is late.
   */
  async scheduled(
    event: ScheduledController,
    env: BackupEnv,
    ctx: ExecutionContext,
  ): Promise<void> {
    const create = async (): Promise<void> => {
      try {
        const instance = await env.BACKUP_WORKFLOW.create({
          params: { trigger: "daily", scheduledTime: event.scheduledTime },
        });
        logInfo("scheduled-instance-created", {
          trigger: "daily",
          instanceId: instance.id,
        });
      } catch (error) {
        logError("scheduled-instance-failed", {
          trigger: "daily",
          reason: error instanceof Error ? error.message : "unknown error",
        });
        // Rethrow so the cron invocation is recorded as failed rather than as a
        // silent success that produced no backup.
        throw error;
      }
    };

    // `waitUntil` keeps the invocation alive until creation settles; the promise
    // is also awaited so a failure surfaces as a failed scheduled run.
    const pending = create();
    ctx.waitUntil(pending);
    await pending;
  },
};
