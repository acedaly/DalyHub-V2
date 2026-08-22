import { expect, test } from "@playwright/test";

import { comboboxOption } from "./helpers";
import type { Page } from "@playwright/test";

/**
 * DS-06 — Shared Forms & field controls, driven end to end against the
 * development-auth server where the dev-only fixture (`/design/forms`) is mounted.
 *
 * Non-brittle: asserts roles, accessible names, visible status text and layout
 * invariants — never pixel snapshots. Covers the explicit-save journey (validate,
 * recover, submit), server-failure draft preservation, autosave status + retry,
 * the entity-link picker (search/create/remove), a keyboard-only path, 320px
 * layout, dark theme and reduced motion, and dirty-navigation protection.
 */

const FIXTURE = "/design/forms";

async function gotoFixture(page: Page) {
  await page.goto(FIXTURE);
  await expect(page.locator('[data-hydrated="true"]')).toBeVisible();
}

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

const explicit = (page: Page) => page.getByTestId("explicit-form");

test.describe("DS-06 — desktop", () => {
  test("validates on submit, recovers, and submits an explicit form", async ({
    page,
  }) => {
    await gotoFixture(page);
    const form = explicit(page);

    // Submitting empty surfaces the error summary and blocks the save.
    await form.getByRole("button", { name: "Save" }).click();
    await expect(form.getByRole("alert")).toBeVisible();
    await expect(page.getByTestId("explicit-saved")).toHaveCount(0);

    // Recover: fill the required title and submit successfully.
    await form.getByRole("textbox", { name: /Title/ }).fill("Website relaunch");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("explicit-saved")).toBeVisible();
    await expect(form.getByRole("alert")).toHaveCount(0);
  });

  test("async validation rejects a taken title", async ({ page }) => {
    await gotoFixture(page);
    const form = explicit(page);
    const title = form.getByRole("textbox", { name: /Title/ });
    await title.fill("taken");
    await title.blur();
    await expect(
      form.getByText("That title is already taken.").first(),
    ).toBeVisible();
  });

  test("a server failure preserves the entire draft", async ({ page }) => {
    await gotoFixture(page);
    const form = explicit(page);
    await form.getByRole("textbox", { name: /Title/ }).fill("Keep me");
    await form
      .getByRole("checkbox", { name: /Simulate a server failure/ })
      .check();
    await form.getByRole("button", { name: "Save" }).click();

    await expect(form.getByRole("alert")).toBeVisible();
    // The draft is intact.
    await expect(form.getByRole("textbox", { name: /Title/ })).toHaveValue(
      "Keep me",
    );
    await expect(page.getByTestId("dirty-state")).toHaveText("Unsaved changes");
  });

  test("autosave shows deterministic status and retries after a failure", async ({
    page,
  }) => {
    await gotoFixture(page);
    const autosave = page.getByTestId("autosave-form");

    // The failing field: type "fail" → Couldn't save → Retry stays failed;
    // fix the value → Saved.
    const failing = autosave.getByRole("textbox", { name: /fails on/ }).first();
    await failing.fill("please fail");
    await failing.blur();
    await expect(autosave.getByText("Couldn’t save").first()).toBeVisible();
    await expect(failing).toHaveValue("please fail"); // input preserved

    await failing.fill("all good now");
    await failing.blur();
    await expect(autosave.getByText("Saved").first()).toBeVisible();
  });

  test("entity-link picker searches, creates and removes a link", async ({
    page,
  }) => {
    await gotoFixture(page);
    const form = explicit(page);
    const combo = form.getByRole("combobox", { name: /Related items/ });
    await combo.click();
    await combo.fill("brief");
    const option = await comboboxOption(combo, /Creative brief/);
    await expect(option).toBeVisible();
    await option.click();

    // The link now appears with a Remove control.
    const remove = form.getByRole("button", {
      name: /Remove link to Creative brief/,
    });
    await expect(remove).toBeVisible();
    await remove.click();
    await expect(remove).toHaveCount(0);
  });

  test("keyboard-only: create a link via the listbox", async ({ page }) => {
    await gotoFixture(page);
    const form = explicit(page);
    const combo = form.getByRole("combobox", { name: /Related items/ });
    await combo.focus();
    await combo.fill("Mel");
    await expect(await comboboxOption(combo, /Mel Okoye/)).toBeVisible();
    await combo.press("ArrowDown");
    await combo.press("Enter");
    await expect(
      form.getByRole("button", { name: /Remove link to Mel Okoye/ }),
    ).toBeVisible();
  });

  test("dirty navigation is intercepted, not silently discarded", async ({
    page,
  }) => {
    await gotoFixture(page);
    const form = explicit(page);
    await form.getByRole("textbox", { name: /Title/ }).fill("Unsaved work");

    // Navigate away via the sidebar; the guard must intercept.
    await page.getByRole("link", { name: "Areas" }).first().click();
    const dialog = page.getByRole("alertdialog", {
      name: /unsaved changes/i,
    });
    await expect(dialog).toBeVisible();
    // Stay keeps us on the form with the draft intact.
    await dialog.getByRole("button", { name: "Stay" }).click();
    await expect(form.getByRole("textbox", { name: /Title/ })).toHaveValue(
      "Unsaved work",
    );
  });

  /*
   * DOC-EDITOR-01 — the long-form field in this fixture is now the SHARED writing
   * surface (`MarkdownEditorField`), which is what every product form uses. The
   * control it replaced was a source textarea plus a "Show preview" disclosure,
   * and it is deleted rather than kept beside the one the product uses.
   *
   * So what this asserts changed with it: the field edits Markdown SOURCE and
   * carries the same formatting toolbar as a Note. Safe RENDERING is a property
   * of the one FND-08 pipeline, proved where a reading surface exists — the
   * editor's Read mode (`notes.spec.ts`, `editor-geometry.spec.ts`) — not by a
   * second preview affordance inside a form.
   */
  test("the long-form field is the shared writing surface, editing Markdown source", async ({
    page,
  }) => {
    await gotoFixture(page);
    const form = explicit(page);
    /*
     * Wait on the shared `data-editor-ready` contract before typing. Until
     * enhancement lands, the live control is still the SSR `<textarea>`, and
     * anything typed into it is discarded when CodeMirror replaces it.
     */
    await expect(
      form.locator('.dh-md-editor[data-editor-ready="true"]'),
    ).toBeVisible({ timeout: 15_000 });
    /*
     * The enhanced surface is CodeMirror's `contentDOM` — a `div` with
     * `role="textbox"`, so it has no `.value` to assert against.
     */
    const surface = form.getByRole("textbox", { name: /Description/ });
    await surface.click();
    await page.keyboard.type("# Heading");
    await page.keyboard.press("Enter");
    await page.keyboard.press("Enter");
    await page.keyboard.type("Some **bold** text.");
    /*
     * The SOURCE is what is held — the syntax is still there, not turned into
     * HTML, so a heading is still `#` and bold is still `**`. Read it the way
     * `notes.spec.ts` does: the live decoration conceals a marker unless the
     * selection is inside it, so select all first and the joined visible line
     * text IS the source.
     */
    await page.keyboard.press("ControlOrMeta+a");
    const source = await form.locator(".cm-content").evaluate((el) =>
      Array.from(el.querySelectorAll(".cm-line"))
        .map((line) => line.textContent ?? "")
        .join("\n"),
    );
    expect(source).toBe("# Heading\n\nSome **bold** text.");
    // ...and it is the same toolbar a Note gets, not a bespoke one.
    await expect(
      form.getByRole("toolbar", { name: /Description formatting/ }),
    ).toBeVisible();
    await expect(form.getByRole("button", { name: "Bold" })).toBeVisible();
  });
});

test.describe("DS-06 — responsive & theming", () => {
  test("no horizontal overflow at 320px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 720 });
    await gotoFixture(page);
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
    // Interact with a control at narrow width without breaking layout.
    await explicit(page).getByRole("textbox", { name: /Title/ }).fill("Narrow");
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("dark theme renders the fixture", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page);
    await expect(
      page.getByRole("heading", {
        name: "Shared Forms & field controls (DS-06)",
      }),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("reduced motion is honoured without breaking interaction", async ({
    page,
  }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await gotoFixture(page);
    const form = explicit(page);
    await form.getByRole("textbox", { name: /Title/ }).fill("Calm");
    await form.getByRole("button", { name: "Save" }).click();
    await expect(page.getByTestId("explicit-saved")).toBeVisible();
  });
});
