/**
 * BACKUP-02 — one server-side path that admits and creates backup Workflows.
 *
 * Both the application/manual trigger and the nightly scheduled trigger come
 * through here. The Durable Object makes the admission decision first, then this
 * helper creates the existing BACKUP-01 Workflow and attaches the instance id to
 * the held admission. If creation fails, the admission is cancelled immediately
 * so the owner can retry.
 */

import { backupAdmissionGate } from "./backup-admission";
import { runBlocksNewBackup } from "./backup-health";
import type { BackupEnv, BackupParams } from "./config";
import { logError } from "./logging";
import type { BackupTrigger } from "./object-key";
import { readRunLog } from "./status-store";

export type StartBackupWorkflowResult =
  | {
      readonly accepted: true;
      readonly instanceId: string;
      readonly status: "queued";
    }
  | {
      readonly accepted: false;
      readonly status: "running";
      readonly message: "A backup is already running.";
    };

export async function startBackupWorkflow(
  env: BackupEnv,
  input: {
    readonly trigger: BackupTrigger;
    readonly scheduledTime?: number;
  },
): Promise<StartBackupWorkflowResult> {
  const gate = backupAdmissionGate(env);
  const admittedAt = new Date();
  const admission = await gate.admit({
    trigger: input.trigger,
    now: admittedAt.toISOString(),
  });
  if (!admission.accepted) {
    return {
      accepted: false,
      status: "running",
      message: admission.message,
    };
  }

  const cancelAdmission = async (): Promise<void> => {
    try {
      await gate.cancel({ admissionId: admission.admissionId });
    } catch (error) {
      logError("admission-cancel-failed", {
        reason: error instanceof Error ? error.message : "unknown error",
      });
    }
  };

  try {
    const log = await readRunLog(env.BACKUPS);
    if (log !== null) {
      const inFlight = log.find((run) => runBlocksNewBackup(run, admittedAt));
      if (inFlight !== undefined) {
        await cancelAdmission();
        return {
          accepted: false,
          status: "running",
          message: "A backup is already running.",
        };
      }
    }
    // A `null` log does not block the trigger. Being unable to read the history
    // is not a reason to refuse to take a backup — it is a reason to take one.

    const params: BackupParams = {
      trigger: input.trigger,
      admissionId: admission.admissionId,
      ...(input.scheduledTime !== undefined
        ? { scheduledTime: input.scheduledTime }
        : {}),
    };
    const instance = await env.BACKUP_WORKFLOW.create({ params });
    await gate.attach({
      admissionId: admission.admissionId,
      instanceId: instance.id,
      now: new Date().toISOString(),
    });
    return { accepted: true, instanceId: instance.id, status: "queued" };
  } catch (error) {
    await cancelAdmission();
    throw error;
  }
}
