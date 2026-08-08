import { expect, test, type Locator, type Page } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * PROJ-02 — Project Health, driven end to end against the development-auth server
 * over real (seeded) D1. Uses wall-clock-INDEPENDENT seeded signals: an always-overdue
 * due date (2000-01-01), a waiting task, an all-complete project and a 2020-anchored
 * stale project. Browse and recognise attention-worthy projects, open one and inspect
 * its reasons, resolve a cause in the shared Task Drawer and see health update after
 * revalidation, reload for persistence, exercise Back/Forward/Escape, and hold the
 * accessibility + responsive baseline.
 */

/**
 * The record's shared summary band — where RECORD-01 put the derived progress,
 * the health state and health's reasons, replacing the module's own health card.
 * Asked for by its landmark name, so a later change to how the band is built
 * cannot silently empty this spec.
 */
function summaryBand(page: Page): Locator {
  return page.getByRole("region", { name: "Summary" });
}

test.describe("PROJ-02 — Project health", () => {
  test("surfaces at-risk / blocked / on-track / stale states on the collection", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects");

    const atRisk = page
      .getByRole("listitem")
      .filter({ hasText: "Conference talk" });
    await expect(atRisk.getByText("At risk")).toBeVisible();
    await expect(atRisk.getByText(/past (its|their) due date/)).toBeVisible();

    const blocked = page
      .getByRole("listitem")
      .filter({ hasText: "Office move" });
    await expect(blocked.getByText("Blocked")).toBeVisible();

    /*
     * Gate D: the collection card carries ONE status treatment, and health
     * REPLACES the lifecycle word only when health has something to say.
     * "On track" is the absence of a signal, so a healthy, actively-worked
     * Project shows its workflow status — "Active" — rather than swapping a
     * useful word for a vaguer one. The full health vocabulary still appears
     * on the record, which the panel assertions below cover.
     */
    const onTrack = page
      .getByRole("listitem")
      .filter({ hasText: "Team offsite" });
    await expect(onTrack.getByText("Active")).toBeVisible();
    await expect(onTrack.getByText("On track")).toHaveCount(0);
    // …and it is still exactly one chip, not a lifecycle chip plus a health one.
    await expect(onTrack.locator(".dh-pill")).toHaveCount(1);

    const stale = page
      .getByRole("listitem")
      .filter({ hasText: "Old archive tidy" });
    await expect(stale.getByText("Stale")).toBeVisible();

    // Health is never conveyed by colour alone: the state pill carries a data-tone
    // AND a text label.
    await expect(atRisk.getByText("At risk")).toHaveAttribute(
      "data-tone",
      "danger",
    );
  });

  test("explains health on the record, resolves a cause, and updates after revalidation", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-atrisk");

    // The record explains health with its reasons (not just a coloured badge).
    //
    // RECORD-01 folded the standalone health CARD into the record's shared
    // summary band, so this asks for the band by its landmark name rather than
    // for the removed `.dh-health-panel` class (AGENTS.md §23).
    const panel = summaryBand(page);
    await expect(panel).toBeVisible();
    await expect(panel.getByText("At risk")).toBeVisible();
    await expect(panel.getByText(/past its due date/)).toBeVisible();
    // Health sits beside the progress it explains, in the same band — the two
    // facts the removed card carried separately.
    await expect(
      panel.getByRole("progressbar", { name: "Tasks" }),
    ).toBeVisible();

    // Open the overdue task in the SHARED Task Drawer and complete it.
    await page
      .getByRole("link", { name: "Open Submit the abstract" })
      .first()
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("checkbox", { name: /Mark complete/ }).check();
    await expect(
      dialog.getByText("Completed", { exact: true }).first(),
    ).toBeVisible();

    // Close the Drawer; with the overdue task done and all tasks complete, health
    // updates to "On track" after revalidation (derived, never cached).
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect
      .poll(async () => (await panel.textContent()) ?? "")
      .toContain("On track");
    await expect(panel.getByText("At risk")).toHaveCount(0);

    // Persistence + derivation: a reload recomputes the same on-track health.
    await page.reload();
    await expect(
      summaryBand(page).getByText("On track"),
    ).toBeVisible();
  });

  test("blocked project explains its blocker, and Back/Forward/Escape keep health", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-blocked");
    const panel = summaryBand(page);
    await expect(panel.getByText("Blocked")).toBeVisible();
    await expect(panel.getByText(/waiting on something else/)).toBeVisible();
    // Sensitive free-text waiting content is never surfaced in the summary band.
    await expect(panel).not.toContainText("landlord counter-signature");

    // Open a task, then Back/Forward/Escape without losing the health explanation.
    const taskLink = page
      .getByRole("link", { name: "Open Sign the lease" })
      .first();
    await taskLink.focus();
    await taskLink.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(panel.getByText("Blocked")).toBeVisible();
    await page.goForward();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(taskLink).toBeFocused();
    await expect(panel.getByText("Blocked")).toBeVisible();
  });

  test("pagination still works with health present", async ({ page }) => {
    await gotoFixture(page, "/projects");
    // The seed has more than one page of projects; the shared Load-more affordance
    // fetches the next keyset page (health rides along on each item).
    const loadMore = page.getByRole("button", { name: "Load more projects" });
    if (await loadMore.isVisible()) {
      await loadMore.click();
      await expect(loadMore).toHaveCount(0);
    }
    // Every card still carries exactly one status treatment after paging —
    // health rides along on each appended item, and never adds a second chip.
    for (const card of await page.getByRole("article").all()) {
      expect(await card.locator(".dh-pill").count()).toBe(1);
    }
  });

  test("is axe-clean and free of horizontal overflow across the responsive matrix", async ({
    page,
  }) => {
    // Two axe scans plus TWO navigations per viewport. MOBILE-01 grew
    // `RESPONSIVE_VIEWPORTS` from seven checkpoints to nine (a large phone at 430px
    // and a phone in landscape, where height is the binding dimension), so this loop
    // now performs 18 full page loads instead of 14 — roughly a third more work than
    // the 30s default was sized for, and it began timing out mid-loop in CI. The
    // budget is raised to match the added coverage; every assertion is unchanged.
    test.setTimeout(90_000);

    // The collection with its health cards is axe-clean.
    await gotoFixture(page, "/projects");
    await expectNoAxeViolations(page);

    // The record's health panel is axe-clean. Scanned with the shared Task Drawer
    // open (the established record a11y gate, e2e/projects.spec.ts): the record's
    // own bare-page heading-order is a pre-existing PROJ-01 condition tracked in
    // PRODUCT_DEBT and out of PROJ-02's scope.
    await gotoFixture(page, "/projects/pr-atrisk?drawer=task%3Apht-overdue");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expectNoAxeViolations(page);

    for (const viewport of RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await gotoFixture(page, "/projects");
      await expectNoHorizontalOverflow(page);
      await gotoFixture(page, "/projects/pr-atrisk");
      await expectNoHorizontalOverflow(page);
    }
  });
});
