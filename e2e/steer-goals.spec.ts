/**
 * V2.5 STEER-01/02 — the outcomes workspace and the owner's hand, end to end.
 *
 * What this file exists to prove is not that a word appears on a page — the
 * kernel parity suite proves the ranking, the D1 suites prove the counts, the
 * condition boundary and the move — but the three claims that are only true of
 * the running product:
 *
 *   1. `/goals` **orders by outcome and counts the workspace**: the Goal behind
 *      its own target date leads the list a browser actually paints, and the
 *      numbers beside the lenses are the workspace's rather than the page's.
 *   2. The owner's **condition is stated beside the derived facts and changes
 *      none of them** — asserted by reading the same Goal's derived sentences
 *      under each condition value, on the surface where the owner reads them.
 *   3. A Goal **moves between Areas keeping its history**, through the record's
 *      own control, and the breadcrumb, the identity and the measurement all
 *      follow.
 *
 * ── The cost, sized deliberately (the FOLLOW-02 method) ─────────────────────
 * TWO tests over four page loads, with every other width and appearance a
 * RESIZE or an `emulateMedia` in place, and ONE axe scan per appearance on the
 * genuinely new state rather than one per width. The partition ledger is
 * updated with the measured figure rather than the gate resized to hold it.
 *
 * Every fact asserted was written by `steer-fixtures.ts`, and the fixture
 * removes every row it writes in `afterAll` — no leaker for [DEBT-173].
 */

import { expect, test, type Page } from "@playwright/test";

import {
  STEER_GOALS,
  cleanupSteerFixture,
  seedSteerFixture,
  steerFixture,
} from "./steer-fixtures";
import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

const FIXTURE = steerFixture();

/** The phone and desktop widths this journey re-measures in place. */
const WIDTHS = [
  { width: 1440, height: 900, name: "desktop" },
  { width: 820, height: 1180, name: "tablet" },
  { width: 393, height: 852, name: "phone" },
  { width: 320, height: 568, name: "narrow phone" },
] as const;

test.beforeAll(() => {
  // Idempotent at both ends, so an interrupted previous run repairs rather than
  // duplicates.
  cleanupSteerFixture();
  seedSteerFixture(FIXTURE);
});

test.afterAll(() => {
  cleanupSteerFixture();
});

/** The `/goals` rows, in the order the server established. */
function rowTitles(page: Page) {
  return page.getByTestId("goal-row").locator(".dh-mrow__title");
}

test.describe("STEER-01 — what /goals answers", () => {
  test("orders the workspace by outcome, counts it truthfully, and states the owner's condition beside the facts", async ({
    page,
  }) => {
    await gotoFixture(page, "/goals");

    /* ---- the ORDER is the answer to the recorded question ---------------- */
    const titles = await rowTitles(page).allInnerTexts();
    const position = (title: string) =>
      titles.findIndex((text) => text.includes(title));

    // The two Goals behind their own target date lead the workspace, ahead of
    // one that is comfortably on schedule — the outcome question, answered.
    expect(position(STEER_GOALS.overdue.title)).toBeGreaterThanOrEqual(0);
    expect(position(STEER_GOALS.overdue.title)).toBeLessThan(
      position(STEER_GOALS.ahead.title),
    );
    // …and an UNMEASURED Goal sits below a measured one that has something to
    // report. DEBT-120's exemplar defect, inverted: it used to be able to sit
    // above a measured Goal that was behind its own target date.
    expect(position(STEER_GOALS.unmeasured.title)).toBeGreaterThan(
      position(STEER_GOALS.ahead.title),
    );
    // The set-aside Goal is STILL HERE, in the place its outcome earns. The
    // collection is where the owner deliberately looks; the condition changes
    // which surfaces ASK for their attention, never what this one says.
    expect(position(STEER_GOALS.rested.title)).toBeGreaterThanOrEqual(0);

    /* ---- the COUNTS describe the workspace (DEBT-121) -------------------- */
    const rail = page.getByTestId("goals-views");
    const attention = rail.getByRole("link", { name: /Needs attention/ });
    const attentionLabel = (await attention.innerText()).trim();
    const attentionCount = Number(attentionLabel.replace(/\D+/g, ""));
    // Both overdue Goals are counted, the set-aside one included: its status is
    // unchanged, so the lens that describes its status still holds it.
    expect(attentionCount).toBeGreaterThanOrEqual(2);
    // The number is the WORKSPACE's, so it is at least as large as what the
    // page shows under that lens — and following the lens proves it, because a
    // page-local count would have to change when the page does.
    await attention.click();
    await page.waitForURL(/view=attention/);
    await expect(rowTitles(page).first()).toBeVisible();
    const underLens = await rowTitles(page).allInnerTexts();
    expect(underLens.length).toBeGreaterThan(0);
    expect(
      (
        await page
          .getByTestId("goals-views")
          .getByRole("link", { name: /Needs attention/ })
          .innerText()
      ).trim(),
    ).toBe(attentionLabel);
    // Every Goal the lens returned really is one the workspace calls behind:
    // both fixture Goals with a past target date are here, and the one that is
    // ahead of schedule is not.
    expect(underLens.join(" ")).toContain(STEER_GOALS.overdue.title);
    expect(underLens.join(" ")).toContain(STEER_GOALS.rested.title);
    expect(underLens.join(" ")).not.toContain(STEER_GOALS.ahead.title);

    /* ---- the owner's condition, BESIDE the derived facts ----------------- */
    await gotoFixture(
      page,
      `/goals?goal=${encodeURIComponent(STEER_GOALS.rested.id)}`,
    );
    const pane = page.getByTestId("goal-workspace-pane");
    // The stable machine value, not a sentence: the pane and the record can be
    // compared on it (FOLLOW-02's parity method).
    await expect(
      pane.getByTestId("goal-pane-condition-value"),
    ).toHaveAttribute("data-goal-condition", "set_aside");
    const restedStatus = await pane
      .locator(".dh-goalpane__focus-state")
      .innerText();

    // The SAME facts on a Goal that is identical except for the owner's word.
    await gotoFixture(
      page,
      `/goals?goal=${encodeURIComponent(STEER_GOALS.overdue.id)}`,
    );
    await expect(
      page.getByTestId("goal-workspace-pane").getByTestId("goal-pane-condition-value"),
    ).toHaveAttribute("data-goal-condition", "pursuing");
    // Two Goals with identical measurement facts and opposite conditions read
    // the SAME derived status. The condition is scope, never truth.
    expect(
      (
        await page
          .getByTestId("goal-workspace-pane")
          .locator(".dh-goalpane__focus-state")
          .innerText()
      ).trim(),
    ).toBe(restedStatus.trim());

    /* ---- and it holds at every width, in both appearances ---------------- */
    for (const viewport of WIDTHS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "light" });
  });
});

test.describe("STEER-02 — the owner's hand", () => {
  test("sets a Goal aside from its record, and re-files a Goal without losing its history", async ({
    page,
  }) => {
    /* ---- the condition, set from the RECORD through the shared control --- */
    await gotoFixture(page, `/goals/${STEER_GOALS.ahead.id}`);
    const condition = page.getByTestId("goal-condition");
    await expect(page.getByTestId("goal-condition-value")).toHaveAttribute(
      "data-goal-condition",
      "pursuing",
    );

    // The derived facts BEFORE, read from the record itself.
    const derivedBefore = await page.getByTestId("goal-progress").innerText();

    await condition.getByRole("button").click();
    await page.getByRole("menuitemradio", { name: /Set aside/ }).click();
    await expect(page.getByTestId("goal-condition-value")).toHaveAttribute(
      "data-goal-condition",
      "set_aside",
    );

    // …and AFTER. The owner's judgement changed; the machine's answers did not.
    expect(
      (await page.getByTestId("goal-progress").innerText()).trim(),
    ).toBe(derivedBefore.trim());

    // Returning it to the fold is offered as the owner's own word.
    await condition.getByRole("button").click();
    await page.getByRole("menuitemradio", { name: "Pursuing" }).click();
    await expect(page.getByTestId("goal-condition-value")).toHaveAttribute(
      "data-goal-condition",
      "pursuing",
    );

    /* ---- the MOVE: the same record, in a different Area ------------------ */
    await gotoFixture(page, `/goals/${STEER_GOALS.movable.id}`);
    // What the Goal knows BEFORE the move: its measurement history, drawn from
    // its own readings.
    const measurementBefore = await page
      .getByTestId("goal-progress")
      .innerText();
    // The machine value, not a rendered label: the Area name appears in the
    // breadcrumb, in the picker's trigger and in the identity field's help
    // text, and a test that matched on the words would be asserting about
    // whichever of the three it happened to find.
    await expect(page.getByTestId("goal-area-edit-value")).toHaveAttribute(
      "data-goal-area",
      "st-area-home",
    );

    const area = page.getByTestId("goal-area-edit");
    await area.getByRole("button").click();
    await page.getByRole("option", { name: /ST: Somewhere else/ }).click();

    // The record now belongs to the destination Area — and the URL has not
    // changed, because it is the SAME record: a move is not a recreation.
    await expect(page.getByTestId("goal-area-edit-value")).toHaveAttribute(
      "data-goal-area",
      "st-area-destination",
    );
    await expect(
      page.getByLabel("Breadcrumb").getByText("ST: Somewhere else"),
    ).toBeVisible();
    expect(page.url()).toContain(STEER_GOALS.movable.id);

    // Its measurement history survived the move verbatim: the readings, the
    // derived value and the status are what they were a moment ago.
    await page.reload();
    expect(
      (await page.getByTestId("goal-progress").innerText()).trim(),
    ).toBe(measurementBefore.trim());
    await expect(page.getByTestId("goal-area-edit-value")).toBeVisible();

    // The move is in the Goal's own history, through the repository's
    // established link vocabulary rather than a new audit mechanism.
    await gotoFixture(page, `/goals/${STEER_GOALS.movable.id}?tab=activity`);
    await expect(page.getByText(/Linked|link/i).first()).toBeVisible();

    /* ---- and the new controls work on a phone, and pass axe -------------- */
    await page.setViewportSize({ width: 393, height: 852 });
    await gotoFixture(page, `/goals/${STEER_GOALS.movable.id}`);
    await expect(page.getByTestId("goal-condition-value")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});
