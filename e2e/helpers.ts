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
import {
  expect,
  type APIRequestContext,
  type APIResponse,
  type Locator,
  type Page,
} from "@playwright/test";

import { DEV_ORIGIN } from "./dev-server";

/**
 * The canonical responsive matrix (DESIGN_SYSTEM.md → Responsive behaviour). The
 * widths are the required checkpoints — the common small phones (320/375/390),
 * a large phone (430), the tablet/`md` boundary (768), the `lg` desktop boundary
 * (1024), the `xl` boundary and most common laptop width (1280), a larger laptop
 * (1440) and an ultra-wide monitor (2560) — so a surface is proven from the
 * narrowest supported viewport through the widest.
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
 *
 * ── The two TIERS (V2.8 CONV-03, DEBT-205) ───────────────────────────────────
 * The matrix is now declared as two named tiers whose concatenation IS
 * `RESPONSIVE_VIEWPORTS`, unchanged in value and in order. The tiers exist
 * because the responsive sweep is the suite's largest spec file and had to be
 * split into two real files to stop stranding gate capacity; the seam is the
 * one the matrix already had — a phone is a phone and a desktop is a desktop —
 * rather than an arbitrary halving, so which file a viewport belongs to is a
 * property of the viewport rather than of last week's timings.
 *
 * `test/unit/ci/responsive-matrix.test.ts` asserts the concatenation, so a
 * viewport cannot be dropped from the product's canonical matrix by being
 * dropped from a tier.
 */
export const PHONE_VIEWPORTS = [
  { label: "mobile-320", width: 320, height: 720 },
  { label: "mobile-375", width: 375, height: 812 },
  { label: "mobile-390", width: 390, height: 844 },
  { label: "mobile-430", width: 430, height: 932 },
  { label: "phone-landscape", width: 844, height: 390 },
] as const;

export const WIDE_VIEWPORTS = [
  { label: "tablet-768", width: 768, height: 1024 },
  { label: "desktop-1024", width: 1024, height: 768 },
  // DS-14 brief §10 sets the verification widths at 320/375/390/430/768/1280/1440.
  // 1280 was the one this matrix did not carry — it is the `xl` breakpoint and the
  // most common laptop width, and a matrix that skips its own breakpoint boundary
  // is proving the two sides of it and not the edge.
  { label: "desktop-1280", width: 1280, height: 800 },
  { label: "desktop-1440", width: 1440, height: 900 },
  { label: "ultrawide-2560", width: 2560, height: 1440 },
] as const;

export const RESPONSIVE_VIEWPORTS = [
  ...PHONE_VIEWPORTS,
  ...WIDE_VIEWPORTS,
] as const;

/**
 * DS-04 — ONE locator for a task row, wherever a Task can be acted on.
 *
 * The workspace list stopped being the generic `Card` (an `<article>`) and became
 * the product-level `TaskRow` (an `<li>` in a real `<ul>`, so a screen reader
 * hears "list, 24 items"). Specs asked for `getByRole("article")`, which was
 * always a statement about the CARD rather than about the task, and would have
 * had to be re-decided in six files.
 *
 * It finds a Task on `/tasks`, on Today, on `/plan` and — since V2.8 CONV-01
 * closed DEBT-175 — on a Project record's Tasks tab. This comment used to carry
 * an exception for the Project tab, whose specs asked for an `article` because
 * that surface drew the generic Card; there is no exception left, and a spec
 * that asks a Task surface for an `article` is asking for a component that
 * does not draw one.
 */
export function taskRows(scope: Page | Locator): Locator {
  return scope.locator("[data-testid='task-row']");
}

/**
 * ONE task row, found by its title.
 *
 * The generic Card carried `aria-label="Open <title>"` on the `<article>`, so a
 * spec could ask for a row by accessible name. A list ITEM has no accessible
 * name of its own — its content is its name — and giving one to fifty rows would
 * make a screen reader read every title twice. The title is inside the row, so
 * filtering on it is both the honest query and the one a person would describe.
 */
export function taskRow(scope: Page | Locator, title: string): Locator {
  return taskRows(scope).filter({ hasText: title });
}

/**
 * The RECORD HEADER's overflow trigger (DS-12: the header's last action).
 *
 * Since V2.8 CONV-01 a record whose tab draws Tasks also draws the shared row,
 * and every row carries its own `More actions for <task>` trigger. A page-wide
 * query for `/More actions for/` therefore resolves to the header's AND each
 * row's, and fails strict mode; the header's own action row is the honest
 * scope for a question about the record.
 */
/**
 * Open a record tab by name, from any viewport width.
 *
 * The record tab strip SCROLLS rather than hiding tabs (MOBILE-01): every tab
 * stays in the tablist at every width, and the "More sections" menu is an
 * accelerator over the strip, not a replacement for it. At 320 px a record with
 * six tabs therefore has its last tabs off-screen inside that strip, reachable
 * by a swipe or through the menu — which is the intended behaviour, asserted by
 * `record-anatomy.spec.ts`.
 *
 * What that means for a TEST is that clicking such a tab has to bring it into
 * view first, exactly as the swipe does. Playwright's own actionability scroll
 * does not reliably reach an element inside a nested horizontal scroller that
 * begins entirely outside the viewport, and a click at coordinates outside the
 * viewport is silently dropped — the tab stays unselected and the assertion
 * that follows fails somewhere else entirely.
 *
 * V2.11 EVIDENCE is what made both of these reachable: a sixth tab on a record
 * pushed Activity past the right edge at 320 px, and the extra work of
 * rendering it widened the window in which the strip is drawn but not yet
 * wired. Neither is new and neither is a product defect; the helper is what was
 * missing.
 */
export async function openRecordTab(
  page: Page,
  name: string | RegExp,
): Promise<Locator> {
  /*
   * Settle FIRST. A record's tab strip is server-rendered and looks
   * interactive well before React attaches to it, so a click that arrives in
   * that window is received by markup with no handler and is simply lost — the
   * tab stays unselected and whatever the test asserts next fails somewhere
   * else entirely, which is what makes this so expensive to diagnose.
   */
  await page.waitForLoadState("networkidle");
  const tab = page.getByRole("tab", { name });

  /*
   * Then RETRY the click, because settling is not the same as being wired.
   * `networkidle` says the network is quiet; it does not say React has
   * attached, and on a loaded runner hydration can land after it — so the
   * first click is still occasionally received by markup with no handler and
   * lost. That is what this helper's own note above describes, and waiting
   * longer cannot fix it: a lost click is never retried by waiting.
   *
   * The assertion is UNCHANGED in strength — the tab must end up selected — so
   * a tab that genuinely never selects still fails, just after several honest
   * attempts rather than after one unlucky one.
   *
   * The SCROLL is inside the retry for the same reason the click is. It used to
   * run once, before the loop, and `scrollIntoViewIfNeeded` throws rather than
   * retries when its target detaches: "Element is not attached to the DOM",
   * MEASURED on run 34782096458 as a hard failure in the one window this helper
   * exists to survive. Retried, a strip that remounts mid-scroll is just
   * another attempt.
   */
  await expect(async () => {
    await tab.scrollIntoViewIfNeeded();
    await tab.click();
    await expect(tab).toHaveAttribute("aria-selected", "true", {
      timeout: 1_000,
    });
  }).toPass({ timeout: 15_000 });
  return tab;
}

export function recordOverflowTrigger(scope: Page | Locator): Locator {
  return scope
    .locator(".record-header__actions")
    .getByRole("button", { name: /^More actions for / });
}

/* -------------------------------------------------------------------------- */
/* STEER-03 — one Goal, one story: the shared `GoalStoryRow`                   */
/* -------------------------------------------------------------------------- */

/**
 * One Goal's story row, wherever it is drawn (`/goals`, an Area's Goals tab,
 * Today), by the machine key every row stamps — `data-goal-story="<id>"`. The
 * row's other `data-goal-*` attributes are its comparable facts (ADR-111
 * decision 6), which is what `steer-goal-story.spec.ts` asserts across surfaces.
 */
export function goalStoryRow(scope: Page | Locator, goalId: string): Locator {
  return scope.locator(`[data-goal-story="${goalId}"]`);
}

/**
 * The row's open affordance, asserted by the accessible name the product
 * composes for it (`goalStoryRowAccessibleName`): the Goal's TITLE, then each
 * derived answer the drawing keeps quiet — ADR-040's alignment state and
 * FOLLOW-02's movement — joined by " — ". The name is asserted in that shape
 * rather than as `Open <title>`, which the STEER-03 row never carried and
 * three assertions kept asking for (DEBT-215).
 *
 * The row says which answers it holds (`data-goal-alignment-state`,
 * `data-goal-movement-available`), so the expected shape is read from the row
 * rather than assumed: a Goal with an alignment state names it, and a Goal
 * whose movement could be read names that too. Change the composition — the
 * order, the separator, an `Open` prefix — and this fails naming the link it
 * found.
 */
export async function expectGoalStoryOpenLink(
  row: Locator,
  title: string,
): Promise<Locator> {
  const link = row.getByRole("link", {
    name: new RegExp(`^${escapeRegExp(title)}( — .+)?$`),
  });
  await expect(link).toHaveCount(1);
  const [alignmentState, movementAvailable] = await Promise.all([
    row.getAttribute("data-goal-alignment-state"),
    row.getAttribute("data-goal-movement-available"),
  ]);
  const derivedAnswers =
    (alignmentState ? 1 : 0) + (movementAvailable === "true" ? 1 : 0);
  const name = await link.evaluate(
    (node) => node.getAttribute("aria-label") ?? node.textContent ?? "",
  );
  // Title first, then at least one " — " per derived answer the row holds.
  expect(name.startsWith(title), `open link is named for "${title}"`).toBe(
    true,
  );
  expect(
    name.slice(title.length).split(" — ").length - 1,
    `"${name}" carries the row's ${derivedAnswers} derived answer(s)`,
  ).toBeGreaterThanOrEqual(derivedAnswers);
  return link;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The WCAG 2.2 target-size minimum (44px), mirrored from `--dh-touch-target-min`. */
export const TOUCH_TARGET_MIN = 44;

/**
 * The seeded owner's calendar timezone — the same value as
 * `DEFAULT_APP_PREFERENCES.timezone`, and the same constant `today-fixtures.mjs`
 * pins for the Today dataset.
 */
export const OWNER_TIMEZONE = "Australia/Sydney";

/**
 * TODAY (`YYYY-MM-DD`) on the OWNER's calendar, which is the only "today" the
 * product has (ADR-022).
 *
 * A spec that fills a date field with `new Date().toISOString().slice(0, 10)` is
 * writing the UTC day, and for a third of every 24 hours that is the owner's
 * YESTERDAY — so "set it to today" quietly becomes "set it overdue" depending on
 * what time the suite happens to run. That failure is invisible in the morning and
 * certain in the evening, which is the worst shape a test can have.
 */
export function ownerToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: OWNER_TIMEZONE,
  }).format(new Date());
}

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

/**
 * NAME the element that is too wide, so a failure says what to look at.
 *
 * The assertion below is `documentElement.scrollWidth > clientWidth`, which is
 * true of a page and tells you nothing about which of its two thousand boxes
 * caused it — so every overflow failure in this suite has cost a bisect in a
 * browser before it could be read. This walks the rendered tree once and
 * reports the widest boxes that cross the viewport's right edge, nearest the
 * leaves first, which is where the cause almost always is.
 *
 * Diagnostic only: it runs when the assertion has already failed, so it can
 * never change what passes.
 */
async function widestOverflowingElements(page: Page): Promise<string> {
  return page.evaluate(() => {
    const limit = document.documentElement.clientWidth;
    const offenders: { readonly depth: number; readonly line: string }[] = [];
    const walk = (element: Element, depth: number) => {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.right > limit + 1) {
        const id = element.id ? `#${element.id}` : "";
        const cls = element.className.toString().trim().slice(0, 60);
        offenders.push({
          depth,
          line:
            `${element.tagName.toLowerCase()}${id}${cls ? `.${cls}` : ""} ` +
            `right=${Math.round(rect.right)} width=${Math.round(rect.width)}`,
        });
      }
      for (const child of element.children) walk(child, depth + 1);
    };
    walk(document.body, 0);
    return offenders
      .sort((a, b) => b.depth - a.depth)
      .slice(0, 6)
      .map((entry) => `  ${entry.line}`)
      .join("\n");
  });
}

/** Assert (with polling, to allow layout to settle) that the page never scrolls sideways. */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  if (await hasNoHorizontalOverflow(page)) return;
  // Give layout the same chance to settle the poll used to.
  await expect
    .poll(() => hasNoHorizontalOverflow(page))
    .toBe(true)
    .catch(async (error: unknown) => {
      const { innerWidth, scrollWidth } = await page.evaluate(() => ({
        innerWidth: document.documentElement.clientWidth,
        scrollWidth: document.documentElement.scrollWidth,
      }));
      throw new Error(
        `the document scrolls sideways at ${innerWidth}px ` +
          `(scrollWidth ${scrollWidth}). Widest boxes past the right edge, ` +
          `innermost first:\n${await widestOverflowingElements(page)}\n\n` +
          String(error),
      );
    });
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
/**
 * Wait until the application STYLESHEET has actually applied.
 *
 * The Vite dev server injects CSS through JavaScript, so a freshly loaded
 * document has a brief window in which it is fully rendered and completely
 * unstyled — every control at its intrinsic text size, every
 * `display: none`-by-breakpoint element visible. `expectMinTouchTarget`'s own
 * docstring already records this and polls around it; nothing else did.
 *
 * It is not a cosmetic race. MEASURED on run 34785352070, `areas.spec.ts`'s axe
 * sweep scanned inside that window and reported 33 violations against a page
 * with none: a `min-h-14` (56px) bottom-nav control measuring "53px by 22.3px",
 * and "more than one banner landmark" because the desktop sidebar and the phone
 * bar are separated by a media query that had not applied yet. Both are true of
 * the unstyled document and of nothing a person ever sees.
 *
 * `--dh-shell-gutter` is a `:root` token from `tokens.css`, so its presence is
 * exactly "the app stylesheet is in force" and nothing else. Production serves
 * a render-blocking `<link>`, where this resolves on the first poll.
 */
async function waitForStylesheet(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        getComputedStyle(document.documentElement)
          .getPropertyValue("--dh-shell-gutter")
          .trim().length > 0,
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => undefined);
}

export async function waitForInteractive(page: Page): Promise<void> {
  // Settle the document FIRST. This function is called precisely when a journey
  // has arrived through the product, which means a client-side navigation may
  // still be in flight — and `[data-hydrated]` belongs to a document, not to the
  // page. Counting the marker before the navigation completes can therefore
  // describe the document being navigated AWAY from, and then the assertion below
  // spends its whole timeout waiting for an element the new document never had.
  // (Seen in CI: a Note capture handed off to the canonical editor, `/notes/`
  // matched, Today's marker was still counted, and `.first()` resolved to
  // nothing.) Settling first makes the count describe the document we landed on.
  //
  // BOUNDED, because `networkidle` is a best-effort settle and not a contract.
  // It resolves only after 500 ms with no more than two connections in flight,
  // and the Vite dev server keeps an HMR websocket open and fetches modules on
  // demand — so on a loaded runner it can simply never be reached. MEASURED on
  // run 34792235989: `project-health.spec.ts:209` spent its entire 90 s budget
  // inside this one line, at `gotoFixture`, having asserted nothing at all. The
  // gates below (`waitForStylesheet`, then the two hydration markers) are the
  // ones that actually answer "is this page wired up yet?", and each of them is
  // already bounded and already swallows its own timeout. This is the same
  // rule, applied to the line that was still exempt from it: a gate waits
  // generously, and then it gets out of the way.
  await page
    .waitForLoadState("networkidle", { timeout: 10_000 })
    .catch(() => undefined);
  await waitForStylesheet(page);

  /*
   * The SHELL's marker first — the one every authenticated route has.
   *
   * `AppShell`'s pane publishes `data-app-hydrated` once React has attached, so
   * "is this page wired up yet?" finally has an answer on `/assets`,
   * `/projects`, `/notes` and everywhere else, rather than only on Today and
   * the `/design/*` fixtures. Settling the NETWORK was the best this could do
   * before, and on a contended runner it regularly lost the race: a create
   * button clicked in that window navigates nowhere, which is what
   * `assets.spec.ts:66` and `activity-actor.spec.ts:51` report as "the URL did
   * not change".
   *
   * Absent is not a failure — an unauthenticated or error document has no
   * shell — so this waits only when the attribute is there to wait on.
   *
   * ── It is a GATE, and a gate never fails a test ─────────────────────────────
   *
   * The first version of this used `expect.poll(...).toBe(true)` on the default
   * 5s budget, and that was a mistake worth spelling out: on a contended runner
   * hydration can take longer than five seconds, and a failing POLL reports
   * "expected true, received false" against the helper rather than anything
   * about the surface under test. MEASURED on run 34789120450 — seven tests
   * across `account-security`, `activity-actor` and `follow-01-week-account`
   * failed with exactly that message, several of which had passed the run
   * before. Turning a race into an uninformative hard failure is worse than the
   * race.
   *
   * So it waits generously and then gets out of the way. If React genuinely
   * never attaches, the test's own next assertion fails on its own terms and
   * says something useful; this is only ever here to remove the window, not to
   * police it. `waitForStylesheet` above takes the same shape and for the same
   * reason.
   */
  await page
    .waitForFunction(
      () => {
        const shell = document.querySelector("[data-app-hydrated]");
        return (
          shell === null || shell.getAttribute("data-app-hydrated") === "true"
        );
      },
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => undefined);

  // `[data-hydrated]` is published only by the surfaces that have a meaningful
  // hydration boundary of their own — Today and the design routes. A product
  // navigation can leave a stale marker mounted briefly while the new route is
  // already usable, so only routes that own the marker wait on it.
  const pathname = new URL(page.url()).pathname;
  if (!pathname.startsWith("/today") && !pathname.startsWith("/design/")) {
    return;
  }

  // Where the marker belongs to the active route it is the real gate, because
  // server-rendered markup is interactive-looking well before React attaches.
  //
  // Same shape, and for the same reason as the shell gate above: this was the
  // ONE `expect.poll(...).toBe(true)` left in the pair, on the default 5s
  // budget, and it failed rather than waited. MEASURED on run 34792235989 —
  // `accessibility.spec.ts:132` and `responsive-desktop.spec.ts:42`, both on
  // `/design/cards-filters`, both reporting "expected true, received false"
  // with "Timeout 5000ms exceeded while waiting on the predicate" and nothing
  // about the page they were auditing; both pass locally in 2 minutes. A gate
  // that turns a slow runner into a mystery failure is worse than no gate.
  await page
    .waitForFunction(
      () => {
        const marker = document.querySelector("[data-hydrated]");
        return (
          marker === null || marker.getAttribute("data-hydrated") === "true"
        );
      },
      undefined,
      { timeout: 15_000 },
    )
    .catch(() => undefined);
}

/**
 * The control that opens the complete phone navigation sheet.
 *
 * MOBILE-01 moved this from a top-left hamburger into the bottom bar's **More** —
 * the same registry-driven sheet, from a control a thumb can actually reach. It
 * lives here so the specs that care about the SHEET (its focus trap, its links,
 * its close control) do not each encode which button opens it.
 */
export function mobileNavigationOpener(page: Page): Locator {
  return page
    .locator("[data-testid='bottom-nav']")
    .getByRole("button", { name: "More" });
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

/**
 * EDIT-03 — what the `region` rule counts as a top-layer surface.
 *
 * `region` asks that all page content sit inside a landmark, and axe already
 * exempts the surfaces that cannot: its default matcher is
 * `dialog, [role=dialog], [role=alertdialog], svg`. A transient popup rendered
 * in DalyHub's overlay layer (`~/shared/anchored`) is the same kind of thing —
 * it is portalled onto `<body>` precisely so no ancestor can clip it, it is
 * owned by a trigger that IS inside a landmark, and it exists only while it is
 * open. The inline DATE popover already passed this rule because it happens to
 * be a `role="dialog"`; the inline SELECT menu did not, which is a difference in
 * the popup's role rather than in its relationship to the page.
 *
 * So the layer is added to axe's own matcher rather than the rule being turned
 * off: `region` stays fully enforced for everything else, including for any
 * ordinary content that escapes a landmark.
 */
const REGION_MATCHER =
  "dialog, [role=dialog], [role=alertdialog], svg, .dh-anchored";

/** Build a WCAG 2.2 AA axe scan for the page. */
export function buildAxeScan(page: Page, options: AxeScanOptions = {}) {
  let builder = new AxeBuilder({ page })
    // Before `withTags`/`disableRules`, both of which extend this object rather
    // than replacing it. `options()` itself replaces, so it has to come first.
    //
    // The cast is axe-core's own gap: `axe.run` reads per-CHECK options from
    // `options.checks[id].options` (see `getCheckOption`), but `RunOptions` in
    // the published types only describes the per-RULE `enabled` flag.
    .options({
      checks: { region: { options: { regionMatcher: REGION_MATCHER } } },
    } as unknown as Parameters<AxeBuilder["options"]>[0])
    .withTags([...AXE_TAGS]);
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
  /*
   * Never scan an UNSTYLED document — see `waitForStylesheet`. A scan that
   * lands in the dev server's CSS-injection window audits a page nobody sees
   * and reports target sizes and landmark duplicates that a media query is
   * about to resolve. Callers that reached this surface by clicking rather than
   * by `gotoFixture` have not passed through that gate.
   */
  await waitForStylesheet(page);
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

/**
 * AUDIT-FIX-04 — the headers a real browser attaches to a same-origin mutation.
 *
 * Playwright's `APIRequestContext` is a raw HTTP client, not a browser: it sends
 * no `Origin` and no `Sec-Fetch-Site`. That was harmless until the request
 * boundary began requiring mutation provenance — at which point a spec setting
 * up state through `request.post` was sending a shape no browser produces, and
 * being refused for it.
 *
 * The production guard is deliberately NOT relaxed to accommodate that. Instead
 * the API-driven setup requests declare, honestly, what they are standing in
 * for: an ordinary same-origin submission from the DalyHub page. Journeys that
 * click through the real UI need none of this — the browser already does it.
 */
export const SAME_ORIGIN_MUTATION_HEADERS: Readonly<Record<string, string>> = {
  Origin: DEV_ORIGIN,
  "Sec-Fetch-Site": "same-origin",
};

/** Options `postSameOrigin` forwards to Playwright, minus the headers it owns. */
export interface SameOriginPostOptions {
  readonly form?: Record<string, string | number | boolean>;
  readonly data?: unknown;
  readonly maxRedirects?: number;
  readonly headers?: Record<string, string>;
}

/**
 * POST to a DalyHub route the way the application itself would.
 *
 * Use this for state SETUP in specs. A test that means to prove the CSRF guard
 * should build its request explicitly rather than reach for this helper — and
 * `csrf.spec.ts` drives a real second origin instead, so the browser generates
 * the hostile headers itself.
 */
export function postSameOrigin(
  request: APIRequestContext,
  path: string,
  options: SameOriginPostOptions = {},
): Promise<APIResponse> {
  const { headers, ...rest } = options;
  return request.post(path, {
    ...rest,
    headers: { ...SAME_ORIGIN_MUTATION_HEADERS, ...headers },
  } as Parameters<APIRequestContext["post"]>[1]);
}

/**
 * Perform an act that mutates a record, and do not return until the PRODUCT has
 * answered (V2.8 CONV-03, DEBT-203).
 *
 * DalyHub's lists paint optimistically (ADR-086): a checkbox, a menu item or a
 * date pick repaints the row from the client's patch map the instant it is
 * pressed, and the server's answer — plus the revalidation it asks for —
 * arrives some milliseconds later. A spec that reads the optimistic paint and
 * moves on is therefore racing the mutation it just made, and it loses in two
 * distinguishable ways: it navigates away before the write lands (so the next
 * assertion reads a document rendered from state that was never stored), or the
 * revalidation RE-CREATES the row underneath whatever it opened on it (so the
 * next click reports "element was detached from the DOM").
 *
 * Both had been repaired one journey at a time — `meetings-concurrency`,
 * `doc-editor-keyboard-save`, `tasks-journey`'s create — each with its own
 * hand-rolled `waitForResponse`. This is that wait, shared, so the next spec
 * that needs it does not invent a twelfth spelling of it.
 *
 * It is NOT `networkidle` and it is NOT a timeout. `networkidle` waits for
 * silence, which a busy page never quite reaches and a quiet one reaches before
 * the write is even sent; a timeout waits for a duration, which is a guess about
 * a runner. This waits for the one HTTP response that IS the product's answer,
 * so a slow runner makes it slower and never makes it wrong.
 *
 *   await awaitMutation(page, "/tasks/bulk", () => menuItem.click());
 *
 * A string route also matches React Router's single-fetch spelling of the same
 * action (`/tasks/bulk.data`), because which of the two the runtime submits is
 * an implementation detail of the router rather than a fact about the product,
 * and a wait that missed it would wait out its whole budget on a mutation that
 * had already landed. Pass a `RegExp` when a journey needs to be exact.
 */
export async function awaitMutation<T>(
  page: Page,
  pathname: string | RegExp,
  act: () => Promise<T>,
  options: { readonly method?: string; readonly timeout?: number } = {},
): Promise<T> {
  const method = options.method ?? "POST";
  const settled = page.waitForResponse(
    (response) => {
      if (response.request().method() !== method) return false;
      const path = new URL(response.url()).pathname;
      return typeof pathname === "string"
        ? path === pathname || path === `${pathname}.data`
        : pathname.test(path);
    },
    options.timeout === undefined ? undefined : { timeout: options.timeout },
  );
  const [, result] = await Promise.all([settled, act()]);
  return result;
}

/**
 * Press something until the WRITE it commands actually goes out.
 *
 * ── Why a press needs proving at all ─────────────────────────────────────────
 * `awaitMutation` above waits for the response that IS the product's answer,
 * which is right, and it assumes the press reached a live handler. On a row
 * that assumption fails in one specific way: a React Router revalidation
 * RE-CREATES the row — it can change component type (`DraggableTaskRow` ⇄
 * `TaskRow` at the same key) or move it between sections — and a row that
 * remounts takes any menu open on it with it. The press then lands on a
 * detached node. Nothing throws. `click()` reports success, no request is ever
 * made, and `waitForResponse` waits out its entire budget.
 *
 * This is documented twice in `tasks-collection.spec.ts` in the product's own
 * words ("the revalidation re-creating the row under its open menu") and has
 * survived two mitigations: HARDEN-04's `networkidle` and DEBT-203's wait on
 * the preceding write. It still failed as `:649` on CI runs 34894702514 and
 * 34906306003. `networkidle` cannot close it, because the revalidation the
 * action asks for can begin AFTER the quiet window that satisfies it.
 *
 * ── What this waits for, and why that is not a retry hiding a race ───────────
 * The state transition is the WRITE, and the write is the only honest proof the
 * press landed — precisely because a lost press is silent. So each attempt gets
 * a slice of the budget, and an attempt that produces no request is retried
 * from the press, which for a menu means re-opening it on whatever row now
 * exists. A person does the same thing when a press does nothing.
 *
 * It cannot mask a defect. A command that never writes still fails here, after
 * every attempt, naming the route it waited for — where today the same defect
 * surfaces as an unexplained 90s timeout inside a helper three frames up. And
 * it cannot double-write: a press that DID reach a handler produces its
 * response inside its own slice, which ends the loop.
 *
 * Use it only where the act is idempotent, because a retry may repeat it. The
 * caller says so by choosing this over `awaitMutation`.
 */
export async function pressUntilMutation(
  page: Page,
  pathname: string | RegExp,
  press: () => Promise<void>,
  options: {
    readonly method?: string;
    readonly attempts?: number;
    readonly attemptTimeout?: number;
  } = {},
): Promise<void> {
  const attempts = options.attempts ?? 4;
  const attemptTimeout = options.attemptTimeout ?? 10_000;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      await awaitMutation(page, pathname, press, {
        method: options.method,
        timeout: attemptTimeout,
      });
      return;
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(
    `no ${options.method ?? "POST"} to ${String(pathname)} after ${attempts} ` +
      `presses of ${attemptTimeout}ms each. The command is not writing — this ` +
      "is the product failing, not a slow runner, because each attempt " +
      `re-issued the press from scratch.\n\nLast wait: ${String(lastError)}`,
  );
}

/**
 * Wait until every animation running in the document has finished (V2.8
 * CONV-03, DEBT-203).
 *
 * A GEOMETRY assertion taken while a surface is still moving is a measurement of
 * a moment, not of a layout — and the moment it lands on is decided by how busy
 * the machine is. `iphone-daily-driver.spec.ts:185` is the case that named it:
 * it opens the phone overflow SHEET, which rises from below the fold on the
 * shared `.dh-motion-*` grammar, and then asserts that the menu's last row sits
 * inside the viewport. Measured mid-rise the last row is still below the fold —
 * **853.85 against 845** on CI run C, and **845.28 against 845** in this
 * sandbox, the same defect at two points along the same animation — while a
 * settled sheet clears it by seventeen pixels.
 *
 * `Animation.finished` is the browser's own answer to "has it arrived", so this
 * is a readiness signal rather than a sleep: under `prefers-reduced-motion` the
 * animations do not exist and it returns immediately, and on a slow machine it
 * waits exactly as long as the machine took. Rejections are swallowed because an
 * animation CANCELLED by a state change (a sheet dismissed while opening) is a
 * legitimate end, and `Promise.all` over a rejection would fail the test for it.
 *
 * The five `*-screenshots.spec.ts` capture passes each carry their own copy of
 * this; they are outside the gate and are left alone rather than churned here.
 */
export async function awaitMotionSettled(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await Promise.all(
      document
        .getAnimations()
        .map((animation) => animation.finished.catch(() => undefined)),
    );
  });
}

/**
 * The Today screen's day panel — the stable landmark that says "this is Today".
 *
 * The Today redesign made the screen's `h1` the owner's GREETING ("Good evening,
 * Sam"), which is page content rather than a page name: it changes with the hour
 * and with who is signed in, and there is no pane header behind it. Several specs
 * were still waiting for `heading level 1 "Today"` and timing out on a page that
 * had rendered perfectly.
 *
 * The screen's own labelled region is what the suite asks for instead, because it
 * is the same at every hour. Asserting a landmark rather than a class also keeps
 * the check on the accessibility tree, where the product's contract lives.
 *
 * It is NOT addressed by its accessible NAME any more. That name has moved twice
 * — "My day" until M3X-02 (#145), then "Focus", and TODAY-11 renamed it again to
 * "Today's plan" — and each rename silently broke this helper, so every spec that
 * waited on it waited out its timeout on a page that had rendered perfectly. The
 * region's name is product COPY, and copy is not this helper's contract; "the
 * Today workspace exists and holds the day's task rows" is.
 *
 * So it asks for the panel's stable test id, placed on the same `<section>` in
 * `TodayScreen`. The panel is still a labelled region, and the specs that assert
 * Today's HEADINGS still assert them by name — this helper simply stops being
 * the thing that breaks when the words change.
 */
export function todayDayPanel(page: Page): Locator {
  return page.getByTestId("today-plan");
}

/**
 * UIX-01 — the DESKTOP global capture control.
 *
 * It was a floating action button in the bottom-right corner of every window
 * (`button.dh-fab`). The redesign retired it: on a phone the navigation bar had
 * already carried a labelled Capture slot in the same corner since CAPTURE-02,
 * and on a desktop the action moved into the top app bar's violet "New" button,
 * where the rest of the utilities are and where the reference design puts it.
 *
 * The surface it opens, the opener contract and the focus restoration are
 * unchanged, which is why the specs that used the button only needed to be
 * pointed at the new one.
 */
export function globalCaptureControl(page: Page): Locator {
  return page.getByTestId("topbar-create");
}

/**
 * UIX-01 — enter (or leave) the Tasks collection's bulk-selection MODE.
 *
 * "Select tasks" was a filled secondary button in the Tasks header until the
 * UIX-01 redesign moved the header's long tail into the ONE shared overflow
 * menu. It is the same command with the same wording and the same toggle
 * semantics — the label still reads "Stop selecting" once the mode is on — it
 * simply lives behind the header's ⋯ now.
 *
 * A helper rather than six copies of "open the menu, click the item": the
 * specs that use it are testing bulk SELECTION, not where its entry point
 * happens to be, and the next time that moves it should be one edit.
 */
export async function enterTaskSelection(page: Page): Promise<void> {
  await page.getByTestId("tasks-overflow").click();
  await page.getByRole("menuitem", { name: "Select tasks" }).click();
}

/** Assert the browser is on the Today screen, by URL and by that landmark. */
export async function expectOnToday(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/today(?:[?#]|$)/);
  await expect(todayDayPanel(page)).toBeVisible();
}

/**
 * Click one of a card's quick actions, the way a person reaches them.
 *
 * On a hover-capable pointer a card's action rail is CONCEALED at rest —
 * `opacity: 0` **and** `pointer-events: none` (UIQ-002, `card.css`) — and is
 * revealed by the pointer arriving over the card. Driving it without hovering
 * first exercises a state no person can reach, and it fails in a way that reads
 * like a product bug: Playwright's visibility check ignores `opacity`, so the
 * button is reported "visible, enabled and stable", and then the hit test at its
 * centre returns whatever sits UNDER the transparent rail — the card's title, or
 * its status chip — as "intercepts pointer events".
 *
 * That misreading is on the record twice. The V2.2 Tasks programme diagnosed it
 * for five `tasks-daily-driver` journeys and fixed it with a local helper; the
 * DEBT-106 census met the same failure on the Archived People collection and
 * recorded it as "a shared-Card layering problem", which it is not — the rail is
 * `pointer-events: none` precisely so a click in a row's empty trailing space
 * cannot activate an unseen action. This is that one helper, shared, so the next
 * spec to meet it does not diagnose it a third time.
 *
 * The upward wheel is for narrow viewports: the sticky mobile header covers the
 * top of the scroll container, so a card scrolled flush to the top sits under it.
 */
export async function clickCardAction(
  card: Locator,
  name: string | RegExp,
): Promise<void> {
  await card.scrollIntoViewIfNeeded();
  await card.page().mouse.wheel(0, -160);
  await card.hover();
  await card.getByRole("button", { name }).click();
}

/**
 * UIX-01 — complete (or reopen) a task from its row.
 *
 * The row's leading control is a completion CHECKBOX now, not a "Complete"
 * button in the trailing action rail — a task's most frequent act moved to
 * where every reference product puts it. The accessible NAME is unchanged
 * ("Complete <title>" / "Reopen <title>"), so this is the same command reached
 * through the same words on a different element.
 */
export async function completeTaskRow(
  card: Locator,
  title: string,
): Promise<void> {
  await card.scrollIntoViewIfNeeded();
  await card.getByRole("checkbox", { name: `Complete ${title}` }).check();
}

/** The same control, the other way: reopen a completed task from its row. */
export async function reopenTaskRow(
  card: Locator,
  title: string,
): Promise<void> {
  await card.scrollIntoViewIfNeeded();
  await card.getByRole("checkbox", { name: `Reopen ${title}` }).uncheck();
}

/**
 * Set an M3-INT `Switch` (`~/shared/forms/Switch`) to `on`.
 *
 * `locator.check()` and `locator.uncheck()` cannot drive this control, and are
 * right not to: the real `<input type="checkbox" role="switch">` is deliberately
 * `pointer-events: none` (`switch.css`), because the 44px pointer target is the
 * `<label>` around the track rather than the 32px graphic. A pointer therefore
 * never reaches the input, Playwright's hit test says so, and it retries until
 * the test times out — which is a true statement about the pointer, not a defect.
 *
 * So the switch is driven the way its OTHER real input method drives it: focus
 * the control and press Space, which is exactly what the component's docstring
 * promises the native element still gives away. State is read back from the
 * input, which is where `:checked` actually lives.
 *
 * Already-in-the-wanted-state is a no-op, so a caller can assert an end state
 * without first knowing the current one.
 */
export async function setSwitch(toggle: Locator, on: boolean): Promise<void> {
  if ((await toggle.isChecked()) === on) return;
  await toggle.focus();
  await toggle.press(" ");
  await expect(toggle).toBeChecked({ checked: on });
}

/**
 * Set an UNTITLED checkbox (`~/shared/ui/Checkbox`'s React Aria path) to
 * `checked`. `setSwitch`'s reasoning, for the other control it applies to.
 *
 * The product has two kinds of checkbox and only one of them can be driven by
 * `locator.check()`. A task row shows both, a few pixels apart:
 *
 *   - COMPLETE is a plain `<input class="dh-check-circle">`, styled directly.
 *     A pointer reaches it, so `check()` works and the callers that use it are
 *     left alone.
 *   - SELECT is the shared `Checkbox`, which is React Aria's: a `<label>`
 *     wrapping a VISUALLY-HIDDEN `<input>` and the painted `<div>` a person
 *     actually clicks. `check()` aims at the input's own 1px box, which sits
 *     under that div, so the hit test names the div and Playwright retries
 *     until the budget is gone.
 *
 * That is a true statement about the pointer rather than a defect — the same
 * shape `setSwitch` already records — and it is expensive: MEASURED on run
 * 34777810234, five 120s timeouts in `tasks-v22-daily-driver` alone, which is
 * what left partition p13 at `globalTimeout` with twelve tests never executed.
 *
 * Space on the focused input is a real interaction and not a `force: true` that
 * would skip the actionability checks altogether; the assertion afterwards is
 * `check()`'s own postcondition, so a control that does not end up in the
 * wanted state still fails, and one that cannot be focused fails before that.
 *
 * Already-in-the-wanted-state is a no-op, like `check()` and like `setSwitch`.
 *
 * `shift` extends a RANGE from the last selected row, the way Shift-clicking
 * does — and it is the same act, not an approximation of one: `TaskRow` reads
 * `event.shiftKey` off the control's `keydown` for Space and Enter exactly as it
 * reads it off `pointerdown`, so the product treats the two identically.
 *
 * ── One press was unrecoverable, and a lost press is silent ──────────────────
 *
 * `TaskRow`'s SELECT is a CONTROLLED React Aria checkbox: `checked` comes from
 * state and the browser's own toggle is never what moves it. So a Space that
 * arrives while the row is being replaced — a revalidation landing, a re-render
 * swapping the input — changes nothing and leaves no trace, and the version of
 * this helper that pressed exactly once could only then watch an assertion it
 * had already lost. MEASURED on run 35518227035, partition p03,
 * `tasks-v22-daily-driver.spec.ts:395` (`selectTask` in the DELETED view): the
 * locator resolved fourteen times over the 5s budget, "unexpected value
 * unchecked" every time. The Deleted view is where it surfaced because it is the
 * one selection path with nothing between arriving and pressing — elsewhere
 * `selectTask` finds no checkbox and clicks "Select" first, and that click
 * absorbs the window.
 *
 * So a lost press is now retried ONCE, and the retry is safe rather than
 * hopeful:
 *
 *   - each press gets its own full settle before being judged, so the retry
 *     cannot race the first press's own state update and untoggle it;
 *   - `shift` presses exactly once, because a second Shift+Space would extend
 *     the range a second time — a retry there would change what the test means;
 *   - the final assertion is unchanged and un-swallowed, on the same 5s budget.
 *     A control that is genuinely broken fails BOTH attempts, so this cannot
 *     turn a product defect green. That is the whole difference between pressing
 *     again and raising a timeout.
 */
export async function setCheckbox(
  checkbox: Locator,
  checked = true,
  options: { readonly shift?: boolean } = {},
): Promise<void> {
  await checkbox.scrollIntoViewIfNeeded();
  if (!options.shift && (await checkbox.isChecked()) === checked) return;
  await checkbox.focus();
  await checkbox.press(options.shift ? "Shift+ " : " ");

  if (options.shift) {
    await expect(checkbox).toBeChecked({ checked });
    return;
  }

  const took = await expect(checkbox)
    .toBeChecked({ checked })
    .then(
      () => true,
      () => false,
    );
  if (took) return;

  await checkbox.focus();
  await checkbox.press(" ");
  await expect(checkbox).toBeChecked({ checked });
}

/**
 * Choose a date in the shared DalyHub calendar (`~/shared/forms/CalendarGrid`).
 *
 * CONTROL-01 replaced the native `<input type="date">` inside every inline date
 * editor with a real month grid, so a journey can no longer `fill()` an ISO
 * string: it steps to the month and presses the day, which is what an owner
 * does. There is no Save — the grid COMMITS on selection, because a calendar day
 * is an unambiguous, complete answer.
 *
 * The day is matched by its accessible name rather than its digits: a bare "15"
 * also matches "15" inside "25" under Playwright's substring matching, whereas
 * the full spoken date ("15 March 2027") is unique within the grid.
 *
 * `scope` is the surface the calendar is in — a popover or a sheet — so a page
 * with two open date editors cannot be ambiguous.
 */
const CALENDAR_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export async function pickCalendarDate(
  scope: Locator,
  iso: string,
): Promise<void> {
  const [year, month] = iso.split("-").map(Number);
  const monthLabel = `${CALENDAR_MONTHS[month - 1]} ${year}`;

  const heading = scope.locator(".dh-calendar__month");
  await expect(heading).toBeVisible();

  // Bounded: twenty-four steps covers any date a journey reasonably picks, and
  // a bound means a broken stepper fails with this message rather than hanging.
  for (let step = 0; step < 24; step += 1) {
    const shown = (await heading.textContent())?.trim() ?? "";
    if (shown === monthLabel) break;
    // Parsed from its two parts rather than fed to `new Date("August 2026")`,
    // whose behaviour on a month-and-year string is implementation-defined.
    const [shownMonth, shownYear] = shown.split(" ");
    const shownIndex = CALENDAR_MONTHS.indexOf(shownMonth ?? "");
    const forwards =
      shownIndex < 0 ||
      Number(shownYear) * 12 + shownIndex < year * 12 + (month - 1);
    await scope
      .getByRole("button", { name: forwards ? "Next month" : "Previous month" })
      .click();
  }
  await expect(heading).toHaveText(monthLabel);
  // By `data-iso`, not by name: "1 January 2027" is a substring of the 11th,
  // the 21st and the 31st under Playwright's default matching, and the full
  // spoken label would make the caller compute a weekday to say it.
  await scope.locator(`.dh-calendar__day[data-iso="${iso}"]`).click();
}

/* -------------------------------------------------------------------------- */
/* DHDS-13 — where a surface FILES a task once it is completed                 */
/* -------------------------------------------------------------------------- */

/**
 * The row for `title` after it has been completed on a surface that keeps
 * completed work behind a disclosure — opened through that disclosure.
 *
 * A completed Task does not stay in its band. Today files it under the plan's
 * `Completed · n` disclosure, and that `<details>` renders CLOSED — so the row
 * is still in the DOM and completely absent from the accessibility tree, and
 * `getByRole("checkbox", …)` scoped to the plan resolves to nothing at all.
 * `check()` re-resolves its locator to verify the new state, finds no element,
 * and retries to timeout; a `toBeChecked()` written the same way reports
 * "element(s) not found" while the page's own live region says *"Completed …"*.
 *
 * Neither is a defect in the product and neither is fixed by waiting longer: the
 * completed row is simply somewhere else, so the assertion goes there. The
 * disclosure is opened by CLICKING ITS SUMMARY — the owner's own way in — so
 * this proves the completion is REACHABLE rather than merely present.
 *
 * DHDS-13 established the mechanism on `today-task-convergence.spec.ts`; this is
 * that helper, shared, so the next spec to complete a Task on Today does not
 * have to rediscover it.
 */
export async function openCompletedGroup(
  page: Page,
  title: string,
  scope = '[data-testid="today-plan"]',
): Promise<Locator> {
  const group = page.locator(`${scope} details.dh-today__completed`);
  await expect(group).toBeAttached();
  if (!(await group.evaluate((el: HTMLDetailsElement) => el.open))) {
    await group.locator("summary").click();
  }
  return group.locator(".dh-taskrow", { hasText: title }).first();
}

/**
 * Engage a row so its contextual actions are operable — the one shared way.
 *
 * DEBT-180. The row-reveal contract (`motion.css`) conceals a row's trailing
 * affordances at `opacity: 0` AND makes them transparent to the pointer, so that
 * an unrevealed action is never a hidden hit area over the row. That rule is
 * right and is deliberately kept: `.dh-action-reveal` sits directly on a
 * navigation `<Link>` in `ScheduleList` and on drag handles in `TaskDragging`,
 * `TaskChecklistSection` and `GoalMeasurementPanel`, and on a hybrid device —
 * one that matches `(hover: hover)` because a mouse is attached, driven by a
 * finger that never hovers — a live control under blank space would navigate or
 * begin a drag with nothing drawn to say so.
 *
 * What that costs is AUTOMATION, and it costs it as a DEADLOCK rather than a
 * race: Playwright hit-tests the target BEFORE moving the mouse, so a bare
 * `click()` on a concealed affordance reports *"intercepts pointer events"* and
 * never performs the hover that would make it hittable. Retrying to timeout is
 * the only outcome.
 *
 * So a journey does what a person does — it moves onto the row first. Hovering
 * is a real interaction, not a workaround: it is exactly how the affordance
 * becomes available to a pointer user, and it is the only honest alternative to
 * `force: true`, which asserts a control is reachable while proving it is not.
 *
 * One helper rather than a hover copied into each spec, so the requirement lives
 * with the contract it belongs to.
 */
export async function revealRowActions(row: Locator): Promise<void> {
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  // The reveal is a `--dh-motion-fast` opacity transition, and `toHaveCSS`
  // polls — so this waits for the affordance to actually BE revealed rather
  // than for a fixed time. A row with no concealed affordance is a no-op.
  const reveal = row.locator(".dh-action-reveal").first();
  if ((await reveal.count()) > 0) {
    await expect(reveal).toHaveCSS("opacity", "1");
  }
}

/**
 * Press a menu trigger and return the menu it opened — confirming that it DID
 * open, and pressing again if a re-render swallowed the press.
 *
 * ── The defect this exists for ───────────────────────────────────────────────
 * A React Router loader revalidation re-renders the surface holding the
 * trigger. Playwright's own actionability checks pass (the button is visible,
 * stable, enabled and hit-testable) and the event is then dispatched at a node
 * React has since replaced, so it lands on nothing. Nothing throws: the click
 * "succeeds", the menu never opens, and the NEXT step — a `menuitem` locator, or
 * a `waitForResponse` for the write that item would have sent — waits out its
 * whole budget and fails somewhere else entirely.
 *
 * MEASURED, and not on this branch: `tasks-collection.spec.ts:128` failed this
 * way on `main` in runs 34807921899 and 34826437375 and again in 34894702514,
 * always on the THIRD presentation of the loop and always as
 * `locator.click: Test timeout ... waiting for getByRole('menuitem', { name:
 * 'List layout' })` — the item was never there to click because the press that
 * should have revealed it went to a detached button. `:649` failed in the same
 * run as a 90s `page.waitForResponse` for `/tasks/bulk`, which is the same
 * dropped press one surface deeper: no press, no menu item, no write, no
 * response to wait for.
 *
 * ── Why this is synchronisation and not a retry that hides a race ────────────
 * The state transition being waited for is "the menu is open", which is the
 * product's own answer to the press and the precondition every caller actually
 * depends on. Asserting it turns a silent drop into an immediate, named failure
 * instead of a timeout three steps later. Re-pressing is what a person does when
 * a press does nothing, and it cannot mask a real defect: a menu that never
 * opens still fails here, with the trigger named, rather than passing.
 *
 * It is deliberately NOT `waitForTimeout` and NOT a raised timeout. A sleep
 * guesses at how long a runner takes to re-render; this waits for the thing
 * itself, so a slow machine makes it slower and never makes it wrong.
 */
export async function openMenuFrom(
  trigger: Locator,
  options: { readonly menu?: Locator } = {},
): Promise<Locator> {
  const page = trigger.page();
  const menu = options.menu ?? page.getByRole("menu");
  await expect(async () => {
    await trigger.click();
    await expect(menu.first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000, intervals: [200, 400, 800, 1_600] });
  return menu;
}

/**
 * Today's week summary, with its `Last 7 days` disclosure OPEN.
 *
 * TODAY-12 put the week's measures behind one line so the day itself owns the
 * first viewport, and that `<details>` renders CLOSED. A closed disclosure's
 * contents are in the DOM and out of the RENDERING, so `innerText` on a figure
 * inside it returns `""` and `getByRole("link", …)` resolves to nothing —
 * neither is a missing figure, and neither is fixed by waiting.
 *
 * Opened through its SUMMARY, the owner's own way in, so a caller proves the
 * measures are reachable as well as correct.
 */
export async function openTodayWeeklySummary(page: Page): Promise<Locator> {
  /*
   * Settle FIRST, through the shared gate. `/today` is one of the two routes
   * that publishes `[data-hydrated]`, precisely because its server-rendered
   * markup is interactive-looking well before React attaches, and every caller
   * of this helper arrives with a bare `page.goto("/today")`.
   *
   * This is hygiene, not a fix for anything. It was added believing it
   * explained a CI failure of "every summary figure states a real count"; it
   * did not, and the failure survived it. The real cause was that the weekly
   * rank RENDERS NOTHING when the week is empty, and the caller was relying on
   * another spec in its partition to have created a task — see the comment in
   * `today.spec.ts`. Kept because settling before touching a hydrating route is
   * right on its own terms, and recorded honestly so the next reader does not
   * mistake it for the answer.
   */
  await waitForInteractive(page);
  const summary = page.getByTestId("today-summary");
  await expect(summary).toBeVisible();
  const weekly = summary.locator("details.dh-today__weekly");
  await expect(weekly).toBeAttached();
  if (!(await weekly.evaluate((el: HTMLDetailsElement) => el.open))) {
    await weekly.locator("summary").click();
  }
  return summary;
}

/* -------------------------------------------------------------------------- */
/* DHDS-09 — the listbox a combobox owns, wherever the overlay layer put it    */
/* -------------------------------------------------------------------------- */

/**
 * The `role="listbox"` a combobox CONTROLS, resolved through `aria-controls`.
 *
 * DHDS-09 moved every floating surface into the shared overlay layer, so a
 * `SelectField`'s or an `EntityLinkPicker`'s options are portalled onto `<body>`
 * and are no longer DOM descendants of the Drawer, dialog or form that holds the
 * field. A container-scoped `dialog.getByRole("option", …)` therefore resolves to
 * nothing, however long it waits — the same shape as the calendar grid, which
 * `pickCalendarDate` already addresses at page level for exactly this reason.
 *
 * Resolving through `aria-controls` is a STRONGER assertion than the container
 * scope it replaces, not a weaker one. The container only ever proved that the
 * option shared an ancestor with the field; this proves the option is in the
 * listbox **this combobox owns** — the relationship the WAI-ARIA pattern is built
 * on, and the one a screen reader follows. It is also presentation-agnostic: the
 * anchored listbox and the phone Sheet both carry the same id.
 *
 * The combobox must be OPEN — `aria-controls` is published while the listbox
 * exists — so call it after the click/fill that opens the field.
 */
export async function comboboxListbox(combo: Locator): Promise<Locator> {
  // `aria-controls` is only published once the field is expanded, so wait for it
  // rather than reading a null and failing with "#null is not a valid selector".
  await expect(combo).toHaveAttribute("aria-controls", /\S/);
  const id = await combo.getAttribute("aria-controls");
  // Attribute selector rather than `#id`: React's `useId()` values contain
  // characters (`«`, `»` on some versions) that are legal in an id and illegal
  // unescaped in a CSS id selector.
  return combo.page().locator(`[id="${id}"]`);
}

/**
 * One option of the listbox `combo` owns. See {@link comboboxListbox}.
 *
 * The narrowest possible replacement for a container-scoped lookup: same role,
 * same name, same matching — only the scope moves, from "somewhere under this
 * dialog" to "inside this field's own listbox".
 */
export async function comboboxOption(
  combo: Locator,
  name: string | RegExp,
  options: { readonly exact?: boolean } = {},
): Promise<Locator> {
  const listbox = await comboboxListbox(combo);
  return listbox.getByRole("option", {
    name,
    ...(options.exact === undefined ? {} : { exact: options.exact }),
  });
}

/**
 * Type into a combobox and choose the option that appears — the whole act, in
 * the order an owner performs it.
 *
 * Most journeys want exactly this and nothing else, and doing it in one place
 * means the wait for the option is never forgotten (a `click()` on an option
 * that has not arrived yet is a flake, not a failure).
 */
export async function chooseComboboxOption(
  combo: Locator,
  query: string,
  name: string | RegExp = query,
  options: { readonly exact?: boolean } = {},
): Promise<void> {
  await combo.click();
  await combo.fill(query);
  const option = await comboboxOption(combo, name, options);
  await expect(option.first()).toBeVisible();
  await option.first().click();
}

/* -------------------------------------------------------------------------- */
/* CONTROL-01 — the shared collection controls, in either presentation         */
/* -------------------------------------------------------------------------- */

/**
 * The collection's filter/sort controls, opened, in whichever presentation this
 * viewport gets.
 *
 * CONTROL-01 split `CollectionControls` in two. A COMPACT viewport still gets
 * the `Sheet` — a draft the owner edits and commits with Apply. A pointer device
 * gets `CollectionControlsPopover`: the same groups, the same params, the same
 * `applyDraft`, anchored beside the trigger and applying LIVE, because on a
 * 1440px window the sheet meant three open/choose/apply/close round trips each
 * of which hid the result of the last.
 *
 * Only the container differs — "there is one model, one set of options and one
 * URL writer", in the component's own words — so a journey about FILTERING
 * should not have to know which one it got. Three specs did know, and knew the
 * wrong one: they drove `collection-sheet-*` at desktop widths, where the sheet
 * has not rendered since CONTROL-01, and timed out.
 *
 * `choose` names a group's param and an option's value, exactly as both
 * presentations' test ids do (`priority`, `p1`). `commit` is the Apply the sheet
 * needs and the popover does not have; calling it in both is what lets one
 * journey run at both widths.
 */
export interface CollectionControlsSurface {
  /** The open surface — the `Sheet` or the anchored popover. */
  readonly surface: Locator;
  /** True when this viewport got the phone's sheet. */
  readonly compact: boolean;
  /** Select an option, e.g. `choose("priority", "p1")`. */
  readonly choose: (param: string, value: string) => Promise<void>;
  /** Commit the draft. A no-op in the popover, which applies as it goes. */
  readonly commit: () => Promise<void>;
  /**
   * Close the surface and wait until it is gone.
   *
   * V2.4-GATE-01 — `commit` does NOT do this, and the asymmetry matters. On a
   * phone it clicks Apply, which closes the sheet; on a pointer viewport it is a
   * no-op, so the popover is still OPEN and still over the page. A journey that
   * goes on to touch something else — a filter chip, say — is then interacting
   * across an open floating surface on desktop and a closed one on phone, which
   * is not one journey at two widths, and is not what a person does either.
   *
   * MEASURED on CI runs 32604491454 and 32610240298 (p07, then p02):
   * `tasks-collection.spec.ts:298` clicked a chip's remove link with the popover
   * still open, and the click produced **no navigation at all** — no third
   * `.data` request in the trace, the URL unchanged. `AnchoredSurface` dismisses
   * on a capture-phase `pointerdown` and returns focus to the trigger, so the
   * page can move between `pointerdown` and `pointerup` and the `click` never
   * reaches the link. The sibling journey that removes a chip with nothing open
   * (`:159`) has always passed.
   *
   * Escape closes both surfaces — the Sheet as a modal, the popover through its
   * own `onKeyDown` — so one keystroke serves both, exactly as a person would.
   */
  readonly dismiss: () => Promise<void>;
}

export async function openCollectionControls(
  page: Page,
): Promise<CollectionControlsSurface> {
  await page.getByTestId("collection-filter-trigger").click();
  const sheet = page.getByTestId("collection-sheet");
  const popover = page.getByTestId("collection-popover");
  // Whichever mounted. `.or()` resolves as soon as either exists, so this waits
  // for the control surface rather than for a guess about which one it is.
  await expect(sheet.or(popover)).toBeVisible();
  const compact = (await sheet.count()) > 0;
  const surface = compact ? sheet : popover;
  const prefix = compact ? "collection-sheet" : "collection-popover";
  return {
    surface,
    compact,
    choose: async (param, value) => {
      await surface.getByTestId(`${prefix}-${param}-${value}`).click();
    },
    commit: async () => {
      if (compact) await page.getByTestId("collection-sheet-apply").click();
    },
    dismiss: async () => {
      if (await surface.isVisible()) {
        await page.keyboard.press("Escape");
        await expect(surface).toBeHidden();
      }
    },
  };
}

/* -------------------------------------------------------------------------- */
/* The Markdown editor's readiness contract                                     */
/* -------------------------------------------------------------------------- */

/**
 * Wait for a `LiveMarkdownEditor` to finish enhancing, before typing into it.
 *
 * `LiveMarkdownEditor` server-renders a plain `<textarea>` and replaces it with
 * CodeMirror on the client, initialising the view from its `value` PROP. So
 * anything typed into the fallback during that window is **discarded** — as
 * `forms.spec.ts` already says in as many words: *"until enhancement lands, the
 * live control is still the SSR `<textarea>`, and anything typed into it is
 * discarded when CodeMirror replaces it."* The component publishes
 * `data-editor-ready` on `.dh-md-editor` precisely so a caller can wait.
 *
 * V2.4-GATE-01 — this exists because `task-drawer.spec.ts:111` did not wait, and
 * lost a race it had won on every previous run. The failure was silent in the
 * worst way: the form SAVED, the toast said success, and the value it wrote was
 * the one already there. Only the request body showed it —
 * `name="description"` carrying `Draft the **proposal** document.`, the seeded
 * text, on CI run 32607890703 (p02). An assertion cannot catch that; a wait can
 * prevent it.
 *
 * Four specs already wait on this contract with their own expectations, and they
 * are deliberately NOT folded into this one: `touch-targets` allows 90 s for a
 * cold CodeMirror compile, `reviews-guided` scopes to `.dh-review-guide__prompt`
 * so it cannot match a sibling prompt's editor, `notes` documents the
 * code-split-chunk reasoning its timeout is chosen for, and
 * `meetings-concurrency` takes a field label and returns the group. Each has a
 * reason worth keeping. This is the default for everything else, so the next
 * spec that types into an editor has somewhere to reach rather than a fifth
 * copy to write.
 *
 * @param scope Where to look — a dialog, a form, or the page.
 */
export async function waitForEditorReady(
  scope: Page | Locator,
  options: { readonly timeout?: number } = {},
): Promise<void> {
  await expect(
    scope.locator('.dh-md-editor[data-editor-ready="true"]').first(),
  ).toBeVisible({ timeout: options.timeout ?? 30_000 });
}
