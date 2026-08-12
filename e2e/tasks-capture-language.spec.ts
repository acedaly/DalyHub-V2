import { expect, test, type Locator, type Page } from "@playwright/test";

import { completeTaskRow, gotoFixture, ownerToday } from "./helpers";

/**
 * TASKS-11 — the deterministic capture journey, end to end through the real UI.
 *
 * One sentence is typed into the ordinary quick-add row, and the product is asked to
 * prove three things about it without any further interaction:
 *
 *   1. the TITLE survives — "Service Hilux", not "Service Hilux every" and not
 *      "Service Hilux after completion";
 *   2. the RULE is the canonical TASKS-07 one, stated in the SAME words the recurrence
 *      editor states it in ("6 months after completion" — the one shared formatter);
 *   3. completing it produces the successor the after-completion engine computes, from
 *      the day the work was finished.
 *
 * A regression journey then types an ordinary repeat and proves it is still a FIXED
 * schedule, and a third proves that a sentence which merely RESEMBLES the vocabulary
 * is left completely alone.
 *
 * Every task is stamped `E2E …` so the seed clears it at the start of each run, and
 * nothing is filed into a Project another journey asserts about.
 */

const RUN = Date.now();

/** The `/tasks` list, most-recent first, so a just-captured task is at the top. */
const LIST = "/tasks?view=list&system=all&sort=created&dir=desc";

/** Today on the OWNER's calendar — never the runner's UTC day (ADR-022). */
const TODAY = ownerToday();

/** Capture a task through the in-workspace quick-add row. */
async function quickAdd(page: Page, text: string) {
  const field = page.getByTestId("tasks-quickadd-input");
  await field.fill(text);
  await field.press("Enter");
  await expect(field).toHaveValue("");
  await page.waitForLoadState("networkidle");
}

/** The card for a task title, by its stable open-control accessible name. */
function cardFor(page: Page, title: string) {
  return page.getByRole("article", { name: `Open ${title}` });
}

/**
 * The same calendar arithmetic the kernel's monthly rule performs, so the expected
 * successor date is computed rather than hard-coded against a run date: add whole
 * months and CLAMP into a short month (31 August + 6 → 28/29 February).
 */
function addMonthsClamped(iso: string, months: number): string {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  const index = month - 1 + months;
  const targetYear = year + Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  const lastDay = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const targetDay = Math.min(day, lastDay);
  return `${targetYear}-${String(targetMonth).padStart(2, "0")}-${String(targetDay).padStart(2, "0")}`;
}

/** "13 Feb 2027" — the product's own hydration-safe calendar wording. */
function calendarText(iso: string): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  return `${Number(iso.slice(8, 10))} ${months[Number(iso.slice(5, 7)) - 1]} ${iso.slice(0, 4)}`;
}

/**
 * Open a task's canonical record Drawer from a specific ROW.
 *
 * The row is passed in rather than looked up by title, because after a recurring
 * occurrence is completed its successor carries the SAME title — so "the card for
 * this title" is genuinely ambiguous at exactly the moment the journey cares most.
 */
async function openRecord(page: Page, card: Locator, title: string) {
  await card.getByRole("link", { name: `Open ${title}` }).click();
  const drawer = page.getByRole("dialog", { name: "Task" });
  await expect(drawer).toBeVisible();
  return drawer;
}

test.describe("TASKS-11 — deterministic natural-language capture", () => {
  test.describe.configure({ timeout: 120_000 });

  test("captures an after-completion routine and completes it into the computed successor", async ({
    page,
  }) => {
    const title = `E2E Service Hilux ${RUN}`;
    await gotoFixture(page, LIST);
    await quickAdd(page, `${title} every 6 months after completion`);

    // 1. The title is EXACTLY what the owner meant — the card is found by it.
    const card = cardFor(page, title);
    await expect(card).toBeVisible();

    // 2. The rule is stated on the row in the one shared vocabulary.
    await expect(card).toContainText("6 months after completion");

    // …and on the record, alongside the first occurrence's date: an interval measured
    // from completion starts on the day the owner asked for it.
    const drawer = await openRecord(page, card, title);
    await expect(drawer).toContainText("6 months after completion");
    await expect(drawer).toContainText(calendarText(TODAY));
    await page.keyboard.press("Escape");

    // 3. Completing it creates exactly ONE successor, through the TASKS-07 engine.
    await gotoFixture(page, LIST);
    await completeTaskRow(cardFor(page, title).first(), title);
    await expect(
      page.locator("[role='status']").filter({ hasText: /next occurrence/i }),
    ).toBeAttached();

    await gotoFixture(page, LIST);
    const open = page
      .getByRole("article", { name: `Open ${title}` })
      .filter({ hasNotText: "Completed" });
    await expect(open).toHaveCount(1);
    await expect(open.first()).toContainText("6 months after completion");

    // The successor is six months from the COMPLETION day, not from the original's
    // date — which is the entire difference the mode expresses.
    const successor = await openRecord(page, open.first(), title);
    await expect(successor).toContainText(
      calendarText(addMonthsClamped(TODAY, 6)),
    );
  });

  test("keeps an ordinary repeat on its FIXED schedule", async ({ page }) => {
    const title = `E2E Pay rent ${RUN}`;
    await gotoFixture(page, LIST);
    await quickAdd(page, `${title} tomorrow every month`);

    const card = cardFor(page, title);
    await expect(card).toBeVisible();
    // The existing wording, unchanged — and emphatically NOT the interval wording.
    await expect(card).toContainText("Every month");
    await expect(card).not.toContainText("after completion");

    const drawer = await openRecord(page, card, title);
    await expect(drawer).toContainText("Every month");
    await expect(drawer).not.toContainText("after completion");
  });

  test("leaves a sentence that merely RESEMBLES the vocabulary completely alone", async ({
    page,
  }) => {
    const title = `E2E Discuss monthly report format ${RUN}`;
    await gotoFixture(page, LIST);
    await quickAdd(page, title);

    // Found by the WHOLE sentence: not one word was taken for metadata.
    const card = cardFor(page, title);
    await expect(card).toBeVisible();
    await expect(card).not.toContainText("after completion");

    const drawer = await openRecord(page, card, title);
    await expect(drawer).toContainText("Does not repeat");
  });
});
