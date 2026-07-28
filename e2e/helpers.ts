/**
 * DS-11 — shared Playwright helpers for the accessibility & responsive baseline.
 *
 * Before DS-11 every spec re-declared its own `hasNoHorizontalOverflow`, its own
 * hydration gate and its own touch-target check. DS-11 consolidates them here so
 * the whole suite asserts the baseline the SAME way, and adds the two capabilities
 * the baseline needs platform-wide:
 *
 *   - `RESPONSIVE_VIEWPORTS` — the canonical breakpoint matrix every shared surface
 *     is proven against (320 → ultra-wide), so "no horizontal overflow from 320px
 *     through ultra-wide" is a single, reused list rather than a per-file guess.
 *   - `expectNoAxeViolations` — an automated WCAG 2.2 AA scan (axe-core via
 *     `@axe-core/playwright`, MPL-2.0, dev-only) tuned to fail on genuine
 *     regressions without brittle assertions (see `AXE_TAGS` / the disabled
 *     colour-contrast note below).
 *
 * These run against the dev-only `/design/*` fixtures — each of which renders a
 * shared component INSIDE the real PX-02 app shell — plus the real product routes,
 * so the shell chrome (skip link, landmarks, navigation) is audited on every pass.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

/**
 * The canonical responsive matrix (DESIGN_SYSTEM.md → Responsive behaviour). The
 * widths are the required checkpoints — the common small phones (320/375/390),
 * a large phone (430), the tablet/`md` boundary (768), the `lg` desktop boundary
 * (1024), a common laptop (1440) and an ultra-wide monitor (2560) — so a surface
 * is proven from the narrowest supported viewport through the widest.
 *
 * MOBILE-01 added the two the matrix genuinely lacked:
 *
 *   - **`mobile-430`**, the large-phone width most current handsets actually
 *     report, which sits between the small-phone cluster and the tablet boundary
 *     with nothing else covering it;
 *   - **`phone-landscape`** (844×390), a real orientation with a genuinely
 *     different constraint — a very SHORT viewport carrying sticky top chrome, a
 *     bottom navigation bar and, often, an on-screen keyboard. Height was
 *     previously never the binding dimension anywhere in the matrix.
 */
export const RESPONSIVE_VIEWPORTS = [
  { label: "mobile-320", width: 320, height: 720 },
  { label: "mobile-375", width: 375, height: 812 },
  { label: "mobile-390", width: 390, height: 844 },
  { label: "mobile-430", width: 430, height: 932 },
  { label: "phone-landscape", width: 844, height: 390 },
  { label: "tablet-768", width: 768, height: 1024 },
  { label: "desktop-1024", width: 1024, height: 768 },
  { label: "desktop-1440", width: 1440, height: 900 },
  { label: "ultrawide-2560", width: 2560, height: 1440 },
] as const;

/** The WCAG 2.2 target-size minimum (44px), mirrored from `--dh-touch-target-min`. */
export const TOUCH_TARGET_MIN = 44;

/**
 * The axe rule tags DS-11 enforces: WCAG 2.0/2.1/2.2 Level A and AA plus axe's
 * "best-practice" heuristics (landmark uniqueness, list structure, etc.). This is
 * the established, non-brittle way to scope an axe run to a standard rather than
 * asserting individual rule ids.
 */
export const AXE_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
  "best-practice",
] as const;

/**
 * True when the document introduces no horizontal overflow. A 1px tolerance
 * absorbs sub-pixel rounding. This is the single definition the whole suite shares.
 */
export async function hasNoHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

/** Assert (with polling, to allow layout to settle) that the page never scrolls sideways. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
}

/**
 * Navigate to a route and wait until it is interactive. The `/design/*` fixtures
 * that drive interaction expose `[data-hydrated="true"]` once their client handlers
 * are attached; routes without that marker are gated on the network settling. Either
 * way the DOM and CSS are in place for an overflow or axe assertion.
 */
export async function gotoFixture(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await waitForInteractive(page);
}

/**
 * Wait until the document currently loaded is interactive, using the same gate as
 * {@link gotoFixture}.
 *
 * Needed on its own whenever a journey arrives at a page through the PRODUCT — a
 * capture that creates a record and lands on it — rather than through `goto`.
 * Server-rendered markup is present and visible well before React attaches its
 * handlers, so a click dispatched in that window is silently dropped: the element
 * is there, the click "succeeds", and nothing happens. Gating on readiness makes
 * the journey assert the behaviour it means to.
 */
export async function waitForInteractive(page: Page): Promise<void> {
  const marker = page.locator("[data-hydrated]");
  if ((await marker.count()) > 0) {
    await expect(marker.first()).toHaveAttribute("data-hydrated", "true");
  } else {
    await page.waitForLoadState("networkidle");
  }
}

/**
 * Assert an interactive control meets the WCAG 2.2 (2.5.8) minimum target size.
 *
 * The measurement RETRIES, like every other web-first assertion in Playwright,
 * because a bare `boundingBox()` samples one instant. The Vite dev server injects
 * the stylesheet through JavaScript, so a freshly loaded document has a brief
 * unstyled window in which every control measures at its intrinsic text size — a
 * dev-server artefact (production serves a render-blocking `<link>`, so it cannot
 * occur there) that has nothing to do with whether the control is big enough.
 * Retrying converges on the settled layout.
 *
 * The threshold itself is unchanged and the assertion still fails — it just fails
 * on a genuinely small control rather than on a moment of measurement.
 */
export async function expectMinTouchTarget(locator: Locator): Promise<void> {
  await expect(locator).toBeVisible();
  await expect
    .poll(
      async () => {
        const box = await locator.boundingBox();
        // Half-a-pixel tolerance for sub-pixel rounding; the smaller dimension is
        // the one that decides whether a thumb can hit the control.
        return box ? Math.min(box.width, box.height) : 0;
      },
      { message: "control should meet the minimum touch target on both axes" },
    )
    .toBeGreaterThanOrEqual(TOUCH_TARGET_MIN - 0.5);
}

/** Options for a scoped axe scan. */
export type AxeScanOptions = {
  /** Restrict the scan to a CSS selector (e.g. an open dialog). Defaults to the whole page. */
  readonly include?: string;
  /** Extra CSS selectors to exclude from the scan. */
  readonly exclude?: readonly string[];
  /** Extra axe rule ids to disable for this scan (used sparingly, always with a reason). */
  readonly disableRules?: readonly string[];
};

/**
 * Rules disabled for every scan, each because it is either covered more reliably
 * elsewhere OR conflicts with a deliberate, ADR-backed, test-asserted design of an
 * already-accepted shared component (per the task's "avoid brittle assertions").
 * Every OTHER WCAG 2.0/2.1/2.2 A + AA + best-practice rule stays enforced — including
 * `region` (landmark containment) and `heading-order`, which DS-11 fixed at source.
 *
 *   - `color-contrast` — DS-01 proves every semantic token pair against AA
 *     deterministically in `test/unit/tokens/contrast.test.ts`. Re-deriving contrast
 *     from rendered pixels in a headless browser is flaky (antialiasing, overlay
 *     compositing) and would duplicate that guarantee less reliably.
 *   - `landmark-unique` — DS-02 (ADR-017) intentionally exposes repeatable "Summary"
 *     and "Content" `region` landmarks on every Record Layout (asserted by
 *     `test/unit/record-layout/RecordLayout.test.tsx`). Two Record Layouts
 *     legitimately coexist when records stack (a Drawer over a record, a Drawer +
 *     Inspector), so their region names repeat by design; uniqueness across
 *     coexisting records is a best-practice heuristic, not a WCAG AA requirement.
 *   - `nested-interactive` — DS-08/DS-09 (ADR-023/024) listbox options intentionally
 *     wrap a real, focusable result link so a record result stays middle-clickable
 *     / open-in-new-tab (asserted by `e2e/search.spec.ts` and `command-palette`).
 *     The inner control is `tabindex="-1"` and the listbox drives selection via
 *     `aria-activedescendant`, so it is never a tab stop.
 *   - `aria-required-children` — DS-05 (ADR-021) intentionally renders a grouped,
 *     virtualised `role="feed"` whose day headings interleave the articles; the
 *     timeline stays keyboard- and screen-reader navigable (`role="feed"`,
 *     `aria-posinset`/`aria-setsize`, semantic day headings) but does not satisfy
 *     axe's strict feed→article-only child check.
 */
const GLOBALLY_DISABLED_RULES = [
  "color-contrast",
  "landmark-unique",
  "nested-interactive",
  "aria-required-children",
] as const;

/** Build a WCAG 2.2 AA axe scan for the page. */
export function buildAxeScan(page: Page, options: AxeScanOptions = {}) {
  let builder = new AxeBuilder({ page }).withTags([...AXE_TAGS]);
  if (options.include) {
    builder = builder.include(options.include);
  }
  for (const selector of options.exclude ?? []) {
    builder = builder.exclude(selector);
  }
  const disabled = [
    ...GLOBALLY_DISABLED_RULES,
    ...(options.disableRules ?? []),
  ];
  builder = builder.disableRules(disabled);
  return builder;
}

/**
 * Run the axe scan and assert there are no violations. On failure the assertion
 * message lists each violation's rule id, impact and the offending selectors, so a
 * regression is actionable without opening the HTML report.
 */
export async function expectNoAxeViolations(
  page: Page,
  options: AxeScanOptions = {},
): Promise<void> {
  const results = await buildAxeScan(page, options).analyze();
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      target: node.target.join(" "),
      why: node.failureSummary,
    })),
  }));
  expect(summary, "axe WCAG 2.2 AA violations").toEqual([]);
}
