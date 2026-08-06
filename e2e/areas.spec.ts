import { expect, test } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
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
    // Gate D: the labelled "Goals: … · Projects: …" metadata is gone. The card
    // states its structure in one line and its open work as one figure — both
    // from exact aggregates, so these are contract assertions, not copy checks.
    const dhCard = page.getByRole("article", { name: "DalyHub V2" });
    await expect(dhCard.getByText(/\d+ active Projects?/)).toBeVisible();
    await expect(dhCard.getByText("open tasks")).toBeVisible();
    // The chip that said nothing about any particular Area is gone.
    await expect(page.getByText("Permanent")).toHaveCount(0);

    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);

    await seededArea.click();
    await expect(page).toHaveURL(/\/areas\/a-dh/);
    await expect(
      page.getByRole("heading", { name: "DalyHub V2" }),
    ).toBeVisible();
    await expect(page.getByText("Permanent").first()).toBeVisible();
    await expect(page.locator(".dh-area-momentum")).toBeVisible();
    await expect(
      page
        .locator(".dh-area-momentum")
        .getByText(
          /Momentum visible|Worth a look|Needs attention|Blocked work|Mostly paused/,
        ),
    ).toBeVisible();

    await expect(
      page.getByRole("article", { name: "Launch the site" }),
    ).toBeVisible();
    // AREA-02: a Goal card is now a real link to its canonical record.
    const openGoalLink = page.getByRole("link", {
      name: "Open Launch the site",
    });
    await expect(openGoalLink).toHaveAttribute("href", /^\/goals\//);

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
    await page.getByRole("link", { name: "New Area" }).first().click();
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
    await expect(page.getByText("No active work")).toBeVisible();
    await expect(page.getByText("No Goals in this Area")).toBeVisible();

    const renameButton = page.getByRole("button", { name: "Rename" });
    await renameButton.focus();
    await renameButton.click();
    const renameDialog = page.getByRole("dialog", { name: "Rename Area" });
    await expect(renameDialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(renameButton).toBeFocused();

    await renameButton.click();
    const renamed = `${title} renamed`;
    await page
      .getByRole("dialog", { name: "Rename Area" })
      .getByLabel(/Title/)
      .fill(renamed);
    await page
      .getByRole("dialog", { name: "Rename Area" })
      .getByRole("button", { name: "Save" })
      .click();
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

    // Each Area wears its OWN accent, so a grid is scannable by colour.
    const accents = await page
      .locator(".dh-accent-icon")
      .evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute("data-accent")),
      );
    expect(new Set(accents).size).toBeGreaterThan(1);

    // The seeded `a-dh` Area holds Projects, Goals and Tasks; the counts come
    // from workspace-wide aggregates, so they are integers, never blanks.
    await expect(fallback.getByText(/\d+ active Projects?/)).toBeVisible();
    await expect(fallback.getByText("open tasks")).toBeVisible();

    // Areas never complete, so no Area card carries a completion bar — the
    // source of the audit's ragged-alignment finding.
    await expect(page.getByRole("progressbar")).toHaveCount(0);
  });

  test("collection: the identity container survives forced colours as a shape", async ({
    browser,
  }) => {
    /*
     * Windows High Contrast strips the generated accent tints, which would
     * otherwise leave a grid of identical invisible boxes where the identity
     * containers were. `icons.css` restores the container as a BORDER for
     * exactly that case, and this asserts it rather than trusting the media
     * query — the one place in this change where meaning could have been left
     * resting on colour alone.
     */
    const context = await browser.newContext({ forcedColors: "active" });
    const page = await context.newPage();
    try {
      await gotoFixture(page, "/areas");
      const icon = page.locator(".dh-accent-icon").first();
      await expect(icon).toBeVisible();
      const borderWidth = await icon.evaluate(
        (node) => getComputedStyle(node).borderTopWidth,
      );
      expect(parseFloat(borderWidth)).toBeGreaterThan(0);
      // The Area's name is text, so it is unaffected — identity never depended
      // on the tint alone in the first place.
      await expect(
        page.getByRole("article", { name: "DalyHub V2" }),
      ).toBeVisible();
    } finally {
      await context.close();
    }
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
      page.getByRole("link", { name: "New Area" }).first(),
    ).toBeVisible();
    await expectNoAxeViolations(page);
  });

  test("collection: an Area with nothing in it says so ONCE", async ({
    page,
  }) => {
    await gotoFixture(page, "/design/collection-states?state=areas-icons");
    const empty = page.getByRole("article", { name: "Finances" });
    await expect(empty.getByText("No active work")).toBeVisible();
    // The three absence messages the audit found are gone.
    await expect(empty.getByText(/No goals yet/)).toHaveCount(0);
    await expect(empty.getByText(/No Projects yet/)).toHaveCount(0);
    await expect(empty.getByText(/No tasks yet/)).toHaveCount(0);

    // An Area holding only loose tasks is NOT idle, and must not claim to be.
    const loose = page.getByRole("article", { name: "Home" });
    await expect(loose.getByText("No active work")).toHaveCount(0);
    await expect(loose.getByText("open tasks")).toBeVisible();
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
