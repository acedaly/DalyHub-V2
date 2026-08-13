/**
 * BACKUP-02 — atomic backup admission.
 *
 * A run log in R2 is excellent status, but it is not a mutex: reading it and
 * then creating a Workflow is a check-then-act race across Worker isolates. This
 * Durable Object is the single serialised admission point for the backup Worker.
 * It owns only operational metadata and never sees backup contents or secrets.
 */

import { DurableObject } from "cloudflare:workers";

import { BACKUP_STALLED_MINUTES } from "./backup-health";
import { logError } from "./logging";
import type { BackupTrigger } from "./object-key";

export type BackupAdmissionNamespace =
  DurableObjectNamespace<BackupAdmissionGate>;

export interface BackupAdmissionAccepted {
  readonly accepted: true;
  readonly admissionId: string;
}

export interface BackupAdmissionRefused {
  readonly accepted: false;
  readonly status: "running";
  readonly message: "A backup is already running.";
  readonly active: {
    readonly admissionId: string;
    readonly trigger: BackupTrigger;
    readonly admittedAt: string;
    readonly workflowInstanceId: string | null;
  };
}

export type BackupAdmissionResult =
  BackupAdmissionAccepted | BackupAdmissionRefused;

type BackupAdmissionGateEnv = Record<string, never>;

interface StoredAdmission {
  readonly admissionId: string;
  readonly trigger: BackupTrigger;
  readonly admittedAt: string;
  readonly workflowInstanceId: string | null;
  readonly workflowCreatedAt: string | null;
}

const GATE_NAME = "production-backup";
const ACTIVE_ID = "active";
const STALE_AFTER_MS = BACKUP_STALLED_MINUTES * 60 * 1000;

function isBackupTrigger(value: unknown): value is BackupTrigger {
  return value === "daily" || value === "manual";
}

function isStoredAdmission(value: unknown): value is StoredAdmission {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    typeof record.admissionId === "string" &&
    record.admissionId.length > 0 &&
    isBackupTrigger(record.trigger) &&
    typeof record.admittedAt === "string" &&
    Number.isFinite(Date.parse(record.admittedAt)) &&
    (typeof record.workflowInstanceId === "string" ||
      record.workflowInstanceId === null) &&
    (typeof record.workflowCreatedAt === "string" ||
      record.workflowCreatedAt === null)
  );
}

function stale(active: StoredAdmission, nowMs: number): boolean {
  const admittedAt = Date.parse(active.admittedAt);
  return !Number.isFinite(admittedAt) || nowMs - admittedAt > STALE_AFTER_MS;
}

function readNow(value: string | undefined): Date {
  if (value === undefined) return new Date();
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : new Date();
}

export function backupAdmissionGate(env: {
  readonly BACKUP_ADMISSION: BackupAdmissionNamespace;
}): DurableObjectStub<BackupAdmissionGate> {
  return env.BACKUP_ADMISSION.getByName(GATE_NAME);
}

export class BackupAdmissionGate extends DurableObject<BackupAdmissionGateEnv> {
  async admit(input: {
    readonly trigger: BackupTrigger;
    readonly now?: string;
  }): Promise<BackupAdmissionResult> {
    const now = readNow(input.now);
    const active = await this.ctx.storage.get<unknown>(ACTIVE_ID);

    if (isStoredAdmission(active) && !stale(active, now.getTime())) {
      return {
        accepted: false,
        status: "running",
        message: "A backup is already running.",
        active: {
          admissionId: active.admissionId,
          trigger: active.trigger,
          admittedAt: active.admittedAt,
          workflowInstanceId: active.workflowInstanceId,
        },
      };
    }

    const admitted: StoredAdmission = {
      admissionId: crypto.randomUUID(),
      trigger: input.trigger,
      admittedAt: now.toISOString(),
      workflowInstanceId: null,
      workflowCreatedAt: null,
    };
    await this.ctx.storage.put(ACTIVE_ID, admitted);
    return { accepted: true, admissionId: admitted.admissionId };
  }

  async attach(input: {
    readonly admissionId: string;
    readonly instanceId: string;
    readonly now?: string;
  }): Promise<void> {
    const active = await this.ctx.storage.get<unknown>(ACTIVE_ID);
    if (
      !isStoredAdmission(active) ||
      active.admissionId !== input.admissionId
    ) {
      return;
    }
    await this.ctx.storage.put(ACTIVE_ID, {
      ...active,
      workflowInstanceId: input.instanceId,
      workflowCreatedAt: readNow(input.now).toISOString(),
    } satisfies StoredAdmission);
  }

  async release(input: {
    readonly admissionId: string;
    readonly instanceId: string;
  }): Promise<void> {
    const active = await this.ctx.storage.get<unknown>(ACTIVE_ID);
    if (!isStoredAdmission(active)) return;
    if (active.admissionId !== input.admissionId) return;
    if (
      active.workflowInstanceId !== null &&
      active.workflowInstanceId !== input.instanceId
    ) {
      logError("admission-release-refused", {
        reason: "workflow instance did not match the active admission",
      });
      return;
    }
    await this.ctx.storage.delete(ACTIVE_ID);
  }

  async cancel(input: { readonly admissionId: string }): Promise<void> {
    const active = await this.ctx.storage.get<unknown>(ACTIVE_ID);
    if (isStoredAdmission(active) && active.admissionId === input.admissionId) {
      await this.ctx.storage.delete(ACTIVE_ID);
    }
  }
}
