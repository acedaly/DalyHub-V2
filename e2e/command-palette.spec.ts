import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  gotoFixture,
  mobileNavigationOpener,
  postSameOrigin,
  todayDayPanel,
} from "./helpers";

/**
 * DS-09 Command Palette — driven end to end against the development-auth server.
 *
 * Exercises the real Product Frame Command Palette affordance (the sidebar ⌘K
 * entry and the global Mod+K shortcut) wired to the live `/commands` catalogue and
 * Today's registry-discovered navigation commands, the DS-08 record search merge,
 * the Today Quick Capture focus command, contextual actions, and the Card adapter —
 * plus the execution/failure states via the `/design/command-palette` fixture.
 * Role-based and non-brittle.
 *
 * ── Which wait belongs where ─────────────────────────────────────────────────
 * Several of these tests fire a GLOBAL KEYBOARD SHORTCUT (`/`, `Mod+K`) as their
 * first interaction, and a keypress is a ONE-SHOT event: pressed before React
 * attaches `CommandShortcutLayer`, it is swallowed and there is nothing to retry,
 * so the surface never opens. A network settle proves the network is quiet, not
 * that the document is interactive. (Observed in CI on 2026-08-02: "is mutually
 * exclusive with Search" pressed `/` and the Search combobox never appeared.
 * Clicking tests were unaffected — Playwright retries a click until it is
 * actionable.)
 *
 * So the two waits are used deliberately, and they are NOT interchangeable:
 *
 *   - ENTERING a journey → `gotoFixture`, which settles AND waits for the
 *     `[data-hydrated]` marker. This is the gate that makes a first keypress safe.
 *   - MID-journey, after a command has navigated → a plain settle. The marker is
 *     published only by Today and the design routes, so waiting for it on Projects,
 *     Areas, Goals or Diary hits the document-swap race `waitForInteractive`'s own
 *     comment describes: the count sees the outgoing document's marker and the
 *     assertion then finds nothing on the one we landed on. (Also observed in CI on
 *     2026-08-02, from over-applying the fix above.) By that point the journey has
 *     already driven the palette, so the dispatcher is attached regardless.
 */

async function hasNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

function commandTrigger(page: Page) {
  return page.getByRole("button", { name: "Command palette", exact: true });
}

function palette(page: Page) {
  return page.getByRole("combobox", { name: "Search commands and records" });
}

// A settle, NOT `waitForInteractive`: this helper is also called mid-journey,
// after a command has navigated to another module, and the hydration marker is
// published only by Today and the design routes. It does not need the stronger
// gate anyway — it CLICKS the trigger, and Playwright retries a click until the
// target is actionable.
async function openPalette(page: Page) {
  await page.waitForLoadState("networkidle");
  await commandTrigger(page).click();
  const input = palette(page);
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  return input;
}

/** Wait for a ranked option to render (so Enter never races the list). */
function option(page: Page, name: RegExp) {
  return page.getByRole("option", { name });
}

test.describe("DS-09 Command Palette — desktop", () => {
  test("opens from the sidebar and lists a matching command", async ({
    page,
  }) => {
    await page.goto("/");
    const input = await openPalette(page);
    await expect(input).toBeFocused();
    await input.fill("today");
    const listbox = page.getByRole("listbox", {
      name: "Commands and records",
    });
    await expect(listbox).toBeVisible();
    await expect(
      listbox.getByRole("option", { name: /Go to Today/ }).first(),
    ).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });

  test("opens with Mod+K and closes with a second Mod+K", async ({ page }) => {
    await gotoFixture(page, "/today");
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette(page)).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette(page)).toHaveCount(0);
  });

  test("runs a navigation command with the keyboard", async ({ page }) => {
    await page.goto("/");
    const input = await openPalette(page);
    await input.fill("Go to Today");
    await expect(option(page, /Go to Today/).first()).toBeVisible();
    await input.press("Enter");
    await expect(page).toHaveURL(/\/today$/);
    await expect(palette(page)).toHaveCount(0);
  });

  test("offers no dead Focus Quick Capture command, and capture is the global control", async ({
    page,
  }) => {
    // The Today redesign removed the screen's own capture widget: capture is the
    // global `+` alone, at every width. The palette command that used to focus
    // that widget went with it (`today/commands.ts`), and this asserts the
    // removal is COMPLETE rather than leaving an entry that navigates to Today
    // and then focuses nothing — the failure mode a retired command has.
    await page.goto("/");
    const input = await openPalette(page);
    await input.fill("Quick Capture");
    await expect(option(page, /Focus Quick Capture/)).toHaveCount(0);
    await page.keyboard.press("Escape");

    // …and Today itself offers no second capture control for it to have focused.
    // (That the GLOBAL control still opens is `global-capture.spec.ts`'s subject.)
    await expect(page.getByTestId("today-capture-task")).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Quick capture", exact: true }),
    ).toHaveCount(0);
  });

  test("opens a DS-08 record result in the real Drawer", async ({ page }) => {
    await page.goto("/today");
    const input = await openPalette(page);
    await input.fill("Finish");
    await expect(
      page.getByRole("listbox", { name: "Commands and records" }),
    ).toBeVisible();
    /*
     * The RECORD group is headed "Tasks", and the assertion names that HEADING
     * rather than asking the whole listbox for the word.
     *
     * `listbox.getByText("Tasks")` was unambiguous only while no Tasks-module
     * COMMAND happened to match this query — every command row carries its
     * module label in a chip with the same text. V2.7 RECALL-02's "Completed
     * yesterday" / "Completed this week" match "Finish" (they are about
     * finished work), so two more "Tasks" chips appeared and the loose locator
     * resolved to several elements. The group title is what this test actually
     * means, and it will not be broken by the next Tasks command.
     */
    await expect(
      page.locator(".dh-command__grouptitle").filter({ hasText: "Tasks" }),
    ).toBeVisible();
    const record = option(page, /Finish PX-02/).first();
    await expect(record).toBeVisible();
    // Open the record result directly (its option is a real link).
    await record.getByRole("link").click();
    // TASKS-01: the task record is resolved by the real Tasks provider and opens on
    // the canonical /tasks surface (its canonicalPath), not /today.
    await expect(page).toHaveURL(/\/tasks\?.*drawer=/);
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  // These persisting-completion journeys use the DEDICATED `t-complete` seed task
  // ("Wrap up the sprint") so completing it never disturbs the tasks other specs
  // open by title. The dev DB is shared and only reseeds at server start, so each
  // test first normalises the task to OPEN (reopening it if a prior run left it
  // completed) — the same robustness pattern the Waiting journey uses.
  const COMPLETE_TITLE = "Wrap up the sprint";

  async function ensureOpen(page: import("@playwright/test").Page) {
    await postSameOrigin(page.request, "/tasks/t-complete", {
      form: { intent: "reopen" },
    });
    /*
     * Also normalise it to PLANNED FOR TODAY, through its own Drawer.
     *
     * The task is unscheduled in the seed, which put it in Today's Anytime band.
     * POLISH-02 previews that band (a real workspace has a backlog of dozens, and
     * the landing page is not a place to read one), so an unscheduled task is not
     * reliably on the page. Planning it for today puts it in the band Today never
     * truncates. The Drawer's own Planning control is used rather than a date
     * computed in the test, so the owner's calendar day comes from the product.
     */
    await page.goto("/today");
    // Scope to the My day region so the task row is unambiguous. The Today
    // redesign replaced the widget's multi-select Cards with plain rows, so the
    // row is identified by its own completion control — a labelled checkbox —
    // rather than by a `.dh-card` that is no longer rendered here.
    const row = todayDayPanel(page).getByRole("checkbox", {
      name: new RegExp(`^(Complete|Reopen) ${COMPLETE_TITLE}$`),
    });

    // Plan it only if it is not already on the page: the dev database is shared,
    // so an unconditional write is an Activity row that pushes the seeded events
    // off the first page of the workspace feed (which `activity-actor.spec.ts`
    // reads). A normaliser should be a no-op when the state is already correct.
    if ((await row.count()) === 0) {
      await page.goto("/today?drawer=task%3At-complete");
      const planning = page
        .getByRole("dialog")
        .getByRole("group", { name: "Planning" });
      await planning
        .getByRole("button", { name: "Today", exact: true })
        .click();
      await expect(
        planning.getByRole("button", { name: "Clear" }),
      ).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(page.getByRole("dialog")).toBeHidden();
    }

    await expect(row).toBeVisible();
  }

  test("runs a contextual action bound to an open task Drawer", async ({
    page,
  }) => {
    await ensureOpen(page);
    // Open the dedicated task record in the Drawer.
    await page.goto("/today?drawer=task%3At-complete");
    await expect(
      page.getByRole("dialog", { name: new RegExp(COMPLETE_TITLE) }),
    ).toBeVisible();
    // Mod+K opens the palette over the Drawer; a task-specific contextual action
    // appears under "Current context".
    await page.keyboard.press("ControlOrMeta+k");
    const input = palette(page);
    await expect(input).toBeVisible();
    await input.fill("complete");
    const listbox = page.getByRole("listbox", {
      name: "Commands and records",
    });
    await expect(listbox.getByText("Current context")).toBeVisible();
    await expect(option(page, /Complete/).first()).toBeVisible();
    await input.press("Enter");
    // TODAY-02/04: the contextual completion action persists through to the real
    // task (the SAME shared action the Card and Drawer use) and reports it.
    await expect(page.getByText(/task completed/i).first()).toBeVisible();
  });

  test("activates the same shared action through the row's own control", async ({
    page,
  }) => {
    await ensureOpen(page);
    // The row's checkbox IS the shared toggle action — the same `/tasks/:id`
    // intent the palette command and the Drawer post. Completing here persists,
    // and the row's own control flips to "Reopen", which is how the redesigned
    // Today states a finished task (it keeps its place rather than moving into a
    // separate "Completed today" section, which the redesign removed).
    /*
     * The row is located by its TITLE, not by its control's name: the control is
     * named for what it will do next ("Complete …" / "Reopen …"), so naming it is
     * asserting the state through the very thing the click changes, and it flips
     * twice — once optimistically, once on revalidation.
     */
    const row = todayDayPanel(page)
      .getByRole("listitem")
      .filter({ hasText: COMPLETE_TITLE });
    const toggle = row.getByRole("checkbox");
    await expect(toggle).not.toBeChecked();

    /*
     * Wait for the WRITE, not for the paint. The row flips optimistically the
     * instant it is clicked, so reading the completion back from another route
     * on the strength of that flip races the request that makes it true — a
     * race a local run wins and a CI shard does not.
     */
    const written = page.waitForResponse(
      (response) =>
        response.request().method() === "POST" && response.status() < 400,
    );
    /*
     * `.click()`, not `.check()`. `check()` verifies its work by RE-RESOLVING
     * the same locator, and completing the Task is exactly what invalidates it:
     * Today files the completed row under the plan's `Completed · n`
     * disclosure, which renders closed, so the row leaves the day panel this
     * locator is scoped to and `check()` retries against nothing until the test
     * times out. The click still happens; only the verification moves — and it
     * moves somewhere better, to the record's own state below.
     */
    await toggle.click();
    await written;

    /*
     * It PERSISTED, which is the whole claim — the row's checkbox IS the shared
     * `/tasks/:id` action the palette command and the Drawer post, not a local
     * paint.
     *
     * Read back from the RECORD, on a fresh navigation. What a completed row
     * does next on Today is that screen's own presentation decision, and which
     * collection view lists it is that collection's — neither is this test's
     * subject, and pinning either made it fail on a difference between a local
     * run and a CI shard while the completion itself was perfectly correct. The
     * record's own control is the one place the answer is unconditional.
     */
    await gotoFixture(page, "/today?drawer=task%3At-complete");
    /*
     * The record states the finished STATE in words and offers only the act that
     * would undo it. CONTROL-01 §4 replaced the summary's completion checkbox
     * with the record header's action — two named commands rather than one
     * toggle — so the state and the control are two assertions rather than one
     * checked box, and both are made.
     */
    const record = page.getByRole("dialog");
    await expect(record.getByText("Completed").first()).toBeVisible();
    await expect(
      record.getByRole("button", { name: "Reopen task" }),
    ).toBeVisible();
  });

  test("closes on Escape and restores focus to the trigger", async ({
    page,
  }) => {
    await page.goto("/today");
    await openPalette(page);
    await page.keyboard.press("Escape");
    await expect(palette(page)).toHaveCount(0);
    await expect(commandTrigger(page)).toBeFocused();
  });

  test("is mutually exclusive with Search", async ({ page }) => {
    await gotoFixture(page, "/today");
    await page.keyboard.press("/");
    await expect(
      page.getByRole("combobox", { name: "Search everything" }),
    ).toBeVisible();
    // Opening the palette closes Search.
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette(page)).toBeVisible();
    await expect(
      page.getByRole("combobox", { name: "Search everything" }),
    ).toHaveCount(0);
  });

  test("opens over an existing Drawer and keeps it behind", async ({
    page,
  }) => {
    // Open a Drawer over Today by its URL rather than by clicking a task named in
    // the seed: POLISH-02 previews Today's discretionary bands, so an unscheduled
    // seed task is no longer guaranteed to be on the page. What this test is
    // about is the palette layering over an already-open Drawer, and the deep
    // link is the more direct way to get one open.
    await gotoFixture(page, "/today?drawer=task%3At-drawer");
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(palette(page)).toBeVisible();
    await page.keyboard.press("Escape");
    // Escape closes only the palette; the Drawer remains.
    await expect(palette(page)).toHaveCount(0);
    await expect(page.getByRole("dialog")).toBeVisible();
  });
});

test.describe("DS-09 Command Palette — mobile 320px", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  test("opens from the mobile navigation without horizontal overflow", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await mobileNavigationOpener(page).click();
    await page
      .getByRole("dialog", { name: "Navigation" })
      .getByRole("button", { name: "Command palette", exact: true })
      .click();
    const input = palette(page);
    await expect(input).toBeVisible();
    await input.fill("today");
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect.poll(() => hasNoHorizontalOverflow(page)).toBe(true);
  });
});

test.describe("DS-09 Command Palette — dark theme", () => {
  test.use({ colorScheme: "dark" });

  test("renders in dark theme", async ({ page }) => {
    await page.goto("/today");
    const input = await openPalette(page);
    await input.fill("today");
    await expect(page.getByRole("listbox")).toBeVisible();
  });
});

test.describe("DS-09 Command Palette — reduced motion", () => {
  test.use({ contextOptions: { reducedMotion: "reduce" } });

  test("opens and closes without depending on animation", async ({ page }) => {
    await page.goto("/today");
    const input = await openPalette(page);
    await input.fill("today");
    await expect(page.getByRole("listbox")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(palette(page)).toHaveCount(0);
  });
});

test.describe("DS-09 Command Palette — execution & failure states (design fixture)", () => {
  async function openFixturePalette(page: Page) {
    await gotoFixture(page, "/design/command-palette");
    await page.getByRole("button", { name: "Open Command Palette" }).click();
    const input = palette(page);
    await expect(input).toBeVisible();
    return input;
  }

  test("runs an executable command and shows inline success", async ({
    page,
  }) => {
    const input = await openFixturePalette(page);
    await input.fill("reindex");
    await expect(option(page, /Reindex the workspace/)).toBeVisible();
    await input.press("Enter");
    // The message shows in both the visible banner and the polite status region.
    await expect(page.getByText(/Reindex complete/i).first()).toBeVisible();
  });

  test("shows a failure with a Retry that re-invokes", async ({ page }) => {
    await gotoFixture(page, "/design/command-palette");
    await page.getByRole("button", { name: "Failure", exact: true }).click();
    await page.getByRole("button", { name: "Open Command Palette" }).click();
    const input = palette(page);
    await input.fill("reindex");
    await expect(option(page, /Reindex the workspace/)).toBeVisible();
    await input.press("Enter");
    await expect(page.getByText(/didn.t complete/i).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  test("blocks a duplicate activation while pending", async ({ page }) => {
    await gotoFixture(page, "/design/command-palette");
    await page.getByRole("button", { name: "Pending (hang)" }).click();
    await page.getByRole("button", { name: "Open Command Palette" }).click();
    const input = palette(page);
    await input.fill("reindex");
    await expect(option(page, /Reindex the workspace/)).toBeVisible();
    await input.press("Enter");
    await expect(page.getByText("Running…")).toBeVisible();
    await input.press("Enter");
    await expect(page.getByText("Running…")).toBeVisible();
  });

  test("keeps commands usable when record search fails partially", async ({
    page,
  }) => {
    await gotoFixture(page, "/design/command-palette");
    await page.getByRole("button", { name: "Partial failure" }).click();
    await page.getByRole("button", { name: "Open Command Palette" }).click();
    const input = palette(page);
    await input.fill("Finish");
    await expect(page.getByText(/didn.t respond/i)).toBeVisible();
    await expect(
      page.getByRole("option", { name: /Finish the Acme/ }),
    ).toBeVisible();
  });

  test("shows a disabled contextual action but never lets it run", async ({
    page,
  }) => {
    const input = await openFixturePalette(page);
    await input.fill("archive");
    // The disabled action is visible, marked unavailable, and non-interactive.
    const disabled = page.getByRole("option", {
      name: /Archive the current record/,
    });
    await expect(disabled).toBeVisible();
    await expect(disabled).toHaveAttribute("aria-disabled", "true");
    await expect(disabled.getByText("Unavailable")).toBeVisible();
    await expect(disabled.getByRole("button")).toHaveCount(0);
    await expect(disabled.getByRole("link")).toHaveCount(0);

    // A normal pointer click is refused by actionability (aria-disabled reads as
    // not-enabled); force the click anyway to prove the handler still never runs.
    await disabled.click({ force: true });
    // Enter is routed to the active option, which skip-disabled never lands here.
    await input.press("Enter");
    // No execution feedback (success or otherwise) ever appears.
    await expect(page.getByText("This should never run.")).toHaveCount(0);
    await expect(page.getByText(/Disabled action ran/)).toHaveCount(0);
    await expect(page.getByText("Running…")).toHaveCount(0);

    // An enabled contextual action in the same palette still works.
    await input.fill("tidy");
    await expect(option(page, /Tidy the current view/)).toBeVisible();
    await input.press("Enter");
    await expect(
      page.getByText(/Tidied \(in memory only\)/i).first(),
    ).toBeVisible();
  });

  test("shows the Card and Record Header adapter proof", async ({ page }) => {
    await gotoFixture(page, "/design/command-palette");
    const proof = page.getByRole("region", {
      name: "Quick Action adapter proof",
    });
    // UIQ-002 — a card's action rail reveals on hover on a fine pointer and is
    // pointer-inert while concealed; pointing at the card precedes the click.
    await proof.locator(".dh-card").first().hover();
    await proof.getByRole("button", { name: "Star" }).first().click();
    await expect(proof.getByText(/Starred/)).toBeVisible();
  });
});

test.describe("DS-09 Command Palette — touch targets (mobile 44px)", () => {
  test.use({ viewport: { width: 320, height: 720 } });

  /** Assert a control's real rendered bounding box meets the 44×44px minimum. */
  async function expectMin44(locator: ReturnType<Page["getByRole"]>) {
    await expect(locator).toBeVisible();
    const box = await locator.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) {
      return;
    }
    // WCAG 2.2 target size (`--dh-touch-target-min` = 2.75rem = 44px). Allow a
    // half-pixel tolerance for sub-pixel rounding (a 44px box can measure 43.999…).
    expect(box.width).toBeGreaterThanOrEqual(43.5);
    expect(box.height).toBeGreaterThanOrEqual(43.5);
  }

  test("the close control has a 44×44px touch target", async ({ page }) => {
    await gotoFixture(page, "/today");
    await mobileNavigationOpener(page).click();
    await page
      .getByRole("dialog", { name: "Navigation" })
      .getByRole("button", { name: "Command palette", exact: true })
      .click();
    await expect(palette(page)).toBeVisible();
    await expectMin44(
      page.getByRole("button", { name: "Close command palette" }),
    );
  });

  test("the Retry control has a 44×44px touch target", async ({ page }) => {
    await gotoFixture(page, "/design/command-palette");
    await page.getByRole("button", { name: "Failure", exact: true }).click();
    await page.getByRole("button", { name: "Open Command Palette" }).click();
    const input = palette(page);
    await input.fill("reindex");
    await expect(option(page, /Reindex the workspace/)).toBeVisible();
    await input.press("Enter");
    await expectMin44(page.getByRole("button", { name: "Retry" }));
  });
});

/**
 * V2.0.1 — the four modules that previously contributed NO palette commands
 * (Projects, Areas, Goals, Diary) now register navigation commands through the
 * same registry contract every other module uses. Each command must appear in
 * the palette and land on a surface that really exists — the create commands
 * open the DS-03 create Drawer (the create ROUTES are action-only and render
 * nothing), and Goals contributes no create command at all because a Goal is
 * created from an Area record.
 */
test.describe("V2.0.1 — Projects, Areas, Goals and Diary palette commands", () => {
  async function runCommand(
    page: Page,
    query: string,
    name: RegExp,
    urlPattern: RegExp,
  ) {
    // A settle, NOT `waitForInteractive`. This helper runs REPEATEDLY within one
    // journey, and every call after the first begins on whichever module the last
    // command navigated to — Projects, Areas, Goals, Diary — none of which publish
    // `[data-hydrated]`. Waiting for that marker here hits the document-swap race
    // the helper's own comment describes: the count sees the marker on the document
    // being navigated away from, and the assertion then finds nothing on the one we
    // landed on. Observed in CI on 2026-08-02.
    //
    // The shortcut below is still safe: by this point the journey has already
    // interacted with the page through the palette, so the dispatcher is attached.
    // The gate that matters is on the initial navigation, which uses `gotoFixture`.
    await page.waitForLoadState("networkidle");
    await page.keyboard.press("ControlOrMeta+k");
    const input = palette(page);
    await expect(input).toBeVisible();
    await input.fill(query);
    await option(page, name).first().click();
    await expect(page).toHaveURL(urlPattern);
    await expect(palette(page)).toHaveCount(0);
  }

  test("opens each module collection from the palette", async ({ page }) => {
    await gotoFixture(page, "/today");
    await runCommand(page, "Open Projects", /Open Projects/, /\/projects$/);
    await runCommand(page, "Open Areas", /Open Areas/, /\/areas$/);
    await runCommand(page, "Open Goals", /Open Goals/, /\/goals$/);
    // Exact-title ranking puts "Open Diary" above "Open Diary for today", so
    // the first option for this query is the collection command.
    await runCommand(page, "Open Diary", /Open Diary/, /\/diary$/);
  });

  test("opens the real create Drawer for a Project and an Area", async ({
    page,
  }) => {
    await page.goto("/today");
    // The command must open the actual create form, not merely change the URL —
    // this is what makes it a real action rather than a link to a blank
    // action-only route.
    await runCommand(
      page,
      "New Project",
      /New Project/,
      /\/projects\?drawer=new-project$/,
    );
    await expect(page.getByRole("form", { name: "New Project" })).toBeVisible();
    await runCommand(page, "New Area", /New Area/, /\/areas\?drawer=new-area$/);
    await expect(page.getByRole("form", { name: "New Area" })).toBeVisible();
  });

  test("contributes NO create-Goal command, because there is no such surface", async ({
    page,
  }) => {
    // A Goal is created from an Area record (the only host of `NewGoalForm`).
    // A workspace-level "New Goal" command would promise something the product
    // cannot do, so the palette must not offer one.
    await gotoFixture(page, "/today");
    await page.keyboard.press("ControlOrMeta+k");
    const input = palette(page);
    await expect(input).toBeVisible();

    // The Goals command that DOES exist is offered…
    await input.fill("Goals");
    await expect(option(page, /Open Goals/).first()).toBeVisible();

    // …and no create-Goal command is, under any of the words that would find one.
    for (const query of ["New Goal", "Create Goal"]) {
      await input.fill(query);
      await expect(option(page, /^New Goal/)).toHaveCount(0);
      await expect(option(page, /^Create Goal/)).toHaveCount(0);
    }
  });

  test("opens the Diary for today and the Diary capture panel", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await runCommand(
      page,
      "Diary for today",
      /Open Diary for today/,
      /\/diary\?mode=day$/,
    );
    await runCommand(
      page,
      "Capture Diary",
      /Capture Diary entry/,
      /\/diary\?inspector=new$/,
    );
    // The deep link must actually open the capture surface, not just change the URL.
    await expect(
      page.getByRole("form", { name: "Quick capture" }),
    ).toBeVisible();
  });
});
