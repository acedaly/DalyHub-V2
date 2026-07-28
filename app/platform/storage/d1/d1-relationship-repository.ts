/**
 * PEOPLE-03 Relationship intelligence — D1 implementation of the read-only
 * relationship-facts projection.
 *
 * Read-only and storage-specific. It resolves, for a bounded set of People:
 *
 *   1. the STRUCTURAL inventory — which active, in-workspace records each Person is
 *      linked to, grouped by entity type, with the open/active slice for Tasks and
 *      Projects (from `spine_records` and `project_details`);
 *   2. the INTERACTION aggregate — the exact count, first and last instant of every
 *      qualifying Activity event on those linked records; and
 *   3. a BOUNDED, newest-first sample of those interaction instants, for the pure
 *      evaluator's cadence arithmetic.
 *
 * Three grouped, chunked statements per batch — a FIXED number regardless of how
 * many People are asked for, never one query per Person (the same shape
 * `D1AlignmentRepository` and `D1ProjectHealthRepository` use). It performs NO
 * mutations and caches NOTHING.
 *
 * No caller-supplied value is ever interpolated into SQL: Person ids and the sample
 * limit are BOUND; the entity types, reserved structural link types and the
 * interaction Activity vocabulary ARE inlined as trusted kernel constants (never
 * caller data), exactly as the sibling projections do.
 *
 * Privacy (AGENTS.md §17): this file reads ids, types, timestamps and completion
 * state only. No title, body, agenda, note, diary text, review content or
 * `person_details` field is selected here, so a relationship summary can never leak
 * the substance of a record — the same boundary PEOPLE-02's timeline holds.
 *
 * Timezone: no calendar logic lives in SQL. Raw UTC instants are returned and the
 * pure evaluator maps them to the owner's calendar day, so "days since" is correct
 * across the UTC/AEST boundary (ADR-030).
 */

import { validateEntityId } from "~/kernel/entities";
import {
  INTERACTION_ACTIVITY_TYPES,
  MAX_RELATIONSHIP_FACTS_BATCH,
  RELATIONSHIP_INTERACTION_SAMPLE_LIMIT,
  emptyPersonRelationshipFacts,
  type PersonRelationshipFacts,
  type RelationshipRecordCounts,
  type RelationshipRepository,
} from "~/kernel/relationships";
import { SPINE_LINK_TYPES } from "~/kernel/spine";
import type { WorkspaceContext } from "~/kernel/workspaces";

import { fromStorageTimestamp } from "./database";

/**
 * The per-query Person-id chunk size. D1 caps bound variables at 100 per
 * statement. The id set is bound TWICE in the `linked` CTE (once per link
 * direction) and a THIRD time in the `subjects` CTE (the Person as their own
 * Activity subject), so 20 ids → 60 id binds plus a handful of scalars stays
 * comfortably under the limit while still gathering a whole collection page in a
 * small, FIXED number of statements.
 */
const RELATIONSHIP_FACTS_CHUNK_SIZE = 20;

/** The reserved structural spine link types, as a trusted, inlined SQL list. A
 * Person is outside the Area → Goal → Project → Task spine, so one should never
 * appear on them; excluded defensively, matching `resolvePersonTimelineAnchors`. */
const SPINE_LINK_TYPE_LIST = SPINE_LINK_TYPES.map((type) => `'${type}'`).join(
  ", ",
);

/** The interaction Activity vocabulary, as a trusted, inlined SQL list. */
const INTERACTION_TYPE_LIST = INTERACTION_ACTIVITY_TYPES.map(
  (type) => `'${type}'`,
).join(", ");

/**
 * The `linked` CTE every statement in this file opens with: the DISTINCT
 * (person, linked record) pairs reachable through an active EntityLink in either
 * direction, excluding reserved spine plumbing and self-links.
 *
 * A `UNION` (not `UNION ALL`) is used because a Person↔Person link would otherwise
 * be attributed twice; the union also settles which endpoint is the anchor without
 * a `CASE`, which would misattribute a link between two People.
 *
 * Binds, in order: workspaceId, …ids, workspaceId, …ids.
 */
function linkedCte(idCount: number): string {
  const placeholders = idPlaceholders(idCount);
  return `WITH linked AS (
      SELECT l.source_entity_id AS person_id, l.target_entity_id AS entity_id
      FROM entity_links l
      WHERE l.workspace_id = ? AND l.deleted_at IS NULL
            AND l.type NOT IN (${SPINE_LINK_TYPE_LIST})
            AND l.source_entity_id IN (${placeholders})
            AND l.target_entity_id <> l.source_entity_id
      UNION
      SELECT l.target_entity_id AS person_id, l.source_entity_id AS entity_id
      FROM entity_links l
      WHERE l.workspace_id = ? AND l.deleted_at IS NULL
            AND l.type NOT IN (${SPINE_LINK_TYPE_LIST})
            AND l.target_entity_id IN (${placeholders})
            AND l.target_entity_id <> l.source_entity_id
    )`;
}

function idPlaceholders(idCount: number): string {
  return Array.from({ length: idCount }, () => "?").join(", ");
}

/**
 * The ACTIVITY-SUBJECT set an interaction is read across: the Person's linked
 * records PLUS the Person themself.
 *
 * The Person is included on purpose, and it is safe purely because
 * `INTERACTION_ACTIVITY_TYPES` excludes every `person.*` and `entity_link.*` type:
 * an edit to a contact card can never enter this set, which is the honesty rule
 * PEOPLE-03 was blocked on.
 *
 * What it DOES capture is an event that names the Person as a subject in their own
 * right — MEET-03's `meeting.held` (ADR-055) is exactly that. Such an event is
 * designed to outlive the attendee link, so reading interactions only through live
 * links would silently drop a meeting the Person genuinely attended, and the
 * summary would then contradict the timeline beside it.
 *
 * Extends `linkedCte`, so it continues its bind order:
 * workspaceId, …ids, workspaceId, …ids, workspaceId, …ids.
 */
function subjectsCte(idCount: number): string {
  return `${linkedCte(idCount)},
    subjects AS (
      SELECT person_id, entity_id FROM linked
      UNION
      SELECT e.id AS person_id, e.id AS entity_id
      FROM entities e
      WHERE e.workspace_id = ? AND e.type = 'person'
            AND e.id IN (${idPlaceholders(idCount)})
    )`;
}

interface RecordCountRow {
  readonly person_id: string;
  readonly entity_type: string;
  readonly total: number;
  readonly open_total: number;
}

interface InteractionAggregateRow {
  readonly person_id: string;
  readonly total: number;
  readonly first_at: string | null;
  readonly last_at: string | null;
}

interface InteractionSampleRow {
  readonly person_id: string;
  readonly occurred_at: string;
}

/** A mutable accumulator mirroring `RelationshipRecordCounts`. */
interface CountsDraft {
  meetings: number;
  diaryEntries: number;
  notes: number;
  tasks: number;
  openTasks: number;
  projects: number;
  activeProjects: number;
  reviews: number;
  otherRecords: number;
  total: number;
}

function newCounts(): CountsDraft {
  return {
    meetings: 0,
    diaryEntries: 0,
    notes: 0,
    tasks: 0,
    openTasks: 0,
    projects: 0,
    activeProjects: 0,
    reviews: 0,
    otherRecords: 0,
    total: 0,
  };
}

/**
 * Fold one grouped `(person, entity_type)` row into the inventory. Unknown entity
 * types fall to `otherRecords`, so a module added later counts sensibly here with
 * no change — it simply is not called out by name until it earns a card.
 */
function applyCountRow(draft: CountsDraft, row: RecordCountRow): void {
  const total = Number(row.total ?? 0);
  const open = Number(row.open_total ?? 0);
  draft.total += total;
  switch (row.entity_type) {
    case "meeting":
      draft.meetings += total;
      break;
    case "diary":
      draft.diaryEntries += total;
      break;
    case "note":
      draft.notes += total;
      break;
    case "task":
      draft.tasks += total;
      draft.openTasks += open;
      break;
    case "project":
      draft.projects += total;
      draft.activeProjects += open;
      break;
    case "review":
      draft.reviews += total;
      break;
    default:
      draft.otherRecords += total;
      break;
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

export class D1RelationshipRepository implements RelationshipRepository {
  readonly #db: D1Database;
  readonly #workspaceId: string;

  constructor(db: D1Database, context: WorkspaceContext) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
  }

  async getPersonRelationshipFacts(
    personId: string,
  ): Promise<PersonRelationshipFacts> {
    const id = validateEntityId(personId);
    const facts = await this.listPersonRelationshipFacts([id]);
    return facts.get(id) ?? emptyPersonRelationshipFacts(id);
  }

  async listPersonRelationshipFacts(
    personIds: readonly string[],
  ): Promise<Map<string, PersonRelationshipFacts>> {
    const ids = [...new Set(personIds.map((id) => validateEntityId(id)))].slice(
      0,
      MAX_RELATIONSHIP_FACTS_BATCH,
    );
    const result = new Map<string, PersonRelationshipFacts>();
    if (ids.length === 0) {
      return result;
    }

    const chunks = chunk(ids, RELATIONSHIP_FACTS_CHUNK_SIZE);
    const gathered = await Promise.all(
      chunks.map(async (idChunk) => {
        // Three grouped statements per chunk, issued together — a FIXED number of
        // round trips per chunk regardless of how many People it covers.
        const [counts, aggregates, samples] = await Promise.all([
          this.#selectRecordCounts(idChunk),
          this.#selectInteractionAggregate(idChunk),
          this.#selectInteractionSample(idChunk),
        ]);
        return { counts, aggregates, samples };
      }),
    );

    const drafts = new Map<string, CountsDraft>();
    const aggregate = new Map<string, InteractionAggregateRow>();
    const samples = new Map<string, Date[]>();

    for (const batch of gathered) {
      for (const row of batch.counts) {
        let draft = drafts.get(row.person_id);
        if (!draft) {
          draft = newCounts();
          drafts.set(row.person_id, draft);
        }
        applyCountRow(draft, row);
      }
      for (const row of batch.aggregates) {
        aggregate.set(row.person_id, row);
      }
      for (const row of batch.samples) {
        const list = samples.get(row.person_id);
        const instant = fromStorageTimestamp(row.occurred_at);
        if (list) {
          list.push(instant);
        } else {
          samples.set(row.person_id, [instant]);
        }
      }
    }

    for (const id of ids) {
      const draft = drafts.get(id);
      const agg = aggregate.get(id);
      if (!draft && !agg) {
        // No relationships and no history: absent from the map by contract, so the
        // caller composes the honest zero shape rather than reading a fabricated one.
        continue;
      }
      const records: RelationshipRecordCounts = draft ?? newCounts();
      const totalInteractions = Number(agg?.total ?? 0);
      const sample = samples.get(id) ?? [];
      result.set(id, {
        personId: id,
        records,
        firstInteractionAt: agg?.first_at
          ? fromStorageTimestamp(agg.first_at)
          : null,
        lastInteractionAt: agg?.last_at
          ? fromStorageTimestamp(agg.last_at)
          : null,
        totalInteractions,
        interactionSample: sample,
        interactionSampleTruncated:
          totalInteractions > RELATIONSHIP_INTERACTION_SAMPLE_LIMIT,
      });
    }

    return result;
  }

  /**
   * ONE workspace-scoped, parameterised query per chunk: every ACTIVE, in-workspace
   * record each Person is linked to, grouped by `(person, entity type)`, with the
   * open/active slice.
   *
   * `open_total` is meaningful only for Tasks and Projects and is derived from the
   * authoritative sources, never a cached column: a Task or Project is open when its
   * `spine_records.completed_at` is NULL, and a Project is additionally active only
   * when `project_details.archived_at` is NULL. For every other type it is zero and
   * unread.
   */
  async #selectRecordCounts(
    personIds: readonly string[],
  ): Promise<RecordCountRow[]> {
    const statement = this.#db
      .prepare(
        `${linkedCte(personIds.length)}
         SELECT linked.person_id AS person_id,
                e.type AS entity_type,
                COUNT(*) AS total,
                SUM(
                  CASE
                    WHEN e.type = 'task' AND sr.completed_at IS NULL AND sr.entity_id IS NOT NULL THEN 1
                    WHEN e.type = 'project' AND sr.completed_at IS NULL AND sr.entity_id IS NOT NULL
                         AND (pd.archived_at IS NULL) THEN 1
                    ELSE 0
                  END
                ) AS open_total
         FROM linked
         JOIN entities e
           ON e.workspace_id = ? AND e.id = linked.entity_id AND e.deleted_at IS NULL
         LEFT JOIN spine_records sr
           ON sr.workspace_id = e.workspace_id AND sr.entity_id = e.id
         LEFT JOIN project_details pd
           ON pd.workspace_id = e.workspace_id AND pd.entity_id = e.id
         GROUP BY linked.person_id, e.type`,
      )
      .bind(
        this.#workspaceId,
        ...personIds,
        this.#workspaceId,
        ...personIds,
        this.#workspaceId,
      );
    const result = await statement.all<RecordCountRow>();
    return result.results ?? [];
  }

  /**
   * ONE workspace-scoped, parameterised query per chunk: the exact interaction
   * aggregate across each Person's linked records.
   *
   * `COUNT(DISTINCT a.id)` is idempotent to an event that names several of the same
   * Person's linked records as subjects (a meeting-to-task conversion does), so one
   * moment can never be counted twice. `MIN`/`MAX` are likewise duplicate-safe.
   */
  async #selectInteractionAggregate(
    personIds: readonly string[],
  ): Promise<InteractionAggregateRow[]> {
    const statement = this.#db
      .prepare(
        `${subjectsCte(personIds.length)}
         SELECT subjects.person_id AS person_id,
                COUNT(DISTINCT a.id) AS total,
                MIN(a.occurred_at) AS first_at,
                MAX(a.occurred_at) AS last_at
         FROM subjects
         JOIN entities e
           ON e.workspace_id = ? AND e.id = subjects.entity_id AND e.deleted_at IS NULL
         JOIN activity_subjects s
           ON s.workspace_id = e.workspace_id AND s.entity_id = e.id
         JOIN activities a
           ON a.workspace_id = s.workspace_id AND a.id = s.activity_id
              AND a.type IN (${INTERACTION_TYPE_LIST})
         GROUP BY subjects.person_id`,
      )
      .bind(
        this.#workspaceId,
        ...personIds,
        this.#workspaceId,
        ...personIds,
        this.#workspaceId,
        ...personIds,
        this.#workspaceId,
      );
    const result = await statement.all<InteractionAggregateRow>();
    return result.results ?? [];
  }

  /**
   * ONE workspace-scoped, parameterised query per chunk: the newest
   * `RELATIONSHIP_INTERACTION_SAMPLE_LIMIT` DISTINCT interaction instants PER
   * Person, ranked with a window function so a whole page is sampled in a single
   * round trip rather than one query per Person. (`D1AlignmentRepository` already
   * proves D1 supports `ROW_NUMBER() OVER (PARTITION BY …)`.)
   *
   * Only the instant crosses the boundary — never the event type, payload or the
   * record it happened on.
   */
  async #selectInteractionSample(
    personIds: readonly string[],
  ): Promise<InteractionSampleRow[]> {
    const statement = this.#db
      .prepare(
        `${subjectsCte(personIds.length)},
         moments AS (
           SELECT DISTINCT subjects.person_id AS person_id,
                           a.id AS activity_id,
                           a.occurred_at AS occurred_at
           FROM subjects
           JOIN entities e
             ON e.workspace_id = ? AND e.id = subjects.entity_id AND e.deleted_at IS NULL
           JOIN activity_subjects s
             ON s.workspace_id = e.workspace_id AND s.entity_id = e.id
           JOIN activities a
             ON a.workspace_id = s.workspace_id AND a.id = s.activity_id
                AND a.type IN (${INTERACTION_TYPE_LIST})
         ),
         ranked AS (
           SELECT person_id, occurred_at,
                  ROW_NUMBER() OVER (
                    PARTITION BY person_id
                    ORDER BY occurred_at DESC, activity_id DESC
                  ) AS rn
           FROM moments
         )
         SELECT person_id, occurred_at
         FROM ranked
         WHERE rn <= ?
         ORDER BY person_id, occurred_at DESC`,
      )
      .bind(
        this.#workspaceId,
        ...personIds,
        this.#workspaceId,
        ...personIds,
        this.#workspaceId,
        ...personIds,
        this.#workspaceId,
        RELATIONSHIP_INTERACTION_SAMPLE_LIMIT,
      );
    const result = await statement.all<InteractionSampleRow>();
    return result.results ?? [];
  }
}
