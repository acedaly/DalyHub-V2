import { expect, test } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { gotoFixture } from "./helpers";

/**
 * TASKS-09 / ADR-086 — the `/tasks` latency contract, end to end.
 *
 * The decision these journeys hold is a SPLIT, and each half fails differently:
 *
 *   - **presentation may lead the server.** A completion has to be visible before the
 *     write lands, or the checkbox is not a checkbox — so §1 holds the POST open and
 *     asserts the row is already struck through while the request is still in flight;
 *   - **an announcement may not lead the server.** §2 forces a refusal and asserts the
 *     opposite behaviour from the same click: the row goes back exactly as it was, the
 *     live region reports the server's reason, and nothing anywhere claims success.
 *
 * §3 is the affordance the confirmation and the reversal share — one Undo, on the
 * notification that says the thing happened. §4 is the rule the predicate must never
 * get wrong in the cheap direction: a completion the current filter excludes still
 * leaves the view.
 */

const RUN = Date.now();

/**
 * `system=all` with a `created` sort is the flattest configuration the workspace has:
 * nothing on screen reads completion, so it is exactly where the predicate is
 * ENTITLED to skip the re-read — and therefore where an optimistic row has to carry
 * the whole of the feedback on its own.
 */
const FLAT_LIST = "/tasks?view=list&system=all&sort=created&dir=desc";

/** The default execution scope, which EXCLUDES completed work. */
const ACTIVE_LIST = "/tasks?view=list&system=active&sort=created&dir=desc";

/** Every canonical single-task record mutation. Never the loader, never `/tasks/new`. */
const TASK_RECORD_POST = "**/tasks/*";

async function quickAdd(page: Page, text: string) {
  const field = page.getByTestId("tasks-quickadd-input");
  await field.fill(text);
  await field.press("Enter");
  await expect(field).toHaveValue("");
}

function cardFor(page: Page, title: string): Locator {
  return page.getByRole("article", { name: `Open ${title}` });
}

/** Press the row's Complete button the way a person does — the rail reveals on hover. */
async function completeFromRow(page: Page, title: string) {
  const card = cardFor(page, title);
  await card.hover();
  await card.getByRole("checkbox", { name: `Complete ${title}` }).check();
}

test.describe("TASKS-09 — an optimistic list, reconciled", () => {
  test.describe.configure({ timeout: 120_000 });

  test("strikes the row through before the write lands, and Undo puts it back", async ({
    page,
  }) => {
    const title = `E2E optimistic complete ${RUN}`;
    await gotoFixture(page, FLAT_LIST);
    await quickAdd(page, title);
    await expect(cardFor(page, title)).toBeVisible();

    // Hold the FIRST canonical completion POST open. Everything asserted before the
    // release therefore happened with the server having answered nothing at all;
    // every later POST (the Undo) passes straight through.
    let release = () => {};
    let hold: Promise<void> | null = new Promise<void>((resolve) => {
      release = resolve;
    });
    await page.route(TASK_RECORD_POST, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      const waitFor = hold;
      hold = null;
      if (waitFor) await waitFor;
      await route.continue();
    });

    await completeFromRow(page, title);

    // The row leads: struck through, and its action already offers the way back.
    await expect(cardFor(page, title)).toHaveAttribute(
      "data-completed",
      "true",
    );
    await expect(
      cardFor(page, title).getByRole("checkbox", { name: `Reopen ${title}` }),
    ).toBeAttached();
    // …and NOTHING has claimed success yet, because nothing has succeeded yet.
    await expect(
      page.locator("[role='status']").filter({ hasText: /^Completed / }),
    ).toHaveCount(0);

    release();

    // Now the server has answered, and only now is the outcome announced.
    await expect(
      page
        .locator("[role='status']")
        .filter({ hasText: `Completed ${title}.` }),
    ).toBeAttached();
    await expect(
      page
        .locator('.dh-feedback-live[aria-live="polite"]')
        .filter({ hasText: `Completed ${title}.` }),
    ).toHaveCount(0);

    // The confirmation IS the way back: one affordance, not two.
    const toast = page.getByRole("group", { name: `Completed ${title}.` });
    await expect(toast).toBeVisible();
    await toast.getByRole("button", { name: "Undo" }).click();

    await expect(cardFor(page, title)).not.toHaveAttribute(
      "data-completed",
      "true",
    );
    await expect(
      page.locator("[role='status']").filter({ hasText: `Reopened ${title}.` }),
    ).toBeAttached();
  });

  test("puts a refused completion back exactly as it was, and says why", async ({
    page,
  }) => {
    const title = `E2E refused complete ${RUN}`;
    await gotoFixture(page, FLAT_LIST);
    await quickAdd(page, title);
    await expect(cardFor(page, title)).toBeVisible();

    const reason = "That task could not be completed right now.";
    await page.route(TASK_RECORD_POST, async (route) => {
      if (route.request().method() !== "POST") {
        await route.continue();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          kind: "completion",
          ok: false,
          message: reason,
        }),
      });
    });

    await completeFromRow(page, title);

    // The refusal reverts the guess — the row is open, and its action says Complete.
    await expect(cardFor(page, title)).not.toHaveAttribute(
      "data-completed",
      "true",
    );
    await expect(
      cardFor(page, title).getByRole("checkbox", { name: `Complete ${title}` }),
    ).toBeAttached();

    // The reason is both announced and visible, in the server's own words.
    await expect(
      page.locator("[role='status']").filter({ hasText: reason }),
    ).toBeAttached();
    await expect(page.getByRole("group", { name: reason })).toBeVisible();
    // And nothing claimed it worked.
    await expect(
      page.locator("[role='status']").filter({ hasText: /^Completed / }),
    ).toHaveCount(0);
  });

  test("a completion the view excludes still leaves the view", async ({
    page,
  }) => {
    const title = `E2E completion leaves view ${RUN}`;
    await gotoFixture(page, ACTIVE_LIST);
    await quickAdd(page, title);
    await expect(cardFor(page, title)).toBeVisible();

    await completeFromRow(page, title);

    // The predicate must return true here: `active` excludes completed work, so the
    // optimistic row is reconciled away by a real re-read rather than lingering.
    await expect(cardFor(page, title)).toHaveCount(0);
    await expect(
      page
        .locator("[role='status']")
        .filter({ hasText: `Completed ${title}.` }),
    ).toBeAttached();
  });

  test("keeps loaded pages when a mutation re-reads the list", async ({
    page,
  }) => {
    await gotoFixture(page, ACTIVE_LIST);
    const loadMore = page.getByRole("button", { name: "Load more tasks" });
    // The seeded workspace may hold a single page; the accumulation rule is unit
    // tested either way, and this case asserts it in the product when there is more
    // than one page to accumulate.
    test.skip(
      (await loadMore.count()) === 0,
      "the seeded workspace holds a single page of active tasks",
    );

    const before = await page.getByRole("article").count();
    await loadMore.click();
    await expect
      .poll(async () => page.getByRole("article").count())
      .toBeGreaterThan(before);
    const accumulated = await page.getByRole("article").count();

    // A completion on this view revalidates (it excludes completed work). The
    // accumulated pages must survive that re-read rather than collapsing to page one.
    const title = `E2E pagination survives ${RUN}`;
    await quickAdd(page, title);
    await completeFromRow(page, title);
    await expect(cardFor(page, title)).toHaveCount(0);

    // The captured-then-completed row is the only one that legitimately left.
    await expect
      .poll(async () => page.getByRole("article").count())
      .toBeGreaterThanOrEqual(accumulated - 1);
    expect(await page.getByRole("article").count()).toBeGreaterThan(before);
  });
});
