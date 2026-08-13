/**
 * BACKUP-01 — the production D1 → R2 backup Workflow.
 *
 * ── The shape ─────────────────────────────────────────────────────────────────
 *
 *   plan ──► initiate-export ──► export-and-store ──► verify-stored-object
 *    │            │                    │                      │
 *    │            │                    │                      └ head() the object:
 *    │            │                    │                        it exists, it is
 *    │            │                    │                        non-zero, it is the
 *    │            │                    │                        size and key we wrote,
 *    │            │                    │                        its metadata is there
 *    │            │                    └ poll until ready, download, validate the
 *    │            │                      SQL, checksum it, put() it
 *    │            └ POST the export, keep the bookmark
 *    └ decide the tier and the object key, ONCE
 *
 * ── Why the steps are cut here and not elsewhere ──────────────────────────────
 * Workflow steps are checkpoints: a step's return value is durably memoised, and
 * a retry re-runs only from the failed step. That makes the cut points a design
 * decision rather than a formatting one.
 *
 * - **`plan` is its own step** so the object KEY is decided exactly once and
 *   memoised. If the key were recomputed inside a later step, every retry would
 *   compute a new timestamp and a failing-then-succeeding run would scatter
 *   several partial objects across the bucket under different names. Deciding it
 *   up front is what makes retries idempotent (§7, §15).
 *
 * - **polling, downloading and storing are ONE step**, deliberately. The signed
 *   URL is a bearer credential for the owner's entire database and expires
 *   within the hour; splitting the poll from the download would persist that URL
 *   into durable Workflow state, which is exactly where a credential should not
 *   live. Keeping them together means the URL exists only inside one step's
 *   execution, and a retry simply re-polls for a fresh one.
 *
 * - **verification is a separate step** because it must be able to fail after a
 *   successful `put()`. "The put() call returned" is not the same claim as
 *   "there is a backup"; §11 asks for the object to be read back, and a distinct
 *   step means a verification failure is reported as a FAILED backup rather than
 *   being swallowed by the step that wrote it.
 *
 * ── Failing closed ────────────────────────────────────────────────────────────
 * Nothing here reports success on a partial result. Missing configuration, a
 * rejected token, a malformed API response, a dump that does not carry the
 * schema, a zero-byte object and a key collision with another instance are all
 * `NonRetryableError` — permanent conditions where retrying for hours would only
 * delay the owner discovering that their backups stopped working. Network
 * failures, 5xx, 429 and "the export is not ready yet" are ordinary throws, so
 * the Workflow's own retry policy handles them.
 */

import { WorkflowEntrypoint } from "cloudflare:workers";
import type { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { NonRetryableError } from "cloudflare:workflows";

import { backupAdmissionGate } from "./backup-admission";
import { checkBackupConfig } from "./config";
import type { BackupConfig, BackupEnv, BackupParams } from "./config";
import { D1ExportError, downloadExport, pollD1Export } from "./d1-export";
import { looksLikeSqlDump, validateDumpText } from "./dump-validation";
import { logError, logInfo } from "./logging";
import {
  BACKUP_RETENTION_DAYS,
  backupObjectKey,
  type BackupTrigger,
} from "./object-key";
import {
  failedRun,
  type BackupFailureStage,
  type BackupRunRecord,
} from "./run-records";
import { recordRun } from "./status-store";

/**
 * How the export is polled INSIDE the `export-and-store` step.
 *
 * Twelve attempts five seconds apart is a minute of patience, comfortably inside
 * the step timeout and far more than a 1.35 MB database needs. If the export is
 * still not ready the step throws an ordinary error and the Workflow's retry
 * policy waits properly before trying again — the same bookmark is re-polled, so
 * no second export is started and the first one keeps running server-side.
 */
const POLL_ATTEMPTS = 12;
const POLL_INTERVAL_MS = 5_000;

/** Retry policy for the steps that talk to the network. */
const NETWORK_RETRIES = {
  retries: { limit: 5, delay: "30 seconds", backoff: "exponential" },
  timeout: "10 minutes",
} as const;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Translate a `D1ExportError` into the Workflow's vocabulary: permanent errors
 * become `NonRetryableError`, transient ones are rethrown for the retry policy.
 */
function rethrowClassified(error: unknown): never {
  if (error instanceof D1ExportError && error.permanent) {
    throw new NonRetryableError(error.message);
  }
  throw error;
}

/** Read the config, or fail the instance permanently with every problem named. */
function requireConfig(env: BackupEnv): BackupConfig {
  const checked = checkBackupConfig(env);
  if (!checked.ok) {
    const reason = checked.problems.join(" ");
    logError("configuration-invalid", { reason });
    throw new NonRetryableError(
      `The backup Worker is not configured: ${reason}`,
    );
  }
  return checked.config;
}

/**
 * The backup itself, as a plain function over its dependencies.
 *
 * Separated from the `WorkflowEntrypoint` class deliberately. The class is a
 * runtime adapter whose constructor the Workers runtime brand-checks, so it
 * cannot be instantiated in a test; the logic below is the part with the
 * behaviour worth proving, and as a function it can be driven directly against
 * a real R2 bucket in the Workers pool (`test/kernel/backup-workflow.test.ts`).
 * The class keeps no logic of its own, so nothing goes untested by living there.
 */
/**
 * Which retention tier this instance belongs to. PURE.
 *
 * `event.schedule` is set only when the PLATFORM created the instance from a
 * `schedules` entry on the Workflow binding (paid Workers plans). It is
 * authoritative and cannot be overridden by a parameter: a nightly backup must
 * never be relabelled onto the manual tier's 365-day retention, or the daily
 * series would silently stop expiring.
 *
 * On the free plan the instance is created by this Worker's own `scheduled()`
 * handler, which passes `trigger: "daily"` explicitly. Only a caller holding
 * Cloudflare credentials can pass parameters at all, and such a caller could
 * already trigger backups, so honouring the parameter grants nothing new.
 * Anything with neither signal is a hand-run backup: `manual`.
 */
export function resolveTrigger(
  event: Readonly<WorkflowEvent<BackupParams>>,
): BackupTrigger {
  return event.schedule !== undefined
    ? "daily"
    : (event.payload?.trigger ?? "manual");
}

/**
 * The instant the backup is NAMED for — the cron SLOT, not "now", so a firing
 * that starts late or an instance that retries still files under the night it
 * belongs to and the daily series keeps exactly one object per day. PURE.
 */
export function resolveNamedInstant(
  event: Readonly<WorkflowEvent<BackupParams>>,
): Date {
  return new Date(
    event.schedule?.scheduledTime ??
      event.payload?.scheduledTime ??
      event.timestamp.getTime(),
  );
}

/**
 * Carries the stage the run is currently in, so the failure record can name it.
 *
 * A mutable holder rather than a return value because the stage advances INSIDE
 * step callbacks, and the `catch` that needs it sits outside them.
 */
interface StageTracker {
  stage: BackupFailureStage;
}

/**
 * Write a run record, best-effort.
 *
 * Deliberately swallows its own failure, for one reason: the record is how the
 * owner SEES the backup, not the backup itself. BACKUP-01's contract is that a
 * verified dump exists in R2, and failing a run whose dump is verified and
 * present because a small JSON status file could not be written would report a
 * successful backup as a failure — the exact dishonesty the whole design avoids.
 *
 * A persistent inability to write status does not go unnoticed: the `running`
 * record stops being replaced, and after thirty minutes the health calculation
 * reports it as stalled. The failure is surfaced by absence rather than by
 * corrupting the meaning of "failed".
 */
async function recordRunSafely(
  env: BackupEnv,
  record: BackupRunRecord,
): Promise<void> {
  try {
    await recordRun(env.BACKUPS, record);
  } catch (error) {
    logError("run-record-write-failed", {
      instanceId: record.id,
      reason: error instanceof Error ? error.message : "unknown error",
    });
  }
}

async function releaseAdmissionSafely(
  env: BackupEnv,
  event: Readonly<WorkflowEvent<BackupParams>>,
): Promise<void> {
  const admissionId = event.payload?.admissionId;
  if (typeof admissionId !== "string" || admissionId === "") return;

  try {
    await backupAdmissionGate(env).release({
      admissionId,
      instanceId: event.instanceId,
    });
  } catch (error) {
    logError("admission-release-failed", {
      instanceId: event.instanceId,
      reason: error instanceof Error ? error.message : "unknown error",
    });
  }
}

export async function runProductionBackup(
  env: BackupEnv,
  event: Readonly<WorkflowEvent<BackupParams>>,
  step: WorkflowStep,
  /**
   * Test seam. Production always uses the default; the "export never becomes
   * ready" test would otherwise spend a real minute sleeping to prove a branch
   * that has nothing to do with elapsed time.
   */
  options: { pollIntervalMs?: number } = {},
): Promise<{ key: string; bytes: number; bookmark: string }> {
  const trigger = resolveTrigger(event);
  // Stable across retries: the instance's own timestamp, never "now". A run
  // record whose key moved on retry would appear as several runs.
  const startedAt = event.timestamp.toISOString();
  const base = {
    id: event.instanceId,
    trigger,
    startedAt,
    objectKey: null,
    sizeBytes: null,
    retentionDays: BACKUP_RETENTION_DAYS[trigger],
  };
  const tracker: StageTracker = { stage: "configuration" };

  await recordRunSafely(env, {
    ...base,
    status: "running",
    completedAt: null,
    stage: null,
    message: null,
  });

  try {
    const result = await executeBackup(env, event, step, options, tracker);
    await recordRunSafely(env, {
      ...base,
      status: "success",
      completedAt: new Date().toISOString(),
      objectKey: result.key,
      sizeBytes: result.bytes,
      stage: null,
      message: null,
    });
    await releaseAdmissionSafely(env, event);
    return result;
  } catch (error) {
    // Reached only after `step.do` has exhausted its retries (or hit a
    // NonRetryableError), so a recorded failure means the run genuinely failed
    // rather than that one attempt did. Retry behaviour is untouched: the record
    // is written, then the original error is rethrown unchanged.
    await recordRunSafely(
      env,
      failedRun(base, tracker.stage, new Date().toISOString()),
    );
    await releaseAdmissionSafely(env, event);
    throw error;
  }
}

async function executeBackup(
  env: BackupEnv,
  event: Readonly<WorkflowEvent<BackupParams>>,
  step: WorkflowStep,
  options: { pollIntervalMs?: number },
  tracker: StageTracker,
): Promise<{ key: string; bytes: number; bookmark: string }> {
  const pollIntervalMs = options.pollIntervalMs ?? POLL_INTERVAL_MS;
  const config = requireConfig(env);
  const instanceId = event.instanceId;
  tracker.stage = "export-start";
  /* ── 1. Plan ──────────────────────────────────────────────────────────── */
  const plan = await step.do("plan", async () => {
    const trigger = resolveTrigger(event);
    const at = resolveNamedInstant(event);

    const key = backupObjectKey({
      trigger,
      databaseName: config.databaseName,
      at,
    });

    return {
      trigger,
      key,
      at: at.toISOString(),
      cron: event.schedule?.cron ?? null,
    };
  });

  logInfo("started", {
    stage: "plan",
    database: config.databaseName,
    databaseId: config.databaseId,
    trigger: plan.trigger,
    key: plan.key,
    instanceId,
    retentionDays: BACKUP_RETENTION_DAYS[plan.trigger],
  });

  /* ── 2. Initiate the export ───────────────────────────────────────────── */
  const initiated = await step.do(
    "initiate-export",
    NETWORK_RETRIES,
    async () => {
      try {
        const first = await pollD1Export({
          accountId: config.accountId,
          databaseId: config.databaseId,
          apiToken: config.apiToken,
        });
        return { bookmark: first.bookmark };
      } catch (error) {
        logError("export-initiation-failed", {
          stage: "initiate-export",
          database: config.databaseName,
          instanceId,
          reason: error instanceof Error ? error.message : "unknown error",
        });
        return rethrowClassified(error);
      }
    },
  );

  logInfo("export-bookmark-obtained", {
    stage: "initiate-export",
    database: config.databaseName,
    bookmark: initiated.bookmark,
    instanceId,
  });

  /* ── 3. Poll, download, validate, store ───────────────────────────────── */
  const stored = await step.do(
    "export-and-store",
    NETWORK_RETRIES,
    async () => {
      const target = {
        accountId: config.accountId,
        databaseId: config.databaseId,
        apiToken: config.apiToken,
      };

      tracker.stage = "export-wait";
      // -- poll until the dump is ready ---------------------------------
      let ready: Awaited<ReturnType<typeof pollD1Export>> | undefined;
      let polls = 0;
      for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt += 1) {
        polls += 1;
        let current;
        try {
          current = await pollD1Export(target, initiated.bookmark);
        } catch (error) {
          logError("export-poll-failed", {
            stage: "export-and-store",
            bookmark: initiated.bookmark,
            polls,
            instanceId,
            reason: error instanceof Error ? error.message : "unknown error",
          });
          return rethrowClassified(error);
        }
        if (current.status === "complete") {
          ready = current;
          break;
        }
        await wait(pollIntervalMs);
      }

      if (ready === undefined || ready.status !== "complete") {
        // Transient by design: the step retries, re-polls the SAME bookmark,
        // and the export continues running on Cloudflare's side meanwhile.
        throw new Error(
          `The D1 export was still in progress after ${polls} polls.`,
        );
      }

      logInfo("export-ready", {
        stage: "export-and-store",
        database: config.databaseName,
        bookmark: ready.bookmark,
        sourceFilename: ready.filename,
        polls,
        instanceId,
      });

      tracker.stage = "export-download";
      // -- download ------------------------------------------------------
      let text: string;
      try {
        text = await downloadExport(ready.signedUrl);
      } catch (error) {
        logError("export-download-failed", {
          stage: "export-and-store",
          bookmark: ready.bookmark,
          instanceId,
          reason: error instanceof Error ? error.message : "unknown error",
        });
        return rethrowClassified(error);
      }

      tracker.stage = "dump-validation";
      // -- validate ------------------------------------------------------
      // Before storing, not after. An object that fails validation is never
      // written, so the bucket cannot contain a file that looks like a backup
      // and is not one.
      if (!looksLikeSqlDump(text)) {
        throw new NonRetryableError(
          "The downloaded export does not look like a SQL dump.",
        );
      }
      const problems = validateDumpText(text);
      if (problems.length > 0) {
        logError("dump-validation-failed", {
          stage: "export-and-store",
          bookmark: ready.bookmark,
          instanceId,
          reason: problems.join("; "),
        });
        throw new NonRetryableError(
          `The production dump failed structural validation: ${problems.join("; ")}`,
        );
      }

      const bytes = new TextEncoder().encode(text);
      if (bytes.byteLength === 0) {
        throw new NonRetryableError("The production dump was zero bytes.");
      }

      const sha256 = toHex(await crypto.subtle.digest("SHA-256", bytes));

      tracker.stage = "r2-write";
      // -- refuse to clobber another instance's backup -------------------
      // Different runs get different timestamps, so a collision means either
      // this instance's own retry (fine — the same bytes go to the same key)
      // or a second run that landed in the same second. Overwriting a
      // previous SUCCESSFUL backup is never acceptable, so the second case
      // fails loudly instead.
      const existing = await env.BACKUPS.head(plan.key);
      if (
        existing !== null &&
        existing.customMetadata?.workflowInstanceId !== instanceId
      ) {
        throw new NonRetryableError(
          `Refusing to overwrite an existing backup at ${plan.key} written by another Workflow instance.`,
        );
      }

      const retentionDays = BACKUP_RETENTION_DAYS[plan.trigger];

      await env.BACKUPS.put(plan.key, bytes, {
        // R2 verifies this server-side and rejects the write if the bytes it
        // received do not hash to it, so a corrupted upload fails rather than
        // being stored.
        sha256,
        httpMetadata: { contentType: "application/sql" },
        // Non-sensitive provenance only: names, identifiers, sizes and a
        // digest. Never a credential, never a row of the owner's data.
        customMetadata: {
          database: config.databaseName,
          databaseId: config.databaseId,
          environment: config.environment,
          bookmark: ready.bookmark,
          backupTimestamp: plan.at,
          trigger: plan.trigger,
          retentionDays: String(retentionDays),
          sourceFilename: ready.filename,
          workflowInstanceId: instanceId,
          workflowName: event.workflowName,
          sha256,
          ...(plan.cron !== null ? { cron: plan.cron } : {}),
          ...(config.workerCommit !== undefined
            ? { workerCommit: config.workerCommit }
            : {}),
        },
      });

      return {
        key: plan.key,
        bytes: bytes.byteLength,
        bookmark: ready.bookmark,
        sourceFilename: ready.filename,
        sha256,
        polls,
      };
    },
  );

  logInfo("stored", {
    stage: "export-and-store",
    database: config.databaseName,
    key: stored.key,
    bytes: stored.bytes,
    bookmark: stored.bookmark,
    sourceFilename: stored.sourceFilename,
    polls: stored.polls,
    instanceId,
  });

  /* ── 4. Verify the object that is actually in the bucket ──────────────── */
  tracker.stage = "verification";
  await step.do("verify-stored-object", async () => {
    const head = await env.BACKUPS.head(stored.key);

    if (head === null) {
      throw new NonRetryableError(
        `The backup object ${stored.key} does not exist after a successful write.`,
      );
    }
    if (head.key !== stored.key) {
      throw new NonRetryableError(
        `The stored object key is ${head.key}, expected ${stored.key}.`,
      );
    }
    if (head.size === 0) {
      throw new NonRetryableError(
        `The backup object ${stored.key} is zero bytes.`,
      );
    }
    if (head.size !== stored.bytes) {
      throw new NonRetryableError(
        `The backup object ${stored.key} is ${head.size} bytes, expected ${stored.bytes}.`,
      );
    }
    const metadata = head.customMetadata ?? {};
    for (const field of [
      "database",
      "databaseId",
      "bookmark",
      "backupTimestamp",
      "trigger",
      "sha256",
    ]) {
      if (typeof metadata[field] !== "string" || metadata[field].length === 0) {
        throw new NonRetryableError(
          `The backup object ${stored.key} is missing the "${field}" metadata.`,
        );
      }
    }
    if (metadata.sha256 !== stored.sha256) {
      throw new NonRetryableError(
        `The backup object ${stored.key} records a different digest than was written.`,
      );
    }
    return { verified: true };
  });

  logInfo("completed", {
    stage: "verify-stored-object",
    database: config.databaseName,
    databaseId: config.databaseId,
    trigger: plan.trigger,
    key: stored.key,
    bytes: stored.bytes,
    bookmark: stored.bookmark,
    retentionDays: BACKUP_RETENTION_DAYS[plan.trigger],
    instanceId,
  });

  return {
    key: stored.key,
    bytes: stored.bytes,
    bookmark: stored.bookmark,
  };
}

/**
 * The Workflow the Cloudflare runtime instantiates. A thin adapter over
 * `runProductionBackup` — see that function's note for why the split exists.
 */
export class ProductionBackupWorkflow extends WorkflowEntrypoint<
  BackupEnv,
  BackupParams
> {
  override async run(
    event: Readonly<WorkflowEvent<BackupParams>>,
    step: WorkflowStep,
  ): Promise<{ key: string; bytes: number; bookmark: string }> {
    return await runProductionBackup(this.env, event, step);
  }
}
