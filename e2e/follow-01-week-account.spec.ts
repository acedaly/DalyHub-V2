/**
 * V2.4 FOLLOW-01 — "did the week hold?", end to end.
 *
 * ONE derivation, TWO consumers. The claim this file exists to prove is not that
 * a number appears on a page — the kernel matrix and the D1 integration test
 * already prove the arithmetic — but that **Weekly Planning and the weekly
 * Review account for the same week from the same facts**, that the account
 * survives a reload, and that it is legible and operable on a phone.
 *
 * Every figure asserted here was written by `follow-01-fixtures.ts`, whose week
 * is CLOSED (last week) precisely so that nothing else in the suite can change
 * it: no other spec can plan or complete a Task in the past. The fixture removes
 * every row it writes in `afterAll`, so this file adds no leaker to the 217
 * PR #227 measured.
 */

import { expect, test, type Page } from "@playwright/test";

import {
  cleanupFollowFixture,
  followFixture,
  seedFollowFixture,
} from "./follow-01-fixtures";
import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

const FIXTURE = followFixture();

/**
 * The outcome each of the fixture's nine Tasks must be given, and the sentence
 * it must carry. Every one of these is EXACT and stable: they are facts about
 * rows this file wrote.
 *
 * `FW: withdrawn after the week` is the one that vanished entirely before
 * FOLLOW-01 — its plan now points outside the week and it has no event inside
 * it, so only the withdrawn-after-the-period arm of the window read can find it.
 */
const EXPECTED_ENTRIES: ReadonlyArray<
  readonly [title: string, outcome: string, reason: RegExp]
> = [
  ["FW: held its day", "kept", /done on/i],
  ["FW: done later than planned", "completed_late", /done on/i],
  ["FW: moved twice", "carried", /after moving 2 times/i],
  ["FW: taken off the plan", "cleared", /taken off the plan/i],
  ["FW: left unfinished", "carried", /still open/i],
  ["FW: moved into the week", "carried", /after moving once/i],
  ["FW: moved out of the week", "moved_out", /outside this/i],
  ["FW: done without a plan", "unplanned", /without being planned/i],
  ["FW: withdrawn after the week", "carried", /still open/i],
];

/**
 * The counts NO OTHER fixture in the suite can contribute to, and their exact
 * values.
 *
 * The shared workspace's committed seed carries fixed `scheduled_date` values
 * scattered through the calendar, so which of them happen to fall in "last week"
 * depends on the day the suite runs — a moving target, and asserting an absolute
 * total against it would be asserting against accumulated state (DEBT-173). But
 * every outcome below needs an EVENT the seed does not write: a completion, a
 * reschedule or a cleared plan inside the period. So these five figures are this
 * fixture's alone, and they are asserted exactly rather than loosely.
 *
 * The one outcome the seed CAN reach — work simply left open — is asserted a
 * different way, against the rows the surface itself draws.
 */
const EXCLUSIVE_FACTS: ReadonlyArray<readonly [string, number]> = [
  ["kept", 1],
  ["late", 1],
  ["moved-out", 1],
  ["cleared", 1],
  ["unplanned", 1],
];

/** Every fact key the account can print, so the two surfaces can be compared. */
const ALL_FACT_KEYS = [
  "kept",
  "early",
  "late",
  "ahead",
  "open",
  "moved-out",
  "cleared",
  "dropped",
  "unplanned",
] as const;

test.beforeAll(() => {
  seedFollowFixture(FIXTURE);
});

test.afterAll(() => {
  cleanupFollowFixture();
});

/** Open last week's plan and reveal its account. */
async function openPlanAccount(page: Page) {
  await gotoFixture(page, "/plan?week=-1");
  const headline = page.getByTestId("plan-account-headline");
  await expect(headline).toBeVisible();
  await page.getByTestId("plan-account-toggle").click();
  const panel = page.getByTestId("plan-account-panel");
  await expect(panel).toBeVisible();
  return { headline, panel };
}

/** Every fact line the surface currently prints, keyed. Absent lines read zero,
 * because the account omits every zero rather than drawing it. */
async function readAllFacts(page: Page): Promise<Record<string, number>> {
  const result: Record<string, number> = {};
  for (const key of ALL_FACT_KEYS) {
    const locator = page.locator(`[data-account-fact="${key}"]`).first();
    result[key] =
      (await locator.count()) === 0 ? 0 : await factCount(page, key);
  }
  return result;
}

/** Read a fact line's count out of a surface, by its stable machine key. */
async function factCount(page: Page, key: string): Promise<number> {
  const value = page.locator(`[data-account-fact="${key}"]`).first();
  await expect(value).toBeVisible();
  return Number((await value.innerText()).trim());
}

test.describe("the week you committed to", () => {
  test("accounts for last week exactly, and names the records behind every figure", async ({
    page,
  }) => {
    const { headline, panel } = await openPlanAccount(page);

    /*
     * The five figures only this fixture can produce, exactly. Each one needs an
     * EVENT inside the period — a completion, a reschedule or a cleared plan —
     * and the committed seed writes none.
     */
    for (const [key, count] of EXCLUSIVE_FACTS) {
      expect(await factCount(page, key), key).toBe(count);
    }

    /*
     * The sentence and the lines behind it must AGREE. This is the assertion
     * that makes the denominator meaningful without depending on which of the
     * shared seed's fixed dates happen to fall in last week today: whatever the
     * week held, the headline's total is the sum of its outcome lines, and the
     * detail list draws exactly that many rows.
     */
    const counts = await Promise.all(
      ALL_FACT_KEYS.map(async (key) =>
        (await page.locator(`[data-account-fact="${key}"]`).count()) === 0
          ? 0
          : factCount(page, key),
      ),
    );
    const unplanned = counts[ALL_FACT_KEYS.indexOf("unplanned")];
    const held = counts.reduce((sum, value) => sum + value, 0) - unplanned;
    await expect(headline).toContainText(`This week's plan held ${held} Tasks`);
    await expect(headline).toContainText("2 done (1 on the day planned)");
    await expect(headline).toContainText("1 moved out");
    await expect(headline).toContainText("1 taken off the plan");
    await expect(headline).toContainText(
      "1 Task was completed without being planned for it",
    );
    await expect(panel.locator("li[data-outcome]")).toHaveCount(
      held + unplanned,
    );

    // No score, no grade, no percentage — ADR-110 decision 4, on the surface.
    const accountText = `${await headline.innerText()} ${await panel.innerText()}`;
    expect(accountText).not.toMatch(/%/);
    expect(accountText).not.toMatch(/\b(score|grade|streak|adherence)\b/i);

    // Movement is a COUNT, not a boolean: three Tasks moved four times between
    // them (twice for one, once each for two others), and one came in.
    await expect(headline).toContainText(
      "3 Tasks moved to another day 4 times between them",
    );
    await expect(headline).toContainText(
      "1 Task came into the week from another day",
    );

    for (const [title, outcome, reason] of EXPECTED_ENTRIES) {
      const entry = panel
        .locator("li[data-outcome]", { hasText: title })
        .first();
      await expect(entry, title).toBeVisible();
      await expect(entry, title).toHaveAttribute("data-outcome", outcome);
      await expect(entry, title).toContainText(reason);
      // Every figure is drillable: the name is a link to the record itself.
      await expect(entry.getByRole("link", { name: title })).toHaveAttribute(
        "href",
        /\/tasks\?task=/,
      );
    }
  });

  test("survives a reload, because it is derived rather than remembered", async ({
    page,
  }) => {
    const { headline } = await openPlanAccount(page);
    const before = await headline.innerText();

    await page.reload();
    const after = page.getByTestId("plan-account-headline");
    await expect(after).toBeVisible();
    expect(await after.innerText()).toBe(before);

    // The disclosure is closed again — the account is a statement at rest — and
    // the detail is still one press away with the same figures behind it.
    await expect(page.getByTestId("plan-account-toggle")).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await page.getByTestId("plan-account-toggle").click();
    expect(await factCount(page, "kept")).toBe(1);

    /*
     * And a week with NO plan at all, in the same journey rather than a second
     * one: NEXT week holds nothing this fixture planned and has not happened. It
     * must read as a plan rather than as a failure, and it must not draw a table
     * of zeroes.
     */
    await gotoFixture(page, "/plan?week=1");
    const empty = page.getByTestId("plan-account-headline");
    await expect(empty).toBeVisible();
    const text = await empty.innerText();
    expect(text).not.toMatch(/left unfinished|failed|missed/i);
    expect(text).toMatch(/planned for this week/i);
    // An empty account renders LESS, not a heading over nothing: there is no
    // detail disclosure at all when the week's plan held nothing.
    if (/^Nothing is planned/.test(text)) {
      await expect(page.getByTestId("plan-account-toggle")).toHaveCount(0);
    }
  });

  test("is accessible, and fits a phone", async ({ page }) => {
    // 393 — the iPhone 15 width, and the phone tier the composition is built for.
    await page.setViewportSize({ width: 393, height: 850 });
    const { panel } = await openPlanAccount(page);
    await expectNoHorizontalOverflow(page);

    // A drill-down is a real touch target on a coarse pointer, like every other
    // link on this surface.
    await expectMinTouchTarget(
      panel.getByRole("link", { name: "FW: held its day" }),
    );
    await expectNoAxeViolations(page);

    // 320 — the narrowest width the product supports.
    await page.setViewportSize({ width: 320, height: 850 });
    await expectNoHorizontalOverflow(page);
    await expect(page.getByTestId("plan-account-headline")).toBeVisible();

    /*
     * And the desktop composition, in the dark appearance, driven by the MEDIA
     * QUERY rather than the appearance cookie — DHDS-13 §9's method note exists
     * because that mistake produced a complete set of "dark" frames that were
     * entirely light. No navigation: a resize and a media change re-evaluate in
     * place, and the disclosure this page already opened stays open, so the scan
     * still covers the account's own state.
     */
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(panel).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "light" });
  });
});

test.describe("the week you had", () => {
  test("accounts for the SAME week, with the same facts, and states routine consistency", async ({
    page,
  }) => {
    await gotoFixture(page, `/reviews/${FIXTURE.reviewId}?tab=progress`);

    const account = page.getByTestId("review-plan-account");
    await expect(account).toBeVisible();
    const headline = page.getByTestId("review-plan-headline");
    await expect(headline).toContainText("2 done (1 on the day planned)");
    await expect(headline).toContainText("1 moved out");
    await expect(headline).toContainText("1 taken off the plan");
    await expect(page.getByTestId("review-plan-movement")).toContainText(
      "moved to another day",
    );

    for (const [key, count] of EXCLUSIVE_FACTS) {
      expect(await factCount(page, key), `review:${key}`).toBe(count);
    }

    // DEBT-156 — the Review said nothing about routines before this. Mon/Wed/Fri
    // asked for three check-ins; the fixture recorded two of them.
    const routines = page.locator('[data-section="habits"]');
    await expect(routines).toBeVisible();
    await expect(routines).toContainText("2 of 3 scheduled check-ins");
    // Two integers with their window, never a proportion (ADR-102 §8).
    expect(await routines.innerText()).not.toMatch(/%/);

    await expectNoAxeViolations(page);

    /*
     * The same account on a phone, WITHOUT leaving the page: the Review's
     * evidence surface is one column at every width, so a resize is the whole of
     * the phone claim and a second navigation would only re-fetch it.
     */
    await page.setViewportSize({ width: 393, height: 850 });
    await expect(page.getByTestId("review-plan-headline")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    expect(await factCount(page, "kept")).toBe(1);
    await page.setViewportSize({ width: 1280, height: 900 });

    /*
     * The claim of the whole item: ONE derivation, TWO consumers. Every outcome
     * count the Review reports for this period is the count the PLANNER reports
     * for the same week — read from the same machine keys on both surfaces,
     * rather than from two sets of words that happen to agree today. Read from
     * the Review LAST, then navigated to the planner, so both readings describe
     * the same database at the same moment.
     */
    const fromReview = await readAllFacts(page);
    await openPlanAccount(page);
    expect(await readAllFacts(page)).toEqual(fromReview);
  });
});
