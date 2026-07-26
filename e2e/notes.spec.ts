import { expect, test, type Page } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";
import {
  cleanupAllNoteFixtures,
  cleanupNoteByTitle,
  uniqueNoteTitle,
} from "./notes-fixtures";

/**
 * NOTES-05 — the writing-first live Markdown editor.
 *
 * A real journey over the seeded Worker/D1 app: navigate to Notes, create a
 * uniquely test-owned Note, and write in the ONE live editor where Markdown is
 * styled as it is typed (headings render, task items become checkboxes, etc.)
 * while the SOURCE stays canonical. It proves dependable autosave (no Save
 * button), the unobtrusive Read mode (the shared FND-08 render), the formatting
 * toolbar + keyboard shortcuts, the delete/restore lifecycle, keyboard-only
 * creation, focus restoration, axe (light + dark), 44px touch targets and no
 * horizontal overflow from 320px up.
 *
 * CodeMirror interaction notes: the editor is an accessible `textbox`
 * (`role="textbox"`, `aria-label="Note"`). We type with the keyboard; we read
 * the exact source by selecting all (which reveals every concealed Markdown
 * marker — see `live-decorations.ts`) and joining the visible line text; and we
 * confirm persistence both by the real save request payload and by re-rendering
 * after a reload.
 */

// Notes this suite creates, tracked so `afterEach` tears down only its OWN
// test-owned Notes by their unique titles (never a broad delete). See
// `./notes-fixtures.ts` for the FK-ordered, race-tolerant cleanup itself.
const ownedNoteTitles = new Set<string>();
function ownNote(title: string): string {
  ownedNoteTitles.add(title);
  return title;
}

// --- CodeMirror interaction helpers ---------------------------------------

const editorBox = (page: Page) => page.getByRole("textbox", { name: "Note" });

/** Wait for the live writing surface to be READY — i.e. CodeMirror has mounted
 * and replaced the SSR `<textarea>` fallback — via the editor's own stable
 * `data-editor-ready` contract rather than CodeMirror's internal `.cm-editor`
 * class. This guarantees we never type into the transient fallback, and it does
 * not depend on any library-internal DOM shape.
 *
 * `timeout` is a bounded, targeted wait for the known async client mount — NOT
 * the global timeout. The very first editor mount on a cold dev server compiles
 * the code-split CodeMirror chunk (~525 kB), which on a loaded CI runner can
 * take longer than a warm mount by a wide margin; the first editor-mounting test
 * in each file pays that once (with a matching per-test timeout) and every later
 * call resolves near-instantly against the warmed module cache. */
async function waitForEditor(page: Page, timeout = 30_000): Promise<void> {
  await expect(page.locator('[data-editor-ready="true"]')).toBeVisible({
    timeout,
  });
}

/** Open the "New note" dialog and let the drawer-open loader revalidation
 * settle before we type + submit. Opening the drawer is itself a route
 * navigation that revalidates the `/notes` loader; submitting the create form
 * then navigates to the new record. If the create-navigation is issued while
 * that drawer-open revalidation is still in flight (likely on a cold CI shard),
 * the two race and the record navigation can be dropped — leaving the URL stuck
 * on `/notes?drawer=new-note`. Waiting for the network to settle (a real
 * condition, not a fixed delay) closes that window deterministically. */
async function openNewNoteDialog(page: Page) {
  await page.getByRole("link", { name: "New note" }).first().click();
  const dialog = page.getByRole("dialog", { name: "New note" });
  await expect(dialog).toBeVisible();
  await page.waitForLoadState("networkidle");
  return dialog;
}

async function focusEditor(page: Page): Promise<void> {
  await waitForEditor(page);
  await page.locator(".cm-content").click();
}

/** Clear the editor and type `text`. Avoids relying on list auto-continuation
 * by only being used for content the test types verbatim. */
async function clearAndType(page: Page, text: string): Promise<void> {
  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Delete");
  await page.keyboard.type(text);
}

/** Read the exact Markdown source. Selecting all reveals every concealed marker
 * (a construct shows raw source while the selection is inside it), so the joined
 * visible line text equals the source. */
async function readSource(page: Page): Promise<string> {
  await focusEditor(page);
  await page.keyboard.press("ControlOrMeta+a");
  return page.locator(".cm-content").evaluate((el) =>
    Array.from(el.querySelectorAll(".cm-line"))
      .map((line) => line.textContent ?? "")
      .join("\n"),
  );
}

/** Blur the editor to force an immediate autosave. */
async function blurEditor(page: Page): Promise<void> {
  await page
    .locator(".cm-content")
    .evaluate((el) => (el as HTMLElement).blur());
}

async function createNote(page: Page, title: string): Promise<string> {
  ownNote(title);
  await gotoFixture(page, "/notes");
  const dialog = await openNewNoteDialog(page);
  await dialog.getByLabel(/Title/).fill(title);
  await dialog.getByRole("button", { name: "Create note" }).click();
  await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
  return page.url();
}

test.describe("NOTES-05 — writing-first live Markdown editor", () => {
  // Sweep any Notes a previously crashed run left behind under the shared
  // prefix, then hand each test a clean slate. Per-test teardown below removes
  // only that test's OWN Notes by their unique titles.
  test.beforeAll(async () => cleanupAllNoteFixtures());
  test.afterEach(async () => {
    for (const title of ownedNoteTitles) {
      await cleanupNoteByTitle(title);
    }
    ownedNoteTitles.clear();
  });

  // Regression coverage for the create → editor-ready lifecycle (the flow whose
  // `.cm-editor` timeout was the NOTES-05 CI baseline failure). It is FIRST so
  // it also absorbs the one-time cold client-mount of the code-split CodeMirror
  // chunk on the dev server; the explicit per-test timeout + generous readiness
  // wait grant that one-time compile head room WITHOUT touching the global
  // timeout or masking a real defect — the assertions below prove the surface
  // genuinely transitions from the SSR fallback to the live editor, and every
  // later test then mounts against a warm module cache.
  test("create → the live editor becomes ready and replaces the SSR fallback", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const noteTitle = uniqueNoteTitle("ready");
    await createNote(page, noteTitle);

    // The live surface signals readiness via the stable `data-editor-ready`
    // contract, then the fallback textarea is gone and the CodeMirror surface is
    // the accessible "Note" textbox.
    await waitForEditor(page, 90_000);
    await expect(page.locator(".dh-md-editor__fallback")).toHaveCount(0);
    await expect(editorBox(page)).toBeVisible();
    await expect(page.locator(".cm-content")).toBeVisible();
  });

  test("navigate, create, write with live formatting, autosave (no Save button), Read mode, reload, rename, Activity", async ({
    page,
  }) => {
    const noteTitle = uniqueNoteTitle("journey");
    const renamedTitle = `${noteTitle} (renamed)`;
    ownNote(noteTitle);
    ownNote(renamedTitle);

    // 1. Navigate to Notes — the real collection replaced the PX-03 placeholder.
    await gotoFixture(page, "/notes");
    await expect(
      page.getByRole("heading", { level: 1, name: "Notes" }),
    ).toBeVisible();
    await expectNoAxeViolations(page);

    // 2. Create a Note (title-only), validation first.
    const newNoteDialog = await openNewNoteDialog(page);
    await newNoteDialog.getByRole("button", { name: "Create note" }).click();
    await expect(
      newNoteDialog.getByText("A title is required").first(),
    ).toBeVisible();
    await newNoteDialog.getByLabel(/Title/).fill(noteTitle);
    await newNoteDialog.getByRole("button", { name: "Create note" }).click();

    // 3. Lands on the canonical record.
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
    const noteUrl = page.url();
    await expect(page.getByRole("heading", { name: noteTitle })).toBeVisible();

    // 4. There is NO Save button, and NO Source/Split/Preview.
    await expect(page.getByRole("button", { name: "Save" })).not.toBeVisible();
    for (const gone of ["Source", "Split", "Preview"]) {
      await expect(page.getByRole("button", { name: gone })).not.toBeVisible();
    }

    // 5. Write a heading followed by body — the heading renders LIVE (its `#`
    // marker is concealed once the caret leaves the line, and it is larger).
    await clearAndType(page, "# Project kickoff\nAgenda and owners.");
    await expect(page.getByText("Unsaved")).toBeVisible();
    const h1Line = page.locator(".cm-dh-h1");
    await expect(h1Line).toHaveText("Project kickoff");
    // 6. Autosave persists without any Save button (reload below re-proves it).
    await blurEditor(page);
    await expect(page.getByText("Saved")).toBeVisible();

    // 7. Read mode renders through the shared safe FND-08 pipeline, then back.
    await page.getByRole("button", { name: "Read" }).click();
    const reading = page.locator(".dh-md-editor__reading");
    await expect(
      reading.getByRole("heading", { level: 1, name: "Project kickoff" }),
    ).toBeVisible();
    await expect(reading.locator("script")).toHaveCount(0);
    await expectNoAxeViolations(page);
    await page.getByRole("button", { name: "Write" }).click();
    await expect(editorBox(page)).toBeVisible();

    // 8. Reload and confirm the exact saved source round-trips.
    await gotoFixture(page, noteUrl);
    await expect(page.locator(".cm-dh-h1")).toBeVisible();
    expect(await readSource(page)).toContain("# Project kickoff");

    // 9. Rename through the generic entity lifecycle; Back/Forward/Escape work.
    const renameButton = page.getByRole("button", { name: "Rename" });
    await renameButton.click();
    const renameDialog = page.getByRole("dialog", { name: "Rename note" });
    await expect(renameDialog).toBeVisible();
    await expect(page).toHaveURL(/drawer=rename/);
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.goForward();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(renameButton).toBeFocused();
    await renameButton.click();
    await renameDialog.getByLabel(/Title/).fill(renamedTitle);
    await renameDialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("heading", { name: renamedTitle }),
    ).toBeVisible();

    // 10. Activity holds note.content_updated.
    await page.getByRole("tab", { name: "Activity" }).click();
    const activityFeed = page.getByRole("feed", { name: "Note activity" });
    await expect(activityFeed.getByText("Updated note content")).toBeVisible();
    await expectNoAxeViolations(page);

    // 11. No horizontal overflow across the responsive matrix.
    for (const viewport of RESPONSIVE_VIEWPORTS) {
      await page.setViewportSize(viewport);
      await expectNoHorizontalOverflow(page);
    }

    // 12. Axe on the collection in dark mode.
    await page.emulateMedia({ colorScheme: "dark" });
    await gotoFixture(page, "/notes");
    await expectNoAxeViolations(page);
    await expectNoHorizontalOverflow(page);
    await page.emulateMedia({ colorScheme: "light" });
  });

  test("live preview: task checkboxes, thematic rules and tables render while writing", async ({
    page,
  }) => {
    const noteTitle = uniqueNoteTitle("live");
    await createNote(page, noteTitle);

    // A task item becomes an interactive checkbox (its `- [ ]` concealed).
    await clearAndType(page, "- [ ] first task\nmore text");
    const checkbox = page.locator(".cm-content").getByRole("checkbox");
    await expect(checkbox.first()).toBeVisible();

    // A thematic break renders as an <hr> widget.
    await clearAndType(page, "above\n\n---\n\nbelow");
    await expect(page.locator(".cm-dh-hr hr")).toBeVisible();

    // A GFM table renders as a real table widget.
    await clearAndType(page, "| A | B |\n| - | - |\n| 1 | 2 |\n\nafter");
    await expect(page.locator(".cm-dh-table").getByRole("table")).toBeVisible();
    await expect(
      page.locator(".cm-dh-table").getByRole("cell", { name: "1" }),
    ).toBeVisible();
  });

  test("autosaves after the real debounce with no interaction, and a later edit during an in-flight save is not lost", async ({
    page,
  }) => {
    const noteTitle = uniqueNoteTitle("debounce");
    const noteUrl = await createNote(page, noteTitle);

    // Type and do nothing — the debounced autosave still fires.
    await clearAndType(page, "First pass content");
    await expect(page.getByText("Unsaved")).toBeVisible();
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 5_000 });

    // Hold the NEXT save in flight so a further edit lands during it.
    let releaseResponse: () => void = () => {};
    const gate = new Promise<void>((resolve) => {
      releaseResponse = resolve;
    });
    let gateArmed = true;
    await page.route("**/mutate", async (route) => {
      const body = route.request().postData() ?? "";
      if (
        route.request().method() !== "POST" ||
        !body.includes("update_content") ||
        !gateArmed
      ) {
        await route.continue();
        return;
      }
      gateArmed = false;
      await gate;
      await route.continue();
    });

    await clearAndType(page, "Content A superseded");
    await blurEditor(page);
    await expect(page.getByText("Saving…")).toBeVisible();

    // Edit again WHILE the save is held in flight.
    await clearAndType(page, "Content B the final value");
    releaseResponse();
    await expect(page.getByText("Saved")).toBeVisible({ timeout: 10_000 });

    // The FINAL value persisted, not the superseded one.
    await expect
      .poll(
        async () => {
          await gotoFixture(page, noteUrl);
          return readSource(page);
        },
        { timeout: 10_000 },
      )
      .toContain("Content B the final value");
    await page.unroute("**/mutate");
  });

  test("a failed save shows the error state with Retry, preserves the draft, and Retry recovers", async ({
    page,
  }) => {
    const noteTitle = uniqueNoteTitle("retry");
    await createNote(page, noteTitle);

    let failNext = true;
    await page.route("**/mutate", async (route) => {
      if (route.request().method() !== "POST" || !failNext) {
        await route.continue();
        return;
      }
      failNext = false;
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "update_content",
          ok: false,
          formError: "Simulated failure for e2e.",
        }),
      });
    });

    await clearAndType(page, "Draft that must survive a failure");
    await blurEditor(page);

    await expect(page.getByText("Couldn't save")).toBeVisible();
    await expect(page.getByText("Simulated failure for e2e.")).toBeVisible();
    expect(await readSource(page)).toContain(
      "Draft that must survive a failure",
    );

    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("Saved")).toBeVisible();
    await page.unroute("**/mutate");
  });

  test("blocks navigation while unsaved, and Leave/Stay both behave correctly", async ({
    page,
  }) => {
    const noteTitle = uniqueNoteTitle("guard");
    await createNote(page, noteTitle);

    // Hold the save in flight forever so the guard sees a genuinely unsaved state.
    await page.route("**/mutate", async (route) => {
      if (
        route.request().method() === "POST" &&
        (route.request().postData() ?? "").includes("update_content")
      ) {
        return; // never resolves — the save stays "saving"
      }
      await route.continue();
    });

    await clearAndType(page, "Unsaved edit that must be protected");
    await blurEditor(page);
    await expect(page.getByText("Saving…")).toBeVisible();

    await page.getByRole("link", { name: "Notes" }).first().click();
    await expect(page.getByText("Leave with unsaved changes?")).toBeVisible();

    // Stay: navigation cancelled.
    await page.getByRole("button", { name: "Stay" }).click();
    await expect(
      page.getByText("Leave with unsaved changes?"),
    ).not.toBeVisible();

    // Leave: navigation proceeds.
    await page.getByRole("link", { name: "Notes" }).first().click();
    await expect(page.getByText("Leave with unsaved changes?")).toBeVisible();
    await page.getByRole("button", { name: "Leave" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Notes" }),
    ).toBeVisible();
    await page.unroute("**/mutate");
  });

  test("formatting toolbar and keyboard shortcuts edit the Markdown source; autosave persists it", async ({
    page,
  }) => {
    const noteTitle = uniqueNoteTitle("toolbar");
    const noteUrl = await createNote(page, noteTitle);

    // Toolbar: select all, apply Bold → the whole line is wrapped in source.
    await clearAndType(page, "make me bold");
    await focusEditor(page);
    await page.keyboard.press("ControlOrMeta+a");
    const toolbar = page.getByRole("toolbar", { name: "Formatting" });
    await toolbar.getByRole("button", { name: "Bold" }).click();
    expect(await readSource(page)).toContain("**make me bold**");

    // Toolbar: Checklist over the current line makes a task item.
    await clearAndType(page, "buy milk");
    await focusEditor(page);
    await page.keyboard.press("ControlOrMeta+a");
    await toolbar.getByRole("button", { name: "Checklist" }).click();
    expect(await readSource(page)).toContain("- [ ] buy milk");

    // Keyboard shortcut: Mod-i italicises the selection. Register the save
    // listener BEFORE the edit so a debounce-triggered save can't be missed.
    await clearAndType(page, "slanted");
    const savedItalic = page.waitForRequest(
      (req) =>
        req.url().includes("/mutate") &&
        req.method() === "POST" &&
        (req.postData() ?? "").includes("_slanted_"),
    );
    await focusEditor(page);
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("ControlOrMeta+i");
    expect(await readSource(page)).toContain("_slanted_");

    // The edit autosaves; confirm it persisted across a reload.
    await blurEditor(page);
    await savedItalic;
    await gotoFixture(page, noteUrl);
    expect(await readSource(page)).toContain("_slanted_");

    // Roving tabindex across the toolbar (one Tab stop; Arrow moves focus).
    await toolbar.getByRole("button", { name: "Heading" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(toolbar.getByRole("button", { name: "Bold" })).toBeFocused();

    // Touch targets and axe on the authoring surface (light + dark).
    await expectMinTouchTarget(toolbar.getByRole("button", { name: "Bold" }));
    await expectMinTouchTarget(page.getByRole("button", { name: "Read" }));
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoAxeViolations(page);
    await page.emulateMedia({ colorScheme: "light" });
  });

  test("delete removes the Note from the active collection; Restore recovers it with content intact", async ({
    page,
  }) => {
    const noteTitle = uniqueNoteTitle("lifecycle");
    await createNote(page, noteTitle);

    await clearAndType(page, "# Keep me\nsurvive delete then restore");
    await blurEditor(page);
    await expect(page.getByText("Saved")).toBeVisible();

    await page.getByRole("button", { name: "Delete note" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Notes" }),
    ).toBeVisible();
    const toasts = page.getByRole("region", { name: "Notifications" });
    await expect(toasts.getByText(`"${noteTitle}" deleted`)).toBeVisible();

    await page.getByRole("link", { name: "Deleted" }).click();
    await expect(page).toHaveURL(/state=deleted/);
    const deletedList = page.getByRole("list", { name: "Deleted notes" });
    await expect(deletedList.getByText(noteTitle)).toBeVisible();
    await expectNoAxeViolations(page);

    const noteRow = deletedList
      .getByRole("listitem")
      .filter({ hasText: noteTitle });
    await noteRow.getByRole("button", { name: "Restore" }).click();
    await expect(
      page
        .getByRole("region", { name: "Notifications" })
        .getByText(`"${noteTitle}" restored`),
    ).toBeVisible();

    await page.getByRole("link", { name: "Active" }).click();
    await expect(page).toHaveURL("/notes");
    await page.getByRole("link", { name: noteTitle }).click();
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
    await expect(page.locator(".cm-dh-h1")).toBeVisible();
    expect(await readSource(page)).toContain("# Keep me");
  });

  test("keyboard-only: reach Notes, open New note, and submit with the keyboard", async ({
    page,
  }) => {
    const noteTitle = ownNote(uniqueNoteTitle("kbd"));
    await gotoFixture(page, "/notes");
    const newNoteLink = page.getByRole("link", { name: "New note" }).first();
    await newNoteLink.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "New note" });
    await expect(dialog).toBeVisible();
    // Let the drawer-open loader revalidation settle before submitting, so the
    // create-navigation isn't dropped racing it (see openNewNoteDialog).
    await page.waitForLoadState("networkidle");
    await dialog.getByLabel(/Title/).focus();
    await page.keyboard.type(noteTitle);
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/notes\/[^/?#]+$/);
    await expect(page.getByRole("heading", { name: noteTitle })).toBeVisible();
  });

  test("mobile (390px and 320px): create, write, autosave and delete work with no horizontal overflow", async ({
    page,
  }) => {
    const noteTitle = uniqueNoteTitle("mobile");

    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await gotoFixture(page, "/notes");
      await expectNoHorizontalOverflow(page);
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await createNote(page, noteTitle);
    await expectNoHorizontalOverflow(page);

    // The formatting toolbar is present on the phone; it scrolls, never overflows.
    await expect(
      page.getByRole("toolbar", { name: "Formatting" }),
    ).toBeVisible();

    await clearAndType(page, "# Mobile heading\nphone editing works");
    await expect(page.locator(".cm-dh-h1")).toHaveText("Mobile heading");
    await blurEditor(page);
    await expect(page.getByText("Saved")).toBeVisible();
    await expectNoHorizontalOverflow(page);

    await page.setViewportSize({ width: 320, height: 720 });
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);

    await page.getByRole("button", { name: "Delete note" }).click();
    await expect(
      page.getByRole("heading", { level: 1, name: "Notes" }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });
});
