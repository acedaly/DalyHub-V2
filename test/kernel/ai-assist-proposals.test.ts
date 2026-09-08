/**
 * V2.15 ASSIST — the three new proposal kinds, against real repositories and
 * real D1 constraints.
 *
 * These are the invariants a mock cannot prove, and they are the ones the
 * release rests on. Each has a name in the roadmap's falsification table:
 *
 *   - an accepted category is ONE ordinary `updateTransaction`, so it stamps
 *     `categoryConfirmedAt` exactly as a manual tap does and the deterministic
 *     suggestion rule learns from it;
 *   - a REPLAYED acceptance changes nothing twice and says `unchanged`;
 *   - a proposal generated against one state and accepted against another is
 *     refused as STALE, and the owner's own choice survives;
 *   - a foreign category, a foreign transaction and a wrong-KIND category are
 *     each refused, and refused indistinguishably from a missing one;
 *   - an accepted follow-up is an ordinary Task with the obligation's own due
 *     date, pointed at by the obligation, and a replay creates no second one;
 *   - a completed obligation refuses a follow-up drafted while it was open;
 *   - a Review draft accepted over writing the owner did after generation is
 *     refused by REVIEW-02's own concurrency guard rather than overwriting it;
 *   - EVERY applied kind can be undone, and the undo restores exactly, and
 *     refuses when the record has moved on since.
 *
 * **Every fixture here is synthetic.** No real owner financial data exists in
 * this repository, and DEBT-198 is why.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createActivityActorContext } from "~/kernel/activity";
import {
  applyProposalItems,
  undoProposalItems,
  type AppliedItem,
} from "~/modules/ai/apply-proposal";
import type { WorkspaceScope } from "~/platform/workspaces";

import {
  FakeClock,
  makeActivityRepository,
  makeContext,
  makeFinanceRepository,
  makeLinkRepository,
  makeObligationRepository,
  makeRepository,
  makeReviewRepository,
  makeSpineRepository,
  makeTaskRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_assist";
const OTHER = "ws_assist_other";
const OWNER = "owner-subject-1";

const nextEntityId = sequentialIds("asst");
const nextActivityId = sequentialIds("asstact");

interface Harness {
  readonly scope: WorkspaceScope;
  /**
   * The harness clock, exposed and advanceable.
   *
   * REVIEW-02's concurrency guard compares a section's `updatedAt`, so a test
   * that never moves the clock is a test in which two consecutive writes are
   * indistinguishable — and would report the guard as broken when it is the
   * fixture that is standing still. Every test below that depends on one write
   * happening after another advances it explicitly.
   */
  readonly clock: FakeClock;
  readonly finance: ReturnType<typeof makeFinanceRepository>;
  readonly obligations: ReturnType<typeof makeObligationRepository>;
  readonly reviews: ReturnType<typeof makeReviewRepository>;
  readonly tasks: ReturnType<typeof makeTaskRepository>;
  readonly entityLinks: ReturnType<typeof makeLinkRepository>;
  readonly workspaceId: string;
}

/**
 * Compose the repositories the acceptance path reads, bound to ONE workspace
 * context — the same composition the production root performs, without a
 * Worker env. The actor is an authenticated USER, established at composition
 * and never passed as a parameter, so no code below can choose one.
 */
function harness(ws: string): Harness {
  const context = makeContext(ws);
  const clock = new FakeClock();
  const shared = {
    clock: clock.now,
    idGenerator: nextEntityId,
    activityIdGenerator: nextActivityId,
    actorContext: createActivityActorContext({ type: "user", id: OWNER }),
  };
  const finance = makeFinanceRepository(context, shared);
  const obligations = makeObligationRepository(context, shared);
  const reviews = makeReviewRepository(context, shared);
  const tasks = makeTaskRepository(context, {
    clock: shared.clock,
    activityIdGenerator: nextActivityId,
    actorContext: shared.actorContext,
  });
  const entityLinks = makeLinkRepository(context, shared);
  const entities = makeRepository(context, shared);
  const spine = makeSpineRepository(context, shared);

  const scope = {
    context,
    finance,
    obligations,
    reviews,
    tasks,
    entityLinks,
    entities,
    spine,
    activity: makeActivityRepository(context),
  } as unknown as WorkspaceScope;

  return {
    scope,
    clock,
    finance,
    obligations,
    reviews,
    tasks,
    entityLinks,
    workspaceId: ws,
  };
}

/** Run an acceptance the way the route does, with the replay guard armed. */
async function accept(
  h: Harness,
  items: readonly unknown[],
  options: { readonly feature: string; readonly usageId?: string },
): Promise<readonly AppliedItem[]> {
  return applyProposalItems({
    scope: h.scope,
    source: null,
    items,
    usageId: options.usageId ?? "usage-assist-1",
    // The feature the LEDGER row names. The route reads it from storage; the
    // test supplies it directly so the engine is driven exactly as the route
    // drives it.
    feature: options.feature as never,
    receipts: {
      db: env.DB,
      workspaceId: h.workspaceId,
      ownerSubject: OWNER,
      now: new Date("2026-09-08T00:00:00.000Z"),
    },
  });
}

/** Run an undo the way the route does. */
async function undo(
  h: Harness,
  items: readonly unknown[],
  options: { readonly feature: string; readonly usageId?: string },
): Promise<readonly AppliedItem[]> {
  return undoProposalItems({
    scope: h.scope,
    source: null,
    items,
    usageId: options.usageId ?? "usage-assist-1",
    feature: options.feature as never,
    receipts: {
      db: env.DB,
      workspaceId: h.workspaceId,
      ownerSubject: OWNER,
      now: new Date("2026-09-08T00:00:00.000Z"),
    },
  });
}

async function everydayAccount(h: Harness) {
  return h.finance.createAccount({
    title: "Everyday",
    accountType: "transaction",
    currencyCode: "AUD",
    openingDate: "2026-09-01",
    institution: "Bank of Synthetica",
  });
}

/** One uncategorised money-OUT transaction. */
async function uncategorisedSpend(h: Harness, accountId: string) {
  return h.finance.createTransaction({
    accountId,
    occurredOn: "2026-09-02",
    amount: "-42.30",
    payeeDisplay: "NORTHWIND GROCERS",
  });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* transaction_category                                                        */
/* -------------------------------------------------------------------------- */

describe("an accepted category is an ordinary Finance mutation", () => {
  it("sets the category, stamps the owner's confirmation, and hands back its own undo", async () => {
    const h = harness(WS);
    const account = await everydayAccount(h);
    const txn = await uncategorisedSpend(h, account.id);
    const categories = await h.finance.listCategories();
    const groceries = categories.find(
      (entry) => entry.kind === "spending",
    ) as (typeof categories)[number];

    const [applied] = await accept(
      h,
      [
        {
          kind: "transaction_category",
          transactionId: txn.id,
          categoryId: groceries.id,
          expectedCategoryId: null,
        },
      ],
      { feature: "finance-categorisation" },
    );

    expect(applied?.ok).toBe(true);
    expect(applied?.outcome).toBe("updated");

    const after = await h.finance.getTransaction(txn.id);
    expect(after?.transaction.categoryId).toBe(groceries.id);
    /*
     * The whole reason acceptance goes through `updateTransaction` rather than
     * a Finance write of its own: setting a category through the canonical
     * mutation stamps `categoryConfirmedAt`, which is the ONLY thing the
     * deterministic last-category-for-payee rule learns from. An accepted
     * suggestion therefore teaches DalyHub exactly as much as a manual tap
     * does — and a suggestion nobody accepted teaches it nothing.
     */
    expect(after?.transaction.categoryConfirmedAt).not.toBeNull();

    // The undo it handed back is a category change in the other direction,
    // expecting to find what the acceptance just wrote.
    expect(applied?.undo).toEqual({
      kind: "transaction_category",
      transactionId: txn.id,
      categoryId: null,
      expectedCategoryId: groceries.id,
    });
  });

  it("is a no-op on replay, and says so rather than writing again", async () => {
    const h = harness(WS);
    const account = await everydayAccount(h);
    const txn = await uncategorisedSpend(h, account.id);
    const groceries = (await h.finance.listCategories()).find(
      (entry) => entry.kind === "spending",
    )!;

    const item = {
      kind: "transaction_category",
      transactionId: txn.id,
      categoryId: groceries.id,
      expectedCategoryId: null,
    };

    const first = await accept(h, [item], {
      feature: "finance-categorisation",
    });
    expect(first[0]?.outcome).toBe("updated");

    /*
     * The SECOND apply finds the expectation no longer matches (the category is
     * now set) and the target already equal to the proposed value. That is a
     * replay, not a conflict, and it is reported as `unchanged` — the DATABASE
     * arbitrates it, not a disabled button.
     */
    const second = await accept(h, [item], {
      feature: "finance-categorisation",
    });
    expect(second[0]?.ok).toBe(true);
    expect(second[0]?.outcome).toBe("unchanged");
    expect(second[0]?.undo).toBeUndefined();

    const after = await h.finance.getTransaction(txn.id);
    expect(after?.transaction.categoryId).toBe(groceries.id);
  });

  it("refuses a row the owner categorised after the suggestion was made", async () => {
    const h = harness(WS);
    const account = await everydayAccount(h);
    const txn = await uncategorisedSpend(h, account.id);
    const spending = (await h.finance.listCategories()).filter(
      (entry) => entry.kind === "spending",
    );
    const suggested = spending[0]!;
    const ownersOwnChoice = spending[1]!;

    // The owner gets there first.
    await h.finance.updateTransaction(txn.id, {
      categoryId: ownersOwnChoice.id,
    });

    const [applied] = await accept(
      h,
      [
        {
          kind: "transaction_category",
          transactionId: txn.id,
          categoryId: suggested.id,
          // What the proposal was generated against: uncategorised.
          expectedCategoryId: null,
        },
      ],
      { feature: "finance-categorisation" },
    );

    expect(applied?.ok).toBe(false);
    expect(applied?.outcome).toBe("stale");
    expect(applied?.message).toContain("changed after the suggestion");

    const after = await h.finance.getTransaction(txn.id);
    expect(after?.transaction.categoryId).toBe(ownersOwnChoice.id);
  });

  it("refuses a category of the wrong KIND for the transaction's direction", async () => {
    const h = harness(WS);
    const account = await everydayAccount(h);
    const spend = await uncategorisedSpend(h, account.id);
    const income = (await h.finance.listCategories()).find(
      (entry) => entry.kind === "income",
    )!;

    const [applied] = await accept(
      h,
      [
        {
          kind: "transaction_category",
          transactionId: spend.id,
          categoryId: income.id,
          expectedCategoryId: null,
        },
      ],
      { feature: "finance-categorisation" },
    );

    expect(applied?.ok).toBe(false);
    expect(applied?.message).toContain("money-in category");
    const after = await h.finance.getTransaction(spend.id);
    expect(after?.transaction.categoryId).toBeNull();
  });

  it("refuses an archived category", async () => {
    const h = harness(WS);
    const account = await everydayAccount(h);
    const txn = await uncategorisedSpend(h, account.id);
    const groceries = (await h.finance.listCategories()).find(
      (entry) => entry.kind === "spending",
    )!;
    await h.finance.setCategoryArchived(groceries.id, true);

    const [applied] = await accept(
      h,
      [
        {
          kind: "transaction_category",
          transactionId: txn.id,
          categoryId: groceries.id,
          expectedCategoryId: null,
        },
      ],
      { feature: "finance-categorisation" },
    );

    expect(applied?.ok).toBe(false);
    expect(applied?.message).toContain("archived");
  });

  it("refuses another workspace's category, and another workspace's transaction, identically to a missing one", async () => {
    const local = harness(WS);
    const foreign = harness(OTHER);
    const account = await everydayAccount(local);
    const txn = await uncategorisedSpend(local, account.id);
    const foreignAccount = await everydayAccount(foreign);
    const foreignTxn = await uncategorisedSpend(foreign, foreignAccount.id);
    const foreignCategory = (await foreign.finance.listCategories()).find(
      (entry) => entry.kind === "spending",
    )!;

    const [withForeignCategory] = await accept(
      local,
      [
        {
          kind: "transaction_category",
          transactionId: txn.id,
          categoryId: foreignCategory.id,
          expectedCategoryId: null,
        },
      ],
      { feature: "finance-categorisation" },
    );
    const [withMissingCategory] = await accept(
      local,
      [
        {
          kind: "transaction_category",
          transactionId: txn.id,
          categoryId: "cat-does-not-exist",
          expectedCategoryId: null,
        },
      ],
      { feature: "finance-categorisation" },
    );
    /*
     * IDENTICAL sentences. A refusal that distinguished "exists, but not
     * yours" from "does not exist" would let an acceptance enumerate another
     * workspace's ids one refusal at a time.
     */
    expect(withForeignCategory?.ok).toBe(false);
    expect(withForeignCategory?.message).toBe(withMissingCategory?.message);

    const localCategory = (await local.finance.listCategories()).find(
      (entry) => entry.kind === "spending",
    )!;
    const [withForeignTransaction] = await accept(
      local,
      [
        {
          kind: "transaction_category",
          transactionId: foreignTxn.id,
          categoryId: localCategory.id,
          expectedCategoryId: null,
        },
      ],
      { feature: "finance-categorisation" },
    );
    const [withMissingTransaction] = await accept(
      local,
      [
        {
          kind: "transaction_category",
          transactionId: "txn-does-not-exist",
          categoryId: localCategory.id,
          expectedCategoryId: null,
        },
      ],
      { feature: "finance-categorisation" },
    );
    expect(withForeignTransaction?.ok).toBe(false);
    expect(withForeignTransaction?.message).toBe(
      withMissingTransaction?.message,
    );

    // And nothing moved in the other workspace.
    const untouched = await foreign.finance.getTransaction(foreignTxn.id);
    expect(untouched?.transaction.categoryId).toBeNull();
  });

  it("refuses the kind entirely when the ledger row names a different feature", async () => {
    const h = harness(WS);
    const account = await everydayAccount(h);
    const txn = await uncategorisedSpend(h, account.id);
    const groceries = (await h.finance.listCategories()).find(
      (entry) => entry.kind === "spending",
    )!;

    const [applied] = await accept(
      h,
      [
        {
          kind: "transaction_category",
          transactionId: txn.id,
          categoryId: groceries.id,
          expectedCategoryId: null,
        },
      ],
      // A Meeting extraction's usage id, carrying a Finance payload.
      { feature: "meeting-action-extraction" },
    );

    expect(applied?.ok).toBe(false);
    expect(applied?.message).toBe("That isn’t something DalyHub can apply.");
    const after = await h.finance.getTransaction(txn.id);
    expect(after?.transaction.categoryId).toBeNull();
  });

  it("undoes to the exact prior category, and refuses to undo over a newer choice", async () => {
    const h = harness(WS);
    const account = await everydayAccount(h);
    const txn = await uncategorisedSpend(h, account.id);
    const spending = (await h.finance.listCategories()).filter(
      (entry) => entry.kind === "spending",
    );
    const first = spending[0]!;
    const second = spending[1]!;

    // Start from a category the owner had already chosen, so "undo restores
    // exactly" means something stronger than "undo clears".
    await h.finance.updateTransaction(txn.id, { categoryId: first.id });

    const [applied] = await accept(
      h,
      [
        {
          kind: "transaction_category",
          transactionId: txn.id,
          categoryId: second.id,
          expectedCategoryId: first.id,
        },
      ],
      { feature: "finance-categorisation" },
    );
    expect(applied?.ok).toBe(true);

    const [undone] = await undo(h, [applied!.undo], {
      feature: "finance-categorisation",
    });
    expect(undone?.ok).toBe(true);
    const restored = await h.finance.getTransaction(txn.id);
    expect(restored?.transaction.categoryId).toBe(first.id);

    // Undoing again is a no-op, not a second write: the category is already
    // what the undo wanted it to be.
    const [again] = await undo(h, [applied!.undo], {
      feature: "finance-categorisation",
    });
    expect(again?.ok).toBe(true);
    expect(again?.outcome).toBe("unchanged");

    // And an undo whose expectation no longer holds refuses rather than
    // reverting a newer decision the owner made after the apply. A THIRD
    // category, so the undo's target and the owner's current choice differ.
    const third = spending[2]!;
    await h.finance.updateTransaction(txn.id, { categoryId: third.id });
    const [refused] = await undo(h, [applied!.undo], {
      feature: "finance-categorisation",
    });
    expect(refused?.ok).toBe(false);
    expect(refused?.outcome).toBe("stale");
    const untouched = await h.finance.getTransaction(txn.id);
    expect(untouched?.transaction.categoryId).toBe(third.id);
  });
});

/* -------------------------------------------------------------------------- */
/* obligation_task                                                             */
/* -------------------------------------------------------------------------- */

async function overdueObligation(h: Harness, title = "Electricity") {
  return h.obligations.create({
    title,
    category: "bill",
    dueDate: "2026-08-01",
  });
}

describe("an accepted follow-up is an ordinary linked Task", () => {
  it("creates the Task with the obligation's own due date, and points the obligation at it", async () => {
    const h = harness(WS);
    const obligation = await overdueObligation(h);

    const [applied] = await accept(
      h,
      [
        {
          kind: "obligation_task",
          obligationId: obligation.id,
          title: "Ring the retailer",
        },
      ],
      { feature: "obligation-follow-up" },
    );

    expect(applied?.ok).toBe(true);
    expect(applied?.created).toBe(true);

    const task = await h.tasks.getTask(applied!.id as string);
    expect(task?.title).toBe("Ring the retailer");
    /*
     * The obligation stays authoritative for WHEN, exactly as the manual
     * `create-task` intent has it. There is no date field in the proposal
     * schema at all, so there is no inferred date for the owner to check.
     */
    expect(task?.dueDate).toBe("2026-08-01");

    const after = await h.obligations.get(obligation.id);
    expect(after?.taskId).toBe(applied?.id);
  });

  it("creates no second Task on replay", async () => {
    const h = harness(WS);
    const obligation = await overdueObligation(h);
    const item = {
      kind: "obligation_task",
      obligationId: obligation.id,
      title: "Ring the retailer",
    };

    const first = await accept(h, [item], { feature: "obligation-follow-up" });
    expect(first[0]?.ok).toBe(true);

    const second = await accept(h, [item], { feature: "obligation-follow-up" });
    /*
     * Refused, and refused for the RIGHT reason: the obligation already points
     * at a Task. Creating a second and moving the pointer would orphan the
     * first — a Task the owner can no longer reach from the commitment it is
     * about.
     */
    expect(second[0]?.ok).toBe(false);
    expect(second[0]?.message).toContain("already a Task");

    const tasks = await countTasksTitled("Ring the retailer");
    expect(tasks).toBe(1);
  });

  it("refuses a follow-up for a commitment that was completed in between", async () => {
    const h = harness(WS);
    const obligation = await overdueObligation(h);
    await h.obligations.complete(obligation.id);

    const [applied] = await accept(
      h,
      [
        {
          kind: "obligation_task",
          obligationId: obligation.id,
          title: "Ring the retailer",
        },
      ],
      { feature: "obligation-follow-up" },
    );

    expect(applied?.ok).toBe(false);
    expect(applied?.outcome).toBe("stale");
    expect(await countTasksTitled("Ring the retailer")).toBe(0);
  });

  it("refuses another workspace's commitment, indistinguishably from a missing one", async () => {
    const local = harness(WS);
    const foreign = harness(OTHER);
    const foreignObligation = await overdueObligation(foreign, "Their bill");

    const [withForeign] = await accept(
      local,
      [
        {
          kind: "obligation_task",
          obligationId: foreignObligation.id,
          title: "Ring them",
        },
      ],
      { feature: "obligation-follow-up" },
    );
    const [withMissing] = await accept(
      local,
      [
        {
          kind: "obligation_task",
          obligationId: "ob-does-not-exist",
          title: "Ring them",
        },
      ],
      { feature: "obligation-follow-up" },
    );

    expect(withForeign?.ok).toBe(false);
    expect(withForeign?.message).toBe(withMissing?.message);
    expect(await countTasksTitled("Ring them")).toBe(0);
  });

  it("undoes by unlinking then deleting, and refuses once the pointer has moved", async () => {
    const h = harness(WS);
    const obligation = await overdueObligation(h);
    const [applied] = await accept(
      h,
      [
        {
          kind: "obligation_task",
          obligationId: obligation.id,
          title: "Ring the retailer",
        },
      ],
      { feature: "obligation-follow-up" },
    );
    expect(applied?.ok).toBe(true);

    const [undone] = await undo(h, [applied!.undo], {
      feature: "obligation-follow-up",
    });
    expect(undone?.ok).toBe(true);

    const after = await h.obligations.get(obligation.id);
    expect(after?.taskId).toBeNull();
    expect(await countTasksTitled("Ring the retailer")).toBe(0);

    // Undoing again refuses: the obligation no longer points at that Task.
    const [again] = await undo(h, [applied!.undo], {
      feature: "obligation-follow-up",
    });
    expect(again?.ok).toBe(false);
    expect(again?.outcome).toBe("stale");
  });
});

async function countTasksTitled(title: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM entities WHERE type='task' AND title = ? AND deleted_at IS NULL",
  )
    .bind(title)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

/* -------------------------------------------------------------------------- */
/* review_reflection                                                           */
/* -------------------------------------------------------------------------- */

async function weeklyReview(h: Harness) {
  const created = await h.reviews.create({
    type: "weekly",
    periodStart: "2026-08-24",
    periodEnd: "2026-08-30",
  });
  return created.review;
}

describe("an accepted reflection is the owner's own writing", () => {
  it("writes into a blank section, and hands back the text it replaced", async () => {
    const h = harness(WS);
    const review = await weeklyReview(h);

    const [applied] = await accept(
      h,
      [
        {
          kind: "review_reflection",
          reviewId: review.id,
          sectionId: "summary.overall",
          body: "A steady week rather than an eventful one.",
          expectedUpdatedAt: null,
        },
      ],
      { feature: "review-reflection-draft" },
    );

    expect(applied?.ok).toBe(true);
    expect(applied?.outcome).toBe("updated");

    const after = await h.reviews.get(review.id);
    const section = after?.sections.find(
      (entry) => entry.sectionId === "summary.overall",
    );
    expect(section?.body).toBe("A steady week rather than an eventful one.");

    const undoPayload = applied?.undo as Record<string, unknown>;
    expect(undoPayload.body).toBe("");
    expect(undoPayload.expectedUpdatedAt).toBe(
      section?.updatedAt.toISOString(),
    );
  });

  it("refuses to replace writing the owner did AFTER the draft was generated", async () => {
    const h = harness(WS);
    const review = await weeklyReview(h);

    // The owner writes something; the draft was generated before it.
    const written = await h.reviews.updateSection(
      review.id,
      "summary.overall",
      "My own thoughts, in my own words.",
    );
    const staleVersion = written.review.sections.find(
      (entry) => entry.sectionId === "summary.overall",
    )!.updatedAt;

    // …and then writes some more, a minute later.
    h.clock.advance(60_000);
    await h.reviews.updateSection(
      review.id,
      "summary.overall",
      "My own thoughts, expanded.",
    );

    const [applied] = await accept(
      h,
      [
        {
          kind: "review_reflection",
          reviewId: review.id,
          sectionId: "summary.overall",
          body: "A steady week rather than an eventful one.",
          expectedUpdatedAt: staleVersion.toISOString(),
        },
      ],
      { feature: "review-reflection-draft" },
    );

    expect(applied?.ok).toBe(false);
    expect(applied?.outcome).toBe("stale");

    const after = await h.reviews.get(review.id);
    expect(
      after?.sections.find((entry) => entry.sectionId === "summary.overall")
        ?.body,
    ).toBe("My own thoughts, expanded.");
  });

  it("refuses to write over existing text with no version to compare", async () => {
    /*
     * A blank section has nothing to lose. A section with the owner's writing
     * in it, accepted with no expectation, is precisely the blind write
     * REVIEW-02 removed — so it is refused rather than performed.
     */
    const h = harness(WS);
    const review = await weeklyReview(h);
    await h.reviews.updateSection(
      review.id,
      "summary.overall",
      "Something I wrote.",
    );

    const [applied] = await accept(
      h,
      [
        {
          kind: "review_reflection",
          reviewId: review.id,
          sectionId: "summary.overall",
          body: "A draft.",
          expectedUpdatedAt: null,
        },
      ],
      { feature: "review-reflection-draft" },
    );

    expect(applied?.ok).toBe(false);
    expect(applied?.outcome).toBe("stale");
    const after = await h.reviews.get(review.id);
    expect(
      after?.sections.find((entry) => entry.sectionId === "summary.overall")
        ?.body,
    ).toBe("Something I wrote.");
  });

  it("is a no-op on replay", async () => {
    const h = harness(WS);
    const review = await weeklyReview(h);
    const item = {
      kind: "review_reflection",
      reviewId: review.id,
      sectionId: "summary.overall",
      body: "A steady week.",
      expectedUpdatedAt: null,
    };

    const first = await accept(h, [item], {
      feature: "review-reflection-draft",
    });
    expect(first[0]?.outcome).toBe("updated");

    const second = await accept(h, [item], {
      feature: "review-reflection-draft",
    });
    expect(second[0]?.ok).toBe(true);
    expect(second[0]?.outcome).toBe("unchanged");
  });

  it("undoes to the exact prior text, and refuses once the owner has typed since", async () => {
    const h = harness(WS);
    const review = await weeklyReview(h);
    const before = await h.reviews.updateSection(
      review.id,
      "summary.overall",
      "What I had written before.",
    );
    const version = before.review.sections.find(
      (entry) => entry.sectionId === "summary.overall",
    )!.updatedAt;

    h.clock.advance(60_000);
    const [applied] = await accept(
      h,
      [
        {
          kind: "review_reflection",
          reviewId: review.id,
          sectionId: "summary.overall",
          body: "The draft, approved.",
          expectedUpdatedAt: version.toISOString(),
        },
      ],
      { feature: "review-reflection-draft" },
    );
    expect(applied?.ok).toBe(true);

    const [undone] = await undo(h, [applied!.undo], {
      feature: "review-reflection-draft",
    });
    expect(undone?.ok).toBe(true);
    const restored = await h.reviews.get(review.id);
    expect(
      restored?.sections.find((entry) => entry.sectionId === "summary.overall")
        ?.body,
    ).toBe("What I had written before.");
  });

  it("refuses an undo that would eat writing done after the apply", async () => {
    const h = harness(WS);
    const review = await weeklyReview(h);
    const [applied] = await accept(
      h,
      [
        {
          kind: "review_reflection",
          reviewId: review.id,
          sectionId: "summary.overall",
          body: "The draft, approved.",
          expectedUpdatedAt: null,
        },
      ],
      { feature: "review-reflection-draft" },
    );
    expect(applied?.ok).toBe(true);

    // The owner keeps writing after accepting, a minute later.
    h.clock.advance(60_000);
    await h.reviews.updateSection(
      review.id,
      "summary.overall",
      "The draft, approved. And then my own additions.",
    );

    const [undone] = await undo(h, [applied!.undo], {
      feature: "review-reflection-draft",
    });
    expect(undone?.ok).toBe(false);
    expect(undone?.outcome).toBe("stale");
    const after = await h.reviews.get(review.id);
    expect(
      after?.sections.find((entry) => entry.sectionId === "summary.overall")
        ?.body,
    ).toBe("The draft, approved. And then my own additions.");
  });

  it("refuses another workspace's Review, indistinguishably from a missing one", async () => {
    const local = harness(WS);
    const foreign = harness(OTHER);
    const theirs = await weeklyReview(foreign);

    const [withForeign] = await accept(
      local,
      [
        {
          kind: "review_reflection",
          reviewId: theirs.id,
          sectionId: "summary.overall",
          body: "Not mine to write.",
          expectedUpdatedAt: null,
        },
      ],
      { feature: "review-reflection-draft" },
    );
    const [withMissing] = await accept(
      local,
      [
        {
          kind: "review_reflection",
          reviewId: "rev-does-not-exist",
          sectionId: "summary.overall",
          body: "Not mine to write.",
          expectedUpdatedAt: null,
        },
      ],
      { feature: "review-reflection-draft" },
    );

    expect(withForeign?.ok).toBe(false);
    expect(withForeign?.message).toBe(withMissing?.message);

    const untouched = await foreign.reviews.get(theirs.id);
    expect(
      untouched?.sections.find((entry) => entry.sectionId === "summary.overall")
        ?.body ?? "",
    ).toBe("");
  });

  it("refuses a section id that is not one of the Review's own", async () => {
    const h = harness(WS);
    const review = await weeklyReview(h);
    const [applied] = await accept(
      h,
      [
        {
          kind: "review_reflection",
          reviewId: review.id,
          sectionId: "summary.secret_admin",
          body: "A draft.",
          expectedUpdatedAt: null,
        },
      ],
      { feature: "review-reflection-draft" },
    );
    expect(applied?.ok).toBe(false);
    expect(applied?.message).toContain("isn’t a section");
  });
});

/* -------------------------------------------------------------------------- */
/* The vocabulary itself                                                       */
/* -------------------------------------------------------------------------- */

describe("an unknown kind is refused, not coerced", () => {
  it("creates nothing for a kind DalyHub does not have", async () => {
    const h = harness(WS);
    const before = await countTasksTitled("Do the thing");

    const applied = await accept(
      h,
      [
        { kind: "update_record", title: "Do the thing" },
        { kind: "transfer_pair", title: "Do the thing" },
        { kind: 42, title: "Do the thing" },
        { title: "Do the thing" },
      ],
      { feature: "meeting-action-extraction" },
    );

    expect(applied.every((entry) => !entry.ok)).toBe(true);
    // The defect this replaces: every one of these used to fall through to
    // `task` and create a record.
    expect(await countTasksTitled("Do the thing")).toBe(before);
  });
});
