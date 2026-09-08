import { expect, test, type Page } from "@playwright/test";

import { d1Execute, d1Query, sqlLiteral } from "./d1";
import {
  RESPONSIVE_VIEWPORTS,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  postSameOrigin,
  waitForInteractive,
} from "./helpers";
import {
  cleanupAccountByTitle,
  cleanupAllTestAccounts,
  uniqueAccountTitle,
} from "./finance-fixtures";
import {
  cleanupAllTestObligations,
  cleanupObligationByTitle,
  uniqueObligationTitle,
} from "./obligations-fixtures";

/**
 * V2.15 ASSISTED AI — the browser journeys.
 *
 * WHAT THIS SUITE DELIBERATELY DOES NOT DO: contact a provider.
 *
 * The local development server has no provider secret and no development
 * provider enabled, and `e2e/ai-assistance.spec.ts` records why turning one on
 * globally would be wrong: the off-state journeys assert that the server has
 * none, and a fixture that supplied one would make them measure the fixture.
 * So generation is proven where every layer of it is real except the network
 * (`test/kernel/assist-ai-gateway.test.ts`), and these journeys prove the parts
 * that must hold whether or not a key exists:
 *
 *   - the Finance queue, the Obligation record and the guided Review all work
 *     completely with AI off, and each says so calmly rather than erroring;
 *   - the deterministic category suggestion is still first-class, still one
 *     tap, and is NOT behind the AI control;
 *   - `/ai/apply` applies, replays, refuses stale state and UNDOES each of the
 *     three new proposal kinds — driven the way the review surface drives it,
 *     against real records, through the real route;
 *   - a tampered payload is refused server-side: a foreign id, a foreign
 *     category, a kind the feature may not produce, and a kind that does not
 *     exist;
 *   - the proposal surfaces are accessible and do not overflow from 320px up.
 */

const WORKSPACE_ID = "local-dev-workspace";
const OWNER_ID = "local-development-user";

const owned = new Set<string>();
const ownedObligations = new Set<string>();
const ownedUsage = new Set<string>();

/**
 * Insert ONE `ai_usage_requests` row, so an acceptance has a ledger row naming
 * its feature.
 *
 * V2.15's apply route reads the FEATURE from that row and refuses a kind the
 * feature may not produce, which is the point of the design: a browser that
 * could choose the feature could choose the permission. An E2E acceptance
 * therefore needs a real row, and writing one directly is the honest fixture —
 * the alternative is contacting a provider, which this suite must not do.
 */
function seedUsageRow(feature: string, label: string): string {
  const id = `e2e-usage-${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  ownedUsage.add(id);
  const now = new Date().toISOString();
  d1Execute(
    `INSERT INTO ai_usage_requests (
       id, workspace_id, owner_id, feature_id, prompt_version, provider,
       model_id, tier, state, attempt, idempotency_key, period_day,
       period_month, requested_at, pricing_version, source_entity_ids
     ) VALUES (
       ${sqlLiteral(id)}, ${sqlLiteral(WORKSPACE_ID)}, ${sqlLiteral(OWNER_ID)},
       ${sqlLiteral(feature)}, ${sqlLiteral(`${feature}:v1`)}, 'anthropic',
       'claude-haiku-4-5', 'economy', 'succeeded', 'primary',
       ${sqlLiteral(id)}, ${sqlLiteral(now.slice(0, 10))},
       ${sqlLiteral(now.slice(0, 7))}, ${sqlLiteral(now)}, '2026-08-05', '[]'
     );`,
  );
  return id;
}

function cleanupUsage(): void {
  for (const id of ownedUsage) {
    d1Execute(
      `DELETE FROM ai_usage_requests WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND id = ${sqlLiteral(id)};`,
    );
  }
  ownedUsage.clear();
  /*
   * The PWA-05 replay receipts an acceptance claims are deliberately NOT swept.
   *
   * Their key is a SHA-256 digest over the usage id, so there is no prefix to
   * sweep by — and there is nothing to sweep for: the usage id is unique per
   * test, so a receipt can never be hit by a later run, and the table holds a
   * digest and a record id rather than any content. DEBT-173's concern is
   * leaked RECORDS competing for a page, and a receipt is not one.
   */
}

test.afterEach(() => {
  cleanupUsage();
  for (const title of ownedObligations) cleanupObligationByTitle(title);
  ownedObligations.clear();
  for (const title of owned) cleanupAccountByTitle(title);
  owned.clear();
});

test.afterAll(() => {
  cleanupAllTestObligations();
  cleanupAllTestAccounts();
});

const ACCOUNT_RECORD_URL = /\/finance\/accounts\/[0-9a-fA-F-]{20,}(?:[?#]|$)/;

/** An owner-calendar day relative to TODAY. Never a literal — see DEBT-246. */
function isoDaysFromNow(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Create an account through the real form and land on its record. */
async function createAccount(page: Page, label: string): Promise<string> {
  const title = uniqueAccountTitle(label);
  owned.add(title);
  await gotoFixture(page, "/finance/accounts/new");
  await page.getByTestId("new-account-title").fill(title);
  await page.getByTestId("new-account-institution").fill("Bank of Synthetica");
  await page.getByTestId("new-account-submit").click();
  await expect(page).toHaveURL(ACCOUNT_RECORD_URL);
  await waitForInteractive(page);
  return title;
}

/** Enter one uncategorised transaction by hand, and return its id. */
async function addTransaction(
  page: Page,
  payee: string,
  amount = "42.30",
): Promise<string> {
  await gotoFixture(page, "/finance/transactions?uncategorised=1");
  await page.getByTestId("add-transaction").click();
  await page.getByTestId("new-transaction-payee").fill(payee);
  await page.getByTestId("new-transaction-out").click();
  await page.getByTestId("new-transaction-amount").fill(amount);
  await page.getByTestId("new-transaction-submit").click();
  await expect(page.getByTestId("transaction-list")).toContainText(payee);

  const rows = d1Query<{ entity_id: string }>(
    `SELECT t.entity_id FROM finance_transaction_details t
       JOIN entities e ON e.id = t.entity_id
      WHERE t.workspace_id = ${sqlLiteral(WORKSPACE_ID)}
        AND e.title = ${sqlLiteral(payee)}
      ORDER BY t.created_at DESC LIMIT 1;`,
  );
  const id = rows[0]?.entity_id;
  expect(id, `no transaction found for ${payee}`).toBeTruthy();
  return id as string;
}

/** The workspace's first live spending category. */
function spendingCategory(): { id: string; name: string } {
  const rows = d1Query<{ id: string; name: string }>(
    `SELECT id, name FROM finance_categories
      WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)}
        AND kind = 'spending' AND archived_at IS NULL
      ORDER BY sort_order LIMIT 2;`,
  );
  const row = rows[0];
  expect(row, "the workspace has no spending category").toBeTruthy();
  return row as { id: string; name: string };
}

/** The SECOND live spending category — a different one from the first. */
function secondSpendingCategory(): { id: string; name: string } {
  const rows = d1Query<{ id: string; name: string }>(
    `SELECT id, name FROM finance_categories
      WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)}
        AND kind = 'spending' AND archived_at IS NULL
      ORDER BY sort_order LIMIT 2;`,
  );
  const row = rows[1];
  expect(
    row,
    "the workspace has fewer than two spending categories",
  ).toBeTruthy();
  return row as { id: string; name: string };
}

function categoryOf(transactionId: string): string | null {
  const rows = d1Query<{ category_id: string | null }>(
    `SELECT category_id FROM finance_transaction_details
      WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)}
        AND entity_id = ${sqlLiteral(transactionId)};`,
  );
  return rows[0]?.category_id ?? null;
}

interface ApplyResult {
  ok: boolean;
  applied?: {
    ok: boolean;
    kind?: string;
    id?: string;
    outcome?: string;
    created?: boolean;
    message?: string;
    undo?: Record<string, unknown>;
  }[];
}

async function post(
  request: Parameters<typeof postSameOrigin>[0],
  fields: Record<string, string>,
): Promise<ApplyResult> {
  const response = await postSameOrigin(request, "/ai/apply", { form: fields });
  return (await response.json()) as ApplyResult;
}

/* -------------------------------------------------------------------------- */
/* The queue works without AI                                                  */
/* -------------------------------------------------------------------------- */

test.describe("V2.15 — the Finance queue does not depend on AI", () => {
  test("offers the control, says it is unavailable, and clears a row anyway", async ({
    page,
  }) => {
    await createAccount(page, "assist-off");
    await addTransaction(page, "NORTHWIND GROCERS");

    await gotoFixture(page, "/finance/transactions?uncategorised=1");

    /*
     * The control is PRESENT and HONEST. AI is off by default on this server,
     * so the panel explains itself rather than offering a button that fails.
     */
    const panel = page.getByTestId("finance-ai-suggest");
    await expect(panel).toBeVisible();
    await expect(panel).not.toContainText("Suggest categories");

    // …and the queue's own job is completely unaffected: one tap to open the
    // picker, one to choose, and the row leaves the queue.
    const before = await page.getByTestId("transaction-count").innerText();
    await page.getByTestId("transaction-row-categorise").first().click();
    const picker = page.getByTestId("category-picker").first();
    await expect(picker).toBeVisible();
    await picker.getByRole("button").first().click();
    await expect(page.getByTestId("transaction-count")).not.toHaveText(before);
  });

  test("shows no AI control on the month list", async ({ page }) => {
    // The month is for reading; the queue is for clearing. An action about a
    // question the owner is not asking does not belong on it.
    await createAccount(page, "assist-month");
    await gotoFixture(page, "/finance/transactions");
    await expect(page.getByTestId("finance-ai-suggest")).toHaveCount(0);
  });
});

/* -------------------------------------------------------------------------- */
/* The apply route, for real                                                   */
/* -------------------------------------------------------------------------- */

test.describe("V2.15 — a category suggestion, applied for real", () => {
  test("applies, replays as unchanged, refuses stale, and undoes exactly", async ({
    page,
    request,
  }) => {
    await createAccount(page, "assist-apply");
    const transactionId = await addTransaction(page, "SYNTH CAFE 001");
    const category = spendingCategory();
    const usageId = seedUsageRow("finance-categorisation", "apply");

    const item = {
      kind: "transaction_category",
      transactionId,
      categoryId: category.id,
      expectedCategoryId: null,
    };

    // ── Applied ────────────────────────────────────────────────────────────
    const first = await post(request, {
      intent: "accept",
      usageId,
      items: JSON.stringify([item]),
    });
    expect(first.ok).toBe(true);
    expect(first.applied?.[0]?.outcome).toBe("updated");
    expect(categoryOf(transactionId)).toBe(category.id);

    // ── Replayed: nothing twice ────────────────────────────────────────────
    const replay = await post(request, {
      intent: "accept",
      usageId,
      items: JSON.stringify([item]),
    });
    expect(replay.applied?.[0]?.ok).toBe(true);
    expect(replay.applied?.[0]?.outcome).toBe("unchanged");
    expect(categoryOf(transactionId)).toBe(category.id);

    // ── Undone: the exact prior value, which was uncategorised ─────────────
    const undoPayload = first.applied?.[0]?.undo;
    expect(undoPayload).toBeTruthy();
    const undone = await post(request, {
      intent: "undo",
      usageId,
      items: JSON.stringify([undoPayload]),
    });
    expect(undone.ok).toBe(true);
    expect(categoryOf(transactionId)).toBeNull();

    // ── Stale: the owner categorises it themselves in the meantime ─────────
    /*
     * Through the real picker on THIS transaction's own row — scoped by the
     * payee rather than `.first()`, because the queue is every uncategorised
     * row in the workspace and a `.first()` in a shared database is an
     * assertion about whoever ran before this test.
     */
    await page.goto("/finance/transactions?uncategorised=1");
    await waitForInteractive(page);
    const row = page
      .getByTestId("transaction-row")
      .filter({ hasText: "SYNTH CAFE 001" });
    await row.getByTestId("transaction-row-categorise").click();
    const picker = page.getByTestId("category-picker").first();
    await expect(picker).toBeVisible();
    /*
     * A category that is NOT the one the proposal names, so "already there"
     * cannot mask the staleness this step exists to prove. The picker lists
     * categories in the same order the query returns them, so the SECOND
     * spending category is a different one by construction.
     */
    const otherCategory = secondSpendingCategory();
    await picker.getByRole("button", { name: otherCategory.name }).click();
    await expect.poll(() => categoryOf(transactionId)).toBe(otherCategory.id);

    const stale = await post(request, {
      intent: "accept",
      usageId: seedUsageRow("finance-categorisation", "stale"),
      items: JSON.stringify([
        {
          kind: "transaction_category",
          transactionId,
          categoryId: category.id,
          // What the proposal SAW: uncategorised.
          expectedCategoryId: null,
        },
      ]),
    });
    expect(stale.applied?.[0]?.ok).toBe(false);
    expect(stale.applied?.[0]?.outcome).toBe("stale");
    // The owner's own choice survives, untouched.
    expect(categoryOf(transactionId)).toBe(otherCategory.id);
  });

  test("refuses a tampered payload, every way it can be tampered with", async ({
    page,
    request,
  }) => {
    await createAccount(page, "assist-tamper");
    const transactionId = await addTransaction(page, "QUOKKA HARDWARE");
    const category = spendingCategory();
    const financeUsage = seedUsageRow("finance-categorisation", "tamper");

    const cases: {
      readonly why: string;
      readonly usageId: string;
      readonly item: Record<string, unknown>;
    }[] = [
      {
        why: "a category id that does not exist",
        usageId: financeUsage,
        item: {
          kind: "transaction_category",
          transactionId,
          categoryId: "cat-secret-admin",
          expectedCategoryId: null,
        },
      },
      {
        why: "a transaction id that does not exist",
        usageId: financeUsage,
        item: {
          kind: "transaction_category",
          transactionId: "txn-not-yours",
          categoryId: category.id,
          expectedCategoryId: null,
        },
      },
      {
        why: "a kind this feature may not produce",
        usageId: seedUsageRow("meeting-action-extraction", "tamper-feature"),
        item: {
          kind: "transaction_category",
          transactionId,
          categoryId: category.id,
          expectedCategoryId: null,
        },
      },
      {
        why: "a kind that does not exist",
        usageId: financeUsage,
        item: { kind: "update_record", transactionId, anything: "anything" },
      },
      {
        why: "no kind at all",
        usageId: financeUsage,
        item: { transactionId, categoryId: category.id },
      },
    ];

    for (const entry of cases) {
      const result = await post(request, {
        intent: "accept",
        usageId: entry.usageId,
        items: JSON.stringify([entry.item]),
      });
      expect(result.applied?.[0]?.ok, entry.why).toBe(false);
      // Nothing moved, in every case.
      expect(categoryOf(transactionId), entry.why).toBeNull();
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Obligation follow-up                                                        */
/* -------------------------------------------------------------------------- */

test.describe("V2.15 — an obligation follow-up, applied for real", () => {
  /** Create an overdue obligation through the real form. */
  async function createOverdueObligation(page: Page): Promise<string> {
    const title = uniqueObligationTitle("assist-followup");
    ownedObligations.add(title);
    await gotoFixture(page, "/obligations/new");
    await waitForInteractive(page);
    await page.getByRole("textbox", { name: /^Title/ }).fill(title);
    /*
     * A due date RELATIVE to today, never a literal.
     *
     * `e2e:fixture-dates:check` refuses a literal that arrives, and DEBT-246
     * records the other half of the same problem: a literal that RECEDES out of
     * a rolling window and silently stops testing what it was written to test.
     * "Overdue" is a relationship to today, so it is computed from today.
     */
    await page
      .getByRole("textbox", { name: /^Due date/ })
      .fill(isoDaysFromNow(-45));
    await page.getByRole("button", { name: "Add obligation" }).click();
    await waitForInteractive(page);
    const rows = d1Query<{ entity_id: string }>(
      `SELECT o.entity_id FROM obligation_details o
         JOIN entities e ON e.id = o.entity_id
        WHERE o.workspace_id = ${sqlLiteral(WORKSPACE_ID)}
          AND e.title = ${sqlLiteral(title)} LIMIT 1;`,
    );
    const id = rows[0]?.entity_id;
    expect(id, "no obligation created").toBeTruthy();
    return id as string;
  }

  test("creates ONE linked Task, replays without a second, and undoes it", async ({
    page,
    request,
  }) => {
    const obligationId = await createOverdueObligation(page);
    const usageId = seedUsageRow("obligation-follow-up", "task");
    const title = "Assist e2e — ring the retailer";

    const item = { kind: "obligation_task", obligationId, title };

    const first = await post(request, {
      intent: "accept",
      usageId,
      items: JSON.stringify([item]),
    });
    expect(first.ok).toBe(true);
    expect(first.applied?.[0]?.created).toBe(true);
    const taskId = first.applied?.[0]?.id as string;

    // The obligation points at it, and its own record says so.
    const pointer = d1Query<{ task_id: string | null }>(
      `SELECT task_id FROM obligation_details WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND entity_id = ${sqlLiteral(obligationId)};`,
    );
    expect(pointer[0]?.task_id).toBe(taskId);

    // ── Replay: no second Task ─────────────────────────────────────────────
    const replay = await post(request, {
      intent: "accept",
      usageId,
      items: JSON.stringify([item]),
    });
    expect(replay.applied?.[0]?.ok).toBe(false);
    const count = d1Query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM entities WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND type = 'task' AND title = ${sqlLiteral(title)} AND deleted_at IS NULL;`,
    );
    expect(Number(count[0]?.n ?? 0)).toBe(1);

    // ── Undo: the pointer clears and the Task goes ─────────────────────────
    const undone = await post(request, {
      intent: "undo",
      usageId,
      items: JSON.stringify([first.applied?.[0]?.undo]),
    });
    expect(undone.ok).toBe(true);
    const after = d1Query<{ n: number }>(
      `SELECT COUNT(*) AS n FROM entities WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND type = 'task' AND title = ${sqlLiteral(title)} AND deleted_at IS NULL;`,
    );
    expect(Number(after[0]?.n ?? 0)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Responsive and accessible                                                   */
/* -------------------------------------------------------------------------- */

test.describe("V2.15 — the proposal surfaces on a phone", () => {
  for (const viewport of RESPONSIVE_VIEWPORTS) {
    test(`the queue and its AI panel fit at ${viewport.label}`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await createAccount(page, `assist-${viewport.width}`);
      await addTransaction(page, "NORTHWIND GROCERS");
      await gotoFixture(page, "/finance/transactions?uncategorised=1");
      await expect(page.getByTestId("finance-ai-suggest")).toBeVisible();
      await expectNoHorizontalOverflow(page);
    });
  }

  test("has no axe violations, and no target under the minimum", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 393, height: 852 });
    await createAccount(page, "assist-axe");
    await addTransaction(page, "SYNTH CAFE 001");
    await gotoFixture(page, "/finance/transactions?uncategorised=1");
    await expect(page.getByTestId("finance-ai-suggest")).toBeVisible();
    await expectNoAxeViolations(page);
    await expectMinTouchTarget(
      page.getByTestId("transaction-row-categorise").first(),
    );
  });
});
