/**
 * FND-05 Activity — D1 adapter boundary types and conversions.
 *
 * Owns the ONLY place the storage-facing snake_case `activities` /
 * `activity_subjects` row shapes, SQLite timestamp strings and payload JSON text
 * are allowed to exist, and converts raw rows into the domain `ActivityRecord`, so
 * those specifics never leak past the adapter into the kernel contract (ADR-012;
 * mirrors `database.ts` and `entity-link-database.ts`).
 */

import type {
  ActivityRecord,
  ActivitySubject,
  ActivityType,
} from "~/kernel/activity";
import { parseActivityPayload } from "~/kernel/activity";
import { parseWorkspaceId } from "~/kernel/workspaces";

import { fromStorageTimestamp } from "./database";

/**
 * The raw `activities` row, exactly as stored in D1 (snake_case columns, ISO-8601
 * UTC TEXT timestamps, payload as JSON TEXT). Never exposed outside the adapter.
 */
export interface ActivityRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly type: string;
  readonly actor_type: string;
  readonly actor_id: string | null;
  readonly occurred_at: string;
  readonly payload_json: string;
}

/** The raw `activity_subjects` row, exactly as stored in D1. */
export interface ActivitySubjectRow {
  readonly workspace_id: string;
  readonly activity_id: string;
  readonly entity_id: string;
  readonly role: string;
}

/** Convert a raw subject row into a domain `ActivitySubject`. */
export function rowToActivitySubject(row: ActivitySubjectRow): ActivitySubject {
  return { entityId: row.entity_id, role: row.role };
}

/**
 * Convert a raw `activities` row plus its already-fetched subject rows into a
 * domain `ActivityRecord`. The payload JSON is parsed and re-validated through the
 * shared `parseActivityPayload` helper — corrupt stored JSON surfaces as a typed
 * `ActivityPayloadError`, never a raw crash. The type is re-branded through its
 * stored-verbatim invariant.
 */
export function rowToActivity(
  row: ActivityRow,
  subjectRows: readonly ActivitySubjectRow[],
): ActivityRecord {
  return {
    id: row.id,
    workspaceId: parseWorkspaceId(row.workspace_id),
    // Stored verbatim after validation on write; re-cast to the branded type.
    type: row.type as ActivityType,
    actor: { type: row.actor_type, id: row.actor_id },
    occurredAt: fromStorageTimestamp(row.occurred_at),
    payload: parseActivityPayload(row.payload_json),
    subjects: subjectRows.map(rowToActivitySubject),
  };
}
