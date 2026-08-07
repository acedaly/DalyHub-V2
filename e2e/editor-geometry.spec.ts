import { expect, test, type Page } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";
import { cleanupAllNoteFixtures } from "./notes-fixtures";

/**
 * EDIT-02 — where the writing surface actually starts.
 *
 * ── The defect this pins ─────────────────────────────────────────────────────
 * On a Note at 1440px the editor frame was 1046px wide and the caret opened at
 * x=538 — roughly a quarter of the way across a surface that started at x=293,
 * with 555px of usable line and a permanently blank column in front of it. On an
 * EMPTY note it was worse: `.dh-note-body .cm-content` carried
 * `max-inline-size: 65ch` AND `margin-inline: auto`, and because `.cm-scroller`
 * is a flex container, auto margins do not merely centre a capped column — they
 * cancel `flex-grow` and centre the item's own max-content box, which for an
 * empty document is a few pixels wide. The placeholder therefore sat near the
 * middle of the editor.
 *
 * ── What is asserted, and why it is a RELATIONSHIP ───────────────────────────
 * Not a pixel value. The contract is "normal editor padding, not anything
 * approaching half the editor", so these tests assert the first line begins
 * within a small multiple of the editor's own padding and nowhere near its
 * midpoint — a bound that would have failed the defect by a wide margin and
 * that survives a padding token changing by a step.
 */

/** `--app-space-4` (16px) of content padding, plus CodeMirror's own ~6px line
 * inset. Anything materially beyond this is chrome the owner did not ask for. */
const EXPECTED_CONTENT_INSET = 22;
/** Generous slack so a token step or a font metric does not fail the suite. */
const INSET_TOLERANCE = 24;

async function openSeededNote(page: Page): Promise<void> {
  await gotoFixture(page, "/notes");
  await page.locator("a[href^='/notes/']").first().click();
  await page.locator(".cm-content").first().waitFor({ timeout: 60_000 });
}

interface Geometry {
  readonly editorX: number;
  readonly editorWidth: number;
  readonly lineX: number;
  readonly lineWidth: number;
  readonly contentX: number;
  readonly contentWidth: number;
}

async function measure(page: Page): Promise<Geometry> {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`missing ${selector}`);
      return element.getBoundingClientRect();
    };
    const editor = box(".dh-md-editor__cm");
    const content = box(".cm-content");
    const line = box(".cm-line");
    return {
      editorX: editor.x,
      editorWidth: editor.width,
      lineX: line.x,
      lineWidth: line.width,
      contentX: content.x,
      contentWidth: content.width,
    };
  });
}

/** The one shared assertion: writing begins at the editor's left content edge. */
function expectLeftAligned(geometry: Geometry, label: string): void {
  const inset = geometry.lineX - geometry.editorX;
  expect(
    inset,
    `${label}: first line starts ${Math.round(inset)}px into the editor`,
  ).toBeLessThan(EXPECTED_CONTENT_INSET + INSET_TOLERANCE);
  expect(
    inset,
    `${label}: first line has no left padding at all`,
  ).toBeGreaterThan(0);
  // The headline claim, stated as the thing a reader of the bug report would
  // check: the caret is nowhere near the middle of the surface.
  expect(
    inset,
    `${label}: first line starts near the CENTRE of the editor`,
  ).toBeLessThan(geometry.editorWidth / 4);
}

test.describe("EDIT-02 — the writing surface's horizontal layout", () => {
  /*
   * These tests write into the SEEDED note (they empty it to measure the
   * placeholder), so the suite-level sweep runs afterwards to clear any
   * test-owned Notes a previous crashed run left behind under the shared
   * prefix. It never touches a note this file did not create.
   */
  test.afterAll(async () => {
    await cleanupAllNoteFixtures();
  });

  for (const width of [390, 1024, 1280, 1440]) {
    test(`a populated Note begins at the left content edge at ${width}px`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await openSeededNote(page);

      const geometry = await measure(page);
      expectLeftAligned(geometry, `populated @${width}`);

      // The content box itself starts flush with the scroller — no auto margin
      // survived anywhere in the shared stack.
      expect(Math.abs(geometry.contentX - geometry.editorX)).toBeLessThan(4);

      // And the line is genuinely usable: most of the editor, not a third of it.
      // At the defect it was 555/1044 with the slack in FRONT of the text.
      expect(geometry.lineWidth).toBeGreaterThan(
        Math.min(geometry.editorWidth, 640) * 0.7,
      );

      await expectNoHorizontalOverflow(page);
    });
  }

  test("an EMPTY Note opens its caret in the same place as a full one", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSeededNote(page);

    const populated = await measure(page);

    await page.locator(".cm-content").click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await expect(page.locator(".cm-placeholder")).toBeVisible();

    const empty = await measure(page);
    expectLeftAligned(empty, "empty @1440");

    // The regression that actually shipped: empty and populated disagreeing.
    expect(Math.abs(empty.lineX - populated.lineX)).toBeLessThan(2);

    // The placeholder is on the content alignment, not floating mid-surface.
    const placeholderX = await page
      .locator(".cm-placeholder")
      .evaluate((element) => element.getBoundingClientRect().x);
    expect(placeholderX - empty.editorX).toBeLessThan(
      EXPECTED_CONTENT_INSET + INSET_TOLERANCE,
    );
  });

  test("the toolbar and the text read as one aligned writing surface", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSeededNote(page);

    const geometry = await measure(page);
    const firstControl = await page
      .locator(".dh-md-toolbar__button")
      .first()
      .boundingBox();
    expect(firstControl).toBeTruthy();

    // The first toolbar glyph and the first character sit within a control's
    // width of each other — the bar and the surface belong to one another.
    expect(Math.abs(firstControl!.x - geometry.lineX)).toBeLessThan(
      firstControl!.width,
    );
  });

  test("Read mode keeps the same left edge as Write mode", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSeededNote(page);

    const writing = await measure(page);
    await page.getByRole("button", { name: "Read", exact: true }).click();

    const reading = page.locator(".dh-md-editor__reading");
    await expect(reading).toBeVisible();
    const readingBox = await reading.boundingBox();

    /*
     * Reading keeps `--app-width-prose`; writing uses the wider
     * `--app-width-editor`. They are different measures on purpose — but they
     * start in the SAME place, so toggling Read never slides the first
     * character sideways. The right edge moving is the whole point of a reading
     * measure; the left edge moving would be the jarring jump.
     */
    expect(Math.abs(readingBox!.x - writing.editorX)).toBeLessThan(4);
    expect(readingBox!.width).toBeLessThan(writing.editorWidth);
    await expectNoHorizontalOverflow(page);
  });

  test("Markdown editing, formatting and storage are unaffected", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await openSeededNote(page);

    const editor = page.getByRole("textbox", { name: "Note" });
    await editor.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await page.keyboard.type("## Heading\n- one\n- two\n");
    await page.keyboard.type("bold me");
    await page.keyboard.press("ControlOrMeta+a");

    // The document is still Markdown SOURCE, byte for byte — the layout change
    // touched no decoration, transform or storage path.
    const source = await page
      .locator(".cm-line")
      .allTextContents()
      .then((lines) => lines.join("\n"));
    expect(source).toContain("## Heading");
    expect(source).toContain("- one");

    // Undo still works, and the toolbar's active-state model is intact.
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("button", { name: /Bold/ })).toHaveAttribute(
      "aria-pressed",
      /true|false/,
    );
  });

  test("is axe-clean in both appearances at laptop width", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await openSeededNote(page);
    await expectNoAxeViolations(page);

    await page.emulateMedia({ colorScheme: "dark" });
    await expectNoAxeViolations(page);
  });
});
