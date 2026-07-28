/**
 * PEOPLE-03 Relationship intelligence kernel — the read-only facts repository
 * contract.
 *
 * A storage-independent, WORKSPACE-BOUND read projection that gathers the raw
 * `PersonRelationshipFacts` a Person's relationship summary and stay-in-touch state
 * are derived from. It performs NO mutations and stores NOTHING — the summary is
 * recomputed from live `entity_links`, `entities`, `spine_records` and Activity data
 * on every read, exactly like `ProjectHealthRepository` (PROJ-02) and
 * `AlignmentRepository` (AREA-03).
 *
 * Like those, no method accepts a `workspaceId`; scope is fixed at construction
 * (ADR-010), and a Person in another workspace (or a non-Person id) is
 * indistinguishable from "no relationships" — never an error that discloses
 * existence.
 *
 * The rules live in `evaluatePersonRelationship` (`person-relationship.ts`); this
 * contract only supplies facts. `listPersonRelationshipFacts` is bounded and
 * N+1-free: it gathers the COMPLETE aggregate for a WHOLE bounded page of People in
 * a fixed number of grouped queries, never one query per Person — which is what
 * makes the People collection able to show a stay-in-touch signal without a query
 * storm.
 */

import type { PersonRelationshipFacts } from "./person-relationship";

/**
 * How many interaction instants one read samples per Person for cadence
 * arithmetic. Bounded deliberately: averages and gaps converge long before this,
 * an unbounded read is a query hazard, and the exact totals
 * (`totalInteractions`, `firstInteractionAt`) are read separately and stay exact.
 * When more exist, `interactionSampleTruncated` says so — never a silent cap.
 */
export const RELATIONSHIP_INTERACTION_SAMPLE_LIMIT = 200;

/**
 * The most People one batched facts read accepts. A bounded collection page, never
 * an unbounded "every Person in the workspace".
 *
 * Deliberately equal to the entity kernel's own `MAX_PAGE_SIZE`, so a real
 * collection page can never exceed it — this is a defensive ceiling on a caller
 * that hand-assembles an id list, not a cap that silently truncates a page. Ids
 * beyond it are simply absent from the result map, exactly like a Person with no
 * relationships: the caller composes the honest zero shape and no card is ever
 * shown a fabricated signal.
 */
export const MAX_RELATIONSHIP_FACTS_BATCH = 100;

export interface RelationshipRepository {
  /**
   * Gather the COMPLETE relationship facts for a bounded set of Person ids (a
   * collection page), returning a map keyed by Person id. Ids are validated and
   * de-duplicated; a Person with no relationships and no history is simply ABSENT
   * from the map — the caller composes the honest zero shape with
   * `emptyPersonRelationshipFacts`. Computed in a fixed number of grouped queries
   * regardless of page size (no N+1).
   *
   * An id that is not a Person, is soft-deleted or belongs to another workspace
   * contributes nothing and is likewise absent — it is never an error, and never
   * discloses which of those it was.
   */
  listPersonRelationshipFacts(
    personIds: readonly string[],
  ): Promise<Map<string, PersonRelationshipFacts>>;

  /**
   * Gather the complete relationship facts for one Person, or the honest zero
   * shape when they have no relationships and no history. This method does NOT
   * verify the Person exists — callers verify that separately (e.g. via
   * `PersonRepository.get`), so a missing Person never becomes a different error
   * here.
   */
  getPersonRelationshipFacts(
    personId: string,
  ): Promise<PersonRelationshipFacts>;
}
