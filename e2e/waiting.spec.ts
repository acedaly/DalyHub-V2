import { expect, test } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * TODAY-03 — the Waiting workflow, driven end to end against the development-auth
 * server over real (seeded) D1. It marks the dedicated `t-waiting` task as waiting
 * (free-text then an entity target), confirms the Waiting view and the Drawer
 * state, clears it, and holds the accessibility + responsive baseline. It mutates
 * only `t-waiting` (the seed clears its waiting/completion state each run), so the
 * other journeys stay stable.
 */

const TASK_TITLE = "Await supplier sign-off";
const DRAWER_URL = "/today?drawer=task%3At-waiting";

/**
 * Open the dedicated task's Drawer and normalise it to a NOT-waiting state, so each
 * test starts from a known point regardless of what a prior test left behind (the
 * seed only resets at server start, and marking waiting persists).
 */
async function openTaskDrawer(page: import("@playwright/test").Page) {
  await gotoFixture(page, DRAWER_URL);
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  // Wait for the task content (and thus the waiting control) to finish loading —
  // either state's button proves it is ready — before deciding whether to clear.
  await expect(
    dialog.getByRole("button", { name: /Mark as waiting|Clear waiting/ }),
  ).toBeVisible();
  const clear = dialog.getByRole("button", { name: "Clear waiting" });
  if ((await clear.count()) > 0) {
    await clear.first().click();
  }
  await expect(
    dialog.getByRole("button", { name: "Mark as waiting" }),
  ).toBeVisible();
  return dialog;
}

test.describe("TODAY-03 — Waiting", () => {
  test("marks a task waiting on a free-text subject and shows it in the Drawer", async ({
    page,
  }) => {
    const dialog = await openTaskDrawer(page);

    await dialog.getByRole("button", { name: "Mark as waiting" }).click();
    await dialog.getByLabel("Something else").click();
    await dialog
      .getByLabel("What it's waiting on")
      .fill("finance confirmation");
    await dialog.getByRole("button", { name: "Save" }).click();

    // The read-only waiting summary appears with the subject and a "Waiting" pill.
    await expect(dialog.getByText("finance confirmation")).toBeVisible();
    await expect(
      dialog.getByText("Waiting", { exact: true }).first(),
    ).toBeVisible();
  });

  test("appears in the Waiting view and opens from there, then clears", async ({
    page,
  }) => {
    // Mark waiting first.
    const dialog = await openTaskDrawer(page);
    await dialog.getByRole("button", { name: "Mark as waiting" }).click();
    await dialog.getByLabel("Something else").click();
    await dialog.getByLabel("What it's waiting on").fill("replacement parts");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("replacement parts")).toBeVisible();

    // Navigate to the Waiting view; the task is listed with its subject.
    await gotoFixture(page, "/today/waiting");
    await expect(
      page.getByRole("heading", { name: "Waiting", level: 1 }),
    ).toBeVisible();
    const card = page.getByRole("link", { name: new RegExp(TASK_TITLE) });
    await expect(card).toBeVisible();
    await expect(page.getByText("replacement parts")).toBeVisible();

    // Open it from Waiting (the shared Drawer opens; the route stays /today/waiting).
    await card.click();
    const reopened = page.getByRole("dialog");
    await expect(reopened).toBeVisible();
    await expect(page).toHaveURL(/\/today\/waiting\?drawer=task%3At-waiting/);

    // Clear waiting from the Drawer.
    await reopened.getByRole("button", { name: "Clear waiting" }).click();
    await expect(
      reopened.getByRole("button", { name: "Mark as waiting" }),
    ).toBeVisible();
  });

  test("records Activity for the waiting change", async ({ page }) => {
    const dialog = await openTaskDrawer(page);
    await dialog.getByRole("button", { name: "Mark as waiting" }).click();
    await dialog.getByLabel("Something else").click();
    await dialog.getByLabel("What it's waiting on").fill("legal review");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("legal review")).toBeVisible();

    await dialog.getByRole("tab", { name: "Activity" }).click();
    await expect(dialog.getByText(/Started waiting/i).first()).toBeVisible();
  });

  test("waits on a DalyHub entity via the picker", async ({ page }) => {
    const dialog = await openTaskDrawer(page);
    await dialog.getByRole("button", { name: "Mark as waiting" }).click();
    // Default mode is a DalyHub record; search for the seeded Person.
    const combobox = dialog.getByRole("combobox", { name: "Which record" });
    await combobox.fill("Sarah");
    const option = dialog.getByRole("option", { name: /Sarah Chen/ });
    await expect(option).toBeVisible();
    await option.click();
    await dialog.getByRole("button", { name: "Save" }).click();

    await expect(dialog.getByText("Sarah Chen")).toBeVisible();
  });

  test("is usable and overflow-free at 320px, and axe-clean when populated", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 720 });

    // Mark waiting so the Waiting view has content to audit.
    const dialog = await openTaskDrawer(page);
    await dialog.getByRole("button", { name: "Mark as waiting" }).click();
    await dialog.getByLabel("Something else").click();
    await dialog.getByLabel("What it's waiting on").fill("finance");
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog.getByText("finance")).toBeVisible();
    // The waiting control (and the whole Drawer) is usable at 320px with no
    // horizontal overflow, and axe-clean.
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page, { include: '[role="dialog"]' });

    // The populated Waiting collection: overflow-free at 320px.
    await gotoFixture(page, "/today/waiting");
    await expect(page.getByText("finance")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // A populated Waiting view is axe-clean in light and dark at desktop width (the
    // shell's mobile top-bar landmark structure is the accessibility baseline's
    // concern; the empty view is swept at both widths by accessibility.spec).
    await page.setViewportSize({ width: 1280, height: 800 });
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoAxeViolations(page);
  });
});
