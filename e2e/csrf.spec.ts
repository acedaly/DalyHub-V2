/**
 * AUDIT-FIX-04 — cross-origin mutations, proven with a real browser.
 *
 * The unit and kernel suites construct the provenance headers themselves. This
 * one refuses to: `Origin` and `Sec-Fetch-Site` are FORBIDDEN header names, so a
 * test that sets them by hand is only asserting that the policy agrees with the
 * test's own idea of what a browser sends. Here the browser sends them, from a
 * page it genuinely loaded from somewhere that is not DalyHub.
 *
 * The second origin is `http://127.0.0.1:4173` — the SAME dev server DalyHub is
 * running on, reached by its other name. To a browser that is a genuinely
 * different origin (its own cookie jar, its own storage, `Sec-Fetch-Site:
 * cross-site` between the two), which makes it a real attacker origin without a
 * second server or any new harness. The attacker page is served by intercepting
 * one path on that origin, so nothing is added to the application itself.
 *
 * Development auth is active, so the request the attacker page sends IS
 * authenticated by the time it reaches the boundary — which is exactly the
 * point. The only thing between it and the owner's data is the provenance check.
 */

import { expect, test, type Page } from "@playwright/test";

import { DEV_ORIGIN, SECOND_ORIGIN } from "./dev-server";
import { expectOnToday, postSameOrigin } from "./helpers";

/** The seeded task the attack aims at. Reversible, and restored afterwards. */
const TARGET_TASK = "t-complete";
const TASK_URL = `${DEV_ORIGIN}/tasks/${TARGET_TASK}`;

/** A path on the second origin that only this test serves. */
const ATTACK_PATH = "/attacker-page";

/** A minimal hostile page: one cross-origin form, submitted on demand. */
function attackPage(action: string, fields: Record<string, string>): string {
  const inputs = Object.entries(fields)
    .map(([name, value]) => `<input name="${name}" value="${value}">`)
    .join("");
  return `<!doctype html><html><head><title>Not DalyHub</title></head><body>
    <h1>Not DalyHub</h1>
    <form id="attack" method="POST" action="${action}">${inputs}</form>
  </body></html>`;
}

/** Serve the hostile page from the second origin and land the browser on it. */
async function openAttackPage(
  page: Page,
  action: string,
  fields: Record<string, string>,
): Promise<void> {
  await page.route(`${SECOND_ORIGIN}${ATTACK_PATH}`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: attackPage(action, fields),
    }),
  );
  await page.goto(`${SECOND_ORIGIN}${ATTACK_PATH}`);
  await expect(
    page.getByRole("heading", { name: "Not DalyHub" }),
  ).toBeVisible();
}

/**
 * Submit the hostile form as a real top-level navigation and return DalyHub's
 * answer. The browser — not this test — decides what provenance headers say.
 */
async function submitAttack(page: Page) {
  const [response] = await Promise.all([
    page.waitForResponse(
      (candidate) =>
        candidate.url() === TASK_URL && candidate.request().method() === "POST",
    ),
    page.evaluate(() => {
      (document.getElementById("attack") as HTMLFormElement).submit();
    }),
  ]);
  return response;
}

/** The task's current state, read from its own JSON resource route. */
async function readTask(page: Page): Promise<{ completedAt: string | null }> {
  const response = await page.request.get(TASK_URL);
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as {
    task: { completedAt: string | null };
  };
  return body.task;
}

/** How many Activity entries the task carries right now. */
async function countActivity(page: Page): Promise<number> {
  const response = await page.request.get(`${TASK_URL}/activity`);
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { items: unknown[] };
  return body.items.length;
}

test.describe("AUDIT-FIX-04 — a cross-origin mutation is refused", () => {
  // The dev database is shared and only reseeds at server start, so the target
  // is normalised to OPEN around each test — the same robustness pattern the
  // other task journeys use.
  test.beforeEach(async ({ page }) => {
    await postSameOrigin(page.request, `/tasks/${TARGET_TASK}`, {
      form: { intent: "reopen" },
    });
  });

  test.afterEach(async ({ page }) => {
    await postSameOrigin(page.request, `/tasks/${TARGET_TASK}`, {
      form: { intent: "reopen" },
    });
  });

  test("the browser's own headers are refused, and the Task is unchanged", async ({
    page,
  }) => {
    expect((await readTask(page)).completedAt).toBeNull();
    const activityBefore = await countActivity(page);

    await openAttackPage(page, TASK_URL, { intent: "complete" });
    const response = await submitAttack(page);

    // The browser really did label it as coming from somewhere else. `Origin` is
    // a forbidden header name, so no page script put it there — which is what
    // makes it worth trusting.
    const sent = await response.request().allHeaders();
    expect(sent["origin"]).toBe(SECOND_ORIGIN);

    // `Sec-Fetch-Site` is deliberately asserted only CONDITIONALLY, because this
    // run proves why it cannot be the primary signal: over plain-HTTP localhost,
    // Chromium attaches no `Sec-Fetch-*` at all. `Origin` is the header that is
    // reliably present on a real cross-origin mutation, which is exactly why the
    // policy requires it and treats fetch-site as corroboration.
    if (sent["sec-fetch-site"] !== undefined) {
      expect(sent["sec-fetch-site"]).not.toBe("same-origin");
    }

    // DalyHub refused it — generically, with no reflected origin, no CORS
    // surface, and no redirect that would hand the caller another attempt.
    expect(response.status()).toBe(403);
    const body = await response.text();
    expect(body).toBe("Request rejected.");
    expect(body).not.toContain(SECOND_ORIGIN);
    expect(response.headers()["cache-control"]).toBe("private, no-store");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    // NOTE: `Access-Control-Allow-Origin` is deliberately NOT asserted here. The
    // Vite DEV server adds its own CORS header for loopback origins, and it sits
    // in front of the Worker in this harness only — DalyHub's boundary sets no
    // CORS header of any kind. That absence is asserted where it can be proven
    // without a dev server in the way: the request-boundary unit suite and
    // `test/kernel/request-boundary-csrf.test.ts`, which runs the real Worker
    // runtime. It changes nothing here either way: CORS governs what a browser
    // lets script READ, and this request was refused server-side before the
    // route ran.

    // The record is untouched and nothing was recorded: the action never ran.
    expect((await readTask(page)).completedAt).toBeNull();
    expect(await countActivity(page)).toBe(activityBefore);
  });

  test("ordinary same-origin work is completely unaffected", async ({
    page,
  }) => {
    // The other half of the guarantee. A normal browser journey still loads,
    // and a normal same-origin submission still mutates.
    await page.goto(`${DEV_ORIGIN}/today`);
    await expectOnToday(page);

    const completed = await postSameOrigin(
      page.request,
      `/tasks/${TARGET_TASK}`,
      { form: { intent: "complete" } },
    );
    expect(completed.ok()).toBe(true);
    expect((await readTask(page)).completedAt).not.toBeNull();

    // And back again, so the shared dev database is left as it was found.
    await postSameOrigin(page.request, `/tasks/${TARGET_TASK}`, {
      form: { intent: "reopen" },
    });
    expect((await readTask(page)).completedAt).toBeNull();
  });
});
