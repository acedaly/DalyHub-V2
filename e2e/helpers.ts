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
 */
export const RESPONSIVE_VIEWPORTS = [
  { label: "mobile-320", width: 320, height: 720 },
  { label: "mobile-375", width: 375, height: 812 },
  { label: "mobile-390", width: 390, height: 844 },
  { label: "mobile-430", width: 430, height: 932 },
  { label: "phone-landscape", width: 844, height: 390 },
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

/**
 * DS-04 — ONE locator for a task row on `/tasks`.
 *
 * The workspace list stopped being the generic `Card` (an `<article>`) and became
 * the product-level `TaskRow` (an `<li>` in a real `<ul>`, so a screen reader
 * hears "list, 24 items"). Specs asked for `getByRole("article")`, which was
 * always a statement about the CARD rather than about the task, and would have
 * had to be re-decided in six files.
 *
 * Every task-bearing surface that has NOT adopted the row — Today, a Project's
 * task list — still renders cards, and those specs still say `article`, which is
 * correct: they are asking about a different component.
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
  // Settle the document FIRST. This function is called precisely when a journey
  // has arrived through the product, which means a client-side navigation may
  // still be in flight — and `[data-hydrated]` belongs to a document, not to the
  // page. Counting the marker before the navigation completes can therefore
  // describe the document being navigated AWAY from, and then the assertion below
  // spends its whole timeout waiting for an element the new document never had.
  // (Seen in CI: a Note capture handed off to the canonical editor, `/notes/`
  // matched, Today's marker was still counted, and `.first()` resolved to
  // nothing.) Settling first makes the count describe the document we landed on.
  await page.waitForLoadState("networkidle");

  // `[data-hydrated]` is published only by the surfaces that have a meaningful
  // hydration boundary — Today and the design routes. A product navigation can
  // leave a stale marker mounted briefly while the new route is already usable,
  // so only routes that own the marker wait on it.
  const pathname = new URL(page.url()).pathname;
  if (!pathname.startsWith("/today") && !pathname.startsWith("/design/")) {
    return;
  }

  // Where the marker belongs to the active route it is the real gate, because
  // server-rendered markup is interactive-looking well before React attaches.
  const marker = page.locator("[data-hydrated]").first();
  await expect
    .poll(async () => {
      if ((await marker.count()) === 0) {
        return true;
      }
      return (await marker.getAttribute("data-hydrated")) === "true";
    })
    .toBe(true);
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
 * It is **Focus**. It was "My day" until M3X-02 (#145) renamed the heading the
 * region is labelled by, and this helper was not renamed with it — so from that
 * merge onwards `todayDayPanel()` resolved to nothing and every spec that waited
 * on it waited out its timeout. Fixed here rather than worked around at the four
 * call sites: a landmark helper that names a landmark the product does not have
 * is one bug, not four.
 */
export function todayDayPanel(page: Page): Locator {
  return page.getByRole("region", { name: "Focus" });
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
  const [year, month, day] = iso.split("-").map(Number);
  const monthLabel = `${CALENDAR_MONTHS[month - 1]} ${year}`;
  const dayLabel = `${day} ${monthLabel}`;

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
  await scope.getByRole("button", { name: dayLabel }).click();
}
