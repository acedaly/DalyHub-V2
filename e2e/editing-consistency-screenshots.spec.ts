/**
 * EDIT-02 — the approval capture for the finished editing model.
 *
 * Opt-in exactly like every other screenshot pass, so the ordinary CI gate
 * neither slows down nor writes into the repository:
 *
 *     pnpm run build
 *     CAPTURE_SCREENSHOTS=1 PLAYWRIGHT_SKIP_BUILD=1 pnpm exec playwright test \
 *       e2e/editing-consistency-screenshots.spec.ts --workers=1
 *
 * The brief asks for evidence of INTERACTION rather than of appearance, so every
 * capture here is a PAIR or a sequence: the value at rest and the same value
 * while being edited; a selected value and the menu that replaces it; an unset
 * optional value and the same field once set. A single tidy screenshot of a
 * record proves nothing about how it is edited.
 *
 * Two rules inherited from the Gate D and EDIT-01 passes, both learned the hard
 * way:
 *
 *   1. `animations: "disabled"`, so nothing is captured mid-transition — a
 *      half-open menu is evidence about a transition, not about a control;
 *   2. capture the AWKWARD states. The phone toolbar, the phone inline editor
 *      and the dark appearance are all here, because a gate that only shows
 *      1440px light mode is evidence about 1440px light mode.
 *
 * Appearance is EMULATED rather than stored: DalyHub ships one generated
 * light/dark pair (ADR-074), so emulating `prefers-color-scheme` exercises the
 * same two stylesheets the explicit preference selects.
 *
 * ── This pass leaves the workspace as it found it ────────────────────────────
 * Every title capture opens the editor and leaves with **Escape**, so no rename
 * is persisted. The Task priority sequence changes P1 → P3 and then back to P1,
 * and the due-date sequence restores the seeded date, exactly as
 * `editing-consistency.spec.ts` does — a screenshot pass that quietly edits the
 * fixtures makes the next run's evidence a picture of the last run.
 */

import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

const OUT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "editing-consistency-2026-08",
);

const DESKTOP = { width: 1440, height: 1000 };
const MOBILE = { width: 390, height: 844 };

const TASK_DRAWER = "/tasks?drawer=task:t-search-e2e";

test.skip(
  process.env.CAPTURE_SCREENSHOTS !== "1",
  "Screenshot capture is opt-in (set CAPTURE_SCREENSHOTS=1).",
);

test.beforeAll(() => {
  mkdirSync(OUT, { recursive: true });
});

async function shot(page: Page, name: string) {
  await page.screenshot({
    path: join(OUT, `${name}.png`),
    fullPage: false,
    animations: "disabled",
  });
}

/**
 * Capture a record title at rest and while being edited, then leave WITHOUT
 * saving. The pair is the point: "looks like content until you touch it" is a
 * claim about two states, and one of them is the one people forget to check.
 */
async function titlePair(
  page: Page,
  path: string,
  field: string,
  name: string,
) {
  await gotoFixture(page, path);
  const trigger = page.getByRole("button", {
    name: new RegExp(`^${field}: `),
  });
  await expect(trigger).toBeVisible();
  await shot(page, `${name}-rest`);

  await trigger.hover();
  await shot(page, `${name}-hover`);

  await trigger.click();
  await expect(page.getByRole("textbox", { name: field })).toBeFocused();
  await shot(page, `${name}-editing`);

  await page.keyboard.press("Escape");
  await expect(page.getByRole("textbox", { name: field })).toHaveCount(0);
}

test.describe("EDIT-02 — record titles, before and while editing", () => {
  test.use({ viewport: DESKTOP });

  test("captures the Note and Project titles in both appearances", async ({
    page,
  }) => {
    test.slow();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await titlePair(
        page,
        "/notes/n-search-e2e",
        "Note title",
        `note-title-${scheme}`,
      );
      await titlePair(
        page,
        "/projects/pr-website",
        "Project name",
        `project-title-${scheme}`,
      );
    }
  });
});

test.describe("EDIT-02 — a selected value changes directly", () => {
  test.use({ viewport: DESKTOP });

  test("captures P1 → menu → P3, and restores the fixture", async ({
    page,
  }) => {
    test.slow();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await gotoFixture(page, TASK_DRAWER);
      await expect(page.getByRole("dialog")).toBeVisible();

      const priority = page.getByRole("button", { name: /^Priority: / });
      await expect(priority).toHaveAccessibleName("Priority: P1 · Urgent");
      await shot(page, `task-priority-set-${scheme}`);

      // The menu, with the current value announced and every other value one
      // press away — and the separated Clear command at the end.
      await priority.click();
      await expect(page.getByRole("menu")).toBeVisible();
      await shot(page, `task-priority-menu-${scheme}`);

      // Set → DIFFERENT set, with no clearing step in between.
      await page.getByRole("menuitemradio", { name: "P3 · Normal" }).click();
      await expect(
        page.getByRole("button", { name: "Priority: P3 · Normal" }),
      ).toBeVisible();
      await shot(page, `task-priority-changed-${scheme}`);

      // Set → UNSET, and the genuinely empty state that follows.
      await page.getByRole("button", { name: /^Priority: / }).click();
      await page.getByRole("menuitemradio", { name: "Clear priority" }).click();
      await expect(
        page.getByRole("button", { name: "Priority: No priority" }),
      ).toBeVisible();
      await shot(page, `task-priority-unset-${scheme}`);

      // UNSET → set, in one action, and the fixture is back where it started.
      await page.getByRole("button", { name: /^Priority: / }).click();
      await page.getByRole("menuitemradio", { name: "P1 · Urgent" }).click();
      await expect(
        page.getByRole("button", { name: "Priority: P1 · Urgent" }),
      ).toBeVisible();
    }
  });
});

test.describe("EDIT-02 — dates and long-form", () => {
  test.use({ viewport: DESKTOP });

  test("captures the Goal's inline date and definition editors", async ({
    page,
  }) => {
    test.slow();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await gotoFixture(page, "/goals/g-launch");

      const target = page.getByRole("button", { name: /^Target date: / });
      await expect(target).toBeVisible();
      await shot(page, `goal-date-rest-${scheme}`);
      await target.click();
      await expect(
        page.getByRole("dialog", { name: "Edit target date" }),
      ).toBeVisible();
      await shot(page, `goal-date-editing-${scheme}`);
      await page.keyboard.press("Escape");

      const definition = page.getByRole("button", {
        name: /^Definition of done: /,
      });
      await expect(definition).toBeVisible();
      await shot(page, `goal-definition-rest-${scheme}`);
      await definition.click();
      await expect(
        page.getByRole("textbox", { name: "Definition of done" }),
      ).toBeFocused();
      await shot(page, `goal-definition-editing-${scheme}`);
      await page.getByRole("button", { name: "Cancel", exact: true }).click();
    }
  });

  test("captures the Diary and Meeting writing surfaces side by side", async ({
    page,
  }) => {
    test.slow();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });

      // The Diary entry panel — the surface that used to be a bare textarea.
      await gotoFixture(page, "/diary?inspector=edit:d-search-e2e");
      await expect(
        page.getByRole("group", { name: "Details" }).first(),
      ).toBeVisible();
      await shot(page, `diary-editor-${scheme}`);

      // The Meeting notes — the same editor, so the two captures should be
      // indistinguishable apart from their content.
      await gotoFixture(page, "/meeting/m-search-e2e");
      await expect(
        page.getByRole("group", { name: "Notes" }).first(),
      ).toBeVisible();
      await shot(page, `meeting-editor-${scheme}`);
    }
  });
});

test.describe("EDIT-02 — on a phone", () => {
  test.use({ viewport: MOBILE });

  test("captures inline editing and the editor toolbar at 390px", async ({
    page,
  }) => {
    test.slow();
    for (const scheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme: scheme });

      await titlePair(
        page,
        "/notes/n-search-e2e",
        "Note title",
        `phone-note-title-${scheme}`,
      );

      // The writing toolbar on a phone: it scrolls inside its own box rather
      // than wrapping into several rows, which is the whole reason it is a
      // glyph row and not eleven word-buttons.
      await gotoFixture(page, "/notes/n-search-e2e");
      await expect(
        page.getByRole("toolbar", { name: /Formatting/ }),
      ).toBeVisible();
      await shot(page, `phone-editor-toolbar-${scheme}`);

      // An anchored menu at 390px: it flips to the inline-end edge rather than
      // hanging off the viewport.
      await gotoFixture(page, TASK_DRAWER);
      await expect(page.getByRole("dialog")).toBeVisible();
      await page.getByRole("button", { name: /^Priority: / }).click();
      await expect(page.getByRole("menu")).toBeVisible();
      await shot(page, `phone-priority-menu-${scheme}`);
      await page.keyboard.press("Escape");
    }
  });
});
