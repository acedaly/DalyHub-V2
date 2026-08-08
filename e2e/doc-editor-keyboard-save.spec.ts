/**
 * DOC-EDITOR-01 — keyboard save on the shared writing surface, in a real browser.
 *
 * The unit suite asserts the contract against the SSR/no-JS fallback (the surface
 * that exists before enhancement). This asserts the ENHANCED one — the CodeMirror
 * surface an owner actually types into — because that is where the binding could
 * be stolen by Markdown's own Enter handling or by CodeMirror's default
 * `Mod-Enter` (insert blank line), and neither can be observed without a browser.
 *
 * Two rules, one journey each:
 *   - ⌘/Ctrl+Enter saves, without leaving the text;
 *   - plain Enter is a PARAGRAPH and never saves. That is the one an owner
 *     discovers the hard way if it is wrong.
 *
 * The Diary entry panel is the surface under test because it is the writing-heavy
 * one whose save is explicit — an autosaving Note has nothing to commit.
 */

import { execFileSync } from "node:child_process";

import { expect, test, type Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

const WS = "local-dev-workspace";
const PREFIX = "DocEditor e2e ";

const ENTITY_QUERY = `
  SELECT id FROM entities
  WHERE workspace_id = '${WS}' AND type = 'diary' AND title LIKE '${PREFIX}%'
`;

function d1Execute(command: string): void {
  execFileSync(
    "pnpm",
    [
      "exec",
      "wrangler",
      "d1",
      "execute",
      "DB",
      "--local",
      "--command",
      command,
    ],
    {
      cwd: process.cwd(),
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
      stdio: "pipe",
    },
  );
}

function cleanup(): void {
  for (const command of [
    `DELETE FROM activity_subjects WHERE workspace_id = '${WS}' AND entity_id IN (${ENTITY_QUERY});`,
    `DELETE FROM activities WHERE workspace_id = '${WS}' AND NOT EXISTS (SELECT 1 FROM activity_subjects s WHERE s.workspace_id = activities.workspace_id AND s.activity_id = activities.id);`,
    `DELETE FROM diary_entry_details WHERE workspace_id = '${WS}' AND entity_id IN (${ENTITY_QUERY});`,
    `DELETE FROM entities WHERE workspace_id = '${WS}' AND id IN (${ENTITY_QUERY});`,
  ]) {
    d1Execute(command);
  }
}

/** Capture one Diary entry through the real capture panel and open its editor. */
async function captureAndEdit(page: Page, title: string): Promise<void> {
  await gotoFixture(page, "/diary");
  await page.getByRole("button", { name: "New Diary entry" }).first().click();
  const capture = page.getByRole("form", { name: "Quick capture" });
  await capture.getByRole("textbox", { name: /Title/ }).fill(title);
  await capture.getByRole("button", { name: "Capture" }).click();
  await expect(
    page.getByRole("heading", { level: 3, name: title }),
  ).toBeVisible();

  await page.getByRole("button", { name: title, exact: true }).click();
  await page.getByRole("button", { name: "Edit entry" }).click();
  await expect(page.getByRole("form", { name: "Edit entry" })).toBeVisible();
}

/** The enhanced writing surface, once CodeMirror has replaced the fallback. */
function writingSurface(page: Page) {
  return page
    .locator('.dh-md-editor[data-editor-ready="true"]')
    .getByRole("textbox", { name: "Details" });
}

test.describe("DOC-EDITOR-01 — the writing surface's keyboard save", () => {
  test.beforeAll(() => cleanup());
  test.afterEach(() => cleanup());

  test("⌘/Ctrl+Enter saves from inside the text, and the words survive a reload", async ({
    page,
  }) => {
    const title = `${PREFIX}keyboard-save-${Date.now()}`;
    await captureAndEdit(page, title);

    const surface = writingSurface(page);
    await expect(surface).toBeVisible();
    await surface.click();
    await page.keyboard.type("Saved with the keyboard.");

    // No mouse anywhere near the Save button.
    await Promise.all([
      page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          /\/diary\/[^/]+\/mutate$/.test(new URL(r.url()).pathname),
      ),
      page.keyboard.press("ControlOrMeta+Enter"),
    ]);

    await expect(page.getByRole("form", { name: "Edit entry" })).toHaveCount(0);

    // Read it back from the database through a fresh page load.
    await gotoFixture(page, "/diary");
    await page.getByRole("button", { name: title, exact: true }).click();
    await expect(
      page.getByText("Saved with the keyboard.", { exact: false }),
    ).toBeVisible();
  });

  test("plain Enter writes a paragraph and never saves", async ({ page }) => {
    const title = `${PREFIX}enter-is-a-paragraph-${Date.now()}`;
    await captureAndEdit(page, title);

    const surface = writingSurface(page);
    await expect(surface).toBeVisible();
    await surface.click();
    await page.keyboard.type("First paragraph.");

    let saves = 0;
    page.on("request", (request) => {
      if (
        request.method() === "POST" &&
        /\/diary\/[^/]+\/mutate$/.test(new URL(request.url()).pathname)
      ) {
        saves += 1;
      }
    });

    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Second paragraph.");

    // Still editing, nothing submitted, and the paragraph break is really there.
    await expect(page.getByRole("form", { name: "Edit entry" })).toBeVisible();
    expect(saves, "plain Enter must not submit").toBe(0);
    await expect(surface).toContainText("First paragraph.");
    await expect(surface).toContainText("Second paragraph.");
  });
});
