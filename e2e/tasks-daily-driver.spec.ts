import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
} from "./helpers";

/**
 * TASKS-04 — the daily-driver Tasks workflows, driven end to end against the
 * development-auth server over real (seeded) D1.
 *
 * What it proves, in the product rather than in a unit:
 *   - Inbox means ACTIVE, UNASSIGNED tasks — a fully-planned task with no parent is
 *     in Inbox, and an assigned task with no sector is not;
 *   - capture defaults to Inbox, and a task can be filed, moved and returned to
 *     Inbox from the ordinary list through the canonical mutation;
 *   - inline renaming works AND leaves the record reachable (the regression that
 *     replacing the card's open control would cause);
 *   - the restrained parser applies a date and a repeat rather than merely
 *     previewing them, and completing a repeating task creates exactly ONE next
 *     occurrence, with a safe undo;
 *   - Review Inbox triages one task at a time, by keyboard, and empties;
 *   - the whole thing holds the 320px and accessibility baselines.
 *
 * Every task it creates is uniquely stamped, so it never disturbs another journey.
 */

const RUN = Date.now();

/** The `/tasks` list, most-recent first, so a just-created task is at the top. */
const LIST = "/tasks?view=list&system=all&sort=created&dir=desc";
const INBOX = "/tasks?view=list&system=inbox&sort=created&dir=desc";

/** Capture a task through the in-workspace quick-add row. */
async function quickAdd(page: Page, text: string) {
  const field = page.getByTestId("tasks-quickadd-input");
  await field.fill(text);
  await field.press("Enter");
  await expect(field).toHaveValue("");
}

/** The card for a task title, by its stable open-control accessible name. */
function cardFor(page: Page, title: string) {
  return page.getByRole("article", { name: `Open ${title}` });
}

/** Open a card's overflow menu and choose one item. */
async function chooseOverflow(
  page: Page,
  title: string,
  item: string | RegExp,
) {
  await cardFor(page, title)
    .getByRole("button", { name: new RegExp(`^More actions for `) })
    .click();
  await page.getByRole("menuitem", { name: item }).click();
}

test.describe("TASKS-04 — Inbox is active, unassigned work", () => {
  test("captures to Inbox by default and keeps the record openable", async ({
    page,
  }) => {
    const title = `E2E inbox capture ${RUN}`;
    await gotoFixture(page, LIST);
    await quickAdd(page, title);

    // The row reports the honest parent value for an Inbox task.
    const card = cardFor(page, title);
    await expect(card).toBeVisible();
    await expect(card).toContainText("Unassigned");

    // It is in the built-in Inbox view, which is about PARENTAGE, not sectors.
    await gotoFixture(page, INBOX);
    await expect(cardFor(page, title)).toBeVisible();

    // The card's title is still the way into the record.
    await cardFor(page, title)
      .getByRole("link", { name: `Open ${title}` })
      .click();
    await expect(page).toHaveURL(/drawer=task%3A/);
    const drawer = page.getByRole("dialog", { name: "Task" });
    await expect(drawer).toBeVisible();
    await expect(drawer).toContainText("Unassigned");

    // Back closes the record and returns to the list — never a dead end.
    await page.goBack();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(cardFor(page, title)).toBeVisible();
  });

  test("a scheduled, prioritised task with no parent is STILL in Inbox", async ({
    page,
  }) => {
    const title = `E2E planned inbox ${RUN}`;
    await gotoFixture(page, LIST);
    // The parser applies the priority and the trailing date; neither files the task.
    await quickAdd(page, `${title} p1 tomorrow`);

    await gotoFixture(page, INBOX);
    await expect(cardFor(page, title)).toBeVisible();
  });

  test("renames inline without losing the way into the record", async ({
    page,
  }) => {
    const title = `E2E rename ${RUN}`;
    const renamed = `${title} renamed`;
    await gotoFixture(page, LIST);
    await quickAdd(page, title);

    await chooseOverflow(page, title, "Rename");
    const editor = page.getByRole("textbox", { name: `Rename ${title}` });
    await expect(editor).toBeFocused();
    await editor.fill(renamed);
    await editor.press("Enter");

    // The row reflects the SERVER, and the open control came back with it.
    await expect(cardFor(page, renamed)).toBeVisible();
    await expect(
      cardFor(page, renamed).getByRole("link", { name: `Open ${renamed}` }),
    ).toBeVisible();

    // Escape abandons an edit without saving and restores the open control.
    await chooseOverflow(page, renamed, "Rename");
    const second = page.getByRole("textbox", { name: `Rename ${renamed}` });
    await second.fill("Discarded text");
    await second.press("Escape");
    await expect(cardFor(page, renamed)).toBeVisible();
  });

  test("files a task under a Project, then moves it back to Inbox", async ({
    page,
  }) => {
    const title = `E2E parent move ${RUN}`;
    await gotoFixture(page, LIST);
    await quickAdd(page, title);

    await chooseOverflow(page, title, "Move to Project or Area…");
    const drawer = page.getByRole("dialog", { name: "Move task" });
    await expect(drawer).toBeVisible();

    const picker = drawer.getByRole("combobox", { name: /Project or Area/ });
    await picker.click();
    await picker.fill("Spanish");
    const option = drawer.getByRole("option").first();
    await expect(option).toBeVisible();
    await option.click();
    await expect(
      page.locator("[role='status']").filter({ hasText: /filed under/i }),
    ).toBeAttached();

    await page.keyboard.press("Escape");
    await gotoFixture(page, LIST);
    // The row's context line now names the destination the picker offered.
    await expect(cardFor(page, title)).not.toContainText("Unassigned");

    // It has LEFT Inbox, because Inbox means unassigned.
    await gotoFixture(page, INBOX);
    await expect(cardFor(page, title)).toHaveCount(0);

    // And "Move to Inbox" returns it, through the same canonical mutation.
    await gotoFixture(page, LIST);
    await chooseOverflow(page, title, "Move to Inbox");
    await expect(
      page.locator("[role='status']").filter({ hasText: "moved to Inbox" }),
    ).toBeAttached();
    await gotoFixture(page, INBOX);
    await expect(cardFor(page, title)).toBeVisible();
  });

  test("finds an unassigned task in global Search", async ({ page }) => {
    const title = `E2E searchable inbox ${RUN}`;
    await gotoFixture(page, LIST);
    await quickAdd(page, title);

    await page.waitForLoadState("networkidle");
    await page
      .getByRole("button", { name: "Search", exact: true })
      .first()
      .click();
    const input = page.getByRole("combobox", { name: "Search everything" });
    await expect(input).toBeVisible();
    await input.fill(title);
    await expect(page.getByText(title).first()).toBeVisible({
      timeout: 15_000,
    });
  });
});

test.describe("TASKS-04 — persisted recurrence", () => {
  test("applies a captured repeat, then creates exactly one successor on completion", async ({
    page,
  }) => {
    const title = `E2E repeat ${RUN}`;
    await gotoFixture(page, LIST);
    // The parser recognises BOTH the trailing date and the repeat, and the capture
    // APPLIES them — parsing without applying would be a promise the product breaks.
    await quickAdd(page, `${title} tomorrow every week`);

    const card = cardFor(page, title);
    await expect(card).toBeVisible();

    // The record reports the stored rule in the product's own vocabulary.
    await card.getByRole("link", { name: `Open ${title}` }).click();
    const drawer = page.getByRole("dialog", { name: "Task" });
    await expect(drawer).toContainText("Every week");
    await page.keyboard.press("Escape");

    // Completing the occurrence creates exactly ONE successor, and says so.
    await cardFor(page, title)
      .getByRole("button", { name: `Complete ${title}` })
      .click();
    await expect(
      page.locator("[role='status']").filter({ hasText: /next occurrence/i }),
    ).toBeAttached();

    await gotoFixture(page, LIST);
    const open = page
      .getByRole("article", { name: `Open ${title}` })
      .filter({ hasNotText: "Completed" });
    await expect(open).toHaveCount(1);
    await expect(open.first()).toContainText("Planned");
  });

  test("undo of a completion withdraws the untouched successor", async ({
    page,
  }) => {
    const title = `E2E repeat undo ${RUN}`;
    await gotoFixture(page, LIST);
    await quickAdd(page, `${title} tomorrow every day`);

    await cardFor(page, title)
      .getByRole("button", { name: `Complete ${title}` })
      .click();
    await expect(
      page.locator("[role='status']").filter({ hasText: /next occurrence/i }),
    ).toBeAttached();

    await gotoFixture(page, "/tasks?view=list&system=completed&sort=updated");
    await cardFor(page, title)
      .first()
      .getByRole("button", { name: `Reopen ${title}` })
      .click();
    await expect(
      page.locator("[role='status']").filter({ hasText: /withdrawn/i }),
    ).toBeAttached();

    // Exactly one open occurrence remains: the reopened original.
    await gotoFixture(page, LIST);
    await expect(
      page
        .getByRole("article", { name: `Open ${title}` })
        .filter({ hasNotText: "Completed" }),
    ).toHaveCount(1);
  });

  test("sets and removes a repeat from the row's quick edit", async ({
    page,
  }) => {
    const title = `E2E repeat control ${RUN}`;
    await gotoFixture(page, LIST);
    await quickAdd(page, `${title} tomorrow`);

    await chooseOverflow(page, title, "Dates, sector and repeat…");
    const drawer = page.getByRole("dialog", { name: "Quick edit" });
    await expect(drawer).toBeVisible();

    const repeat = drawer.getByRole("combobox", { name: /Repeat/ });
    await expect(repeat).toBeVisible();
    await repeat.click();
    await repeat.fill("Every month");
    const monthly = drawer.getByRole("option", { name: "Every month" });
    await expect(monthly).toBeVisible();
    await monthly.click();
    await expect(
      page.locator("[role='status']").filter({ hasText: /repeats/i }),
    ).toBeAttached();

    await page.keyboard.press("Escape");
    await gotoFixture(page, LIST);
    await cardFor(page, title)
      .getByRole("link", { name: `Open ${title}` })
      .click();
    await expect(page.getByRole("dialog", { name: "Task" })).toContainText(
      "Every month",
    );
  });
});

test.describe("TASKS-04 — Review Inbox", () => {
  test("triages one task at a time and reports progress", async ({ page }) => {
    // Guarantee the queue is non-empty without depending on WHERE in it this task
    // lands: the Inbox is a real, shared collection and its size is not this spec's
    // business.
    await gotoFixture(page, LIST);
    await quickAdd(page, `E2E review ${RUN}`);

    await gotoFixture(page, "/tasks");
    await page.getByRole("link", { name: "Review Inbox" }).click();
    await expect(page).toHaveURL(/\/tasks\/review$/);
    await expect(
      page.getByRole("heading", { level: 1, name: "Review Inbox" }),
    ).toBeVisible();

    // Progress through the CURRENT Inbox set is always visible.
    const progress = page.getByRole("heading", { name: /Reviewing task/ });
    await expect(progress).toBeVisible();
    const before = ((await progress.textContent()) ?? "").trim();
    expect(before).toMatch(/Reviewing task 1 of \d+/);

    // The task under review is whichever the SERVER put first.
    const panel = page.getByTestId("task-quick-edit");
    const reviewed = (
      (await panel.getByRole("heading").first().textContent()) ?? ""
    ).trim();
    expect(reviewed.length).toBeGreaterThan(0);

    // Filing it takes it out of the queue, because the queue IS the Inbox query —
    // never a client-side guess about whether it still belongs there.
    const picker = panel.getByRole("combobox", { name: /Project or Area/ });
    await picker.click();
    await picker.fill("Spanish");
    await expect(panel.getByRole("option").first()).toBeVisible();
    await panel.getByRole("option").first().click();
    await expect(
      page.locator("[role='status']").filter({ hasText: /filed under/i }),
    ).toBeAttached();

    await expect(
      page.getByTestId("task-quick-edit").getByRole("heading", {
        name: reviewed,
        exact: true,
      }),
    ).toHaveCount(0, { timeout: 15_000 });
    // Triage continues on the next task — the queue refills from the SERVER's Inbox
    // page rather than stalling on a hole where the filed task was. (The total need
    // not shrink: the page is a bounded window over a larger Inbox.)
    await expect(progress).toBeVisible();
    await expect(
      page.getByTestId("task-quick-edit").getByRole("heading").first(),
    ).toBeVisible();
  });

  test("is keyboard operable and holds the 320px baseline", async ({
    page,
  }) => {
    await gotoFixture(page, LIST);
    await quickAdd(page, `E2E review keyboard ${RUN}`);

    await gotoFixture(page, "/tasks/review");
    await expect(
      page.getByRole("heading", { name: /Reviewing task/ }),
    ).toBeVisible();
    const first = (
      (await page
        .getByRole("heading", { name: /Reviewing task/ })
        .textContent()) ?? ""
    ).trim();

    // `j` walks the queue without touching the mouse.
    await page.keyboard.press("j");
    await expect(
      page.getByRole("heading", { name: /Reviewing task/ }),
    ).not.toHaveText(first);
    await page.keyboard.press("k");
    await expect(
      page.getByRole("heading", { name: /Reviewing task/ }),
    ).toHaveText(first);

    await page.setViewportSize({ width: 320, height: 720 });
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});
