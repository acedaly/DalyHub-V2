/**
 * V2.5 STEER-03/04 — one Goal story, and the step it points at, end to end.
 *
 * The kernel suites prove the VALUES: `goal-story.test.ts` drives the real
 * `/goals`, Area-record and Review loaders over one workspace and demands their
 * machine facts be equal; `task-next-action.test.ts` proves the repository and
 * the pure rule cannot disagree; `goal-next-action.test.ts` proves the Goal-level
 * composition and the creation loop against real D1. What only the running
 * product can prove is what this file asserts:
 *
 *   1. The Area record's Goals tab PAINTS the shared story — the Goal's own
 *      measurement, its movement, its alignment and the owner's condition —
 *      and paints no Task roll-up as its progress (DEBT-206).
 *   2. Today's project cards name a next action that OPENS the canonical Task,
 *      and a Goal's record names its next step across its Projects (DEBT-77,
 *      DEBT-210).
 *   3. A Goal with no contributing Project offers "New Project for this Goal",
 *      and following it creates one that is contributing structure on reload.
 *
 * ── The cost, sized deliberately (the STEER-01/02 method) ───────────────────
 * THREE tests. Every other width is a RESIZE in place rather than another page
 * load, and there is ONE axe scan per appearance on the genuinely new state
 * rather than one per width. The partition ledger records the measured figure.
 *
 * Every fact asserted was written by `steer-fixtures.ts`, whose cleanup sweeps
 * by title prefix — so the Project this journey CREATES is removed too, and no
 * leaker is left for [DEBT-173].
 */

import { expect, test, type Page } from "@playwright/test";

import {
  HOME_AREA_ID,
  STEER_GOALS,
  STEER_PROJECTS,
  STEER_TASKS,
  cleanupSteerFixture,
  seedSteerFixture,
  touchSteerContinueBand,
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
  { width: 1440, height: 900 },
  { width: 820, height: 1180 },
  { width: 393, height: 852 },
  { width: 320, height: 568 },
] as const;

test.beforeAll(() => {
  cleanupSteerFixture();
  seedSteerFixture(FIXTURE);
});

test.afterAll(() => {
  cleanupSteerFixture();
});

/** One Goal's row, wherever it is drawn, by the machine key every row stamps. */
function storyRow(page: Page, goalId: string) {
  return page.locator(`[data-goal-story="${goalId}"]`);
}

test.describe("STEER-03 — one Goal, one story", () => {
  test("an Area's Goals tab tells the same story /goals tells, and draws no Task roll-up as progress", async ({
    page,
  }) => {
    /* ---- the facts, as `/goals` states them ------------------------------ */
    await gotoFixture(page, "/goals");
    const collectionRow = storyRow(page, STEER_GOALS.overdue.id);
    await expect(collectionRow).toBeVisible();
    const collectionFacts = await collectionRow.evaluate((node) =>
      Object.fromEntries(
        [...node.attributes]
          .filter((attribute) => attribute.name.startsWith("data-goal-"))
          .map((attribute) => [attribute.name, attribute.value]),
      ),
    );
    // The fixture's own facts must actually be present, or "they agree" would
    // be a statement about two empty sets.
    expect(collectionFacts["data-goal-measurement-status"]).toBe("overdue");
    expect(collectionFacts["data-goal-condition"]).toBe("pursuing");

    /* ---- and as the AREA RECORD states them ------------------------------ */
    await gotoFixture(page, `/areas/${HOME_AREA_ID}?tab=goals`);
    const areaRow = storyRow(page, STEER_GOALS.overdue.id);
    await expect(areaRow).toBeVisible();
    const areaFacts = await areaRow.evaluate((node) =>
      Object.fromEntries(
        [...node.attributes]
          .filter((attribute) => attribute.name.startsWith("data-goal-"))
          .map((attribute) => [attribute.name, attribute.value]),
      ),
    );
    // Machine values, not sentences — ADR-111 decision 6's own method.
    expect(areaFacts).toEqual(collectionFacts);

    /* ---- DEBT-206: no third measure, and no fake percentage -------------- */
    const goalsList = page.getByTestId("area-goals-list");
    await expect(goalsList).toBeVisible();
    // The caption that used to sit under every Goal card is gone…
    await expect(goalsList.getByText(/Task roll-up/)).toHaveCount(0);
    // …the roll-up survives as a COUNT, worded as what it is…
    await expect(
      goalsList.getByText(/Projects complete/).first(),
    ).toBeVisible();
    // …and the meter a measured Goal draws is the GOAL's own arithmetic.
    await expect(
      areaRow.getByRole("progressbar", {
        name: `${STEER_GOALS.overdue.title} progress`,
      }),
    ).toBeVisible();
    // An UNMEASURED Goal draws no meter at all, and says why.
    const unmeasuredRow = storyRow(page, STEER_GOALS.unmeasured.id);
    await expect(unmeasuredRow.getByRole("progressbar")).toHaveCount(0);
    await expect(unmeasuredRow.getByText(/No measurement/)).toBeVisible();
    // The owner's condition is stated where the owner meets the Goal.
    await expect(
      storyRow(page, STEER_GOALS.rested.id).getByText("Set aside"),
    ).toBeVisible();

    /* ---- every width, both appearances ----------------------------------- */
    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "light" });
  });

  test("the guided Review's Goals step sees measurement, movement and the owner's condition", async ({
    page,
  }) => {
    /*
     * Create a weekly Review and go straight to its Goals step.
     *
     * `?step=<id>` is the guided flow's own DEEP-LINK contract (REVIEW-04): a
     * real step id renders that step, and anything else canonicalises by
     * redirect. Walking the whole flow to reach one step would make this spec
     * a second copy of `reviews-guided.spec.ts`'s journey and pay for six page
     * loads to assert about the seventh.
     */
    await gotoFixture(page, "/reviews/new");
    const title = `ST: Steering review ${Date.now()}`;
    await page.getByRole("textbox", { name: "Review title" }).fill(title);
    await page.getByRole("button", { name: "Start Review" }).click();
    // The RECORD, named by its own heading — `/reviews/new` matches a lazier
    // "one segment after /reviews" URL check, and a click that did not navigate
    // would sail past one.
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    const reviewUrl = page.url();
    expect(reviewUrl).not.toContain("/reviews/new");
    await gotoFixture(page, `${reviewUrl}/guide?step=alignment`);
    await expect(
      page.getByRole("heading", { level: 2, name: "Goals and Areas" }),
    ).toBeVisible();

    const goalRow = storyRow(page, STEER_GOALS.overdue.id);
    await expect(goalRow).toBeVisible();
    // DEBT-209's two missing facts, present: the measurement status…
    await expect(goalRow).toHaveAttribute(
      "data-goal-measurement-status",
      "overdue",
    );
    // …and FOLLOW-02's movement, in the same words every other surface uses.
    await expect(goalRow).toHaveAttribute(
      "data-goal-movement-available",
      "true",
    );
    // ADR-040's alignment is still there — it is what the step SELECTS on.
    await expect(goalRow.locator(".dh-alignment")).toBeVisible();
    // A Goal the owner set aside is distinguishable from a neglected one, in
    // the ritual itself — the half of STEER-02 that would otherwise survive it.
    await expect(
      storyRow(page, STEER_GOALS.rested.id).getByText("Set aside"),
    ).toBeVisible();

    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "light" });
  });
});

test.describe("STEER-04 — from signal to step", () => {
  /*
   * DEBT-173 — "Continue working" is bounded twice: the twelve most recently
   * UPDATED active Projects are the candidates, and the top THREE of those by
   * last Activity are the cards. This journey asserts that two of this fixture's
   * Projects are in the band, and the `beforeAll` established that minutes
   * earlier against the seed alone. Anything a neighbouring spec touched since
   * has a better claim on both bounds, which is how the two-arrangement proof
   * caught this one. Establishing it here makes the precondition true at the
   * moment it is asserted — see `touchSteerContinueBand`.
   */
  test.beforeEach(() => touchSteerContinueBand());

  test("names the next action on a Goal, opens the canonical Task, and creates the missing Project", async ({
    page,
  }) => {
    /* ---- Today's project cards name what to do next (DEBT-77) ------------ */
    await gotoFixture(page, "/today");
    const card = page
      .getByTestId("today-continue")
      .locator("li", { hasText: STEER_PROJECTS.reportReview.title });
    await expect(card).toBeVisible();
    // The card gains a FACT, not a second subject: the Project's title is still
    // the row's link, and the next action is a quiet line beneath it.
    await expect(
      card.getByRole("link", { name: STEER_PROJECTS.reportReview.title }),
    ).toBeVisible();
    const todayNext = card.getByTestId("next-action");
    await expect(todayNext).toContainText(STEER_TASKS.proofread.title);
    // A Project whose only open Task is WAITING names nothing, and the card
    // renders less rather than inventing a step. The fixture's Activity offsets
    // put it in the top three deliberately, so this branch is exercised rather
    // than assumed.
    const stalled = page
      .getByTestId("today-continue")
      .locator("li", { hasText: STEER_PROJECTS.readingStalled.title });
    await expect(stalled).toBeVisible();
    await expect(stalled.getByTestId("next-action")).toHaveCount(0);
    // It opens the CANONICAL Task, in the Drawer Today already hosts.
    await todayNext.getByRole("link").click();
    await page.waitForURL(/drawer=task/);
    await expect(
      page.getByRole("dialog").getByText(STEER_TASKS.proofread.title).first(),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    /* ---- a Goal names its next step ACROSS its Projects ------------------ */
    await gotoFixture(page, `/goals/${STEER_GOALS.overdue.id}`);
    const nextStep = page.getByTestId("goal-next-step");
    await expect(nextStep).toBeVisible();
    // P1 in the second Project beats P3 in the first — the canonical smart
    // ordering, applied across the Goal's structure rather than within one
    // Project. It names the Project, because the Goal shows several.
    await expect(nextStep).toContainText(STEER_TASKS.proofread.title);
    await expect(nextStep).toContainText(STEER_PROJECTS.reportReview.title);
    await expect(nextStep).not.toContainText(STEER_TASKS.outline.title);

    /* ---- KEYBOARD: the row is reachable and opens the canonical Task ----- */
    const nextLink = nextStep.getByRole("link", {
      name: new RegExp(`Open ${STEER_TASKS.proofread.title}`),
    });
    await nextLink.focus();
    await expect(nextLink).toBeFocused();
    await page.keyboard.press("Enter");
    // The shared Task Drawer, deep-linked through the DS-03 URL contract.
    await page.waitForURL(/drawer=task/);
    await expect(
      page.getByRole("dialog").getByText(STEER_TASKS.proofread.title).first(),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    /* ---- a Goal with WORK but nothing eligible says so ------------------- */
    await gotoFixture(page, `/goals/${STEER_GOALS.ahead.id}`);
    // Its only open Task is waiting on somebody else, so the honest answer is
    // an absence — stated, never filled, and never a fabricated suggestion.
    await expect(page.getByTestId("next-action-absent")).toBeVisible();
    // …and the Goal's derived facts are all still stated beside it.
    await expect(page.getByTestId("goal-progress")).toBeVisible();

    /* ---- a Goal with NO structure is offered the remedy ------------------ */
    await gotoFixture(page, `/goals/${STEER_GOALS.unmeasured.id}`);
    await expect(page.getByTestId("next-action-absent")).toBeVisible();
    const door = page.getByTestId("goal-new-project");
    await expect(door).toBeVisible();

    // Keyboard-reachable, with an accessible name that says what it does.
    await door.focus();
    await expect(door).toBeFocused();
    await page.keyboard.press("Enter");

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    // The parent is DECIDED and stated — no picker to re-find the Goal in.
    await expect(drawer.getByTestId("new-project-parent")).toContainText(
      STEER_GOALS.unmeasured.title,
    );
    await drawer.getByLabel("Title").fill("ST: Created from the Goal");
    await drawer.getByRole("button", { name: /Create|Save/ }).click();

    // The canonical Project record — created through `POST /projects/new`.
    await page.waitForURL(/\/projects\//);
    await expect(
      page.getByRole("heading", { name: "ST: Created from the Goal" }),
    ).toBeVisible();

    /* ---- and the relationship is right on RELOAD ------------------------- */
    await gotoFixture(page, `/goals/${STEER_GOALS.unmeasured.id}`);
    await expect(
      page.getByRole("link", { name: /ST: Created from the Goal/ }).first(),
    ).toBeVisible();
    // The door is gone, because the structural absence it answered is gone.
    await expect(page.getByTestId("goal-new-project")).toHaveCount(0);

    for (const viewport of WIDTHS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "light" });
  });
});
