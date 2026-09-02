import { expect, test } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectGoalStoryOpenLink,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  goalStoryRow,
  gotoFixture,
} from "./helpers";

test.describe("AREA-01 — Areas", () => {
  test("collection, creation, record, rename, hierarchy and Project navigation", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page.getByRole("link", { name: "Areas", exact: true }).click();
    await expect(page).toHaveURL(/\/areas$/);

    const seededArea = page.getByRole("link", { name: "Open DalyHub V2" });
    await expect(seededArea).toHaveAttribute("href", "/areas/a-dh");
    /*
     * The labelled "Goals: … · Projects: …" metadata is gone. The row states
     * its structure in one line and its open work as one figure — both from
     * exact aggregates, so these are contract assertions, not copy checks.
     *
     * UIX-02 dropped the "active"/"open" qualifiers from the relationship line:
     * on a list where every row says it, they are words per row restating what
     * the collection already means.
     */
    const dhCard = page.getByRole("article", { name: "DalyHub V2" });
    await expect(dhCard.getByText(/\d+ Projects?/)).toBeVisible();
    /*
     * The open-task figure and its NOUN.
     *
     * They are separate elements in the gallery card (the metric's value is set
     * larger than its label) and one string in the row, so the assertion is that
     * both parts are present rather than that they are one node. That is the fact
     * that matters — the count is never a bare number — and it is the only form of
     * it true of both presentations.
     */
    await expect(dhCard.getByText(/open tasks?/)).toBeVisible();
    await expect(dhCard).toContainText(/\d+\s*open tasks?/);
    // The chip that said nothing about any particular Area is gone.
    await expect(page.getByText("Permanent")).toHaveCount(0);

    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);

    await seededArea.click();
    await expect(page).toHaveURL(/\/areas\/a-dh/);
    await expect(
      page.getByRole("heading", { name: "DalyHub V2" }),
    ).toBeVisible();
    /*
     * UIX-02 — no "Permanent" chip on the record either.
     *
     * Every Area is permanent, so it is a fact about Areas rather than about
     * this Area. The gallery dropped it in AREA-01; the record kept it, so the
     * product said it on one screen and not the other. Only the exceptional
     * state (Archived) paints now.
     */
    await expect(page.getByText("Permanent")).toHaveCount(0);
    /*
     * RECORD-01 — momentum is the compact summary band's state chip and signal
     * line. It used to be an outlined card nested inside the summary card
     * (`.dh-area-momentum`), carrying a chip, a duplicate of its own summary
     * sentence and a bulleted list of its reasons.
     */
    const summary = page.getByRole("region", { name: "Summary" });
    await expect(summary).toBeVisible();
    await expect(
      summary.getByText(
        /Momentum visible|Worth a look|Needs attention|Blocked work|Mostly paused|No active work/,
      ),
    ).toBeVisible();

    /*
     * UIX-02 — the record OPENS on its Overview, so reaching a section is a
     * deliberate step. The overview states what is in the Area as counts of
     * living things; the sections hold the records themselves.
     */
    const overviewMetrics = page.getByTestId("area-overview-metrics");
    await expect(overviewMetrics).toBeVisible();
    // Counts, never a proportion: an Area does not complete.
    await expect(page.getByRole("progressbar")).toHaveCount(0);

    await page.getByRole("tab", { name: /Goals/ }).click();
    await expect(page).toHaveURL(/\/areas\/a-dh\?tab=goals/);
    /*
     * STEER-03 — the Goals tab draws the shared `GoalStoryRow`, found by the
     * machine key every row stamps; its open affordance is a real link to the
     * canonical record, named as the product composes it — the title, then the
     * derived answers — not `Open <title>` (DEBT-215, CONV-00-B).
     */
    const seededGoal = goalStoryRow(page, "g-launch");
    await expect(seededGoal).toBeVisible();
    const openGoalLink = await expectGoalStoryOpenLink(
      seededGoal,
      "Launch the site",
    );
    await expect(openGoalLink).toHaveAttribute("href", /^\/goals\/g-launch$/);

    await page.getByRole("tab", { name: /Projects/ }).click();
    await expect(page).toHaveURL(/\/areas\/a-dh\?tab=projects/);
    await expect(
      page
        .getByRole("article", { name: "Website relaunch" })
        .getByText("Directly in this Area"),
    ).toBeVisible();
    await expect(
      page
        .getByRole("article", { name: "Launch checklist" })
        .getByText("Goal: Launch the site"),
    ).toBeVisible();

    const projectLink = page.getByRole("link", {
      name: "Open Website relaunch",
    });
    await projectLink.click();
    await expect(page).toHaveURL(/\/projects\/pr-website/);
    await expect(
      page.getByRole("heading", { name: "Website relaunch" }),
    ).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/\/areas\/a-dh\?tab=projects/);
    await page.goForward();
    await expect(page).toHaveURL(/\/projects\/pr-website/);
    await page.goBack();
    await expect(page).toHaveURL(/\/areas\/a-dh\?tab=projects/);

    await page.getByRole("link", { name: "Areas" }).click();
    await page.getByRole("link", { name: "New area" }).first().click();
    const newDialog = page.getByRole("dialog", { name: "New Area" });
    await expect(newDialog).toBeVisible();
    await expectNoAxeViolations(page);
    await newDialog.getByRole("button", { name: "Create Area" }).click();
    await expect(
      newDialog.getByText("A title is required").first(),
    ).toBeVisible();

    const title = `Area overview e2e ${Date.now()}`;
    await newDialog.getByLabel(/Title/).fill(title);
    await newDialog.getByRole("button", { name: "Create Area" }).click();
    await expect(page).toHaveURL(/\/areas\/[^/?#]+$/);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    // A brand-new Area still reports its momentum in the band…
    await expect(page.getByText("No active work")).toBeVisible();
    /*
     * …and its Overview says the absence ONCE, as a sentence, rather than as
     * three tiles reading zero. "An absence is never drawn as a state" is the
     * design system's rule for a Goal's measurement and it holds here too.
     */
    await expect(
      page.getByText("Nothing running in this Area yet."),
    ).toBeVisible();
    await expect(page.getByTestId("area-overview-metrics")).toHaveCount(0);

    await page.getByRole("tab", { name: /Goals/ }).click();
    await expect(page.getByText("No Goals in this Area")).toBeVisible();

    // DS-16 — the heading IS the rename control. Escape restores focus to it
    // with the stored name intact; Enter commits.
    const titleControl = page.getByRole("button", { name: /^Area name:/ });
    await titleControl.focus();
    await titleControl.click();
    const titleInput = page.getByRole("textbox", { name: "Area name" });
    await expect(titleInput).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(titleControl).toBeFocused();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();

    await titleControl.click();
    const renamed = `${title} renamed`;
    await page.getByRole("textbox", { name: "Area name" }).fill(renamed);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: renamed })).toBeVisible();

    await page.getByRole("tab", { name: "Projects" }).click();
    await expect(page.getByText("No Projects in this Area")).toBeVisible();
    await page.getByRole("tab", { name: "Activity" }).click();
    await expect(
      page.getByRole("feed", { name: "Area activity" }),
    ).toBeVisible();
    await expect(
      page
        .getByRole("feed", { name: "Area activity" })
        .getByRole("article")
        .first(),
    ).toBeVisible();

    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
  });

  test("collection: icons, exact counts and one work-state line", async ({
    page,
  }) => {
    await gotoFixture(page, "/areas");

    // The seed is deliberately partial (PR #121): `a-health` carries a chosen
    // icon and `a-dh` carries none, so BOTH the persisted and the fallback
    // paths are proven in a browser rather than only one of them.
    const withIcon = page.getByRole("article", { name: "Health" });
    await expect(withIcon.locator('[data-icon-key="shield"]')).toBeVisible();

    const fallback = page.getByRole("article", { name: "DalyHub V2" });
    await expect(fallback.locator("[data-icon-key]")).toHaveCount(0);
    await expect(
      fallback.locator('.dh-accent-icon [data-entity="area"]'),
    ).toBeVisible();

    // IDENTITY-01 — each Area wears its OWN identity slot, so a grid is
    // scannable by colour. The slot is carried by NAME, so this survives a
    // reorder of the ramp in a way a numeric accent would not.
    const identities = await page
      .locator(".dh-accent-icon")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-identity")),
      );
    expect(new Set(identities).size).toBeGreaterThan(1);

    // The seeded `a-dh` Area holds Projects, Goals and Tasks; the counts come
    // from workspace-wide aggregates, so they are integers, never blanks.
    await expect(fallback.getByText(/\d+ Projects?/)).toBeVisible();
    /*
     * The open-task figure and its NOUN.
     *
     * They are separate elements in the gallery card (the metric's value is set
     * larger than its label) and one string in the row, so the assertion is that
     * both parts are present rather than that they are one node. That is the fact
     * that matters — the count is never a bare number — and it is the only form of
     * it true of both presentations.
     */
    await expect(fallback.getByText(/open tasks?/)).toBeVisible();
    await expect(fallback).toContainText(/\d+\s*open tasks?/);

    // Areas never complete, so no Area row carries a completion bar — the
    // source of the audit's ragged-alignment finding, and the fabricated
    // figure UIX-02 also removed from the Area RECORD.
    await expect(page.getByRole("progressbar")).toHaveCount(0);
  });

  test("collection: axe is clean in the dark appearance too", async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, "/areas");
    await expect(page.getByRole("article").first()).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("collection: the true-empty state is deliberate and accessible", async ({
    page,
  }) => {
    // Areas has no filter dimension, so it has no filtered-empty state to
    // distinguish this from — see the Gate D notes in M3_POLISH_HANDOFF.md.
    // The true-empty state cannot be reached from the seeded workspace without
    // destroying the shared local D1 every other spec in this run depends on,
    // so it is rendered by the dev-only fixture over the SAME component.
    await gotoFixture(page, "/design/collection-states?state=areas-empty");
    await expect(page.getByText("No Areas yet")).toBeVisible();
    await expect(
      page.getByRole("link", { name: "New area" }).first(),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("collection: an Area with nothing in it says so ONCE", async ({
    page,
  }) => {
    await gotoFixture(page, "/design/collection-states?state=areas-icons");
    const empty = page.getByRole("article", { name: "Finances" });
    /*
     * UIX-02 — ONE line, and it is the ACTIONABLE absence. The row used to say
     * "No active work" in its relationship slot and "Ready for its first
     * Project" beneath it: two statements of the same nothing.
     */
    await expect(empty.getByText("Ready for its first Project")).toBeVisible();
    await expect(empty.getByText("No active work")).toHaveCount(0);
    // The three absence messages the audit found are gone.
    await expect(empty.getByText(/No goals yet/)).toHaveCount(0);
    await expect(empty.getByText(/No Projects yet/)).toHaveCount(0);
    await expect(empty.getByText(/No tasks yet/)).toHaveCount(0);

    // An Area holding only loose tasks is NOT idle, and must not claim to be.
    const loose = page.getByRole("article", { name: "Home" });
    await expect(loose.getByText("No active work")).toHaveCount(0);
    await expect(loose.getByText("Ready for its first Project")).toHaveCount(0);
    /*
     * The open-task figure and its NOUN.
     *
     * They are separate elements in the gallery card (the metric's value is set
     * larger than its label) and one string in the row, so the assertion is that
     * both parts are present rather than that they are one node. That is the fact
     * that matters — the count is never a bare number — and it is the only form of
     * it true of both presentations.
     */
    await expect(loose.getByText(/open tasks?/)).toBeVisible();
    await expect(loose).toContainText(/\d+\s*open tasks?/);
  });

  test("collection: meets touch targets and stays overflow-free at 320px", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/areas");
    const card = page.getByRole("article", { name: "DalyHub V2" });
    await expect(card).toBeVisible();
    await expectNoHorizontalOverflow(page);

    /*
     * The card's destination is a STRETCHED link: the title anchor's `::after`
     * is absolutely positioned over the whole card, so the area a finger can
     * hit is the card, not the two lines of text the anchor's own box covers.
     * Measuring the anchor would report ~19px and be wrong about the product.
     *
     * So: measure the card, then PROVE the stretched hit area by tapping its
     * bottom-LEFT corner — far outside the anchor's own box, and clear of the
     * capture FAB's fixed bottom-right position — which must still open the
     * record.
     */
    await expectMinTouchTarget(card);
    await card.scrollIntoViewIfNeeded();
    const box = (await card.boundingBox())!;
    await page.mouse.click(box.x + 8, box.y + box.height - 8);
    await expect(page).toHaveURL(/\/areas\/a-dh/);
  });

  test("collection and record stay overflow-free across representative widths", async ({
    page,
  }) => {
    for (const viewport of [
      RESPONSIVE_VIEWPORTS[0],
      RESPONSIVE_VIEWPORTS[3],
      RESPONSIVE_VIEWPORTS[5],
    ]) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/areas");
      await expectNoHorizontalOverflow(page);
      await gotoFixture(page, "/areas/a-dh");
      await expectNoHorizontalOverflow(page);
    }
  });
});
