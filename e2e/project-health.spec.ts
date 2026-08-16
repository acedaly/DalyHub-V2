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

    /*
     * UIX-02 — ONE attention LINE per card, not a chip plus the sentence
     * explaining it.
     *
     * The contract this asserts is unchanged: exactly one status treatment per
     * card, health replacing the lifecycle word whenever health has something
     * to say, and never a meaning carried by colour alone. What changed is the
     * object — a filled `.dh-pill` beside the title became a state dot and
     * words in the card's foot — and the wording, which is now built from the
     * reason's own structured count ("2 overdue") with the evaluator's full
     * sentence carried alongside for assistive tech.
     */
    const atRisk = page
      .getByRole("listitem")
      .filter({ hasText: "Conference talk" });
    /*
     * REDESIGN-04 §5.6 — the visible line is now the reference's meta line
     * ("14 tasks · 4 due this week"); the health STATE is the dot's tone and
     * the evaluator's own full sentence, which rides along for assistive tech.
     * Asserting the sentence is a stronger check than the compact wording it
     * replaces: the compact form was derived, the sentence is the evaluator's.
     */
    const atRiskLine = atRisk.locator(".dh-pcard__meta");
    await expect(atRiskLine).toHaveCount(1);
    await expect(atRiskLine).toHaveAttribute("data-tone", "danger");
    await expect(atRiskLine).toContainText(/past (its|their) due date/);

    const blocked = page
      .getByRole("listitem")
      .filter({ hasText: "Office move" });
    await expect(blocked.locator(".dh-pcard__meta")).toContainText(
      /waiting on something else/,
    );

    /*
     * UIX-02 — a healthy, actively-worked Project now reads "On track".
     *
     * Gate D showed "Active" here, because the card's ONE chip was the
     * lifecycle word unless health spoke, and `on_track` counted as silence.
     * The card's one line is now the health signal wherever health is
     * evaluated at all, and `on_track` is what it has to say; the workflow word
     * is what a Project shows when health is deliberately NOT evaluated
     * (Planned, On hold) — which the cases below cover.
     */
    const onTrack = page
      .getByRole("listitem")
      .filter({ hasText: "Team offsite" });
    // The evaluator's own sentence for THIS fixture — a Project whose tasks are
    // all done. Asserting what the evaluator actually says, rather than a
    // sentence chosen to match, is the point of moving to the accessible text.
    await expect(onTrack.locator(".dh-pcard__meta")).toContainText(
      /All tasks complete/,
    );
    // …and still exactly one treatment, with no filled chip anywhere on it.
    await expect(onTrack.locator(".dh-pcard__meta")).toHaveCount(1);
    await expect(onTrack.locator(".dh-pill")).toHaveCount(0);

    const stale = page
      .getByRole("listitem")
      .filter({ hasText: "Old archive tidy" });
    await expect(stale.locator(".dh-pcard__meta")).toContainText(
      /No progress in \d+ days/,
    );

    // Health is never conveyed by colour alone: the line carries a data-tone
    // AND its words.
    await expect(atRiskLine).toHaveAttribute("data-tone", "danger");
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
    await dialog.getByRole("button", { name: "Complete task" }).click();
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
    await expect(summaryBand(page).getByText("On track")).toBeVisible();
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
    // health rides along on each appended item, and never adds a second one.
    for (const card of await page.getByRole("article").all()) {
      expect(await card.locator(".dh-pcard__meta").count()).toBe(1);
      expect(await card.locator(".dh-pill").count()).toBe(0);
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
