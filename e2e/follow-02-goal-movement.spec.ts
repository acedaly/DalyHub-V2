/**
 * V2.4 FOLLOW-02 — "did the goals move?", end to end.
 *
 * ONE derivation, THREE consumers. The claim this file exists to prove is not
 * that a sentence appears on a page — the kernel matrix and the D1 integration
 * test already prove the arithmetic — but that **Today, the Goals collection
 * and the Goal record answer the same question about the same Goal from the
 * same facts**, and that a Goal carrying no number is no longer silent.
 *
 * Every figure asserted here was written by `follow-02-fixtures.ts`, and every
 * one is read from a stable machine key (`data-goal-movement*`) rather than by
 * comparing three independently authored sentences — because three sentences
 * that happen to match today prove nothing about one derivation. The words are
 * asserted once, on the surface where they are read, and the FACTS are asserted
 * on all three.
 *
 * The fixture removes every row it writes in `afterAll`, so this file adds no
 * leaker to the population [DEBT-173] tracks.
 */

import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  cleanupMovementFixture,
  movementFixture,
  seedMovementFixture,
} from "./follow-02-fixtures";
import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

const FIXTURE = movementFixture();

/** The unmeasured Goal the fixture moved: one Project, one Task completed. */
const MOVED = { id: "fm-goal-moving", title: "FM: Learn to sail" };
/** The unmeasured Goal whose only completion was BEFORE the window opened. */
const STILL = { id: "fm-goal-still", title: "FM: Restore the shed" };
/** Three contributing Projects, two of which moved. */
const PARTIAL = { id: "fm-goal-partial", title: "FM: Run the house well" };
/** A Project renamed inside the window, and nothing else. */
const METADATA = {
  id: "fm-goal-metadata",
  title: "FM: Keep the records straight",
};
/** Measurable, moved by a reading rather than by any Project. */
const MEASURED = { id: "fm-goal-measured", title: "FM: Reach 70 kg" };

test.beforeAll(() => {
  // Idempotent at both ends, so an interrupted previous run repairs rather than
  // duplicates.
  cleanupMovementFixture();
  seedMovementFixture(FIXTURE);
});

test.afterAll(() => {
  cleanupMovementFixture();
});

/** The movement facts a surface publishes for one Goal, by machine key. */
interface MovementFacts {
  readonly key: string;
  readonly events: number;
  readonly projects: number;
  readonly headline: string;
}

async function readMovement(scope: Locator): Promise<MovementFacts> {
  const block = scope.locator("[data-goal-movement]").first();
  await expect(block).toBeVisible();
  return {
    key: (await block.getAttribute("data-goal-movement")) ?? "",
    events: Number(await block.getAttribute("data-goal-movement-events")),
    projects: Number(await block.getAttribute("data-goal-movement-projects")),
    headline: (
      await block.locator(".dh-goal-movement__headline").innerText()
    ).trim(),
  };
}

/** One Goal's row in the `/goals` workspace list. */
function goalRow(page: Page, title: string): Locator {
  return page.getByTestId("goal-row").filter({ hasText: title }).first();
}

/** One Goal's tile in Today's Goal panel. */
function todayTile(page: Page, title: string): Locator {
  return page
    .getByTestId("today-goal-progress")
    .locator("li")
    .filter({ hasText: title })
    .first();
}

test.describe("did the goals move?", () => {
  test("answers with the SAME facts on Today, the collection and the record", async ({
    page,
  }) => {
    /* ---- Today ---------------------------------------------------------- */
    await gotoFixture(page, "/today");
    const panel = page.getByTestId("today-goal-progress");
    await expect(panel).toBeVisible();

    /*
     * The gap FOLLOW-02 closes. Before it, this panel rendered MEASURABLE Goals
     * only, so a workspace with Goals and no numeric targets was told "No
     * measurable Goals yet" every morning. The fixture's unmeasured Goal that
     * moved is now on it.
     */
    await expect(panel).not.toContainText("No measurable Goals yet");
    const todayMoved = await readMovement(todayTile(page, MOVED.title));
    expect(todayMoved.key).toBe("moved");
    expect(todayMoved.events).toBe(1);
    expect(todayMoved.projects).toBe(1);

    /*
     * An unmeasured Goal is never given a percentage to sit beside a measured
     * one. "No numeric target" is not "0%".
     */
    const movedTile = todayTile(page, MOVED.title);
    expect(await movedTile.innerText()).not.toMatch(/%/);
    await expect(movedTile.locator("[role='progressbar']")).toHaveCount(0);

    /* ---- the Goals collection ------------------------------------------- */
    await gotoFixture(page, `/goals?goal=${MOVED.id}`);
    const collectionMoved = await readMovement(goalRow(page, MOVED.title));
    expect(collectionMoved).toEqual(todayMoved);

    // The pane beside the row is the same value again, not a second read.
    const paneMoved = await readMovement(
      page.getByTestId("goal-workspace-pane"),
    );
    expect(paneMoved.key).toBe(todayMoved.key);
    expect(paneMoved.events).toBe(todayMoved.events);
    expect(paneMoved.projects).toBe(todayMoved.projects);

    /*
     * A Goal that has NOT moved says so in words, and is never given a `0%`, an
     * empty ring or a figure with no denominator.
     */
    const stillRow = goalRow(page, STILL.title);
    const still = await readMovement(stillRow);
    expect(still.key).toBe("no_movement_yet");
    expect(still.events).toBe(0);
    expect(still.headline).toMatch(/^No movement yet this week\.$/);
    expect(await stillRow.innerText()).not.toMatch(/%/);
    // Absence of evidence in a bounded window is described as exactly that.
    expect(await stillRow.innerText()).not.toMatch(
      /stalled|failing|poor|bad|neglected/i,
    );

    /*
     * Several contributing Projects, only some of them moving — and the
     * denominator is printed rather than implied.
     */
    const partialRow = goalRow(page, PARTIAL.title);
    const partial = await readMovement(partialRow);
    expect(partial.key).toBe("moved");
    expect(partial.projects).toBe(2);
    expect(partial.events).toBe(2);
    await expect(partialRow).toContainText("2 of 3 Projects contributed");

    /*
     * A Project RENAMED inside the window is Activity, and it is not the Goal
     * moving. This row is the difference between "did it move?" and "did
     * something happen?".
     */
    expect((await readMovement(goalRow(page, METADATA.title))).key).toBe(
      "no_movement_yet",
    );

    /*
     * GOAL-02 is untouched. The measurable Goal still states its own reading,
     * its own target and its own status — and gains a movement sentence beside
     * them rather than instead of them.
     */
    const measuredRow = goalRow(page, MEASURED.title);
    await expect(measuredRow).toContainText("77 / 70 kg");
    await expect(measuredRow).toContainText("Ahead");
    const measuredMovement = await readMovement(measuredRow);
    expect(measuredMovement.key).toBe("moved");
    // A reading moved it; no Project did.
    expect(measuredMovement.projects).toBe(0);

    /*
     * No score, no grade, no percentage anywhere in a movement statement —
     * [ADR-110] decision 4, asserted over rendered output.
     */
    const everyStatement = await page
      .locator("[data-goal-movement]")
      .allInnerTexts();
    for (const text of everyStatement) {
      expect(text).not.toMatch(/%/);
      expect(text).not.toMatch(/\b(score|grade|streak|adherence|momentum)\b/i);
      // Every statement names its own window.
      expect(text).toMatch(/this week/i);
    }

    /* ---- the Goal record ------------------------------------------------- */
    await gotoFixture(page, `/goals/${MOVED.id}`);
    const recordMoved = await readMovement(page.locator("main"));
    expect(recordMoved).toEqual(todayMoved);

    // The record is the one surface with room to state the window's own days.
    const label = page
      .locator("[data-goal-movement] .dh-goal-movement__window")
      .first();
    await expect(label).toBeVisible();
    const days = (await label.innerText()).trim();
    expect(days).toContain(String(Number(FIXTURE.weekStart.slice(8, 10))));
    expect(days).toContain(String(Number(FIXTURE.weekEnd.slice(8, 10))));

    /*
     * Alignment and movement compose rather than compete: this Goal is BOTH
     * "Recently active" (ADR-040's fortnight) and "Moved this week"
     * (FOLLOW-02's seven days), and the record states each without either
     * overwriting the other.
     */
    await expect(page.locator("main")).toContainText("Recently active");
    await expect(page.locator("main")).toContainText("Moved this week.");
  });

  test("is accessible, and fits a phone, in both appearances", async ({
    page,
  }) => {
    // 393 — the iPhone 15 width, and the phone tier the composition is built for.
    await page.setViewportSize({ width: 393, height: 850 });
    await gotoFixture(page, "/today");
    const movedTile = todayTile(page, MOVED.title);
    await expect(movedTile).toBeVisible();
    await expectNoHorizontalOverflow(page);

    /*
     * The Goal's NAME keeps priority over the movement text. Measured from the
     * live box, per DHDS-13's one rule: the title is painted at its full
     * content width rather than ellipsised to make room for the sentence.
     */
    const title = movedTile.locator(".dh-today__goal-title");
    const titleFits = await title.evaluate(
      (node) => node.scrollWidth <= node.clientWidth + 1,
    );
    expect(titleFits).toBe(true);

    // 320 — the narrowest width the product supports.
    await page.setViewportSize({ width: 320, height: 850 });
    await expect(movedTile).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    /*
     * The collection carries the longest statement the feature can produce
     * ("2 of 3 Projects contributed · 2 Tasks completed"), so the remaining
     * widths are driven there — with a resize and a media change in place
     * rather than a second navigation, because both re-evaluate without a fetch
     * and the state under test is already on screen.
     *
     * WITHOUT `?goal=`: REDESIGN-04 §7 gives the phone the LIST unless the URL
     * genuinely names a Goal, so an explicit selection would hide the very rows
     * this width claim is about.
     */
    await gotoFixture(page, "/goals");
    const partialRow = goalRow(page, PARTIAL.title);
    await expect(partialRow).toBeVisible();
    await expectNoHorizontalOverflow(page);
    // The statement wraps rather than overflowing its row at the narrowest width.
    await expect(partialRow).toContainText("2 of 3 Projects contributed");

    await page.setViewportSize({ width: 393, height: 850 });
    await expectNoHorizontalOverflow(page);

    /*
     * The desktop composition in the DARK appearance, driven by the media query
     * rather than by the appearance cookie — DHDS-13 §9's method note exists
     * because that mistake produced a complete set of "dark" frames that were
     * entirely light.
     */
    await page.emulateMedia({ colorScheme: "dark" });
    await page.setViewportSize({ width: 1440, height: 900 });
    await expect(partialRow).toBeVisible();
    await expect(page.getByTestId("goal-workspace-pane")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "light" });
  });
});
