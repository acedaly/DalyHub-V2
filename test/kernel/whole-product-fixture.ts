/**
 * V2.16 CONSOL-02 — the synthetic workspace the WHOLE-PRODUCT rehearsal is run
 * against.
 *
 * It COMPOSES `workspace-fixture.ts` rather than forking it. That fixture is
 * already the realistic workspace the export suite and the restore suite are
 * both proved against — the spine, Notes, Diary, People, Meetings, Assets, an
 * Obligation, a Review, a Project template, tags, links, saved views of two
 * kinds and owner preferences — and a second fixture beside it would be a second
 * definition of "a workspace", which is exactly the kind of drift this release
 * exists to remove.
 *
 * What it ADDS is every durable domain that fixture does not reach, so the
 * rehearsal covers the product rather than the half of it that existed when the
 * fixture was written:
 *
 *   - **Habits** — a Habit, its effective-dated schedule chain (two versions,
 *     because a one-version chain proves nothing about versioning) and
 *     check-ins;
 *   - **Goal measurements** — a real series on the seeded Goal, so `Insight`
 *     and the Goal record have a shape to compare rather than two empty sets;
 *   - **Finance** — three accounts in two currencies, an APPLIED CSV import
 *     with its ledger row, categories, a budget, a transfer pair, and an
 *     obligation SETTLED by an imported transaction;
 *   - **Attachments** — real bytes in real R2: a PDF, a PNG, a text file, and
 *     the same FILENAME twice with different bytes, which is the case a
 *     filename-keyed store would silently collapse;
 *   - **A saved Report** — the third saved-view kind, so the archive carries a
 *     definition that must still EXECUTE after a restore;
 *   - **A Review insight snapshot** — history that cannot be recomputed once
 *     the records under it move (ADR-079);
 *   - **Two Diary entries either side of the Australia/Sydney DST transition**,
 *     so the owner-day arithmetic is proved across the one boundary that
 *     actually moves.
 *
 * Everything is SYNTHETIC. No real owner data exists in this repository, and
 * DEBT-198 is why.
 */

import { env } from "cloudflare:test";

import { createSystemActorContext } from "~/kernel/activity";
import type { CsvMapping } from "~/kernel/finance";
import { findBuiltInReport, parseReportDefinition } from "~/kernel/reports";
import { uploadAttachment, createR2ObjectStore } from "~/platform/attachments";
import { createAttachmentRepository } from "~/platform/storage/d1";

import {
  FakeClock,
  makeContext,
  makeFinanceRepository,
  makeGoalMeasurementRepository,
  makeHabitRepository,
  makeObligationRepository,
  makeReportRepository,
  makeReviewInsightRepository,
  makeDiaryRepository,
  sequentialIds,
} from "./support";
import {
  FIXTURE_OWNER,
  FIXTURE_WORKSPACE,
  seedWorkspace,
  type Seeded,
} from "./workspace-fixture";

export const WHOLE_PRODUCT_WORKSPACE = FIXTURE_WORKSPACE;
export const WHOLE_PRODUCT_OWNER = FIXTURE_OWNER;

/**
 * The frozen owner day the rehearsal computes every derived figure at, and the
 * zone it computes them in.
 *
 * A rehearsal whose figures depend on the day it RAN is not a rehearsal, it is
 * a weather report. `2026-10-05` is chosen deliberately: it is the day AFTER
 * Australia/Sydney enters daylight saving on 2026-10-04, so the fixture's two
 * boundary Diary entries fall on different owner days under different offsets
 * and a restore that mangled either the instant or the zone moves one of them.
 */
export const REHEARSAL_TODAY = "2026-10-05";
export const REHEARSAL_TIMEZONE = "Australia/Sydney";
export const REHEARSAL_NOW = new Date("2026-10-05T02:00:00.000Z");
/** The clock every seeding repository is bound to. Fixed, like the day. */
export const REHEARSAL_CLOCK_ISO = "2026-10-05T02:00:00.000Z";

/* -------------------------------------------------------------------------- */
/* Real bytes                                                                 */
/* -------------------------------------------------------------------------- */

/** A minimal but genuinely valid one-page PDF (`%PDF-1.4` … `%%EOF`). */
const PDF = new TextEncoder().encode(
  "%PDF-1.4\n" +
    "1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n" +
    "2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n" +
    "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]>>endobj\n" +
    "trailer<</Root 1 0 R>>\n" +
    "%%EOF\n",
);

/** A real 1x1 PNG: signature, IHDR, a minimal IDAT and IEND. */
const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d,
  0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
  0x60, 0x82,
]);

const TEXT_A = new TextEncoder().encode(
  "Rego renewal — paid 6 September 2026.\nAmount: $89.40\n",
);
/** The SAME filename as `TEXT_A`, different bytes. */
const TEXT_B = new TextEncoder().encode(
  "Rego renewal — superseded copy.\nAmount: $91.10\n",
);

export interface AttachmentFixture {
  readonly filename: string;
  readonly mediaType: string;
  readonly bytes: Uint8Array;
}

export const ATTACHMENT_FIXTURES: readonly AttachmentFixture[] = [
  {
    filename: "Rego renewal — Hilux.pdf",
    mediaType: "application/pdf",
    bytes: PDF,
  },
  { filename: "receipt.png", mediaType: "image/png", bytes: PNG },
  { filename: "rego.txt", mediaType: "text/plain", bytes: TEXT_A },
  // Same NAME, different BYTES. A store keyed by filename collapses these two
  // into one and the byte comparison would still pass on whichever survived.
  { filename: "rego.txt", mediaType: "text/plain", bytes: TEXT_B },
];

/* -------------------------------------------------------------------------- */
/* Finance fixtures                                                           */
/* -------------------------------------------------------------------------- */

/** A synthetic bank CSV, so the ledger row and every fingerprint are real. */
const STATEMENT = [
  "Date,Description,Amount,Balance",
  "03/09/2026,EFTPOS NORTHWIND GROCERS 4821 DUBBO,-120.50,879.50",
  "04/09/2026,SYNTH CAFE 001,-12.50,867.00",
  "04/09/2026,SYNTH CAFE 001,-12.50,854.50",
  "05/09/2026,SYNTHETIC PAYROLL,2500.00,3354.50",
  "",
].join("\n");

const MAPPING: CsvMapping = {
  v: 1,
  headerRows: 1,
  date: 0,
  dateFormat: "dmy",
  description: 1,
  amount: { kind: "single", column: 2, invert: false },
  sourceId: null,
  balance: 3,
};

/* -------------------------------------------------------------------------- */
/* The seeded workspace                                                       */
/* -------------------------------------------------------------------------- */

export interface WholeProductSeeded extends Seeded {
  readonly habitId: string;
  readonly financeAccountIds: readonly string[];
  readonly settledObligationId: string;
  readonly savedReportId: string;
  readonly attachmentIds: readonly string[];
  readonly dstBeforeDiaryId: string;
  readonly dstAfterDiaryId: string;
}

function clock() {
  return new FakeClock(REHEARSAL_CLOCK_ISO).now;
}

function attachmentDeps(workspaceId: string) {
  return {
    attachments: createAttachmentRepository(env.DB, makeContext(workspaceId), {
      actorContext: createSystemActorContext(),
    }),
    objects: createR2ObjectStore(env.ATTACHMENTS),
    workspaceId,
  };
}

/**
 * Seed the complete synthetic workspace, through the PRODUCTION repositories.
 *
 * Never direct SQL for anything a repository owns: the point of the rehearsal
 * is that the archive sees what the product actually writes, including the
 * atomic Activity every mutation appends and the structural links the spine
 * creates for itself.
 */
export async function seedWholeProductWorkspace(): Promise<WholeProductSeeded> {
  const base = await seedWorkspace();
  const ws = WHOLE_PRODUCT_WORKSPACE;
  const context = makeContext(ws);

  /* ---- Habits: a chain with TWO versions, and check-ins ------------------ */
  const habits = makeHabitRepository(context, {
    clock: clock(),
    idGenerator: sequentialIds("habit"),
    ownerTimeZone: async () => REHEARSAL_TIMEZONE,
  });
  const habit = await habits.create({
    title: "Morning mobility",
    notes: "Ten minutes, before anything else.",
    schedule: { kind: "weekdays", weekdays: [1, 3, 5] },
    areaId: base.areaId,
  });
  // A second schedule version, so the chain is a CHAIN. A one-version chain
  // round-trips identically whether or not the restore understands versioning.
  await habits.changeSchedule(habit.id, {
    kind: "weekly_count",
    timesPerWeek: 4,
  });
  await habits.checkIn(habit.id, "2026-10-01");
  await habits.checkIn(habit.id, "2026-10-02");
  // …and one on the far side of the DST transition.
  await habits.checkIn(habit.id, "2026-10-05");

  /* ---- Goal measurements: a real series ---------------------------------- */
  const measurements = makeGoalMeasurementRepository(context, {
    clock: clock(),
    idGenerator: sequentialIds("gm"),
  });
  for (const [value, measuredOn] of [
    [85, "2026-09-01"],
    [81, "2026-09-15"],
    [78, "2026-10-01"],
  ] as const) {
    await measurements.createMeasurement(base.goalId, { value, measuredOn });
  }

  /* ---- Diary either side of the Sydney DST transition -------------------- */
  const diary = makeDiaryRepository(context, {
    clock: clock(),
    idGenerator: sequentialIds("dst"),
  });
  // 2026-10-03T13:30Z is 23:30 on 3 October in Sydney (AEST, UTC+10).
  const dstBefore = await diary.create({
    entryType: "reflection",
    title: "The night before the clocks moved",
    occurredAt: new Date("2026-10-03T13:30:00.000Z"),
    timezone: REHEARSAL_TIMEZONE,
  });
  // 2026-10-03T16:30Z is 03:30 on 4 October in Sydney (AEDT, UTC+11) — the same
  // three hours later, and a DIFFERENT owner day.
  const dstAfter = await diary.create({
    entryType: "reflection",
    title: "The morning after",
    occurredAt: new Date("2026-10-03T16:30:00.000Z"),
    timezone: REHEARSAL_TIMEZONE,
  });

  /* ---- Finance ----------------------------------------------------------- */
  const finance = makeFinanceRepository(context, {
    clock: clock(),
    idGenerator: sequentialIds("fin"),
  });
  const everyday = await finance.createAccount({
    title: "Everyday",
    accountType: "transaction",
    currencyCode: "AUD",
    openingDate: "2026-09-01",
    openingBalance: "1000.00",
    institution: "Bank of Synthetica",
  });
  const card = await finance.createAccount({
    title: "Rewards Card",
    accountType: "credit_card",
    currencyCode: "AUD",
    openingDate: "2026-09-01",
    openingBalance: "-400.00",
  });
  const overseas = await finance.createAccount({
    title: "Synthetica NZ",
    accountType: "savings",
    currencyCode: "NZD",
    openingDate: "2026-09-01",
    openingBalance: "500.00",
  });

  const categories = await finance.listCategories();
  const groceries = categories.find((entry) => entry.name === "Groceries")!;
  const dining = categories.find((entry) => entry.name === "Dining")!;
  const income = categories.find((entry) => entry.name === "Income")!;

  const statementBytes = new TextEncoder().encode(STATEMENT);
  const preview = await finance.previewImport({
    accountId: everyday.id,
    fileName: "synthetica-2026-09.csv",
    bytes: statementBytes,
    mapping: MAPPING,
  });
  await finance.applyImport({
    accountId: everyday.id,
    fileName: "synthetica-2026-09.csv",
    bytes: statementBytes,
    mapping: MAPPING,
    expectedSha256: preview.fileSha256,
    saveMapping: true,
  });

  const imported = await finance.listTransactions({
    filters: { accountId: everyday.id },
  });
  for (const view of imported.items) {
    const categoryId =
      view.transaction.amountMinor > 0
        ? income.id
        : view.transaction.payeeKey.includes("CAFE")
          ? dining.id
          : groceries.id;
    await finance.updateTransaction(view.transaction.id, { categoryId });
  }

  // A transfer pair, so the fact that keeps a card payment out of spending is
  // on the round trip.
  const out = await finance.createTransaction({
    accountId: everyday.id,
    occurredOn: "2026-09-20",
    amount: "-400.00",
    payeeDisplay: "CARD PAYMENT",
  });
  const back = await finance.createTransaction({
    accountId: card.id,
    occurredOn: "2026-09-20",
    amount: "400.00",
    payeeDisplay: "PAYMENT RECEIVED",
  });
  await finance.linkTransfer(out.id, back.id);

  // Unlike money, which must survive without being summed with the rest.
  await finance.createTransaction({
    accountId: overseas.id,
    occurredOn: "2026-09-11",
    amount: "-45.00",
    payeeDisplay: "NORTHWIND GROCERS NZ",
    categoryId: groceries.id,
  });

  await finance.setBudget({
    categoryId: groceries.id,
    periodMonth: "2026-09",
    amount: "600.00",
    currencyCode: "AUD",
  });

  /* ---- A money-bearing Obligation, SETTLED by a transaction --------------- */
  const obligations = makeObligationRepository(context, {
    clock: clock(),
    idGenerator: sequentialIds("obl2"),
  });
  const electricity = await obligations.create({
    category: "bill",
    title: "Electricity",
    dueDate: "2026-09-03",
    expectedAmount: "120.00",
    currencyCode: "AUD",
  });
  const grocerRow = imported.items.find(
    (view) => view.transaction.amountMinor === -12_050,
  )!;
  await obligations.complete(electricity.id, {
    settledByTransactionId: grocerRow.transaction.id,
  });

  /* ---- Attachments: real bytes, real R2 ---------------------------------- */
  const attachmentIds: string[] = [];
  const owners = [
    base.noteId,
    base.assetId,
    grocerRow.transaction.id,
    base.noteId,
  ];
  for (const [index, fixture] of ATTACHMENT_FIXTURES.entries()) {
    const uploaded = await uploadAttachment(attachmentDeps(ws), {
      ownerEntityId: owners[index]!,
      filename: fixture.filename,
      declaredMediaType: fixture.mediaType,
      bytes: fixture.bytes,
      uploadOperationId: `whole-product-op-${String(index).padStart(4, "0")}`,
    });
    attachmentIds.push(uploaded.attachment.id);
  }

  /* ---- A saved REPORT — the third saved-view kind ------------------------- */
  const reports = makeReportRepository(context, {
    clock: clock(),
    idGenerator: sequentialIds("rpt"),
  });
  const builtIn = findBuiltInReport("spend-by-category");
  if (!builtIn) throw new Error("the spend-by-category built-in is missing");
  const savedReport = await reports.create(WHOLE_PRODUCT_OWNER, {
    name: "Household spending",
    config: parseReportDefinition({
      ...builtIn.config,
      // A FIXED window, so the report's machine result is the same figure
      // whenever the rehearsal runs. A built-in's own relative window would
      // make the comparison a statement about the calendar.
      window: { kind: "custom", startIso: "2026-09-01", endIso: "2026-09-30" },
    }),
  });

  /* ---- A Review insight snapshot — history that cannot be recomputed ------ */
  await makeReviewInsightRepository(context).saveSnapshot(base.reviewId, {
    version: 1,
    periodStart: "2026-07-27",
    periodEnd: "2026-08-02",
    tasksCompleted: 1,
    projectsCompleted: 0,
    goalsCompleted: 0,
    overdueCarryOver: 2,
    waitingCarryOver: 1,
    projects: [],
    projectsBounded: false,
    goals: [],
    goalsBounded: false,
    areas: [],
    areasBounded: false,
    carryOverTaskIds: [base.recurringTaskId],
    carryOverTaskIdsBounded: false,
  });

  return {
    ...base,
    habitId: habit.id,
    financeAccountIds: [everyday.id, card.id, overseas.id],
    settledObligationId: electricity.id,
    savedReportId: savedReport.id,
    attachmentIds,
    dstBeforeDiaryId: dstBefore.id,
    dstAfterDiaryId: dstAfter.id,
  };
}
