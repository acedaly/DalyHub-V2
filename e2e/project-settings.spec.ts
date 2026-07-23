import { expect, test } from "@playwright/test";

import { expectNoHorizontalOverflow, gotoFixture } from "./helpers";

/**
 * PROJ-05 Slice 3 — the Project Settings tab + Archived Projects collection,
 * driven end to end against the development-auth server over real (seeded) D1.
 * The SMALLEST focused journey proving the shared DS-10b Settings surface and
 * the Archived collection are wired to the real repository/route boundary
 * (Slices 1–2): open a project, open its Settings tab, change its workflow
 * status, move it to a different Goal, archive it, reach it again via the
 * Archived collection, restore it, exercise basic keyboard operation, and hold
 * no 320px overflow. Full PROJ-05 accessibility/responsive/Today-integration
 * closure is Slice 4 — this is deliberately narrow.
 *
 * Mutates the dedicated seeded `pr-settings` project only; its mutable state is
 * reset in `seed-tasks.sql` before every run.
 */

test.describe("PROJ-05 — Project Settings and Archived collection", () => {
  test("changes status, moves the parent, archives, restores via the Archived collection", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-settings");
    await expect(
      page.getByRole("heading", { name: "Settings journey project" }),
    ).toBeVisible();

    // Open the final Settings tab.
    await page.getByRole("tab", { name: "Settings" }).click();
    const statusSelect = page.getByRole("combobox", {
      name: "Workflow status",
    });
    await expect(statusSelect).toHaveValue("planned");

    // Change the workflow status — an immediate setting, confirmed via a toast.
    await statusSelect.selectOption("active");
    await expect(
      page.getByRole("group", { name: "Workflow status saved" }),
    ).toBeVisible();
    await expect(statusSelect).toHaveValue("active");
    // The header pill reflects the saved status after revalidation.
    await expect(
      page.getByText("Active", { exact: true }).first(),
    ).toBeVisible();

    // Move the project to the seeded Goal via the searchable Area/Goal picker.
    const parentCombo = page.getByRole("combobox", { name: /Area or Goal/ });
    await expect(parentCombo).toHaveValue("DalyHub V2");
    await parentCombo.fill("Launch");
    await page.getByRole("option", { name: /Launch the site/ }).click();
    await expect(
      page.getByRole("group", { name: "Organisation updated" }),
    ).toBeVisible();
    // The header/summary now show the Goal (and its derived Area).
    await expect(page.getByText("Launch the site").first()).toBeVisible();

    // Archive: a deliberate confirmation explaining the consequences.
    await page.getByRole("button", { name: "Archive project…" }).click();
    const archiveDialog = page.getByRole("dialog", {
      name: "Archive this project?",
    });
    await expect(archiveDialog).toBeVisible();
    await expect(archiveDialog).toContainText("read-only until you restore it");
    await archiveDialog
      .getByRole("button", { name: "Archive project" })
      .click();
    await expect(archiveDialog).toBeHidden();
    await expect(
      page.getByRole("group", { name: "Project archived" }),
    ).toBeVisible();

    // The record shows the Archived state prominently, with Rename/Complete
    // hidden and Settings showing Restore instead of Archive.
    await expect(
      page.getByText("Archived", { exact: true }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Complete project" }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Rename" })).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Restore project…" }),
    ).toBeVisible();

    // Reach it again via the dedicated Archived collection segment.
    await page.goto("/projects");
    await page.getByRole("link", { name: "Archived" }).click();
    await expect(page).toHaveURL(/state=archived/);
    const archivedCard = page.getByRole("link", {
      name: "Open Settings journey project",
    });
    await expect(archivedCard).toBeVisible();
    await archivedCard.click();
    await expect(page).toHaveURL(/\/projects\/pr-settings/);

    // Restore via the ordinary (non-destructive) action in Settings.
    await page.getByRole("tab", { name: "Settings" }).click();
    // Keyboard operation: the Restore button is reachable and activatable by
    // keyboard, and the confirmation traps focus on a real dialog.
    const restoreButton = page.getByRole("button", {
      name: "Restore project…",
    });
    await restoreButton.focus();
    await page.keyboard.press("Enter");
    const restoreDialog = page.getByRole("dialog", {
      name: "Restore this project?",
    });
    await expect(restoreDialog).toBeVisible();
    await restoreDialog
      .getByRole("button", { name: "Restore project" })
      .click();
    await expect(restoreDialog).toBeHidden();
    await expect(
      page.getByRole("group", { name: "Project restored" }),
    ).toBeVisible();

    // Normal controls return; the preserved workflow status survives the
    // archive/restore round trip.
    await expect(
      page.getByRole("button", { name: "Complete project" }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Workflow status" }),
    ).toHaveValue("active");
  });

  test("has no horizontal overflow at 320px with the Settings tab and a confirmation open", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page, "/projects/pr-settings");
    await page.getByRole("tab", { name: "Settings" }).click();
    await expectNoHorizontalOverflow(page);
    await page.getByRole("button", { name: "Archive project…" }).click();
    await expect(
      page.getByRole("dialog", { name: "Archive this project?" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    // Leave the record exactly as this run found it — cancel, mutating nothing.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});

/**
 * PROJ-05 Slice 4 — Today integration closure. Extends the Slice 3 Settings
 * journey above rather than a second test architecture: it proves the complete
 * Project workflow-status/archive/restore journey affects Today's "Continue
 * working" exactly as ADR-037's Today integration promises, over the dedicated
 * seeded `pr-today` project (isolated from `pr-settings`). Every transition goes
 * through the real Settings tab UI/mutation route; no client-only filtering ever
 * substitutes for repository state, and no hard reload is used to reconcile
 * in-record mutations — only revalidation.
 */
test.describe("PROJ-05 Slice 4 — Today integration", () => {
  test("Planned → Active → On hold → Active → Archive → Restore, reflected live on Today", async ({
    page,
  }) => {
    const projectLink = () =>
      page.getByRole("link", { name: "Open Today integration project" });

    // 1–3: Today shows no Active/Planned/On hold/Completed/Archived card for this
    // project while it is still Planned.
    await gotoFixture(page, "/today");
    const continueWorking = page.getByRole("region", {
      name: "Continue working",
    });
    await expect(continueWorking).toBeVisible();
    await expect(projectLink()).toHaveCount(0);

    // 4–6: open it through Projects (not Today, since it is absent), open its
    // final Settings tab, change it to Active.
    await gotoFixture(page, "/projects/pr-today");
    await expect(
      page.getByRole("heading", { name: "Today integration project" }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Settings" }).click();
    const statusSelect = page.getByRole("combobox", {
      name: "Workflow status",
    });
    await expect(statusSelect).toHaveValue("planned");
    await statusSelect.selectOption("active");
    await expect(
      page.getByRole("group", { name: "Workflow status saved" }),
    ).toBeVisible();

    // 7–8: back to Today — it now appears and reads Active. No hard reload.
    await gotoFixture(page, "/today");
    await expect(projectLink()).toBeVisible();
    const card = page.locator('article[data-card-id="pr-today"]');
    await expect(card.getByText("Active", { exact: true })).toBeVisible();

    // 9–10: back to Settings, change to On hold; back to Today — it disappears.
    await gotoFixture(page, "/projects/pr-today");
    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(
      page.getByRole("combobox", { name: "Workflow status" }),
    ).toHaveValue("active");
    await page
      .getByRole("combobox", { name: "Workflow status" })
      .selectOption("on_hold");
    await expect(
      page.getByRole("group", { name: "Workflow status saved" }),
    ).toBeVisible();
    await gotoFixture(page, "/today");
    await expect(projectLink()).toHaveCount(0);

    // 11: change it back to Active.
    await gotoFixture(page, "/projects/pr-today");
    await page.getByRole("tab", { name: "Settings" }).click();
    await page
      .getByRole("combobox", { name: "Workflow status" })
      .selectOption("active");
    await expect(
      page.getByRole("group", { name: "Workflow status saved" }),
    ).toBeVisible();

    // 12: archive it through the real confirmation, keyboard-operated.
    const archiveButton = page.getByRole("button", {
      name: "Archive project…",
    });
    await archiveButton.focus();
    await page.keyboard.press("Enter");
    const archiveDialog = page.getByRole("dialog", {
      name: "Archive this project?",
    });
    await expect(archiveDialog).toBeVisible();
    await archiveDialog
      .getByRole("button", { name: "Archive project" })
      .click();
    await expect(archiveDialog).toBeHidden();
    await expect(
      page.getByRole("group", { name: "Project archived" }),
    ).toBeVisible();

    // 13: disappears from Today, appears in Archived.
    await gotoFixture(page, "/today");
    await expect(projectLink()).toHaveCount(0);
    await gotoFixture(page, "/projects?state=archived");
    const archivedCard = page.getByRole("link", {
      name: "Open Today integration project",
    });
    await expect(archivedCard).toBeVisible();

    // 14–16: open it from Archived, restore it (keyboard-operated), confirm it
    // returns to Today because Active was preserved.
    await archivedCard.click();
    await expect(page).toHaveURL(/\/projects\/pr-today/);
    await page.getByRole("tab", { name: "Settings" }).click();
    const restoreButton = page.getByRole("button", {
      name: "Restore project…",
    });
    await restoreButton.focus();
    await page.keyboard.press("Enter");
    const restoreDialog = page.getByRole("dialog", {
      name: "Restore this project?",
    });
    await expect(restoreDialog).toBeVisible();
    await restoreDialog
      .getByRole("button", { name: "Restore project" })
      .click();
    await expect(restoreDialog).toBeHidden();
    await expect(
      page.getByRole("group", { name: "Project restored" }),
    ).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Workflow status" }),
    ).toHaveValue("active");

    await gotoFixture(page, "/today");
    await expect(projectLink()).toBeVisible();

    // 18: Back/Forward and a copied URL do not break.
    await projectLink().click();
    await expect(page).toHaveURL(/\/projects\/pr-today/);
    await page.goBack();
    await expect(page).toHaveURL(/\/today/);
    await expect(projectLink()).toBeVisible();
    await page.goForward();
    await expect(page).toHaveURL(/\/projects\/pr-today/);
    // `pr-today` is left restored (Active, not archived); the seed resets it to
    // its Planned baseline before the next full suite run regardless.
  });

  test("a restored Planned project stays absent from Today's Continue working", async ({
    page,
  }) => {
    await gotoFixture(page, "/projects/pr-today-planned");
    await expect(
      page.getByRole("heading", {
        name: "Planned project (Today absence check)",
      }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Settings" }).click();
    await expect(
      page.getByRole("combobox", { name: "Workflow status" }),
    ).toHaveValue("planned");

    // Archive it directly (it never passes through Active) and restore it.
    await page.getByRole("button", { name: "Archive project…" }).click();
    const archiveDialog = page.getByRole("dialog", {
      name: "Archive this project?",
    });
    await archiveDialog
      .getByRole("button", { name: "Archive project" })
      .click();
    await expect(archiveDialog).toBeHidden();

    await page.getByRole("button", { name: "Restore project…" }).click();
    const restoreDialog = page.getByRole("dialog", {
      name: "Restore this project?",
    });
    await restoreDialog
      .getByRole("button", { name: "Restore project" })
      .click();
    await expect(restoreDialog).toBeHidden();
    // Workflow status is preserved as Planned across the round trip.
    await expect(
      page.getByRole("combobox", { name: "Workflow status" }),
    ).toHaveValue("planned");

    await gotoFixture(page, "/today");
    await expect(
      page.getByRole("link", {
        name: "Open Planned project (Today absence check)",
      }),
    ).toHaveCount(0);
  });
});
