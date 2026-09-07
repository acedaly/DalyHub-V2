/**
 * PERF-01 — one workspace fixture, at two sizes, for the navigation measurements.
 *
 * Every performance claim in this programme is made twice: once on a workspace a
 * new owner would have, and once on one four years in. A single measurement
 * cannot tell a constant from a coincidence — a loader that reads one row per
 * Task looks perfectly flat at ten Tasks — so the budget tests seed BOTH and
 * assert the numbers do not move between them.
 *
 * It seeds through the REAL repositories rather than by writing rows, so a
 * fixture can never hold a shape the product would not produce.
 *
 * **Every fixture name is synthetic.** `Northwind Grocers`, `Bank of Synthetica`.
 */

import { makeContext } from "./support";
import {
  FakeClock,
  makeFinanceRepository,
  makeGoalDetailsRepository,
  makeGoalMeasurementRepository,
  makeObligationRepository,
  makeSpineRepository,
  makeTaskRepository,
  sequentialIds,
} from "./support";

/** The owner's day every measurement is taken against. Fixed, and in the past. */
export const PERF_TODAY = "2026-08-31";
export const PERF_NOW = new Date("2026-08-31T09:00:00.000Z");
export const PERF_TIMEZONE = "Australia/Sydney";

const nextEntityId = sequentialIds("perfe");
const nextActivityId = sequentialIds("perfa");
const nextDetailId = sequentialIds("perfd");

/** How much of everything each size holds. */
export interface FixtureSize {
  readonly label: "small" | "large";
  readonly areas: number;
  readonly projectsPerArea: number;
  readonly tasksPerProject: number;
  readonly goalsPerArea: number;
  readonly obligations: number;
  readonly accounts: number;
  readonly transactionsPerAccount: number;
}

/**
 * A workspace a new owner would have after a week.
 *
 * Small enough that a per-row read would still look fast, which is exactly why
 * it is never measured alone.
 */
export const SMALL: FixtureSize = {
  label: "small",
  areas: 2,
  projectsPerArea: 2,
  tasksPerProject: 3,
  goalsPerArea: 1,
  obligations: 3,
  accounts: 1,
  transactionsPerAccount: 8,
};

/**
 * A workspace four years in: ~240 Tasks, 24 Projects, 12 Goals, 40 obligations
 * and 300 transactions. Chosen to cross every page bound the hot loaders carry
 * (Tasks pages at 50, Today's planning read at 200/100/100, Finance's month
 * read), so a bound that is not applied shows up as a moved number rather than
 * as a slower one.
 */
export const LARGE: FixtureSize = {
  label: "large",
  areas: 6,
  projectsPerArea: 4,
  tasksPerProject: 10,
  goalsPerArea: 2,
  obligations: 40,
  accounts: 3,
  transactionsPerAccount: 100,
};

function world(ws: string) {
  const clock = new FakeClock("2026-08-01T00:00:00.000Z");
  const ctx = makeContext(ws);
  const options = {
    clock: clock.now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
  };
  return {
    ctx,
    spine: makeSpineRepository(ctx, options),
    tasks: makeTaskRepository(ctx, options),
    goalDetails: makeGoalDetailsRepository(ctx, {
      clock: clock.now,
      idGenerator: nextDetailId,
    }),
    goalMeasurements: makeGoalMeasurementRepository(ctx, {
      clock: clock.now,
      idGenerator: nextDetailId,
    }),
    obligations: makeObligationRepository(ctx, options),
    finance: makeFinanceRepository(ctx, {
      clock: clock.now,
      idGenerator: nextEntityId,
      actorContext: undefined,
    }),
  };
}

/** Shift an ISO date by whole days, without touching the clock. */
function shiftDay(iso: string, days: number): string {
  const at = new Date(`${iso}T00:00:00.000Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}

export interface SeededWorkspace {
  readonly areaIds: readonly string[];
  readonly projectIds: readonly string[];
  readonly taskIds: readonly string[];
  readonly goalIds: readonly string[];
  readonly accountIds: readonly string[];
  readonly categoryIds: readonly string[];
}

/**
 * Seed one workspace to a size. Assumes the workspace row already exists
 * (`resetTables([ws])`).
 */
export async function seedNavigationWorkspace(
  ws: string,
  size: FixtureSize,
): Promise<SeededWorkspace> {
  const w = world(ws);
  const areaIds: string[] = [];
  const projectIds: string[] = [];
  const taskIds: string[] = [];
  const goalIds: string[] = [];

  for (let a = 0; a < size.areas; a += 1) {
    const area = await w.spine.createArea({ title: `Area ${a + 1}` });
    areaIds.push(area.id);

    for (let g = 0; g < size.goalsPerArea; g += 1) {
      const goal = await w.spine.createGoal({
        title: `Goal ${a + 1}.${g + 1}`,
        areaId: area.id,
      });
      goalIds.push(goal.id);
      await w.goalDetails.update(goal.id, {
        measurement: { type: "accumulation", targetValue: 100 },
        targetDate: shiftDay(PERF_TODAY, 60),
      });
      // Two readings, so the Goal has movement to derive rather than a null.
      await w.goalMeasurements.createMeasurement(goal.id, {
        value: 20 + g,
        measuredOn: shiftDay(PERF_TODAY, -9),
      });
      await w.goalMeasurements.createMeasurement(goal.id, {
        value: 40 + g,
        measuredOn: shiftDay(PERF_TODAY, -2),
      });
    }

    for (let p = 0; p < size.projectsPerArea; p += 1) {
      const project = await w.spine.createProject({
        title: `Project ${a + 1}.${p + 1}`,
        parent: { kind: "area", id: area.id },
      });
      projectIds.push(project.id);

      for (let t = 0; t < size.tasksPerProject; t += 1) {
        // A spread of due and scheduled dates around the fixed today, so the
        // overdue / due-today / planned buckets all have rows and the planning
        // read is doing real work rather than returning nothing.
        const offset = (t % 7) - 3;
        const task = await w.tasks.createTask({
          title: `Task ${a + 1}.${p + 1}.${t + 1}`,
          parent: { kind: "project", id: project.id },
          priority: t % 4 === 0 ? "p1" : null,
          dueDate: t % 3 === 0 ? shiftDay(PERF_TODAY, offset) : null,
          scheduledDate: t % 3 === 1 ? shiftDay(PERF_TODAY, offset) : null,
        });
        taskIds.push(task.id);
      }
    }
  }

  for (let o = 0; o < size.obligations; o += 1) {
    await w.obligations.create({
      category: o % 3 === 0 ? "bill" : o % 3 === 1 ? "subscription" : "service",
      title: `Obligation ${o + 1}`,
      dueDate: shiftDay(PERF_TODAY, (o % 30) - 7),
      expectedAmount: o % 2 === 0 ? "120.00" : null,
      currencyCode: o % 2 === 0 ? "AUD" : null,
    });
  }

  const categories = await Promise.all([
    w.finance.createCategory({ name: "Groceries", kind: "spending" }),
    w.finance.createCategory({ name: "Transport", kind: "spending" }),
    w.finance.createCategory({ name: "Salary", kind: "income" }),
  ]);
  const categoryIds = categories.map((one) => one.id);

  const accountIds: string[] = [];
  for (let a = 0; a < size.accounts; a += 1) {
    const account = await w.finance.createAccount({
      title: `Bank of Synthetica ${a + 1}`,
      accountType: "transaction",
      currencyCode: "AUD",
      openingBalance: "1000.00",
      openingDate: shiftDay(PERF_TODAY, -400),
    });
    accountIds.push(account.id);
    for (let t = 0; t < size.transactionsPerAccount; t += 1) {
      await w.finance.createTransaction({
        accountId: account.id,
        // Spread across the measured month and the two before it.
        occurredOn: shiftDay(PERF_TODAY, -(t % 60)),
        amount: t % 10 === 0 ? "2500.00" : `-${((t % 40) + 5).toFixed(2)}`,
        payeeDisplay:
          t % 10 === 0 ? "NORTHWIND PAYROLL" : `NORTHWIND GROCERS ${t % 5}`,
        // A third stay uncategorised, so the uncategorised queue is not empty.
        categoryId: t % 3 === 0 ? null : (categoryIds[t % 3] ?? null),
      });
    }
  }

  return { areaIds, projectIds, taskIds, goalIds, accountIds, categoryIds };
}
