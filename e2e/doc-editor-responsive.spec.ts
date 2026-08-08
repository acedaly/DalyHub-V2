/**
 * DOC-EDITOR-01 — the writing surface across the whole supported width matrix.
 *
 * `editor-geometry.spec.ts` pins where writing STARTS, at four widths, against a
 * specific past defect. This one is the breadth pass DOC-EDITOR-01 asked for: the
 * canonical `RESPONSIVE_VIEWPORTS` list — 320 · 375 · 390 · 430 · phone landscape ·
 * tablet · laptop 1024 · 1280 · desktop 1440 · ultra-wide 2560 — with the four
 * things that actually go wrong on a long-form surface measured at every one:
 *
 *   1. no horizontal document overflow;
 *   2. the document does not begin halfway across the screen, and does not leave a
 *      large unexplained gutter beside it at wide widths;
 *   3. the toolbar does not collide with or overflow the page — it scrolls inside
 *      its own box instead;
 *   4. the toolbar's controls stay at 44px, which is DalyHub's bar and stricter
 *      than WCAG 2.2 AA's 24px.
 *
 * Everything asserted is a RELATIONSHIP between measured boxes, never a pixel
 * constant, so a spacing token moving by a step does not fail the suite.
 */

import { expect, test, type Page } from "@playwright/test";

import {
  RESPONSIVE_VIEWPORTS,
  TOUCH_TARGET_MIN,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";
import { cleanupAllNoteFixtures } from "./notes-fixtures";

interface Surface {
  readonly pageWidth: number;
  readonly editorX: number;
  readonly editorWidth: number;
  readonly lineX: number;
  readonly lineRight: number;
  readonly contentWidth: number;
  readonly scrollerWidth: number;
  readonly toolbarX: number;
  readonly toolbarRight: number;
  readonly toolbarScrollWidth: number;
  readonly toolbarClientWidth: number;
  readonly barBottom: number;
  readonly surfaceTop: number;
}

async function measure(page: Page): Promise<Surface> {
  return page.evaluate(() => {
    const box = (selector: string) => {
      const element = document.querySelector(selector);
      if (!element) throw new Error(`missing ${selector}`);
      return element.getBoundingClientRect();
    };
    const editor = box(".dh-md-editor__cm");
    const line = box(".cm-line");
    const content = box(".cm-content");
    const scroller = box(".cm-scroller");
    const toolbar = box(".dh-md-toolbar");
    const bar = box(".dh-md-editor__bar");
    const surface = box(".dh-md-editor__surface");
    const toolbarElement = document.querySelector(
      ".dh-md-toolbar",
    ) as HTMLElement;
    return {
      pageWidth: document.documentElement.clientWidth,
      editorX: editor.x,
      editorWidth: editor.width,
      lineX: line.x,
      lineRight: line.right,
      contentWidth: content.width,
      scrollerWidth: scroller.width,
      toolbarX: toolbar.x,
      toolbarRight: toolbar.right,
      toolbarScrollWidth: toolbarElement.scrollWidth,
      toolbarClientWidth: toolbarElement.clientWidth,
      barBottom: bar.bottom,
      surfaceTop: surface.top,
    };
  });
}

async function openSeededNote(page: Page): Promise<void> {
  await gotoFixture(page, "/notes");
  await page.locator("a[href^='/notes/']").first().click();
  await page.locator(".cm-content").first().waitFor({ timeout: 60_000 });
  // Real content, so the measured line is a line of text rather than a caret.
  const surface = page.getByRole("textbox", { name: /Note/ }).first();
  await surface.click();
  await page.keyboard.type("Measured at this width.");
  await expect(page.locator(".cm-line").first()).toContainText("Measured");
}

test.describe("DOC-EDITOR-01 — the writing surface at every supported width", () => {
  test.afterAll(async () => {
    await cleanupAllNoteFixtures();
  });

  for (const viewport of RESPONSIVE_VIEWPORTS) {
    test(`${viewport.label} (${viewport.width}×${viewport.height})`, async ({
      page,
    }) => {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });
      await openSeededNote(page);

      // 1. No horizontal document overflow, at any width.
      await expectNoHorizontalOverflow(page);

      const s = await measure(page);

      // 2a. Writing begins at the editor's own content edge, not a gutter. The
      //     bound is a fraction of the surface, so it scales with the viewport.
      const inset = s.lineX - s.editorX;
      expect(
        inset,
        `${viewport.label}: the first line starts ${Math.round(inset)}px into a ${Math.round(s.editorWidth)}px editor`,
      ).toBeLessThan(Math.max(48, s.editorWidth / 6));
      expect(
        inset,
        `${viewport.label}: no left padding at all`,
      ).toBeGreaterThan(0);

      // 2b. The editor takes the region it is given — the surface is not a narrow
      //     column adrift in a wide frame. `.cm-content` is capped at 90ch, so at
      //     ultra-wide the CONTENT may be narrower than the scroller; what must
      //     never shrink is the scroller itself.
      expect(
        s.scrollerWidth,
        `${viewport.label}: the writing surface collapsed inside its editor`,
      ).toBeGreaterThan(s.editorWidth * 0.85);
      // ...and the unused width falls AFTER the text, never before it.
      expect(
        s.lineX - s.editorX,
        `${viewport.label}: unused width appeared BEFORE the text`,
      ).toBeLessThan(s.editorWidth - (s.lineRight - s.lineX) - inset + 1);

      // 3a. The toolbar sits inside the page, never past its edge.
      expect(
        s.toolbarX,
        `${viewport.label}: the toolbar starts left of the viewport`,
      ).toBeGreaterThanOrEqual(-1);
      expect(
        s.toolbarRight,
        `${viewport.label}: the toolbar extends past the viewport`,
      ).toBeLessThanOrEqual(s.pageWidth + 1);

      // 3b. It never collides with the writing surface: the bar ends at or above
      //     where the surface begins (they share one outline, so touching is
      //     correct; overlapping is not).
      expect(
        s.barBottom,
        `${viewport.label}: the toolbar overlaps the writing surface`,
      ).toBeLessThanOrEqual(s.surfaceTop + 1);

      // 3c. Where the controls do not fit, the toolbar SCROLLS inside its own box
      //     rather than wrapping into a tall stack or widening the page.
      if (s.toolbarScrollWidth > s.toolbarClientWidth) {
        const overflowX = await page.evaluate(
          () =>
            getComputedStyle(document.querySelector(".dh-md-toolbar")!)
              .overflowX,
        );
        expect(
          overflowX,
          `${viewport.label}: the toolbar overflows without being scrollable`,
        ).toMatch(/auto|scroll/);
      }

      // 4. Touch targets hold DalyHub's 44px bar on every pointer, at every width.
      const buttons = page.locator(".dh-md-toolbar button");
      const count = await buttons.count();
      expect(
        count,
        `${viewport.label}: the toolbar has no controls`,
      ).toBeGreaterThan(0);
      for (let index = 0; index < count; index += 1) {
        const size = await buttons.nth(index).boundingBox();
        if (!size) continue; // scrolled out of the toolbar's own box
        expect(
          Math.round(size.height),
          `${viewport.label}: toolbar control ${index} is ${size.height}px tall`,
        ).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN);
        expect(
          Math.round(size.width),
          `${viewport.label}: toolbar control ${index} is ${size.width}px wide`,
        ).toBeGreaterThanOrEqual(TOUCH_TARGET_MIN);
      }
    });
  }
});
