/**
 * V2.16 CONSOL-02 — THE WHOLE-PRODUCT REHEARSAL. The gate on the release.
 *
 * V2.11 proved that an attachment's BYTES come back. V2.12 proved that every
 * FINANCE machine value comes back. Neither proved the thing an owner actually
 * cares about, which is not a domain:
 *
 * > If the whole product disappears tonight, can a verified archive put it
 * > back, and will DalyHub then tell me the same things it told me today?
 *
 * ```
 *   1. seed ONE synthetic workspace covering every durable domain
 *   2. compute a TRUTH MANIFEST — derived owner-facing values, not row counts
 *   3. export the full archive, and verify it reads back
 *   4. DESTROY the workspace — every row, through the registry-derived purge
 *      plan, and every object in R2
 *   5. PROVE it is gone — zero rows in all sixty tables, zero objects
 *   6. restore from the archive
 *   7. recompute the manifest and compare it to the one from step 2
 * ```
 *
 * **Step 7 is the point.** A row count proves an archive moved bytes; it does
 * not prove the product came back. What is compared is what the owner would
 * read on the screen: account balances DERIVED again from the restored rows, a
 * month's totals per currency, a transfer that is still excluded from spending,
 * an obligation still settled by the transaction that settled it, a Goal's
 * measurement series, a Review's persisted insight snapshot, a saved Report
 * RE-EXECUTED against the restored data, the completion history Insight draws,
 * and the AI FactBlock built from all of it.
 *
 * **The AI clause needs no provider.** A FactBlock is deterministic — that is
 * the whole of what V2.14 decided — so "would the model have been given the
 * same numbers?" is answerable with the provider switched off. If it differs
 * after a restore, the restore is wrong.
 *
 * **The owner day is FROZEN.** Every derived figure is computed at
 * `2026-10-05` in `Australia/Sydney` — the day after that zone enters daylight
 * saving — and the fixture holds two Diary entries three hours apart that fall
 * on different owner days across the transition. A rehearsal whose figures
 * depend on the day it ran is a weather report.
 *
 * Run it on its own with:
 *
 * ```
 *   pnpm run restore:rehearsal
 * ```
 */

import { beforeEach, describe, expect, it } from "vitest";

import { env } from "cloudflare:test";

import {
  createActivityActorContext,
  createSystemActorContext,
} from "~/kernel/activity";
import { attachmentWorkspacePrefix, hexDigest } from "~/kernel/attachments";
import { buildActivityWindow } from "~/kernel/activity-window";
import { monthDirectionTotals } from "~/kernel/finance";
import { ownerDayStartInstant } from "~/shared/datetime";
import { buildGroundedFacts } from "~/platform/ai/grounded-facts.server";
import { readAttachmentBytes } from "~/platform/attachments";
import {
  buildStructuredExportArchive,
  buildWorkspaceSnapshot,
  readAttachmentBytesForArchive,
} from "~/platform/export";
import { runReport } from "~/platform/reports/report-execution.server";
import {
  acknowledgeSafetyBackup,
  applyRestore,
  createSafetyBackup,
  prepareRestore,
  readBackupArchive,
  type RestoreDependencies,
} from "~/platform/restore";
import { WorkspaceNotFoundError } from "~/kernel/workspaces";
import {
  validateWorkspaceSnapshot,
  type WorkspaceSnapshotV1,
} from "~/kernel/export";
import {
  bindWorkspaceRepositories,
  createConfiguredWorkspaceContextResolver,
} from "~/platform/workspaces";
import { createWorkspaceRepository } from "~/platform/storage/d1";
import {
  createAttachmentRepository,
  createWorkspaceRestoreRepository,
  createWorkspaceSnapshotRepository,
  workspacePurgeOrder,
} from "~/platform/storage/d1";
import { createR2ObjectStore } from "~/platform/attachments";

import {
  FakeClock,
  makeContext,
  makeDiaryRepository,
  makeFinanceRepository,
  makeGoalMeasurementRepository,
  makeHabitRepository,
  makeObligationRepository,
  makeReportRepository,
  makeReviewInsightRepository,
  makeTaskRepository,
  resetTables,
} from "./support";
import { FIXTURE_OTHER_WORKSPACE } from "./workspace-fixture";
import {
  ATTACHMENT_FIXTURES,
  REHEARSAL_CLOCK_ISO,
  REHEARSAL_NOW,
  REHEARSAL_TIMEZONE,
  REHEARSAL_TODAY,
  WHOLE_PRODUCT_OWNER,
  WHOLE_PRODUCT_WORKSPACE,
  seedWholeProductWorkspace,
  type WholeProductSeeded,
} from "./whole-product-fixture";

const WS = WHOLE_PRODUCT_WORKSPACE;
const OWNER = WHOLE_PRODUCT_OWNER;
const APPLICATION = {
  name: "DalyHub",
  version: "2.16.0",
  releaseName: "CONSOLIDATE",
  environment: "test",
  buildCommit: "test",
} as const;

/**
 * The three owner weeks every completion figure is bucketed into.
 *
 * Built through `buildActivityWindow` at the frozen zone, so the instants are
 * the product's own — including the week containing the daylight-saving
 * transition, which is 167 hours long rather than 168 and is the one a
 * hand-written pair of instants would get wrong.
 */
const WEEKS = [
  { periodStart: "2026-07-27", periodEnd: "2026-08-02" },
  { periodStart: "2026-08-03", periodEnd: "2026-08-09" },
  { periodStart: "2026-09-28", periodEnd: "2026-10-04" },
].map((period) =>
  buildActivityWindow({
    ...period,
    startOfOwnerDay: (dayIso) =>
      ownerDayStartInstant(dayIso, REHEARSAL_TIMEZONE),
  }),
);

/* -------------------------------------------------------------------------- */
/* Harness                                                                    */
/* -------------------------------------------------------------------------- */

function objectStore() {
  return createR2ObjectStore(env.ATTACHMENTS);
}

function attachmentRepo(workspaceId = WS) {
  return createAttachmentRepository(env.DB, makeContext(workspaceId), {
    actorContext: createSystemActorContext(),
  });
}

let restoreCounter = 0;

function restoreDeps(): RestoreDependencies {
  const context = makeContext(WS);
  return {
    restore: createWorkspaceRestoreRepository(env.DB, context),
    snapshot: createWorkspaceSnapshotRepository(env.DB, context),
    attachments: attachmentRepo(),
    objects: objectStore(),
    workspaceId: WS,
    ownerId: OWNER,
    application: APPLICATION,
    now: () => new Date(REHEARSAL_CLOCK_ISO),
    newId: () => `whole-product-${++restoreCounter}`,
  };
}

async function snapshot() {
  return buildWorkspaceSnapshot(
    createWorkspaceSnapshotRepository(env.DB, makeContext(WS)),
    {
      ownerId: OWNER,
      exportedAt: new Date(REHEARSAL_CLOCK_ISO),
      application: APPLICATION,
    },
  );
}

/** The complete archive an owner would download — rows AND bytes. */
async function exportArchive(): Promise<Uint8Array> {
  const current = await snapshot();
  return (
    await buildStructuredExportArchive(
      current,
      await readAttachmentBytesForArchive({
        workspaceId: WS,
        attachments: current.records.attachments,
        store: objectStore(),
      }),
    )
  ).bytes;
}

async function restoreFrom(archive: Uint8Array): Promise<void> {
  const deps = restoreDeps();
  const preview = await prepareRestore(deps, archive);
  if (preview.mode === "replace") {
    const backup = await createSafetyBackup(deps, preview.operationId);
    await acknowledgeSafetyBackup(
      deps,
      preview.operationId,
      await hexDigest(backup.bytes),
    );
  }
  await applyRestore(deps, preview.operationId);
}

/* -------------------------------------------------------------------------- */
/* Destruction — through the registry-derived purge plan                      */
/* -------------------------------------------------------------------------- */

/**
 * Destroy the workspace COMPLETELY: every row in every table, and every object.
 *
 * It walks `workspacePurgeOrder()` — the plan CONSOL-01 documents and
 * `scripts/workspace-purge-plan.mjs` emits — rather than a list written here.
 * That is deliberate on both sides: the rehearsal cannot destroy less than the
 * whole product (a hand-kept list forgets the table a migration added last
 * week, and the restore then looks better than it is), and the documented
 * operator procedure gets executed by a test rather than believed.
 */
async function destroyWorkspace(
  options: {
    readonly workspaceId?: string;
    /**
     * Whether to delete the `workspaces` ROW as well.
     *
     * `false` — the default, and the RECOVERY scenario — leaves the row and
     * empties everything it holds. That is what an owner is actually in after a
     * catastrophe: a provisioned deployment pointing at a workspace with
     * nothing in it. It is also what the restore path REQUIRES, and the
     * rehearsal found out the hard way: `workspace_restore_staged_rows`
     * references `workspaces(id)`, so staging an archive into a database whose
     * workspace row is gone fails on a foreign key before it reads a byte.
     *
     * `true` is the COMPLETE purge — CONSOL-01's operator procedure — and it
     * leaves a deployment that cannot serve a request at all: the configured
     * resolver confirms the workspace exists and has no auto-create
     * (`configured-context-resolver.ts`). That asymmetry is not a defect; it is
     * the reason ADR-124 refuses to put a delete button in the product.
     */
    readonly includeWorkspaceRow?: boolean;
  } = {},
): Promise<void> {
  const workspaceId = options.workspaceId ?? WS;
  const listed = await env.ATTACHMENTS.list({
    prefix: attachmentWorkspacePrefix(workspaceId),
    limit: 1000,
  });
  for (const object of listed.objects) await env.ATTACHMENTS.delete(object.key);

  for (const entry of workspacePurgeOrder()) {
    if (entry.scope === "root" && options.includeWorkspaceRow !== true)
      continue;
    const predicate = entry.scope === "root" ? "id = ?" : "workspace_id = ?";
    await env.DB.prepare(`DELETE FROM ${entry.table} WHERE ${predicate}`)
      .bind(workspaceId)
      .run();
  }
}

/** Every table's row count for one workspace, so "gone" is a measurement. */
async function rowCounts(workspaceId: string): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const entry of workspacePurgeOrder()) {
    const predicate = entry.scope === "root" ? "id = ?" : "workspace_id = ?";
    const row = await env.DB.prepare(
      `SELECT COUNT(*) AS n FROM ${entry.table} WHERE ${predicate}`,
    )
      .bind(workspaceId)
      .first<{ n: number }>();
    counts.set(entry.table, row?.n ?? 0);
  }
  return counts;
}

/* -------------------------------------------------------------------------- */
/* The truth manifest                                                         */
/* -------------------------------------------------------------------------- */

function clock() {
  return new FakeClock(REHEARSAL_CLOCK_ISO).now;
}

function scope() {
  return bindWorkspaceRepositories(
    { DB: env.DB },
    makeContext(WS),
    createActivityActorContext({ type: "user", id: OWNER }),
  );
}

/**
 * Every owner-facing fact the rehearsal compares across the round trip.
 *
 * Read through the PRODUCT'S OWN repositories and executors — never straight
 * from SQL — so a restore that produced rows the product cannot read still
 * fails. Every figure is computed at the frozen owner day.
 */
async function truthManifest(seeded: WholeProductSeeded) {
  const context = makeContext(WS);
  const finance = makeFinanceRepository(context, { clock: clock() });
  const tasks = makeTaskRepository(context);
  const obligations = makeObligationRepository(context, { clock: clock() });
  const measurements = makeGoalMeasurementRepository(context, {
    clock: clock(),
  });
  const reviewInsights = makeReviewInsightRepository(context);
  const habits = makeHabitRepository(context, {
    clock: clock(),
    ownerTimeZone: async () => REHEARSAL_TIMEZONE,
  });
  const diary = makeDiaryRepository(context, { clock: clock() });
  const reports = makeReportRepository(context, { clock: clock() });

  /* ---- Tasks and the completion history Insight draws ------------------- */
  const taskPage = await tasks.listTasks();
  const completionBuckets = await tasks.countCompletedInBuckets({
    buckets: WEEKS.map((week) => ({
      key: week.periodStart,
      startsAt: new Date(week.startInstantIso),
      endsAt: new Date(week.endInstantIso),
    })),
  });

  /* ---- Goals ------------------------------------------------------------ */
  const series = await measurements.listMeasurements(seeded.goalId);

  /* ---- Reviews ---------------------------------------------------------- */
  const reviewSnapshot = await reviewInsights.getSnapshot(seeded.reviewId);

  /* ---- Insight: the period series over the immutable Activity stream ----- */
  const periodCompletions = await reviewInsights.countPeriodCompletions(
    WEEKS.map((week) => ({ key: week.periodStart, window: week })),
  );

  /* ---- Obligations ------------------------------------------------------- */
  const obligationPage = await obligations.list();

  /* ---- Finance ----------------------------------------------------------- */
  const accounts = await finance.listAccountsWithBalances({
    includeClosed: true,
  });
  const transactions = await finance.listTransactions({ limit: 200 });
  const budgets = await finance.listBudgets("2026-09");
  const imports = await finance.listImports();
  const month = await finance.monthSummary("2026-09");

  /* ---- Habits ------------------------------------------------------------ */
  const habit = await habits.get(seeded.habitId);
  const checkIns = await habits.listCompletionsInRange({
    habitIds: [seeded.habitId],
    fromIso: "2026-09-01",
    toIso: "2026-10-31",
  });

  /* ---- The owner day, across a DST transition ---------------------------- */
  const dstBefore = await diary.get(seeded.dstBeforeDiaryId);
  const dstAfter = await diary.get(seeded.dstAfterDiaryId);

  /* ---- The saved Report, RE-EXECUTED ------------------------------------- */
  const savedReport = await reports.get(OWNER, seeded.savedReportId);
  if (!savedReport) throw new Error("the saved Report did not come back");
  if (!savedReport.config.ok) {
    throw new Error("the restored Report definition no longer parses");
  }
  const execution = await runReport(savedReport.config.config, {
    scope: scope(),
    todayIso: REHEARSAL_TODAY,
    timeZone: REHEARSAL_TIMEZONE,
    now: REHEARSAL_NOW,
  });
  if (!execution.ok) {
    throw new Error(`the saved Report refused: ${execution.refusal.code}`);
  }

  /* ---- The AI FactBlock, with no provider anywhere near it ---------------- */
  const factBlock = await buildGroundedFacts(
    { intent: "obligation_horizon", days: 400, assumptions: [] },
    {
      scope: scope(),
      todayIso: REHEARSAL_TODAY,
      timeZone: REHEARSAL_TIMEZONE,
      question: "what do I need to deal with?",
      now: REHEARSAL_NOW,
    },
  );

  /* ---- Attachments: metadata AND bytes ----------------------------------- */
  const attachmentRows = await Promise.all(
    seeded.attachmentIds.map(async (id) => {
      const record = await attachmentRepo().get(id);
      if (record === null)
        throw new Error(`attachment ${id} did not come back`);
      const bytes = await readAttachmentBytes(
        {
          attachments: attachmentRepo(),
          objects: objectStore(),
          workspaceId: WS,
        },
        record,
      );
      return {
        digest: await hexDigest(bytes),
        filename: record.filename,
        mediaType: record.mediaType,
        byteSize: record.byteSize,
        owner: record.ownerEntityId,
      };
    }),
  );

  return {
    tasks: taskPage.items
      .map((item) => ({
        title: item.title,
        dueDate: item.dueDate,
        priority: item.priority,
        completed: item.completedAt !== null,
      }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    completionBuckets,
    periodCompletions,
    goalSeries: series.map((entry) => ({
      value: entry.value,
      measuredOn: entry.measuredOn,
    })),
    reviewSnapshot: reviewSnapshot?.snapshot ?? null,
    obligations: obligationPage.items
      .map((entry) => ({
        title: entry.title,
        status: entry.status,
        dueDate: entry.dueDate,
        expected: entry.expectedAmountMinor,
        settled: entry.settledByTransactionId !== null,
      }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    accounts: accounts
      .map((entry) => ({
        title: entry.account.title,
        currency: entry.account.currencyCode,
        opening: entry.account.openingBalanceMinor,
        // RECOMPUTED on both sides from the same rule, never carried.
        balance: entry.balanceMinor,
        transactionCount: entry.transactionCount,
      }))
      .sort((a, b) => a.title.localeCompare(b.title)),
    transactions: transactions.items
      .map((view) => ({
        payee: view.transaction.payeeDisplay,
        date: view.transaction.occurredOn,
        amount: view.transaction.amountMinor,
        currency: view.transaction.currencyCode,
        category: view.categoryName,
        fingerprint: view.transaction.fingerprint,
        transferred: view.transferPartnerId !== null,
        settles: view.settlesObligationTitle,
      }))
      .sort((a, b) =>
        `${a.date}${a.payee}${a.amount}`.localeCompare(
          `${b.date}${b.payee}${b.amount}`,
        ),
      ),
    budgets: budgets.map((budget) => ({
      month: budget.periodMonth,
      amount: budget.amountMinor,
      currency: budget.currencyCode,
    })),
    imports: imports.map((entry) => ({
      fileName: entry.fileName,
      sha: entry.fileSha256,
      rows: entry.rowCount,
      added: entry.addedCount,
    })),
    month: monthDirectionTotals(month),
    transfers: month.transferCount,
    habitSchedule: habit?.versions.map((version) => ({
      schedule: version.schedule,
      from: version.effectiveFrom,
      to: version.effectiveTo,
    })),
    habitCheckIns: checkIns.map((entry) => entry.completedOn).sort(),
    ownerDays: {
      before: dstBefore?.occurredAt.toISOString() ?? null,
      after: dstAfter?.occurredAt.toISOString() ?? null,
      beforeZone: dstBefore?.timezone ?? null,
      afterZone: dstAfter?.timezone ?? null,
    },
    reportName: savedReport.name,
    reportBlocks: execution.result.blocks.map((block) => ({
      currency: block.currencyCode,
      rows: block.rows.map((row) => ({ label: row.label, value: row.value })),
    })),
    factBlock: {
      facts: factBlock.facts.map((fact) => ({
        label: fact.label,
        value: fact.value,
      })),
    },
    attachments: attachmentRows.sort((a, b) =>
      `${a.filename}${a.digest}`.localeCompare(`${b.filename}${b.digest}`),
    ),
  };
}

/* -------------------------------------------------------------------------- */
/* The rehearsal                                                              */
/* -------------------------------------------------------------------------- */

beforeEach(async () => {
  await resetTables([WS]);
  for (const workspaceId of [WS, FIXTURE_OTHER_WORKSPACE]) {
    const listed = await env.ATTACHMENTS.list({
      prefix: attachmentWorkspacePrefix(workspaceId),
      limit: 1000,
    });
    for (const object of listed.objects)
      await env.ATTACHMENTS.delete(object.key);
  }
});

describe("V2.16 CONSOL-02 — the whole-product rehearsal", () => {
  it("puts the WHOLE product back, and says the same things afterwards", async () => {
    /* ---- 1. One synthetic workspace, every durable domain --------------- */
    const seeded = await seedWholeProductWorkspace();

    /* ---- 2. The truth manifest, BEFORE --------------------------------- */
    const before = await truthManifest(seeded);

    // Named rather than only compared, so a `toEqual` on a large object cannot
    // pass by being empty on both sides.
    expect(before.accounts).toHaveLength(3);
    expect(before.transactions.length).toBeGreaterThanOrEqual(6);
    expect(before.attachments).toHaveLength(4);
    expect(before.goalSeries).toHaveLength(3);
    expect(before.reviewSnapshot).not.toBeNull();
    expect(before.reportBlocks.length).toBeGreaterThan(0);
    expect(before.factBlock.facts.length).toBeGreaterThan(0);
    expect(before.habitCheckIns).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-05",
    ]);
    // The two Diary entries are three hours apart and on DIFFERENT owner days,
    // because Sydney entered daylight saving between them.
    expect(before.ownerDays.before).toBe("2026-10-03T13:30:00.000Z");
    expect(before.ownerDays.after).toBe("2026-10-03T16:30:00.000Z");

    /* ---- 3. Export, and prove the archive READS BACK -------------------- */
    const archive = await exportArchive();
    // `readBackupArchive` REJECTS rather than returning a flag, so reading it at
    // all is the assertion — and DEBT-247 is why it is made: an export DalyHub
    // will write and then refuse to read is a souvenir, not a backup.
    const read = await readBackupArchive(archive);
    expect(read.snapshot.records.attachments).toHaveLength(4);
    expect(read.attachmentBytes.size).toBe(4);

    /* ---- 4. Destroy — every row, every object --------------------------- */
    await destroyWorkspace();

    /* ---- 5. Prove it is gone ------------------------------------------- */
    const emptied = await rowCounts(WS);
    for (const [table, count] of emptied) {
      // The workspace ROW is deliberately left standing: that is the state a
      // catastrophe actually leaves — a provisioned deployment with an empty
      // workspace — and it is what the restore path requires. The COMPLETE
      // purge, workspace row included, is proved separately below.
      if (table === "workspaces") {
        expect(count).toBe(1);
        continue;
      }
      expect(count, `${table} should hold nothing after the purge`).toBe(0);
    }
    const objects = await env.ATTACHMENTS.list({
      prefix: attachmentWorkspacePrefix(WS),
      limit: 1000,
    });
    expect(objects.objects).toHaveLength(0);

    // And the workspace BESIDE it is untouched — the property that makes the
    // purge plan safe to hand an operator.
    const neighbour = await rowCounts(FIXTURE_OTHER_WORKSPACE);
    expect(neighbour.get("entities")).toBeGreaterThan(0);
    expect(neighbour.get("workspaces")).toBe(1);

    /* ---- 6. Restore ----------------------------------------------------- */
    await restoreFrom(archive);

    /* ---- 7. The same manifest ------------------------------------------ */
    const after = await truthManifest(seeded);
    expect(after).toEqual(before);

    // Named again, because the domains most likely to fail silently are the
    // DERIVED ones, and a reader should see them asserted rather than trust a
    // deep equality on an object this large.
    expect(after.accounts).toEqual(before.accounts);
    expect(after.month).toEqual(before.month);
    expect(after.transfers).toBe(before.transfers);
    expect(after.reportBlocks).toEqual(before.reportBlocks);
    expect(after.factBlock).toEqual(before.factBlock);
    expect(after.reviewSnapshot).toEqual(before.reviewSnapshot);
    expect(after.goalSeries).toEqual(before.goalSeries);
    expect(after.completionBuckets).toEqual(before.completionBuckets);
    expect(after.periodCompletions).toEqual(before.periodCompletions);
    expect(after.habitSchedule).toEqual(before.habitSchedule);
    expect(after.attachments).toEqual(before.attachments);
  });

  it("carries every attachment's BYTES, including two files with one name", async () => {
    const seeded = await seedWholeProductWorkspace();
    const archive = await exportArchive();
    await destroyWorkspace();
    await restoreFrom(archive);

    // Byte-for-byte, not metadata: the digests would agree even if the store
    // had collapsed the two `rego.txt` files onto one object, so the BYTES are
    // compared against the fixture that produced them.
    const restored = await Promise.all(
      seeded.attachmentIds.map(async (id) => {
        const record = await attachmentRepo().get(id);
        if (record === null)
          throw new Error(`attachment ${id} did not come back`);
        const bytes = await readAttachmentBytes(
          {
            attachments: attachmentRepo(),
            objects: objectStore(),
            workspaceId: WS,
          },
          record,
        );
        return { record, bytes };
      }),
    );
    for (const [index, fixture] of ATTACHMENT_FIXTURES.entries()) {
      const actual = restored[index]!;
      expect(actual.record.filename, `${index}`).toBe(fixture.filename);
      expect(Array.from(actual.bytes), `${index}`).toEqual(
        Array.from(fixture.bytes),
      );
    }
    // The two same-named files are genuinely two objects with different bytes.
    const [, , first, second] = restored;
    expect(first!.record.filename).toBe(second!.record.filename);
    expect(Array.from(first!.bytes)).not.toEqual(Array.from(second!.bytes));
  });

  it("records what the archive COSTS, rather than optimising it away", async () => {
    /*
     * The scale reading. It is recorded, not asserted against a target: an
     * archive that is too big is a truth about the product, and the wrong
     * response is to weaken an integrity check to make the number smaller.
     *
     * The bound that IS asserted is the one the restore path enforces — an
     * archive DalyHub writes must be one it will read back (DEBT-247, closed by
     * V2.12 FIN-00, and the property that makes an export a backup rather than
     * a souvenir).
     */
    await seedWholeProductWorkspace();
    const current = await snapshot();
    const built = await buildStructuredExportArchive(
      current,
      await readAttachmentBytesForArchive({
        workspaceId: WS,
        attachments: current.records.attachments,
        store: objectStore(),
      }),
    );

    const collections = Object.entries(current.records).map(
      ([name, rows]) => [name, (rows as readonly unknown[]).length] as const,
    );
    const totalRows = collections.reduce((sum, [, count]) => sum + count, 0);

    // The measurement IS the deliverable: an archive that is too big is a
    // truth about the product, and printing it is how the release records it.
    console.log(
      `[CONSOL-02] whole-product archive: ${built.bytes.byteLength} bytes, ` +
        `${totalRows} rows across ${collections.length} collections, ` +
        `${current.records.attachments.length} attachment objects.`,
    );

    const read = await readBackupArchive(built.bytes);
    expect(read.attachmentBytes.size).toBe(current.records.attachments.length);
    expect(totalRows).toBeGreaterThan(50);
  });
});

/* -------------------------------------------------------------------------- */
/* CONSOL-01 — the documented purge procedure, EXECUTED                       */
/* -------------------------------------------------------------------------- */

describe("V2.16 CONSOL-01 — the operator purge plan, executed", () => {
  it("empties every table the schema has, and leaves the neighbour alone", async () => {
    /*
     * `docs/development/WORKSPACE_DELETION.md` documents this procedure and
     * `pnpm run workspace:purge:plan` emits it. Documentation that has never
     * been executed is a hypothesis, so this executes it — over real D1 and
     * real R2, with a SECOND populated workspace sitting beside the one being
     * destroyed, because "it deleted the right workspace" is the property that
     * actually matters when a person runs this by hand at 2am.
     */
    await seedWholeProductWorkspace();

    const neighbourBefore = await rowCounts(FIXTURE_OTHER_WORKSPACE);
    expect(neighbourBefore.get("entities")).toBeGreaterThan(0);

    await destroyWorkspace({ includeWorkspaceRow: true });

    // Every one of the sixty tables, including `workspaces` itself.
    const after = await rowCounts(WS);
    expect(after.size).toBe(workspacePurgeOrder().length);
    for (const [table, count] of after) {
      expect(count, `${table} survived the purge`).toBe(0);
    }

    // Not one object under the workspace's own R2 prefix.
    const objects = await env.ATTACHMENTS.list({
      prefix: attachmentWorkspacePrefix(WS),
      limit: 1000,
    });
    expect(objects.objects).toHaveLength(0);

    // And the workspace beside it is EXACTLY as it was.
    const neighbourAfter = await rowCounts(FIXTURE_OTHER_WORKSPACE);
    expect(neighbourAfter).toEqual(neighbourBefore);
  });

  it("leaves a deployment that cannot serve a request — which is why there is no button", async () => {
    /*
     * ADR-124's deciding fact, asserted rather than asserted-in-prose.
     *
     * `createConfiguredWorkspaceContextResolver` confirms the configured
     * workspace EXISTS and has no auto-create and no fallback, and there is no
     * workspace-creation surface anywhere in the product. So a purge that
     * includes the workspace row leaves every authenticated request failing,
     * with no in-product path back: a "Delete workspace" button would be a
     * button that destroys the application drawing it.
     */
    await seedWholeProductWorkspace();
    await destroyWorkspace({ includeWorkspaceRow: true });

    const resolver = createConfiguredWorkspaceContextResolver({
      configuredWorkspaceId: WS,
      repository: createWorkspaceRepository(env.DB),
    });
    await expect(resolver.resolve()).rejects.toBeInstanceOf(
      WorkspaceNotFoundError,
    );
  });

  it("destroys the BYTES, not merely the rows", async () => {
    /*
     * The falsification the whole rehearsal rests on. If destruction removed
     * only the D1 rows, every byte comparison after a restore would pass
     * without the archive having carried a single file — the objects would
     * still be sitting in the bucket from before. So the destroyer is checked
     * against the store directly.
     */
    const seeded = await seedWholeProductWorkspace();
    const before = await env.ATTACHMENTS.list({
      prefix: attachmentWorkspacePrefix(WS),
      limit: 1000,
    });
    expect(before.objects).toHaveLength(seeded.attachmentIds.length);

    await destroyWorkspace();

    const after = await env.ATTACHMENTS.list({
      prefix: attachmentWorkspacePrefix(WS),
      limit: 1000,
    });
    expect(after.objects).toHaveLength(0);
  });
});

/* -------------------------------------------------------------------------- */
/* The refusal corpus — CROSS-DOMAIN cases only                               */
/* -------------------------------------------------------------------------- */

/**
 * Rebuild an archive from a MUTATED snapshot, carrying the same real bytes.
 *
 * The mutation is applied to the snapshot the product just produced, so each
 * case below is a genuine archive that differs from a good one in exactly one
 * way — rather than a hand-written JSON blob whose refusal might be about its
 * shape rather than about the thing under test.
 */
async function archiveWithSnapshot(
  mutate: (snapshot: WorkspaceSnapshotV1) => WorkspaceSnapshotV1,
): Promise<Uint8Array> {
  const current = await snapshot();
  const bytes = await readAttachmentBytesForArchive({
    workspaceId: WS,
    attachments: current.records.attachments,
    store: objectStore(),
  });
  return (await buildStructuredExportArchive(mutate(current), bytes)).bytes;
}

describe("V2.16 CONSOL-02 — the whole-product refusal corpus", () => {
  /*
   * Deliberately NOT a second copy of the restore suite. Corruption, truncation,
   * an unreadable schema version, a foreign workspace id, an unsafe vault path
   * and a self-declared truncated export are all proved in
   * `workspace-restore.test.ts` and `attachment-restore-rehearsal.test.ts`, and
   * repeating them here would buy nothing and cost a minute of every run.
   *
   * What is here is what only a WHOLE-PRODUCT archive can express: a collection
   * the current schema requires, a collection from a FUTURE DalyHub, a Finance
   * row that is structurally wrong, and a saved Report definition this build
   * cannot read. Each is a different layer refusing, and each must refuse the
   * WHOLE restore rather than dropping the row and carrying on.
   */

  it("refuses a snapshot missing a collection the schema REQUIRES", async () => {
    /*
     * Asserted at the VALIDATOR rather than through a rebuilt archive, and the
     * reason is itself a finding: `buildStructuredExportArchive` CRASHES on a
     * snapshot missing a collection (`structuredReadme` counts every collection
     * in `SNAPSHOT_COLLECTION_ORDER`), because it only ever receives snapshots
     * its own repository produced. That is a fair assumption for a writer and
     * no assumption at all for a READER — which is exactly why the reader runs
     * `validateWorkspaceSnapshot` over whatever an owner uploads, and why this
     * case belongs at that seam.
     *
     * `spineRecords` has existed since the first archive and is deliberately
     * NOT in `SNAPSHOT_OPTIONAL_ON_READ_COLLECTIONS`, so an archive without it
     * is truncated rather than old, and the validator says so instead of
     * restoring a workspace with every Task's completion state silently gone.
     * (`workspace-restore.test.ts` proves the reader RUNS this validator; this
     * proves what the validator does with a whole-product snapshot.)
     */
    await seedWholeProductWorkspace();
    const current = await snapshot();
    const truncated = {
      ...current,
      records: Object.fromEntries(
        Object.entries(current.records).filter(
          ([key]) => key !== "spineRecords",
        ),
      ),
    };
    const issues = validateWorkspaceSnapshot(truncated);
    expect(
      issues.length,
      "a missing required collection must be refused",
    ).toBeGreaterThan(0);
    expect(JSON.stringify(issues)).toContain("spineRecords");

    // …and a COMPLETE snapshot from the same workspace validates clean, so the
    // assertion above is about the omission rather than about the fixture.
    expect(validateWorkspaceSnapshot(current)).toEqual([]);
  });

  it("refuses an archive whose Finance rows are structurally wrong", async () => {
    await seedWholeProductWorkspace();
    const archive = await archiveWithSnapshot((current) => ({
      ...current,
      records: {
        ...current.records,
        financeTransactions: current.records.financeTransactions.map((row) => ({
          ...row,
          // Money is minor units, always an integer. A float here is what a
          // hand-edited archive or a bad third-party writer produces.
          amountMinor: 12.5 as unknown as number,
        })),
      },
    }));
    await expect(readBackupArchive(archive)).rejects.toThrow();
  });

  it("carries a collection from a FUTURE DalyHub without losing the rest", async () => {
    /*
     * The compatibility policy, in the other direction. An archive written by a
     * LATER build may hold a key this one has never heard of. The snapshot's
     * declared `schemaVersion` is the gate — an unreadable version is refused
     * outright (`workspace-restore.test.ts`) — and a same-version archive with
     * an extra key must NOT be refused for it, because the alternative is that
     * adding a collection retroactively invalidates archives already on disk.
     */
    const seeded = await seedWholeProductWorkspace();
    const archive = await archiveWithSnapshot((current) => ({
      ...current,
      records: {
        ...current.records,
        somethingFromV4: [{ id: "x" }],
      } as never,
    }));
    const read = await readBackupArchive(archive);
    expect(read.snapshot.records.entities.length).toBeGreaterThan(0);

    await destroyWorkspace();
    await restoreFrom(archive);
    const restored = await makeGoalMeasurementRepository(makeContext(WS), {
      clock: clock(),
    }).listMeasurements(seeded.goalId);
    expect(restored).toHaveLength(3);
  });

  it("CARRIES a saved Report definition this build cannot read, and says so", async () => {
    /*
     * The asymmetry this case found, and it is deliberate rather than a defect.
     *
     * `reports.create()` REFUSES to store a definition it could not read back
     * (`validateReportDefinitionForWrite`), because writing one would be
     * putting a row in the owner's list that fails every time they open it.
     * Restore does NOT refuse the archive for the same row — and must not.
     * A restore is the recovery path: failing an owner's whole workspace
     * because one saved view names a source this build does not have would
     * make "export always possible" (AGENTS.md section 2) a promise with an
     * expiry date, and the archive might have been written by a LATER DalyHub
     * that did have it.
     *
     * What makes that safe is the decoder: a saved view whose config does not
     * parse comes back as `{ ok: false }` with its reason, and every surface
     * renders that honestly rather than executing nonsense. So the claim here
     * is precisely that — the row survives, it is marked unreadable, and
     * nothing else about the workspace is affected.
     */
    const seeded = await seedWholeProductWorkspace();
    const archive = await archiveWithSnapshot((current) => ({
      ...current,
      owner: {
        ...current.owner,
        taskSavedViews: current.owner.taskSavedViews.map((view) =>
          view.kind === "report"
            ? {
                ...view,
                config: {
                  ...(view.config as object),
                  source: "payroll",
                } as never,
              }
            : view,
        ),
      },
    }));

    await destroyWorkspace();
    await restoreFrom(archive);

    const reports = makeReportRepository(makeContext(WS), { clock: clock() });
    const restored = await reports.get(OWNER, seeded.savedReportId);
    expect(restored, "the row itself must survive").not.toBeNull();
    expect(restored!.name).toBe("Household spending");
    expect(
      restored!.config.ok,
      "…and be marked unreadable rather than run",
    ).toBe(false);

    // The rest of the workspace is untouched by one undecodable row.
    const series = await makeGoalMeasurementRepository(makeContext(WS), {
      clock: clock(),
    }).listMeasurements(seeded.goalId);
    expect(series).toHaveLength(3);
  });
});
