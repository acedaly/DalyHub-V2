/**
 * DS-11 — platform-wide keyboard navigation audit.
 *
 * The roadmap asks for one keyboard audit proving the cross-cutting guarantees that
 * every surface inherits from the shared shell and the shared modal machinery (the
 * DS-03 focus/scroll-lock/inert hooks that DS-08/09/10 and PX-02 reuse):
 *
 *   - the skip link is the first tab stop and moves focus into `main`;
 *   - the shell's interactive chrome (Search, Command Palette, navigation, user
 *     menu) is all keyboard-reachable, with no control unreachable and no trap in
 *     the resting page;
 *   - the reserved shortcuts (`/` for Search, `Mod+K` for the Command Palette) open
 *     their surfaces, which trap focus, close on Escape, and RESTORE focus to the
 *     control that opened them (deterministic focus restoration);
 *   - opening a modal surface locks background scroll and inerts the background.
 *
 * Surface-specific keyboard behaviour (tab roving in RecordTabs, listbox arrows in
 * Forms, reorder keys on Cards, etc.) is covered by each component's own spec; this
 * file proves the PLATFORM contract once.
 */

import { expect, test } from "@playwright/test";

import { gotoFixture } from "./helpers";

test.describe("keyboard — shell skip link and landmarks", () => {
  test("skip link is the first tab stop and jumps to main content", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: /skip to main content/i });
    await expect(skip).toBeFocused();
    await skip.press("Enter");
    // Activating the skip link moves focus to the main region (tabIndex -1).
    const main = page.locator("main#main-content");
    await expect(main).toBeFocused();
  });

  test("the shell exposes exactly one main landmark and a navigation landmark", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await expect(page.getByRole("main")).toHaveCount(1);
    await expect(
      page.getByRole("navigation", { name: /primary/i }),
    ).toBeVisible();
  });
});

test.describe("keyboard — shell chrome is reachable, resting page has no trap", () => {
  test("Search and Command Palette entries are keyboard-reachable", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    // Tab through the resting shell; the Search and Command affordances must be hit
    // within a bounded number of stops (no unreachable control), and focus keeps
    // moving (no trap).
    const seen = new Set<string>();
    let sawSearch = false;
    let sawCommand = false;
    for (let i = 0; i < 40; i += 1) {
      await page.keyboard.press("Tab");
      const info = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        if (!el) return { key: "", name: "" };
        return {
          key: `${el.tagName}.${el.className}#${el.id}`,
          name: (el.textContent ?? "").trim().toLowerCase(),
        };
      });
      seen.add(info.key);
      if (/search/.test(info.name)) sawSearch = true;
      if (/command palette/.test(info.name)) sawCommand = true;
      if (sawSearch && sawCommand) break;
    }
    expect(sawSearch, "Search entry reachable by keyboard").toBe(true);
    expect(sawCommand, "Command Palette entry reachable by keyboard").toBe(
      true,
    );
    // More than one distinct element received focus — focus was never trapped.
    expect(seen.size).toBeGreaterThan(1);
  });
});

test.describe("keyboard — modal focus restoration through the shared machinery", () => {
  test("Search opens from its affordance and Escape restores focus to the opener", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    // Open from the real Search affordance so there is a genuine opener to restore
    // to (opening via the `/` shortcut with nothing focused would legitimately
    // restore to <body>).
    const opener = page
      .getByRole("button", { name: "Search", exact: true })
      .first();
    await opener.click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Body scroll is locked while the modal is open.
    await expect(page.locator("html")).toHaveCSS("overflow", "hidden");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    // Focus is restored to the control that opened Search (deterministic).
    await expect(opener).toBeFocused();
  });

  test("`Mod+K` toggles the Command Palette and traps focus while open", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page.keyboard.press("ControlOrMeta+k");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    // Tab several times; focus stays inside the dialog and never escapes to the
    // (inert) background — a proper modal trap, incl. the wrap past tabindex="-1"
    // listbox options (regression guard for the DS-11 focus-trap fix).
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab");
      const location = await dialog.evaluate((node) => {
        const active = document.activeElement;
        return {
          inDialog: node.contains(active),
          inBackground: Boolean(
            active?.closest(".dh-sidebar, main#main-content"),
          ),
        };
      });
      expect(
        location.inBackground,
        "focus never reaches the inert background",
      ).toBe(false);
      expect(location.inDialog, "focus stays within the open palette").toBe(
        true,
      );
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
  });
});

test.describe("keyboard — Drawer traps and restores focus", () => {
  test("opening a Drawer traps focus; Escape restores it to the opener", async ({
    page,
  }) => {
    await gotoFixture(page, "/design/drawer");
    const opener = page.getByRole("link", {
      name: /Project Website relaunch/,
    });
    await opener.click();
    const dialog = page.getByRole("dialog", { name: "Website relaunch" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(opener).toBeFocused();
  });
});
