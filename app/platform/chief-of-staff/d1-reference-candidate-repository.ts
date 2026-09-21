import type { ReferenceKind } from "~/kernel/chief-of-staff";
import type { WorkspaceContext } from "~/kernel/workspaces";

/** One legitimate name/alias candidate for a Chief-of-Staff reference. */
export type ReferenceCandidate = {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string | null;
  /** Explicit aliases only. Today those are a Person's preferred name/email. */
  readonly aliases?: readonly string[];
};

export interface ReferenceCandidateRepository {
  find(input: {
    readonly kind: ReferenceKind;
    /** The application-layer canonical reference key (ASCII letters/digits). */
    readonly normalisedReference: string;
    readonly limit: number;
  }): Promise<readonly ReferenceCandidate[]>;
}

/** The single canonical key used by candidate retrieval and final comparison. */
export function normaliseReferenceKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/** A deterministic hard ceiling for the normalisation-compatible fallback. */
const REFERENCE_SCAN_LIMIT = 1_000;

type CandidateRow = {
  readonly id: string;
  readonly title: string;
  readonly organisation: string | null;
  readonly role: string | null;
  readonly preferred_name: string | null;
  readonly email: string | null;
};

/**
 * A title/explicit-alias lookup over the canonical entity tables.
 *
 * This is deliberately separate from global/full-text search: descriptions,
 * bodies, checklist text, tags, roles and organisations never participate in
 * the candidate comparison. SQLite cannot reproduce JavaScript's Unicode NFD
 * fold, so the adapter reads a deterministic, hard-capped identity projection
 * and applies the ONE canonical fold in application code. Archived
 * Areas/Projects/Notes follow their picker lifecycle; archived People remain
 * addressable for restore/read operations.
 */
export class D1ReferenceCandidateRepository implements ReferenceCandidateRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;

  constructor(db: D1Database, context: WorkspaceContext) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
  }

  async find(input: {
    readonly kind: ReferenceKind;
    readonly normalisedReference: string;
    readonly limit: number;
  }): Promise<readonly ReferenceCandidate[]> {
    const lifecyclePredicate =
      input.kind === "area"
        ? " AND ad.archived_at IS NULL"
        : input.kind === "project"
          ? " AND prd.archived_at IS NULL"
          : input.kind === "note"
            ? " AND nd.entity_id IS NOT NULL AND nd.archived_at IS NULL"
            : "";
    const result = await this.#db
      .prepare(
        `SELECT e.id, e.title,
                pd.organisation, pd.role, pd.preferred_name, pd.email
         FROM entities e
         LEFT JOIN person_details pd
           ON pd.workspace_id = e.workspace_id AND pd.entity_id = e.id
         LEFT JOIN area_details ad
           ON ad.workspace_id = e.workspace_id AND ad.entity_id = e.id
         LEFT JOIN project_details prd
           ON prd.workspace_id = e.workspace_id AND prd.entity_id = e.id
         LEFT JOIN note_details nd
           ON nd.workspace_id = e.workspace_id AND nd.entity_id = e.id
         WHERE e.workspace_id = ? AND e.type = ? AND e.deleted_at IS NULL
           ${lifecyclePredicate}
         ORDER BY e.created_at ASC, e.id ASC
         LIMIT ?`,
      )
      .bind(this.#workspaceId, input.kind, REFERENCE_SCAN_LIMIT)
      .all<CandidateRow>();

    const key = input.normalisedReference;
    return (result.results ?? [])
      .map((row) => ({
        id: row.id,
        title: row.title,
        subtitle:
          input.kind === "person" ? (row.organisation ?? row.role) : null,
        ...(input.kind === "person"
          ? {
              aliases: [row.preferred_name, row.email].filter(
                (value): value is string => value !== null,
              ),
            }
          : {}),
      }))
      .filter((candidate) => {
        if (normaliseReferenceKey(candidate.title).includes(key)) return true;
        return (candidate.aliases ?? []).some((alias) =>
          normaliseReferenceKey(alias).includes(key),
        );
      })
      .sort((left, right) => {
        const leftExact = normaliseReferenceKey(left.title) === key ? 0 : 1;
        const rightExact = normaliseReferenceKey(right.title) === key ? 0 : 1;
        return leftExact - rightExact;
      })
      .slice(0, input.limit);
  }
}
