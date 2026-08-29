/**
 * V2.5 STEER-05 — the week's door, end to end.
 *
 * DEBT-34's remaining half: *"the weekly Review has no entry point on the
 * screen the owner opens every day."* The kernel suite
 * (`test/kernel/today-review-door.test.ts`) proves the STATES and the budget
 * against real D1, and the two unit suites prove the pure rule and the
 * single-period-authority shape. What only the running product can prove is
 * what this file asserts:
 *
 *   1. **The offer is real and it moves.** From nothing, Today offers Start;
 *      following it creates this week's Review and the SAME door then offers
 *      Continue into the guided flow; completing it leaves the recorded quiet
 *      completed state, with no urging anywhere.
 *   2. **The two surfaces name the same week.** Today's period label and
 *      `/reviews/new`'s own period preview are compared as VALUES on the
 *      running product — the structural guard says they read one authority,
 *      this says the owner sees one week.
 *
 * ── The cost, sized deliberately (the STEER-03/04 method) ───────────────────
 * ONE test. The three states are three points on one journey rather than three
 * page loads of setup, every width is a RESIZE in place, and there is one axe
 * scan per appearance — on the completed state, which is the genuinely new one
 * a scan has never seen. The partition ledger records the measured figure.
 *
 * Every fact this journey asserts is a fact it created. `clearCurrentWeeklyReviews`
 * runs at both ends, so the Review it starts is removed and no leaker is left
 * for [DEBT-173].
 */

import { expect, test, type Locator } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";
import { clearCurrentWeeklyReviews } from "./steer-week-door-fixtures";

/** The widths this journey re-measures in place, with the door present. */
const WIDTHS = [
  { width: 1440, height: 900 },
  { width: 820, height: 1180 },
  { width: 393, height: 852 },
  { width: 320, height: 568 },
] as const;

test.beforeAll(() => {
  clearCurrentWeeklyReviews();
});

test.afterAll(() => {
  clearCurrentWeeklyReviews();
});

test.describe("STEER-05 — the week's door", () => {
  test("Today offers this week's Review: start it, continue it, then read the finished one", async ({
    page,
  }) => {
    /* ---- 1. with no Review for the week, Today offers Start -------------- */
    await gotoFixture(page, "/today");
    const door = page.getByTestId("today-review-door");
    await expect(door).toBeVisible();
    await expect(door).toHaveAttribute("data-state", "start");
    await expect(
      door.getByRole("heading", { name: "This week’s Review" }),
    ).toBeVisible();

    // The wording names the PERIOD — criterion 1.
    const periodLabel = (
      await door.locator(".dh-today__review-door-period").innerText()
    ).trim();
    expect(periodLabel).toMatch(/\d/);

    const startLink = door.getByTestId("today-review-door-action");
    // The accessible name carries the period too, so a link list is not four
    // identical-sounding "Start" links.
    await expect(startLink).toHaveAccessibleName(
      new RegExp(
        `Start this week’s Review\\s*,\\s*${escapeForRegExp(periodLabel)}`,
      ),
    );

    // Nothing on the door urges. The calm rules are the item's explicit
    // non-goals, and this is where a badge or an "overdue" would show up.
    await expectNoUrging(door);

    /* ---- KEYBOARD: the door is reachable and operable ------------------- */
    await startLink.focus();
    await expect(startLink).toBeFocused();
    await page.keyboard.press("Enter");

    /* ---- 2. it lands on the Reviews module's own creation surface -------- */
    await page.waitForURL(/\/reviews\/new$/);
    await expect(
      page.getByRole("heading", { name: "New Review" }),
    ).toBeVisible();
    // Weekly is already the selected cadence…
    await expect(page.getByRole("radio", { name: "Weekly" })).toBeChecked();
    // …and the period it opens on is THE SAME WEEK Today just named. Two
    // surfaces, one `currentReviewPeriod`, one owner preference — asserted as
    // the values a person actually reads.
    await expect(page.locator(".dh-review-period-preview")).toHaveText(
      periodLabel,
    );

    const title = `Reviews e2e review week-door-${Date.now()}`;
    await page.getByRole("textbox", { name: "Review title" }).fill(title);
    await page.getByRole("button", { name: "Start Review" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    const reviewUrl = new URL(page.url()).pathname;
    expect(reviewUrl).not.toContain("/reviews/new");

    /* ---- 3. the SAME door now offers Continue ---------------------------- */
    await gotoFixture(page, "/today");
    await expect(door).toHaveAttribute("data-state", "continue");
    await expect(door.locator(".dh-today__review-door-period")).toHaveText(
      periodLabel,
    );
    const continueLink = door.getByTestId("today-review-door-action");
    await expect(continueLink).toHaveAccessibleName(
      new RegExp(
        `Continue this week’s Review\\s*,\\s*${escapeForRegExp(periodLabel)}`,
      ),
    );
    await expectNoUrging(door);

    /* ---- every width, with the entry PRESENT in this state --------------- */
    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport);
      await expect(door).toBeVisible();
      await expect(continueLink).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 1440, height: 900 });

    /* ---- 4. Continue resumes the guided flow's own position -------------- */
    await continueLink.click();
    // `/reviews/:id/guide` resolves the owner's resume step and REDIRECTS to a
    // canonical step URL. Today names no step and holds no bookmark: the
    // resume semantics are the guided flow's, untouched.
    await page.waitForURL(new RegExp(`${escapeForRegExp(reviewUrl)}/guide`));
    await expect(page).toHaveURL(/[?&]step=/);

    /* ---- 5. complete it, and the door goes quiet ------------------------- */
    await gotoFixture(page, reviewUrl);
    await page.getByRole("button", { name: "Complete" }).click();
    await expect(
      page.locator(".record-status", { hasText: /^Completed$/ }),
    ).toBeVisible();

    await gotoFixture(page, "/today");
    await expect(door).toHaveAttribute("data-state", "completed");
    // The recorded decision: a quiet completed state, not an absence — and a
    // way back IN, to the canonical record rather than to the guided flow.
    await expect(door).toContainText("This week’s Review is done.");
    const readLink = door.getByTestId("today-review-door-action");
    await expect(readLink).toHaveAttribute("href", reviewUrl);
    // A period with a completed Review never renders an urging — criterion 4.
    await expectNoUrging(door);
    await expect(door.locator(".dh-today__review-door-period")).toHaveText(
      periodLabel,
    );

    /* ---- every width again, in the state a scan has never seen ----------- */
    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport);
      await expect(door).toBeVisible();
      await expect(readLink).toBeVisible();
      await expectNoHorizontalOverflow(page);
    }

    /* ---- light and dark, axe clean, no rule disabled -------------------- */
    await page.setViewportSize({ width: 1440, height: 900 });
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expect(door).toBeVisible();
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "light" });
  });
});

/** Escape a literal for use inside a `RegExp`. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The calm rules, asserted rather than intended.
 *
 * STEER-05's explicit non-goals: no notification, no badge, no urgency colour,
 * no count, and a Review the owner never starts is never described as overdue
 * or missed. The vocabulary check is the cheap, durable half of that — a
 * future edit that reached for "overdue" or "3 weeks since your last Review"
 * fails here.
 */
async function expectNoUrging(door: Locator): Promise<void> {
  const text = (await door.innerText()).toLowerCase();
  for (const word of [
    "overdue",
    "missed",
    "late",
    "behind",
    "streak",
    "don’t break",
    "don't break",
    "in a row",
  ]) {
    expect(text, `the week's door must never say "${word}"`).not.toContain(
      word,
    );
  }
}
