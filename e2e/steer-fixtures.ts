/**
 * STEER-01/02 — the Goals whose OUTCOMES and CONDITIONS are known.
 *
 * V2.4's acceptance boundary, which V2.5 inherits: a numerical claim about the
 * owner's history is proven against a fixture whose facts are known, not
 * against whatever the workspace happens to hold. So this file writes the exact
 * measurement configurations, readings, target dates and owner conditions the
 * journey asserts on — every figure the spec reads is a figure this file put
 * there.
 *
 * ── Why the dates are relative ──────────────────────────────────────────────
 * The outcome ranking is computed against the owner's TODAY: "overdue" is a
 * target date in the past and "on track" is a fraction measured against elapsed
 * schedule. A fixture with fixed dates would classify correctly on the day it
 * was written and drift into a different bucket a month later — the exact time
 * bomb `goals-alignment.spec.ts` records having been caught by. Every date here
 * is therefore an offset from the owner's calendar day.
 *
 * ── It owns its isolation, explicitly ───────────────────────────────────────
 * [DEBT-173]. Everything is prefixed `st-`, and {@link cleanupSteerFixture}
 * removes every row it writes — dependents first, because every foreign key is
 * ON DELETE RESTRICT. Idempotent at both ends: seeding twice repairs, cleaning
 * twice is a no-op.
 */

import { d1Execute, sqlLiteral } from "./d1";
import { OWNER_TIMEZONE } from "./helpers";

const WORKSPACE = "local-dev-workspace";

/** The Area every fixture Goal starts in. */
export const HOME_AREA_ID = "st-area-home";
/** The Area the move journey re-files a Goal into. */
export const DESTINATION_AREA_ID = "st-area-destination";

const AREA_IDS = [HOME_AREA_ID, DESTINATION_AREA_ID] as const;

/**
 * The Goals, and what each one is FOR.
 *
 * Between them they cover the outcome ranking's leading buckets, both lens
 * partitions the journey reads, and both halves of the condition rule.
 */
export const STEER_GOALS = {
  /** Behind its OWN target date — the workspace's leading outcome. */
  overdue: { id: "st-goal-overdue", title: "ST: Ship the annual report" },
  /** Comfortably ahead of the line to a distant date. */
  ahead: { id: "st-goal-ahead", title: "ST: Read twenty books" },
  /**
   * ALSO behind its own date, and the owner has SET IT ASIDE. Its derived
   * facts must be identical to `overdue`'s treatment: still in the collection,
   * still "Needs attention", still counted there.
   */
  rested: { id: "st-goal-rested", title: "ST: Learn the piano" },
  /** No measurement at all — the bucket that must sort BELOW every measured one. */
  unmeasured: { id: "st-goal-unmeasured", title: "ST: Keep the shed tidy" },
  /** The Goal the move journey re-files, with a reading it must not lose. */
  movable: { id: "st-goal-movable", title: "ST: Re-file me" },
} as const;

const GOAL_IDS = Object.values(STEER_GOALS).map((goal) => goal.id);
const MEASUREMENT_IDS = [
  "st-m-overdue",
  "st-m-ahead",
  "st-m-rested",
  "st-m-movable-1",
  "st-m-movable-2",
] as const;

export interface SteerFixture {
  readonly todayIso: string;
  /** A date `days` from the owner's today, as `YYYY-MM-DD`. */
  readonly day: (days: number) => string;
}

/** The owner's calendar day — the only "today" the product has (ADR-022). */
function ownerTodayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: OWNER_TIMEZONE,
  }).format(new Date());
}

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export function steerFixture(): SteerFixture {
  const todayIso = ownerTodayIso();
  return { todayIso, day: (days: number) => addDays(todayIso, days) };
}

export function seedSteerFixture(fixture: SteerFixture): void {
  const stamp = "2026-07-19T02:00:00.000Z";
  const sql: string[] = [];

  const entity = (id: string, type: string, title: string, created = stamp) => {
    sql.push(
      `INSERT OR IGNORE INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES (${sqlLiteral(id)}, ${sqlLiteral(WORKSPACE)}, ${sqlLiteral(type)}, ${sqlLiteral(title)}, ${sqlLiteral(created)}, ${sqlLiteral(stamp)}, NULL);`,
      `UPDATE entities SET deleted_at = NULL, title = ${sqlLiteral(title)},
          type = ${sqlLiteral(type)}, created_at = ${sqlLiteral(created)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND id = ${sqlLiteral(id)};`,
    );
  };

  const spine = (id: string, kind: string) => {
    sql.push(
      `INSERT OR IGNORE INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(id)}, ${sqlLiteral(kind)}, NULL);`,
      `UPDATE spine_records SET kind = ${sqlLiteral(kind)}, completed_at = NULL
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(id)};`,
    );
  };

  const link = (source: string, target: string, type: string) => {
    sql.push(
      `INSERT OR IGNORE INTO entity_links (id, workspace_id, source_entity_id, target_entity_id, type, created_at, updated_at, deleted_at)
       VALUES (${sqlLiteral(`l-${source}-${target}`)}, ${sqlLiteral(WORKSPACE)}, ${sqlLiteral(source)}, ${sqlLiteral(target)}, ${sqlLiteral(type)}, ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)}, NULL);`,
      `UPDATE entity_links SET deleted_at = NULL
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND id = ${sqlLiteral(`l-${source}-${target}`)};`,
    );
  };

  /**
   * A Goal, with its measurement configuration, its target date and the
   * owner's condition — written to `goal_details` exactly as the repository
   * writes them.
   *
   * `createdAt` matters: it is the schedule's origin when a Goal has no
   * earlier reading, so "ahead" and "on track" are measured against it.
   */
  const goal = (
    id: string,
    title: string,
    options: {
      readonly areaId?: string;
      readonly createdAt?: string;
      readonly targetDate?: string | null;
      readonly measurementType?: string | null;
      readonly targetValue?: number | null;
      readonly condition?: string | null;
    } = {},
  ) => {
    entity(id, "goal", title, options.createdAt ?? stamp);
    spine(id, "goal");
    link(id, options.areaId ?? HOME_AREA_ID, "goal.belongs_to_area");
    sql.push(
      `INSERT OR IGNORE INTO goal_details (workspace_id, entity_id, entity_type, updated_at)
       VALUES (${sqlLiteral(WORKSPACE)}, ${sqlLiteral(id)}, 'goal', ${sqlLiteral(stamp)});`,
      `UPDATE goal_details SET
          measurement_type = ${options.measurementType ? sqlLiteral(options.measurementType) : "NULL"},
          measurement_unit = NULL,
          measurement_direction = ${options.measurementType ? "'increase'" : "NULL"},
          baseline_value = ${options.measurementType ? "0" : "NULL"},
          target_value = ${options.targetValue === undefined || options.targetValue === null ? "NULL" : String(options.targetValue)},
          target_date = ${options.targetDate ? sqlLiteral(options.targetDate) : "NULL"},
          condition = ${options.condition ? sqlLiteral(options.condition) : "NULL"},
          icon_key = NULL, colour_slot = NULL
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND entity_id = ${sqlLiteral(id)};`,
    );
  };

  const reading = (
    id: string,
    goalId: string,
    value: number,
    measuredOn: string,
  ) => {
    sql.push(
      `INSERT OR IGNORE INTO goal_measurements (id, workspace_id, entity_id, value, measured_on, note, created_at, updated_at)
       VALUES (${sqlLiteral(id)}, ${sqlLiteral(WORKSPACE)}, ${sqlLiteral(goalId)}, ${value}, ${sqlLiteral(measuredOn)}, NULL, ${sqlLiteral(stamp)}, ${sqlLiteral(stamp)});`,
      `UPDATE goal_measurements SET value = ${value}, measured_on = ${sqlLiteral(measuredOn)}
        WHERE workspace_id = ${sqlLiteral(WORKSPACE)} AND id = ${sqlLiteral(id)};`,
    );
  };

  entity(HOME_AREA_ID, "area", "ST: Steering fixtures");
  spine(HOME_AREA_ID, "area");
  entity(DESTINATION_AREA_ID, "area", "ST: Somewhere else");
  spine(DESTINATION_AREA_ID, "area");

  /*
   * Two Goals BEHIND their own target date — one pursued, one set aside. Their
   * derived facts are identical by construction, which is what makes the
   * condition's independence checkable rather than assertable.
   */
  goal(STEER_GOALS.overdue.id, STEER_GOALS.overdue.title, {
    measurementType: "accumulation",
    targetValue: 100,
    targetDate: fixture.day(-14),
  });
  reading("st-m-overdue", STEER_GOALS.overdue.id, 12, fixture.day(-3));

  goal(STEER_GOALS.rested.id, STEER_GOALS.rested.title, {
    measurementType: "accumulation",
    targetValue: 100,
    targetDate: fixture.day(-14),
    condition: "set_aside",
  });
  reading("st-m-rested", STEER_GOALS.rested.id, 12, fixture.day(-3));

  // Comfortably ahead of a distant date: 90 of 100 with most of the schedule
  // still to run.
  goal(STEER_GOALS.ahead.id, STEER_GOALS.ahead.title, {
    createdAt: `${fixture.day(-30)}T02:00:00.000Z`,
    measurementType: "accumulation",
    targetValue: 100,
    targetDate: fixture.day(180),
  });
  reading("st-m-ahead", STEER_GOALS.ahead.id, 90, fixture.day(-2));

  // No measurement at all — the absence bucket, which must sort last of the
  // open Goals however recently it was created.
  goal(STEER_GOALS.unmeasured.id, STEER_GOALS.unmeasured.title);

  // The Goal the move journey re-files. Two readings, so the move demonstrably
  // preserves a HISTORY rather than a single value.
  goal(STEER_GOALS.movable.id, STEER_GOALS.movable.title, {
    createdAt: `${fixture.day(-60)}T02:00:00.000Z`,
    measurementType: "accumulation",
    targetValue: 50,
    targetDate: fixture.day(90),
  });
  reading("st-m-movable-1", STEER_GOALS.movable.id, 10, fixture.day(-40));
  reading("st-m-movable-2", STEER_GOALS.movable.id, 25, fixture.day(-5));

  d1Execute(sql);
}

export function cleanupSteerFixture(): void {
  const ws = sqlLiteral(WORKSPACE);
  const goals = GOAL_IDS.map((id) => sqlLiteral(id)).join(", ");
  const measurements = MEASUREMENT_IDS.map((id) => sqlLiteral(id)).join(", ");
  const all = [...GOAL_IDS, ...AREA_IDS].map((id) => sqlLiteral(id)).join(", ");
  d1Execute([
    `DELETE FROM activity_subjects WHERE workspace_id = ${ws} AND entity_id IN (${all});`,
    `DELETE FROM activities WHERE workspace_id = ${ws}
       AND NOT EXISTS (SELECT 1 FROM activity_subjects s
                       WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    `DELETE FROM entity_links WHERE workspace_id = ${ws}
       AND (source_entity_id IN (${all}) OR target_entity_id IN (${all}));`,
    `DELETE FROM goal_measurements WHERE workspace_id = ${ws}
       AND (id IN (${measurements}) OR entity_id IN (${goals}));`,
    `DELETE FROM goal_milestones WHERE workspace_id = ${ws} AND entity_id IN (${goals});`,
    `DELETE FROM goal_details WHERE workspace_id = ${ws} AND entity_id IN (${goals});`,
    `DELETE FROM area_details WHERE workspace_id = ${ws} AND entity_id IN (${AREA_IDS.map((id) => sqlLiteral(id)).join(", ")});`,
    `DELETE FROM spine_records WHERE workspace_id = ${ws} AND entity_id IN (${all});`,
    `DELETE FROM entities WHERE workspace_id = ${ws} AND id IN (${all});`,
  ]);
}
