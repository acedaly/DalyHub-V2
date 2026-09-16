/**
 * MOBILE-03 — capturing during a meeting with no signal, end to end in a real
 * browser.
 *
 * The sibling of `pwa-offline-tasks.spec.ts`, and real in exactly the same way:
 * the network is genuinely taken away (`context.setOffline(true)` plus an
 * abort-everything route, so the service worker's own fetches go too), there is
 * no injected transport double, and the code under test is the real queue, the
 * real replay engine and the real `/meeting/:id/mutate` route. There are no
 * sleeps — every wait is a condition read from IndexedDB, from the D1 row, or
 * from the page's own text.
 *
 * ── The four properties worth an end-to-end test ─────────────────────────────
 * The kernel's unit tests already hold the vocabulary, the conflict rule, the
 * no-coalescing rule and the receipt/CHECK agreement, and re-proving those here
 * would be slow and redundant. What only a browser can show is the WIRING:
 *
 *   1. a capture made with no connection is kept, and is reported as kept —
 *      not as a failure the owner is invited to retype;
 *   2. it is queued as the right operation against the right record;
 *   3. reconnecting sends it to the canonical authority and the item appears;
 *   4. it appears EXACTLY ONCE, and the receipt says so — which is the whole
 *      reason an append was safe to queue in the first place.
 *
 * One journey, driven in order, because they are one story and a failure at step
 * 3 means something different if step 1 passed.
 *
 * ── Tier ─────────────────────────────────────────────────────────────────────
 * PR gate, deliberately. It is a critical daily-driver correctness journey (a
 * regression here silently loses the owner's meeting notes), it is one spec file
 * and one test, and V3-E2E-01's nightly tier is for exhaustive width and
 * appearance MATRICES — which this is not.
 */

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { d1Execute, d1Query, sqlLiteral } from "./d1";
import { waitForInteractive } from "./helpers";
import { cleanupMeetingByTitle, uniqueMeetingTitle } from "./meetings-fixtures";

const PHONE = { width: 390, height: 844 };
const WORKSPACE_ID = "local-dev-workspace";

test.use({ viewport: PHONE, isMobile: true, hasTouch: true });

/** One queued mutation, as it is actually stored on the device. */
interface QueuedMutation {
  readonly entityType: string;
  readonly entityId: string;
  readonly operation: string;
  readonly status: string;
  readonly value: string | null;
}

/** Read the queue straight out of IndexedDB — no product surface in between. */
async function readMutations(page: Page): Promise<QueuedMutation[]> {
  return page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("dalyhub-offline");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!database.objectStoreNames.contains("mutations")) {
      database.close();
      return [];
    }
    const rows = await new Promise<unknown[]>((resolve, reject) => {
      const request = database
        .transaction("mutations", "readonly")
        .objectStore("mutations")
        .getAll();
      request.onsuccess = () => resolve(request.result as unknown[]);
      request.onerror = () => reject(request.error);
    });
    database.close();
    return rows as QueuedMutation[];
  });
}

/**
 * Wait until the device holds a server-produced snapshot.
 *
 * Nothing can be queued before one exists — the PWA-05 namespace rule, enforced
 * by the data model rather than by a flag, so a device with no prior
 * authenticated session has nowhere to put an offline change. Waiting for it is
 * not test scaffolding; it is the precondition the product actually has, and a
 * journey that skipped it would be testing the refusal rather than the feature.
 */
async function waitForSnapshot(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const database = await new Promise<IDBDatabase>((resolve, reject) => {
            const request = indexedDB.open("dalyhub-offline");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          });
          if (!database.objectStoreNames.contains("meta")) {
            database.close();
            return 0;
          }
          const rows = await new Promise<unknown[]>((resolve, reject) => {
            const request = database
              .transaction("meta", "readonly")
              .objectStore("meta")
              .getAll();
            request.onsuccess = () => resolve(request.result as unknown[]);
            request.onerror = () => reject(request.error);
          });
          database.close();
          return rows.length;
        }),
      { timeout: 30_000 },
    )
    .toBeGreaterThan(0);
}

/**
 * Take the network away from EVERYTHING, including the service worker's own
 * fetches. `setOffline` alone applies to the page's network context, and a fetch
 * issued from inside the worker can still reach the server — which would quietly
 * turn an offline assertion into a test of the online path.
 */
async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
  await context.route("**/*", (route) => route.abort("internetdisconnected"));
}

async function goOnline(context: BrowserContext): Promise<void> {
  await context.unroute("**/*");
  await context.setOffline(false);
}

/** How many items with this body the meeting actually holds, from D1. */
function serverItemCount(body: string): number {
  const rows = d1Query(
    `SELECT COUNT(*) AS n FROM meeting_items
      WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)}
        AND body_markdown = ${sqlLiteral(body)}`,
  );
  return Number((rows[0] as { n: number } | undefined)?.n ?? 0);
}

const meetingTitle = uniqueMeetingTitle("offline-capture");

test.afterAll(async () => {
  await cleanupMeetingByTitle(meetingTitle);
});

test("MOBILE-03 a decision captured with no signal is kept, then syncs exactly once", async ({
  page,
  context,
}) => {
  // Create the meeting through the product's own phone capture path, so the
  // journey depends on no seeded record and the workspace it lands in is the one
  // an owner would actually be looking at.
  await page.goto("/today");
  await waitForInteractive(page);
  await page
    .getByTestId("bottom-nav-control")
    .filter({ hasText: "Add" })
    .click();
  await page.getByTestId("capture-choose-meeting").click();
  const sheet = page.getByTestId("capture-sheet");
  await sheet.getByLabel("Title").fill(meetingTitle);
  await expect(sheet.getByLabel("Start")).not.toHaveValue("", {
    timeout: 15_000,
  });
  await sheet.getByRole("button", { name: "Create meeting" }).click();
  await expect(page).toHaveURL(/\/meeting\//, { timeout: 15_000 });
  await waitForInteractive(page);
  await page.bringToFront();

  const meetingId = new URL(page.url()).pathname.split("/")[2];
  const bar = page.getByTestId("meeting-capture-bar");
  await expect(bar).toBeVisible({ timeout: 15_000 });

  // The bar opens on AGENDA for a meeting that has not been held — the type the
  // owner is overwhelmingly about to type, so the common case costs no tap.
  await expect(page.getByTestId("meeting-capture-agenda")).toHaveAttribute(
    "aria-pressed",
    "true",
  );

  // An agenda item, online, through the same authority the section's add field
  // uses. Proves the online path is untouched before the network goes.
  const input = page.getByTestId("meeting-capture-input");
  const agendaBody = `Agenda online ${meetingId}`;
  await input.fill(agendaBody);
  await input.press("Enter");
  await expect(input).toHaveValue("", { timeout: 15_000 });
  await expect(page.getByText(agendaBody)).toBeVisible({ timeout: 15_000 });

  await waitForSnapshot(page);
  await goOffline(context);

  // ── 1. The capture is kept, and is reported as kept ───────────────────────
  const decisionBody = `Decision offline ${meetingId}`;
  await page.getByTestId("meeting-capture-decision").click();
  await input.fill(decisionBody);
  await input.press("Enter");

  // The field CLEARS, which is the behavioural claim: a queued capture is a
  // success from the owner's side, so the next one can be typed straight away.
  await expect(input).toHaveValue("", { timeout: 15_000 });
  const status = page.getByRole("status").filter({ hasText: /this device/i });
  await expect(status).toHaveText(/saved on this device/i);
  // And it never tells them to try again — that would invite typing it twice.
  await expect(status).not.toHaveText(/try again/i);

  // ── 2. Queued as the right operation, against the right record ────────────
  await expect
    .poll(async () => (await readMutations(page)).length, { timeout: 20_000 })
    .toBe(1);
  const [queued] = await readMutations(page);
  expect(queued.entityType).toBe("meeting");
  expect(queued.entityId).toBe(meetingId);
  expect(queued.operation).toBe("add_decision");
  expect(queued.value).toBe(decisionBody);
  expect(queued.status).toBe("pending");

  // Nothing reached the server while the network was away.
  expect(serverItemCount(decisionBody)).toBe(0);

  // ── 3. Reconnecting sends it through the canonical authority ──────────────
  await goOnline(context);
  await expect
    .poll(async () => (await readMutations(page)).length, { timeout: 45_000 })
    .toBe(0);

  await page.reload();
  await waitForInteractive(page);
  await expect(page.getByText(decisionBody)).toBeVisible({ timeout: 15_000 });

  // ── 4. Exactly once, and the receipt says why ─────────────────────────────
  // The point of the whole design: an append cannot conflict, so the ONLY thing
  // protecting it from a lost response is the idempotency receipt. Reading both
  // the row count and the receipt distinguishes "it happened to work" from "the
  // protocol ran".
  expect(serverItemCount(decisionBody)).toBe(1);
  const receipts = d1Query(
    `SELECT operation, outcome FROM offline_mutation_receipts
      WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)}
        AND entity_id = ${sqlLiteral(meetingId)}`,
  );
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({ operation: "add_decision" });

  // Clean up this journey's own receipt so a repeated local run starts level.
  d1Execute(
    `DELETE FROM offline_mutation_receipts
      WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)}
        AND entity_id = ${sqlLiteral(meetingId)}`,
  );
});
