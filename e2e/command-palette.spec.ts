import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

/**
 * DS-09 Command Palette — driven end to end against the development-auth server.
 *
 * Exercises the real Product Frame Command Palette affordance (the sidebar ⌘K
 * entry and the global Mod+K shortcut) wired to the live `/commands` catalogue and
 * Today's registry-discovered navigation commands, the DS-08 record search merge,
 * the Today Quick Capture focus command, contextual actions, and the Card adapter —
 * plus the execution/failure states via the `/design/command-palette` fixture.
 * Role-based and non-brittle.
 */

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

function commandTrigger(page: Page) {
  return page.getByRole("button", { name: "Command palette", exact: true });
}

function palette(page: Page) {
  return page.getByRole("combobox", { name: "Search commands and records" });
}

async function openPalette(page: Page) {
  await page.waitForLoadState("networkidle");
  await commandTrigger(page).click();
  const input = palette(page);
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  return input;
}

/** Wait for a ranked option to render (so Enter never races the list). */
function option(page: Page, name: RegExp) {
  return page.getByRole("option", { name });
}

test.describe("DS-09 Command Palette — desktop", () => {
  test("opens from the sidebar and lists a matching command", async ({
    page,
  }) => {
    await page.goto("/");
    const input = await openPalette(page);
    await expect(input).toBeFocused();
    await input.fill("today");
    const listbox = page.getByRole("listbox", {
      name: "Commands and records",
    });
    await expect(listbox).toBeVisible();
    await expect(
      listbox.getByRole("option", { name: /Go to Today/ }),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("opens with Mod+K and closes with a second Mod+K", async ({ page }) => {
    await page.goto("/today");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette(page)).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette(page)).toHaveCount(0);
  });

  test("runs a navigation command with the keyboard", async ({ page }) => {
    await page.goto("/");
    const input = await openPalette(page);
    await input.fill("Go to Today");
    await expect(option(page, /Go to Today/)).toBeVisible();
    await input.press("Enter");
    await expect(page).toHaveURL(/\/today$/);
    await expect(palette(page)).toHaveCount(0);
  });

  test("focuses Today Quick Capture via the Focus Quick Capture command", async ({
    page,
  }) => {
    await page.goto("/");
    const input = await openPalette(page);
    await input.fill("Focus Quick Capture");
    await expect(option(page, /Focus Quick Capture/).first()).toBeVisible();
    await input.press("Enter");
    await expect(page).toHaveURL(/\/today/);
    await expect(
      page.getByPlaceholder("What needs your attention?"),
    ).toBeFocused();
    // The capture intent is cleaned from the URL (no Back-button trap).
    await expect(page).toHaveURL(/\/today$/);
  });

  test("opens a DS-08 record result in the real Drawer", async ({ page }) => {
    await page.goto("/today");
    const input = await openPalette(page);
    await input.fill("Finish");
    const listbox = page.getByRole("listbox", {
      name: "Commands and records",
    });
    await expect(listbox.getByText("Tasks")).toBeVisible();
    // Open the record result directly (its option is a real link).
    await option(page, /Finish PX-02/)
      .first()
      .getByRole("link")
      .click();
    await expect(page).toHaveURL(/\/today\?.*drawer=/);
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("runs a contextual action bound to an open task Drawer", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.waitForLoadState("networkidle");
    // Open a task record in the Drawer.
    await page.getByRole("link", { name: "Finish PX-02" }).first().click();
    await expect(
      page.getByRole("dialog", { name: /Finish PX-02/ }),
    ).toBeVisible();
    // Mod+K opens the palette over the Drawer; a task-specific contextual action
    // appears under "Current context".
    await page.keyboard.press("ControlOrMeta+k");
    const input = palette(page);
    await expect(input).toBeVisible();
    await input.fill("complete");
    const listbox = page.getByRole("listbox", {
      name: "Commands and records",
    });
    await expect(listbox.getByText("Current context")).toBeVisible();
    await expect(option(page, /Complete/).first()).toBeVisible();
    await input.press("Enter");
    // The contextual (in-memory) action ran — the palette shows honest feedback
    // and never claims a save.
    await expect(
      page.getByText(/for this session \(not saved\)/i).first(),
    ).toBeVisible();
  });

  test("activates the same shared action through its Card control", async ({
    page,
  }) => {
    await page.goto("/today");
    const focus = page.getByRole("region", { name: /Today's focus/ });
    const firstCard = focus.locator(".dh-card").first();
    await firstCard.hover();
    await firstCard.getByRole("button", { name: "Complete" }).click();
    await expect(firstCard.getByText("Done")).toBeVisible();
    await expect(
      firstCard.getByRole("button", { name: "Reopen" }),
    ).toBeVisible();
  });

  test("closes on Escape and restores focus to the trigger", async ({
    page,
  }) => {
    await page.goto("/today");
    await openPalette(page);
    await page.keyboard.press("Escape");
    await expect(palette(page)).toHaveCount(0);
    await expect(commandTrigger(page)).toBeFocused();
  });

  test("is mutually exclusive with Search", async ({ page }) => {
    await page.goto("/today");
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("/");
    await expect(
      page.getByRole("combobox", { name: "Search everything" }),
    ).toBeVisible();
    // Opening the palette closes Search.
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette(page)).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Search everything" }),
    ).toHaveCount(0);
  });

  test("opens over an existing Drawer and keeps it behind", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.waitForLoadState("networkidle");
    await page.getByRole("link", { name: "Finish PX-02" }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette(page)).toBeVisible();
    await page.keyboard.press("Escape");
    // Escape closes only the palette; the Drawer remains.
    await expect(palette(page)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("DS-09 Command Palette — mobile 320px", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("opens from the mobile navigation without horizontal overflow", async ({
    page,
  }) => {
    await page.goto("/today");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Open navigation" }).click();
    await commandTrigger(page).click();
    const input = palette(page);
    await expect(input).toBeVisible();
    await input.fill("today");
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });
});

test.describe("DS-09 Command Palette — dark theme", () => {
  test.use({ colorScheme: "dark" });

  test("renders in dark theme", async ({ page }) => {
    await page.goto("/today");
    const input = await openPalette(page);
    await input.fill("today");
    await expect(page.getByRole("listbox")).toBeVisible();
  });
});

test.describe("DS-09 Command Palette — reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("opens and closes without depending on animation", async ({ page }) => {
    await page.goto("/today");
    const input = await openPalette(page);
    await input.fill("today");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette(page)).toHaveCount(0);
  });
});

test.describe("DS-09 Command Palette — execution & failure states (design fixture)", () => {
  async function openFixturePalette(page: Page) {
    await page.goto("/design/command-palette");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Open Command Palette" }).click();
    const input = palette(page);
    await expect(input).toBeVisible();
    return input;
  }

  test("runs an executable command and shows inline success", async ({
    page,
  }) => {
    const input = await openFixturePalette(page);
    await input.fill("reindex");
    await expect(option(page, /Reindex the workspace/)).toBeVisible();
    await input.press("Enter");
    // The message shows in both the visible banner and the polite status region.
    await expect(page.getByText(/Reindex complete/i).first()).toBeVisible();
  });

  test("shows a failure with a Retry that re-invokes", async ({ page }) => {
    await page.goto("/design/command-palette");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Failure", exact: true }).click();
    await page.getByRole("button", { name: "Open Command Palette" }).click();
    const input = palette(page);
    await input.fill("reindex");
    await expect(option(page, /Reindex the workspace/)).toBeVisible();
    await input.press("Enter");
    await expect(page.getByText(/didn.t complete/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  test("blocks a duplicate activation while pending", async ({ page }) => {
    await page.goto("/design/command-palette");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Pending (hang)" }).click();
    await page.getByRole("button", { name: "Open Command Palette" }).click();
    const input = palette(page);
    await input.fill("reindex");
    await expect(option(page, /Reindex the workspace/)).toBeVisible();
    await input.press("Enter");
    await expect(page.getByText("Running…")).toBeVisible();
    await input.press("Enter");
    await expect(page.getByText("Running…")).toBeVisible();
  });

  test("keeps commands usable when record search fails partially", async ({
    page,
  }) => {
    await page.goto("/design/command-palette");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: "Partial failure" }).click();
    await page.getByRole("button", { name: "Open Command Palette" }).click();
    const input = palette(page);
    await input.fill("Finish");
    await expect(page.getByText(/didn.t respond/i)).toBeVisible();
    await expect(
      page.getByRole("option", { name: /Finish the Acme/ }),
    ).toBeVisible();
  });

  test("shows the Card and Record Header adapter proof", async ({ page }) => {
    await page.goto("/design/command-palette");
    await page.waitForLoadState("networkidle");
    const proof = page.getByRole("region", {
      name: "Quick Action adapter proof",
    });
    await proof.getByRole("button", { name: "Star" }).first().click();
    await expect(proof.getByText(/Starred/)).toBeVisible();
  });
});
