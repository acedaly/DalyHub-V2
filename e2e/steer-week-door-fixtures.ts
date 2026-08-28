/**
 * STEER-05 — the facts the week's-door journey owns.
 *
 * [DEBT-173]'s rule: a spec owns the facts it asserts. This journey's whole
 * subject is *"does the owner's current week already have a Review?"*, so the
 * one thing it must control is exactly that — and it must control it without
 * re-deriving the week, because re-deriving the week here would be a second
 * answer to the question the product's ONE authority answers.
 *
 * So the predicate is CONTAINMENT rather than arithmetic: a weekly Review whose
 * stored period covers the owner's calendar day is this week's, whichever day
 * the owner's week starts on. No offsets, no week-start rule, nothing to keep
 * in step with `currentReviewPeriod`.
 *
 * Idempotent at both ends: clearing twice is a no-op, and the journey's own
 * Review is swept by the same predicate afterwards.
 */

import { d1Execute, sqlLiteral } from "./d1";
import { OWNER_TIMEZONE } from "./helpers";

const WORKSPACE = "local-dev-workspace";

/** The owner's calendar day — the only "today" the product has (ADR-022). */
export function ownerTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: OWNER_TIMEZONE,
  }).format(new Date());
}

/**
 * Remove every WEEKLY Review whose period contains the owner's today.
 *
 * ── The ORDER, and why the last statement looks the way it does ─────────────
 * Every other review table references `review_details`, and `review_details`
 * references `entities` ON DELETE RESTRICT — so the detail row has to go before
 * the entity row. But the detail row is also what IDENTIFIES the Review as this
 * week's, so once it is gone the entity can no longer be selected by period.
 *
 * The sweep therefore ends by deleting review entities with no detail row at
 * all. That is exactly the set this function just orphaned, it needs no
 * captured id list, and it is idempotent — a second run finds nothing.
 */
export function clearCurrentWeeklyReviews(): void {
  const ws = sqlLiteral(WORKSPACE);
  const today = sqlLiteral(ownerTodayIso());
  const selection = `
    SELECT d.entity_id FROM review_details d
    WHERE d.workspace_id = ${ws}
      AND d.review_type = 'weekly'
      AND d.period_start <= ${today} AND d.period_end >= ${today}
  `;
  d1Execute([
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id IN (${selection});`,
    `DELETE FROM activities WHERE workspace_id = ${ws} AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    `DELETE FROM entity_links WHERE workspace_id = ${ws} AND (source_entity_id IN (${selection}) OR target_entity_id IN (${selection}));`,
    `DELETE FROM review_insight_snapshots WHERE workspace_id = ${ws} AND review_id IN (${selection});`,
    `DELETE FROM review_step_acknowledgements WHERE workspace_id = ${ws} AND review_id IN (${selection});`,
    `DELETE FROM review_workflow_state WHERE workspace_id = ${ws} AND review_id IN (${selection});`,
    `DELETE FROM review_sections WHERE workspace_id = ${ws} AND review_id IN (${selection});`,
    `DELETE FROM review_details WHERE workspace_id = ${ws}
       AND review_type = 'weekly'
       AND period_start <= ${today} AND period_end >= ${today};`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND type = 'review'
       AND NOT EXISTS (
         SELECT 1 FROM review_details d
         WHERE d.workspace_id = entities.workspace_id AND d.entity_id = entities.id
       );`,
  ]);
}
