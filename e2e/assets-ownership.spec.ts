/**
 * ASSET-02 — the Asset ownership journeys, end to end (real Worker + local D1).
 *
 * These are OWNERSHIP JOURNEYS, not isolated form tests: buy a ute, service it,
 * repair it, read its odometer, put its registration and its 10,000 km service on
 * a schedule, carry one into Today, complete a task and then record what actually
 * happened, complete an obligation directly and watch exactly one successor
 * appear, record a valuation, then archive and restore the whole thing with its
 * history intact.
 *
 * The two most load-bearing assertions here are the ones that are easy to get
 * wrong and impossible to notice: that completing a repeating obligation produces
 * EXACTLY ONE next occurrence, and that ticking a linked Task does not silently
 * assert the servicing happened.
 */

import { expect, test, type Page } from "@playwright/test";

import {
  chooseAssetType,
  cleanupAllAssetFixtures,
  cleanupAssetByTitle,
  uniqueAssetTitle,
} from "./assets-fixtures";
import {
  expectMinTouchTarget,
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

const owned = new Set<string>();

test.beforeAll(async () => {
  await cleanupAllAssetFixtures();
});

test.afterEach(async () => {
  for (const title of owned) {
    await cleanupAssetByTitle(title);
  }
  owned.clear();
});

/** Escape a generated fixture title for use inside a name RegExp. */
function escapeForRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Assert the Assets COLLECTION states an outstanding obligation for `title`.
 *
 * This used to be asserted on Today, which carried an "Assets needing attention"
 * list. The Today redesign removed that list and did not replace it, so the
 * collection's own obligation signal is now the only place an obligation reaches
 * the owner outside the asset's own record. The journey these steps belong to is
 * unchanged — "an outstanding obligation is visible somewhere I will actually
 * look" — so it is asserted where the product now says it. The missing Today
 * surface is recorded as debt rather than rebuilt inside an E2E repair.
 */
async function expectCollectionSignal(
  page: Page,
  title: string,
  signal: string | RegExp,
): Promise<void> {
  await gotoFixture(page, "/assets");
  const card = page
    .getByRole("listitem")
    .filter({ hasText: new RegExp(escapeForRegExp(title)) });
  await expect(card).toBeVisible();
  await expect(card.getByText(signal)).toBeVisible();
}

/** The counterpart: the card is there, and states no obligation at all. */
async function expectNoCollectionSignal(
  page: Page,
  title: string,
): Promise<void> {
  await gotoFixture(page, "/assets");
  const card = page
    .getByRole("listitem")
    .filter({ hasText: new RegExp(escapeForRegExp(title)) });
  await expect(card).toBeVisible();
  await expect(card.getByText(/obligation/)).toHaveCount(0);
}

/** A calendar date `days` from today, in the owner's wall-calendar form. */
function isoInDays(days: number): string {
  const now = new Date();
  const date = new Date(
    Date.UTC(now.getFullYear(), now.getMonth(), now.getDate() + days),
  );
  return date.toISOString().slice(0, 10);
}

/**
 * Choose an Asset type. The shared helper handles BOTH presentations of the one
 * control (combobox on desktop, option sheet below `md`), so a journey that runs
 * at 320px picks a type the same way a laptop journey does.
 */
async function chooseType(page: Page, label: string): Promise<void> {
  await chooseAssetType(page, label);
}

async function createAsset(
  page: Page,
  title: string,
  type = "Vehicle",
): Promise<string> {
  owned.add(title);
  await gotoFixture(page, "/assets");
  await page.getByRole("link", { name: "New Asset" }).first().click();
  await expect(page).toHaveURL(/\/new\/asset$/);
  await page.getByRole("textbox", { name: /^Name/ }).fill(title);
  await chooseType(page, type);
  await page.getByRole("button", { name: "Create asset" }).click();
  await expect(page).toHaveURL(/\/asset\/[^/?#]+$/);
  return page.url();
}

/** The record's Drawer, which hosts every ASSET-02 write form. */
/**
 * RECORD-01 — start a history capture, wherever the record's action hierarchy
 * puts it.
 *
 * The History tab used to render all six captures as six equally-weighted ghost
 * buttons. It now exposes the asset's PRIMARY capture — "Record service" for a
 * serviceable thing, "Record renewal" for a document/licence/policy — and keeps
 * the rest in the shared DS-12 overflow. These journeys care that the capture
 * happens, not about which control started it, so the helper takes whichever
 * route the record offers rather than each test encoding the hierarchy.
 */
async function startCapture(page: Page, label: string): Promise<void> {
  /*
   * Which capture is EXPOSED depends on the asset's type — a thing that is
   * serviced leads with "Record service", everything else is behind the
   * overflow — so this asks the toolbar which one it is.
   *
   * The toolbar is waited for before the question is asked. `count()` does not
   * auto-wait, so calling it straight after a tab click reads the panel before
   * it has rendered: the answer is always 0, the helper takes the overflow
   * branch, and then waits out the whole test budget for a menu item that is
   * not in the menu BECAUSE it is the exposed button. That is what made this
   * spec's theme sweep burn six minutes on a locator that was on screen the
   * whole time.
   */
  const toolbar = page.locator(".dh-record-toolbar");
  await expect(toolbar).toBeVisible();
  const exposed = toolbar.getByRole("button", { name: label });
  if ((await exposed.count()) > 0) {
    await exposed.click();
    return;
  }
  await page
    .getByRole("button", { name: "More ways to record an entry" })
    .click();
  await page.getByRole("menu").getByRole("menuitem", { name: label }).click();
}

function drawer(page: Page) {
  return page.getByRole("dialog");
}

/**
 * Choose an option in a shared DS-06 SelectField. It is an editable combobox with
 * a listbox popup, not a native `<select>`, so the journey drives it the way a
 * person does — which is also what proves it is keyboard-operable.
 */
async function chooseOption(
  page: Page,
  field: string | RegExp,
  optionLabel: string,
): Promise<void> {
  const combo = drawer(page).getByRole("combobox", { name: field });
  await combo.click();
  await combo.fill(optionLabel);
  // Scoped to the DRAWER: the obligations tab behind it carries a native
  // `<select>` filter with the same option labels.
  await drawer(page)
    .getByRole("option", { name: optionLabel, exact: true })
    .first()
    .click();
}

test("record a service, a repair and a meter reading, and see the history", async ({
  page,
}) => {
  const title = uniqueAssetTitle("ownership-history");
  const url = await createAsset(page, title);

  await page.goto(url);
  await page.getByRole("tab", { name: "History" }).click();

  // A brand-new asset teaches the first entry rather than showing an empty list.
  await expect(page.getByText("No history recorded yet")).toBeVisible();

  // 1. Record a service — the fast path asks only for what is on the invoice.
  await startCapture(page, "Record service");
  await drawer(page)
    .getByRole("textbox", { name: /^Title/ })
    .fill("60,000 km service");
  await drawer(page).getByRole("textbox", { name: /^Cost/ }).fill("489.50");
  await drawer(page)
    .getByRole("textbox", { name: /^Meter reading/ })
    .fill("60200");
  await drawer(page)
    .getByRole("textbox", { name: /^Provider/ })
    .fill("Northside Auto");
  await drawer(page)
    .getByRole("textbox", { name: /^Next service due/ })
    .fill(isoInDays(180));
  await drawer(page).getByRole("button", { name: "Record service" }).click();

  const history = page.getByRole("list", { name: "Asset history" });
  await expect(history.getByText("60,000 km service").first()).toBeVisible();
  await expect(history.getByText(/Northside Auto/)).toBeVisible();
  await expect(history.getByText(/489\.50/)).toBeVisible();
  await expect(history.getByText(/60,200 km/)).toBeVisible();

  // 2. Record a repair.
  await startCapture(page, "Record repair");
  await drawer(page)
    .getByRole("textbox", { name: /^Title/ })
    .fill("Alternator replaced");
  await drawer(page).getByRole("textbox", { name: /^Cost/ }).fill("1200");
  await drawer(page).getByRole("button", { name: "Record repair" }).click();
  await expect(history.getByText("Alternator replaced").first()).toBeVisible();

  // 3. Update the meter — two fields, not a generic form.
  await startCapture(page, "Update meter");
  await drawer(page)
    .getByRole("textbox", { name: /^Meter reading/ })
    .fill("61500");
  await drawer(page).getByRole("button", { name: "Update meter" }).click();
  await expect(history.getByText(/61,500 km/)).toBeVisible();

  // 4. The Overview reflects the CURRENT canonical facts, not a replay.
  await page.getByRole("tab", { name: "Overview" }).click();
  const overview = page.getByRole("tabpanel", { name: "Overview" });
  await expect(overview.getByText("Current meter")).toBeVisible();
  await expect(overview.getByText(/61,500 km/)).toBeVisible();
  // Scoped to the facts list: "Last service" is also a row inside the closed
  // "All dates" disclosure. The newest service-or-repair here is the repair, so
  // the label reads "Last repair" — which is the behaviour, not a workaround.
  await expect(
    overview
      .locator(".dh-asset-summary__facts")
      .getByText(/^Last (service|repair)$/),
  ).toBeVisible();

  // 5. Recorded costs are labelled as recorded, and disclaim completeness.
  await overview.getByText("Recorded costs").click();
  await expect(
    overview.getByText(/not a complete cost of ownership/),
  ).toBeVisible();
  await expect(overview.getByText("Service and maintenance")).toBeVisible();
  await expect(overview.getByText("Repairs")).toBeVisible();

  // 6. History filters by category over the whole history, not the loaded page.
  await page.getByRole("tab", { name: "History" }).click();
  await page.getByLabel("Show").selectOption("repair");
  await expect(history.getByText("Alternator replaced").first()).toBeVisible();
  await expect(history.getByText("60,000 km service")).toHaveCount(0);
});

test("a date obligation reaches Today, and completing it schedules exactly one successor", async ({
  page,
}) => {
  const title = uniqueAssetTitle("ownership-rego");
  const url = await createAsset(page, title);

  // 1. Put the registration on a yearly schedule, due inside the lead window so
  //    it is genuinely something Today should mention.
  await page.goto(url);
  await page.getByRole("tab", { name: "Obligations" }).click();
  await expect(page.getByText("Nothing scheduled yet")).toBeVisible();
  await page.getByRole("button", { name: "Add obligation" }).click();

  await chooseOption(page, /^Category/, "Registration renewal");
  await drawer(page)
    .getByRole("textbox", { name: /^Title/ })
    .fill("Renew registration");
  await drawer(page)
    .getByRole("textbox", { name: /^Due date/ })
    .fill(isoInDays(7));
  await chooseOption(page, /^Repeats/, "Every N years");
  await drawer(page).getByRole("button", { name: "Add obligation" }).click();

  // 2. It reads as due soon, in WORDS, under a Due soon heading.
  const dueList = page.getByRole("list", { name: "Due soon obligations" });
  await expect(dueList.getByText("Renew registration").first()).toBeVisible();
  await expect(dueList.getByText("Due soon")).toBeVisible();
  await expect(dueList.getByText(/Due in \d+ days/)).toBeVisible();
  await expect(dueList.getByText("Every year")).toBeVisible();

  // 3. The Overview leads with it, and the tab strip carries no false alarm.
  await page.getByRole("tab", { name: "Overview" }).click();
  await expect(
    page.getByTestId("asset-next-obligation").getByText("Renew registration"),
  ).toBeVisible();

  // 4. It reaches the owner OUTSIDE the record it was created on — the Assets
  //    collection card carries the obligation signal, by count and in words.
  await expectCollectionSignal(page, title, "1 obligation due soon");

  // 5. Complete it — recording what actually happened, not just ticking a box.
  await page.goto(`${url}?tab=obligations`);
  await page
    .getByRole("button", { name: /^Complete Renew registration/ })
    .click();
  await expect(
    drawer(page).getByText(/records what actually happened/),
  ).toBeVisible();
  await drawer(page).getByRole("textbox", { name: /^Cost/ }).fill("870");
  await drawer(page)
    .getByRole("button", { name: "Record and complete" })
    .click();

  // 6. EXACTLY ONE successor, a year on, and exactly one completed occurrence.
  const laterList = page.getByRole("list", { name: "Later obligations" });
  await expect(
    laterList.locator(".dh-asset-obligation__name", {
      hasText: "Renew registration",
    }),
  ).toHaveCount(1);
  await expect(page.getByText(/Completed and set aside \(1\)/)).toBeVisible();

  // 7. The proof of the work is in history, in the right category.
  await page.getByRole("tab", { name: "History" }).click();
  const history = page.getByRole("list", { name: "Asset history" });
  await expect(history.getByText("Renew registration").first()).toBeVisible();
  await expect(history.getByText("Registration").first()).toBeVisible();
  await expect(history.getByText(/870/)).toBeVisible();

  // 8. The signal is quiet again — the next one is a year away, not today's
  //    business, so the card states nothing rather than a zero.
  await expectNoCollectionSignal(page, title);
});

test("a meter obligation asks for a reading rather than accusing you of being late", async ({
  page,
}) => {
  const title = uniqueAssetTitle("ownership-meter");
  const url = await createAsset(page, title);

  await page.goto(`${url}?tab=obligations`);
  await page.getByRole("button", { name: "Add obligation" }).click();
  await chooseOption(page, /^Category/, "Scheduled service");
  await drawer(page)
    .getByRole("textbox", { name: /^Title/ })
    .fill("Service every 10,000 km");
  await drawer(page)
    .getByRole("textbox", { name: /^Due at meter reading/ })
    .fill("70000");
  await chooseOption(page, /^Meter unit/, "Kilometres");
  await chooseOption(page, /^Repeats/, "Every N kilometres, hours or cycles");
  await drawer(page)
    .getByRole("textbox", { name: /^Repeat every/ })
    .fill("10000");
  await drawer(page).getByRole("button", { name: "Add obligation" }).click();

  // 1. With no reading at all, it says so — it does NOT say overdue.
  const dueList = page.getByRole("list", { name: "Due soon obligations" });
  await expect(
    dueList.getByText("Reading needed", { exact: true }),
  ).toBeVisible();
  await expect(dueList.getByText("Current meter reading needed")).toBeVisible();
  await expect(dueList.getByText("Overdue", { exact: true })).toHaveCount(0);

  // 2. Record a reading comfortably short of the threshold.
  await page.getByRole("tab", { name: "History" }).click();
  await startCapture(page, "Update meter");
  await drawer(page)
    .getByRole("textbox", { name: /^Meter reading/ })
    .fill("55000");
  await chooseOption(page, /^Meter unit/, "Kilometres");
  await drawer(page).getByRole("button", { name: "Update meter" }).click();

  await page.getByRole("tab", { name: "Obligations" }).click();
  const laterList = page.getByRole("list", { name: "Later obligations" });
  await expect(laterList.getByText(/Due at 70,000 km/)).toBeVisible();

  // 3. Push the reading past the threshold — now it IS overdue, by a distance.
  await page.getByRole("tab", { name: "History" }).click();
  await startCapture(page, "Update meter");
  await drawer(page)
    .getByRole("textbox", { name: /^Meter reading/ })
    .fill("70500");
  await chooseOption(page, /^Meter unit/, "Kilometres");
  await drawer(page).getByRole("button", { name: "Update meter" }).click();

  await page.getByRole("tab", { name: "Obligations" }).click();
  const overdueList = page.getByRole("list", { name: "Overdue obligations" });
  await expect(overdueList.getByText(/Overdue by 500 km/)).toBeVisible();

  // 4. Complete it at the reading the work was done at — the next threshold is a
  //    full interval later, so being 500 km late does not shift the schedule.
  await page
    .getByRole("button", { name: /^Complete Service every 10,000 km/ })
    .click();
  await drawer(page)
    .getByRole("textbox", { name: /^Meter reading/ })
    .fill("70600");
  await drawer(page)
    .getByRole("button", { name: "Record and complete" })
    .click();

  await expect(
    page
      .getByRole("list", { name: "Later obligations" })
      .getByText(/Due at 80,600 km/),
  ).toBeVisible();
});

test("completing the linked Task does not assert the work happened", async ({
  page,
}) => {
  const title = uniqueAssetTitle("ownership-task");
  const url = await createAsset(page, title);

  await page.goto(`${url}?tab=obligations`);
  await page.getByRole("button", { name: "Add obligation" }).click();
  await chooseOption(page, /^Category/, "Scheduled service");
  await drawer(page)
    .getByRole("textbox", { name: /^Title/ })
    .fill("Book the annual service");
  await drawer(page)
    .getByRole("textbox", { name: /^Due date/ })
    .fill(isoInDays(5));
  await drawer(page).getByRole("button", { name: "Add obligation" }).click();

  // 1. Create the actionable Task from the obligation.
  await page
    .getByRole("button", { name: /^Create task for Book the annual service/ })
    .click();
  const dueList = page.getByRole("list", { name: "Due soon obligations" });
  await expect(dueList.getByText(/Tracked as a task/)).toBeVisible();
  const taskLink = dueList.getByRole("link", { name: "Open task" });
  await expect(taskLink).toBeVisible();

  /*
   * 2. The dedup rule: ONE Task tracks this obligation, and the obligation stops
   *    offering to create another.
   *
   *    This used to be read off Today, which said "1 asset obligation is already
   *    tracked as a task in My day" beside an "Assets needing attention" list.
   *    The Today redesign removed that list outright — Today now carries no
   *    obligations at all, so there is nothing there left to duplicate and
   *    nothing there left to assert. The gap is recorded as DEBT-111 rather than
   *    rebuilt inside an E2E repair, and the rule itself is asserted where the
   *    product still states it.
   */
  await expect(dueList.getByRole("link", { name: "Open task" })).toHaveCount(1);
  await expect(
    dueList.getByRole("button", {
      name: /^Create task for Book the annual service/,
    }),
  ).toHaveCount(0);

  // 3. Complete the Task.
  await page.goto(`${url}?tab=obligations`);
  const taskHref = await dueList
    .getByRole("link", { name: "Open task" })
    .getAttribute("href");
  await page.goto(taskHref!);
  // The Task's own canonical control, in the shared Task drawer.
  await page.getByRole("checkbox", { name: "Mark complete" }).first().check();
  await expect(page.getByText("Completed").first()).toBeVisible();

  // 4. The obligation is STILL OPEN, and says so in the owner's words.
  await page.goto(`${url}?tab=obligations`);
  await expect(
    page.getByText(/Its task is done\. Record what actually happened/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Complete Book the annual service/ }),
  ).toBeVisible();

  // 5. It is still being asked for, because it is genuinely still outstanding —
  //    completing the TASK never asserts that the servicing happened.
  await expectCollectionSignal(page, title, /obligation/);
});

test("valuation history refuses to call two points a trend", async ({
  page,
}) => {
  const title = uniqueAssetTitle("ownership-value");
  const url = await createAsset(page, title);

  await page.goto(`${url}?tab=history`);
  for (const [amount, source] of [
    ["38000", "Insurance valuation"],
    ["35500", "Dealer quote"],
  ] as const) {
    await startCapture(page, "Record valuation");
    await drawer(page)
      .getByRole("textbox", { name: /^Title/ })
      .fill(source);
    await drawer(page)
      .getByRole("textbox", { name: /^Value/ })
      .fill(amount);
    await drawer(page)
      .getByRole("button", { name: "Record valuation" })
      .click();
    await expect(drawer(page)).toHaveCount(0);
  }

  await page.getByRole("tab", { name: "Overview" }).click();
  const overview = page.getByRole("tabpanel", { name: "Overview" });
  await overview.getByText("Value history").click();
  await expect(overview.getByText("Current recorded value")).toBeVisible();
  await expect(overview.getByText(/35,500/).first()).toBeVisible();
  await expect(overview.getByText(/too few to show a trend/)).toBeVisible();
});

test("archiving keeps the history and stops the reminders; restoring brings both back", async ({
  page,
}) => {
  const title = uniqueAssetTitle("ownership-archive");
  const url = await createAsset(page, title);

  await page.goto(`${url}?tab=history`);
  await startCapture(page, "Record service");
  await drawer(page)
    .getByRole("textbox", { name: /^Title/ })
    .fill("Annual service");
  await drawer(page).getByRole("button", { name: "Record service" }).click();

  await page.getByRole("tab", { name: "Obligations" }).click();
  await page.getByRole("button", { name: "Add obligation" }).click();
  await drawer(page)
    .getByRole("textbox", { name: /^Title/ })
    .fill("Next service");
  await drawer(page)
    .getByRole("textbox", { name: /^Due date/ })
    .fill(isoInDays(3));
  await drawer(page).getByRole("button", { name: "Add obligation" }).click();
  await expect(
    page.getByRole("list", { name: "Due soon obligations" }),
  ).toBeVisible();

  // Archive from the shared Settings tab.
  await page.getByRole("tab", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Archive asset" }).click();
  await expect(page.getByText(/Archived ·/)).toBeVisible();

  // History survives, and becomes read-only.
  await page.getByRole("tab", { name: "History" }).click();
  await expect(
    page
      .getByRole("list", { name: "Asset history" })
      .getByText("Annual service")
      .first(),
  ).toBeVisible();
  // RECORD-01 — an archived asset offers no capture at all: neither the
  // exposed primary action nor the overflow that holds the rest.
  await expect(
    page.locator(".dh-record-toolbar").getByRole("button"),
  ).toHaveCount(0);

  // An archived asset stops asking for things: it is out of the active
  // collection entirely, so it carries no obligation signal anywhere.
  await gotoFixture(page, "/assets");
  await expect(
    page.getByRole("link", { name: new RegExp(escapeForRegExp(title)) }),
  ).toHaveCount(0);

  // Restoring brings the obligation back WITHOUT reopening completed work.
  await page.goto(`${url}?tab=settings`);
  await page.getByRole("button", { name: "Restore asset" }).click();
  await expect(
    page.getByRole("button", { name: "Archive asset" }),
  ).toBeVisible();
  await expectCollectionSignal(page, title, /obligation/);
});

test("the collection surfaces the obligation signal and filters on it", async ({
  page,
}) => {
  const overdue = uniqueAssetTitle("collection-overdue");
  const quiet = uniqueAssetTitle("collection-quiet");

  const overdueUrl = await createAsset(page, overdue);
  await createAsset(page, quiet, "Appliance");

  await page.goto(`${overdueUrl}?tab=obligations`);
  await page.getByRole("button", { name: "Add obligation" }).click();
  await drawer(page)
    .getByRole("textbox", { name: /^Title/ })
    .fill("Overdue rego");
  await drawer(page)
    .getByRole("textbox", { name: /^Due date/ })
    .fill(isoInDays(-10));
  await drawer(page).getByRole("button", { name: "Add obligation" }).click();
  await expect(
    page.getByRole("list", { name: "Overdue obligations" }),
  ).toBeVisible();

  await gotoFixture(page, "/assets");
  await expect(page.getByText("1 obligation overdue")).toBeVisible();

  await page
    .getByRole("combobox", { name: "Obligations" })
    .selectOption("overdue");
  await expect(
    page.getByRole("link", { name: new RegExp(overdue) }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: new RegExp(quiet) })).toHaveCount(
    0,
  );
});

test("the whole workflow is keyboard-operable with visible focus", async ({
  page,
}) => {
  const title = uniqueAssetTitle("ownership-keyboard");
  const url = await createAsset(page, title);

  await page.goto(`${url}?tab=obligations`);
  const add = page.getByRole("button", { name: "Add obligation" });
  await add.focus();
  await expect(add).toBeFocused();
  await page.keyboard.press("Enter");

  const titleField = drawer(page).getByRole("textbox", { name: /^Title/ });
  await expect(titleField).toBeVisible();
  await titleField.fill("Keyboard obligation");
  await drawer(page)
    .getByRole("textbox", { name: /^Due date/ })
    .fill(isoInDays(4));
  await drawer(page)
    .getByRole("button", { name: "Add obligation" })
    .press("Enter");

  await expect(
    page
      .getByRole("list", { name: "Due soon obligations" })
      .locator(".dh-asset-obligation__name", {
        hasText: "Keyboard obligation",
      }),
  ).toHaveCount(1);
});

test("obligation and history actions meet the minimum touch target", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 780 });
  const title = uniqueAssetTitle("ownership-touch");
  const url = await createAsset(page, title);

  await page.goto(`${url}?tab=obligations`);
  await page.getByRole("button", { name: "Add obligation" }).click();
  await drawer(page)
    .getByRole("textbox", { name: /^Title/ })
    .fill("Touch target");
  await drawer(page)
    .getByRole("textbox", { name: /^Due date/ })
    .fill(isoInDays(4));
  await drawer(page).getByRole("button", { name: "Add obligation" }).click();

  // The compact action row must still be reachable with a thumb.
  await expectMinTouchTarget(
    page.getByRole("button", { name: /^Complete Touch target/ }),
  );
  await expectMinTouchTarget(
    page.getByRole("button", { name: /^Hold Touch target/ }),
  );
});

for (const width of [320, 375, 390, 430]) {
  test(`no horizontal overflow on the history and obligations tabs at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 780 });
    const title = uniqueAssetTitle(`mobile-${width}`);
    const url = await createAsset(page, title);

    await page.goto(`${url}?tab=history`);
    await startCapture(page, "Record service");
    await drawer(page)
      .getByRole("textbox", { name: /^Title/ })
      // A long unbroken provider/serial-like value is exactly what forces a page
      // wide if anything is missing `overflow-wrap`.
      .fill("Averyveryverylongunbrokenservicedescriptionvaluethatmustwrap");
    await drawer(page)
      .getByRole("textbox", { name: /^Provider/ })
      .fill("Northsideautomotiveandmechanicalservicespropertylimited");
    await drawer(page).getByRole("button", { name: "Record service" }).click();
    await expectNoHorizontalOverflow(page);

    await page.getByRole("tab", { name: "Obligations" }).click();
    await expectNoHorizontalOverflow(page);
    await page.getByRole("tab", { name: "Overview" }).click();
    await expectNoHorizontalOverflow(page);
  });
}

for (const scheme of ["light", "dark"] as const) {
  test(`the history and obligations surfaces pass axe (${scheme})`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const title = uniqueAssetTitle(`axe-${scheme}`);
    const url = await createAsset(page, title);

    await page.goto(`${url}?tab=obligations`);
    await page.getByRole("button", { name: "Add obligation" }).click();
    await drawer(page)
      .getByRole("textbox", { name: /^Title/ })
      .fill("Axe check");
    await drawer(page)
      .getByRole("textbox", { name: /^Due date/ })
      .fill(isoInDays(4));
    await drawer(page).getByRole("button", { name: "Add obligation" }).click();

    // Gate each scan on the record's own h1 being present. A scan fired while a
    // revalidation is still swapping the document sees a page with no level-one
    // heading and reports it — which is a race in the test, not a real defect.
    const heading = page.getByRole("heading", { level: 1, name: title });

    const scan = async () => {
      await page.waitForLoadState("networkidle");
      await expect(heading).toBeVisible();
      await expectNoAxeViolations(page);
    };

    await scan();
    await page.getByRole("tab", { name: "History" }).click();
    await scan();
    await page.getByRole("tab", { name: "Overview" }).click();
    await scan();
  });
}

/* -------------------------------------------------------------------------- */
/* Every curated theme                                                        */
/* -------------------------------------------------------------------------- */

/** Every curated theme, by the id the document carries. */
const APPEARANCES = ["light", "dark"] as const;

test("the obligation and history states read correctly in both appearances", async ({
  page,
}) => {
  // MEASURED at 31.9s on an idle machine at five themes, against the 30s default:
  // a whole-registry sweep is genuinely long work, not a hang. THEME-02 took the
  // registry to seven, so the same per-theme cost lands near 45s. Sized to it, as
  // the sibling theme and responsive tests in this suite already are. No assertion
  // changes.
  test.setTimeout(120_000);
  // This one journey walks EVERY theme over THREE tabs, running an axe scan on
  // each — roughly twenty-one real scans plus the setup that creates the states.
  // The extended budget reflects that genuine work; it is not covering a race
  // (every step below waits on a real condition, and none of them polls).
  test.slow();

  const title = uniqueAssetTitle("themes");
  const url = await createAsset(page, title);

  // One asset carrying every state worth checking: an overdue obligation, a
  // due-soon one, a meter obligation with no reading, and a history entry.
  await page.goto(`${url}?tab=obligations`);
  // Scoped to the tab panel: once the drawer is open it carries its own
  // "Add obligation" SUBMIT button, which is a legitimate second control with
  // the same name rather than a duplicate to design away.
  const panel = page.getByRole("tabpanel", { name: "Obligations" });
  const addObligation = panel.getByRole("button", { name: "Add obligation" });

  for (const [name, offset] of [
    ["Overdue rego", -10],
    ["Service due soon", 4],
  ] as const) {
    await addObligation.click();
    await drawer(page)
      .getByRole("textbox", { name: /^Title/ })
      .fill(name);
    await drawer(page)
      .getByRole("textbox", { name: /^Due date/ })
      .fill(isoInDays(offset));
    await drawer(page).getByRole("button", { name: "Add obligation" }).click();
    // The drawer must be gone before the next iteration reaches for the bar.
    await expect(drawer(page)).toHaveCount(0);
  }

  await addObligation.click();
  await drawer(page)
    .getByRole("textbox", { name: /^Title/ })
    .fill("Service at 60,000 km");
  await drawer(page)
    .getByRole("textbox", { name: /^Due at meter reading/ })
    .fill("60000");
  await chooseOption(page, /^Meter unit/, "Kilometres");
  await drawer(page).getByRole("button", { name: "Add obligation" }).click();
  await expect(drawer(page)).toHaveCount(0);

  await page.getByRole("tab", { name: "History" }).click();
  await startCapture(page, "Record service");
  await drawer(page)
    .getByRole("textbox", { name: /^Title/ })
    .fill("Annual service");
  await drawer(page).getByRole("textbox", { name: /^Cost/ }).fill("489.50");
  await drawer(page).getByRole("button", { name: "Record service" }).click();
  await expect(drawer(page)).toHaveCount(0);

  try {
    for (const scheme of APPEARANCES) {
      await page.emulateMedia({ colorScheme: scheme });

      await page.goto(`${url}?tab=obligations`);

      // Every state is carried by a WORD, in both appearances — the assertion that
      // proves nothing here depends on colour alone.
      await expect(
        page
          .getByRole("list", { name: "Overdue obligations" })
          .getByText("Overdue", { exact: true }),
      ).toBeVisible();
      const dueList = page.getByRole("list", { name: "Due soon obligations" });
      await expect(
        dueList.getByText("Due soon", { exact: true }),
      ).toBeVisible();
      await expect(
        dueList.getByText("Reading needed", { exact: true }),
      ).toBeVisible();

      await expectNoHorizontalOverflow(page);
      await expectNoAxeViolations(page);

      await page.getByRole("tab", { name: "History" }).click();
      await page.waitForLoadState("networkidle");
      await expect(
        page.getByRole("list", { name: "Asset history" }).getByText(/489\.50/),
      ).toBeVisible();
      await expectNoHorizontalOverflow(page);
      await expectNoAxeViolations(page);

      await page.getByRole("tab", { name: "Overview" }).click();
      await page.waitForLoadState("networkidle");
      await expectNoHorizontalOverflow(page);
      await expectNoAxeViolations(page);
    }
  } finally {
    // Never leave the suite running under an appearance this test chose.
    await page.emulateMedia({ colorScheme: "light" });
  }
});
