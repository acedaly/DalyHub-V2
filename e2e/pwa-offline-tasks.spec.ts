/**
 * PWA-12 — offline Task mutation, end to end in a real browser.
 *
 * ── What makes these real ────────────────────────────────────────────────────
 * The network is genuinely taken away. There is no `window.__DALYHUB_OFFLINE`
 * and no injected transport double: `context.setOffline(true)` plus an
 * abort-everything route means the page's own `fetch` fails exactly as it does
 * on a phone in a lift, and the code under test is the real queue, the real
 * replay engine and the real `/tasks/:taskId` route.
 *
 * There are no sleeps. Every wait is a deterministic condition: a record
 * reaching a status in IndexedDB, a row's own text, a value read back from the
 * server.
 *
 * ── What they deliberately do NOT try to prove ───────────────────────────────
 * They run against the DEVELOPMENT server, because that is the one of the two
 * Playwright servers with an authenticated session. The application is fully
 * hydrated and interactive there, which is all these journeys need — they never
 * reload a page while offline, because a dev server's module graph is not
 * precached and that limitation is PWA-05's, not PWA-12's. It is already
 * recorded in `PWA_AND_OFFLINE.md`. Durability across a reload is proven here
 * the way it can be proven honestly: by reloading after RECONNECTING and reading
 * the authoritative server state back.
 */

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { d1Execute, d1Query, sqlLiteral } from "./d1";
import { clickCardAction, completeTaskRow } from "./helpers";

const WORKSPACE_ID = "local-dev-workspace";

/* -------------------------------------------------------------------------- */
/* Deterministic state, read from the browser's own storage                    */
/* -------------------------------------------------------------------------- */

interface QueuedMutation {
  readonly id: string;
  readonly entityId: string;
  readonly operation: string;
  readonly status: string;
  readonly value: string | null;
  readonly attempts: number;
}

/** Read the queued Task changes straight out of IndexedDB. */
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

/** Wait until this device holds exactly `count` outstanding Task changes. */
async function waitForQueued(page: Page, count: number): Promise<void> {
  await expect
    .poll(
      async () =>
        (await readMutations(page)).filter((row) => row.status !== "synced")
          .length,
      { timeout: 20_000 },
    )
    .toBe(count);
}

/**
 * Wait until nothing is left waiting to sync.
 *
 * A confirmed change is PRUNED from the queue — the surface shows work that
 * still needs to reach DalyHub, not a history (§42) — so "drained" is an empty
 * queue rather than a queue full of `synced` rows.
 */
async function waitForDrained(page: Page, timeout = 45_000): Promise<void> {
  await expect
    .poll(async () => (await readMutations(page)).length, { timeout })
    .toBe(0);
}

/** Wait until the device has stored a snapshot — proof of a prior online session. */
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
 * fetches.
 *
 * `context.setOffline` alone is not enough: Chromium applies its emulation to
 * the page's network context, and a fetch issued from inside the service worker
 * can still reach the server — which would silently turn an offline assertion
 * into a test of the online path.
 */
async function goOffline(context: BrowserContext): Promise<void> {
  await context.setOffline(true);
  await context.route("**/*", (route) => route.abort("internetdisconnected"));
}

async function goOnline(context: BrowserContext): Promise<void> {
  await context.unroute("**/*");
  await context.setOffline(false);
}

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * A creation instant far ahead of every seeded fixture, so `sort=created&dir=desc`
 * puts these tasks at the top of a list that already holds ninety-odd others.
 * Deterministic placement, not luck — a journey that depends on where a row
 * happens to paginate is a journey that fails for a reason unrelated to what it
 * is testing.
 */
const NOW = "2027-01-01T00:00:00.000Z";

/**
 * The Tasks list with no grouping, newest first — the one configuration in which
 * a freshly seeded fixture is reliably the first row.
 */
const TASKS_URL = "/tasks?view=list&group=none&sort=created&dir=desc";

/**
 * Seed one plain task, addressable by a fixed id.
 *
 * Removes first rather than using `INSERT OR REPLACE` on `entities`: REPLACE is a
 * delete-then-insert, and a leftover `task_details` or `spine_records` row from a
 * previous run holds a RESTRICT foreign key that makes the delete fail. Removing
 * the children explicitly, in order, is the only sequence that is idempotent
 * across runs.
 */
function seedTask(id: string, title: string): void {
  removeTask(id);
  d1Execute(
    `INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at)
       VALUES (${sqlLiteral(id)}, ${sqlLiteral(WORKSPACE_ID)}, 'task', ${sqlLiteral(title)}, ${sqlLiteral(NOW)}, ${sqlLiteral(NOW)}, NULL);
     INSERT INTO spine_records (workspace_id, entity_id, kind, completed_at)
       VALUES (${sqlLiteral(WORKSPACE_ID)}, ${sqlLiteral(id)}, 'task', NULL);
     INSERT INTO task_details (workspace_id, entity_id, status, priority, due_date, scheduled_date, updated_at)
       VALUES (${sqlLiteral(WORKSPACE_ID)}, ${sqlLiteral(id)}, 'todo', NULL, NULL, NULL, ${sqlLiteral(NOW)});`,
  );
}

/** Remove a seeded task and everything that hangs off it. */
function removeTask(id: string): void {
  d1Execute(
    `DELETE FROM task_recurrence_rules WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND entity_id = ${sqlLiteral(id)};
     DELETE FROM task_details WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND entity_id = ${sqlLiteral(id)};
     DELETE FROM spine_records WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND entity_id = ${sqlLiteral(id)};
     DELETE FROM activity_subjects WHERE entity_id = ${sqlLiteral(id)};
     DELETE FROM entities WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND id = ${sqlLiteral(id)};`,
  );
}

/** Read a task's authoritative server state, through the real record route. */
async function readServerTask(page: Page, taskId: string) {
  return page.evaluate(async (id: string) => {
    const response = await fetch(`/tasks/${id}`, {
      headers: { Accept: "application/json" },
    });
    const body = (await response.json()) as {
      task?: {
        title: string;
        priority: string | null;
        dueDate: string | null;
        completedAt: string | null;
      };
    };
    return body.task ?? null;
  }, taskId);
}

/** Open Tasks, hydrated, with a stored snapshot — a real prior online session. */
async function openTasks(page: Page): Promise<void> {
  await page.goto(TASKS_URL);
  await expect(
    page.getByRole("heading", { level: 1, name: "Tasks" }),
  ).toBeVisible();
  await waitForSnapshot(page);
}

/**
 * The row for a task.
 *
 * A Card renders as an `article` whose accessible name is its OPEN control's —
 * `Open <title>` — which is the shape every other Tasks journey addresses rows
 * by, through the same helpers used below.
 */
function rowFor(page: Page, title: string) {
  return page.getByRole("article", { name: `Open ${title}` }).first();
}

/**
 * Set a row's priority through the ordinary inline control — the SAME control an
 * online edit uses, at whatever width the test is running at.
 *
 * EDIT-03 gives the shared inline select two presentations: an anchored menu on a
 * pointer device and a full `Sheet` of large option rows on a phone. Both are the
 * real control, and the journeys have to drive whichever one this viewport gets —
 * so this waits for the option itself rather than for a particular surface. The
 * hover is what reveals the field's control on a pointer device.
 */
async function setRowPriority(
  page: Page,
  title: string,
  option: string,
): Promise<void> {
  const row = rowFor(page, title);
  await row.scrollIntoViewIfNeeded();
  await row.hover();
  await row.locator('[data-testid="task-row-priority"] button').first().click();
  // The anchored menu marks each option `menuitemradio`; the phone sheet renders
  // a pressed-state button. Either is the same choice, made the same way.
  const choice = page
    .getByRole("menuitemradio", { name: option })
    .or(page.getByRole("button", { name: option }))
    .last();
  await expect(choice).toBeVisible();
  await choice.click();
}

/** Open a row's overflow menu and choose one item, through the shared helper. */
async function chooseOverflow(
  page: Page,
  title: string,
  item: string,
): Promise<void> {
  await clickCardAction(rowFor(page, title), /^More actions for /);
  await page
    .getByRole("menu")
    .last()
    .getByRole("menuitem", { name: item, exact: true })
    .click();
}

/* -------------------------------------------------------------------------- */
/* The primary journey                                                        */
/* -------------------------------------------------------------------------- */

test.describe("PWA-12 — offline Task mutation", () => {
  /*
   * A longer budget than the suite default, for a measured reason rather than to
   * make a flaky test pass.
   *
   * Each journey contains an offline→online TRANSITION, and reconnection is
   * event-driven by design: the provider probes on the browser's `online` event
   * and then runs a full sync pass (snapshot, capture replay, mutation replay)
   * before the queue drains. On this machine the primary journey measures ~35s
   * end to end against the dev server, most of it the initial page load and the
   * two sync passes — genuinely more than the 30s default, and not a symptom of
   * anything being slow to settle.
   *
   * Nothing else is loosened: retries stay 0, every wait below is a deterministic
   * condition rather than a sleep, and no assertion is weakened to fit.
   */
  test.describe.configure({ timeout: 120_000 });

  test.beforeEach(async ({ context }) => {
    await context.setOffline(false);
  });

  test.afterEach(async ({ context }) => {
    await goOnline(context);
  });

  test("edits made during an outage are pending, then reconciled on reconnect", async ({
    page,
    context,
  }) => {
    const editId = "pwa12-edit";
    const completeId = "pwa12-complete";
    seedTask(editId, "PWA12 edit target");
    seedTask(completeId, "PWA12 completion target");

    try {
      await openTasks(page);
      await expect(rowFor(page, "PWA12 edit target")).toBeVisible();

      // ---- the network genuinely disappears --------------------------------
      await goOffline(context);

      // ---- 1. rename, through the ordinary inline control -------------------
      await chooseOverflow(page, "PWA12 edit target", "Rename");
      const input = page.getByRole("textbox", {
        name: "Rename PWA12 edit target",
      });
      await input.fill("PWA12 renamed offline");
      await input.press("Enter");

      // The owner's change is SHOWN — and the row says, in words, that DalyHub
      // has not accepted it. That distinction is the whole product contract.
      await expect(rowFor(page, "PWA12 renamed offline")).toBeVisible();
      await expect(
        rowFor(page, "PWA12 renamed offline").getByTestId("task-row-sync"),
      ).toHaveText("Waiting to sync");
      await waitForQueued(page, 1);

      // ---- 2. priority, through the ordinary inline control -----------------
      await setRowPriority(page, "PWA12 renamed offline", "P2 · High");
      await waitForQueued(page, 2);

      // ---- 3. complete a DIFFERENT task ------------------------------------
      await completeTaskRow(
        rowFor(page, "PWA12 completion target"),
        "PWA12 completion target",
      );
      await waitForQueued(page, 3);
      await expect(
        rowFor(page, "PWA12 completion target").getByTestId("task-row-sync"),
      ).toHaveText("Waiting to sync");

      // No generic crash page anywhere in this journey.
      await expect(page.getByText("Something went wrong")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { level: 1, name: "Tasks" }),
      ).toBeVisible();

      // ---- 4. the connection returns ---------------------------------------
      await goOnline(context);
      await waitForDrained(page);

      // The pending indication clears without the owner doing anything: an
      // ordinary successful change never needs a manual "sync".
      await expect(page.getByTestId("task-row-sync")).toHaveCount(0);

      // ---- 5. the AUTHORITATIVE state, read back from the server ------------
      const edited = await readServerTask(page, editId);
      expect(edited?.title).toBe("PWA12 renamed offline");
      expect(edited?.priority).toBe("p2");
      const completed = await readServerTask(page, completeId);
      expect(completed?.completedAt).not.toBeNull();

      // ---- 6. and it survives a reload -------------------------------------
      await page.reload();
      await expect(rowFor(page, "PWA12 renamed offline")).toBeVisible();
      expect(await readMutations(page)).toEqual([]);
    } finally {
      await goOnline(context);
      removeTask(editId);
      removeTask(completeId);
    }
  });

  test("a queued change survives a reload before it has been sent", async ({
    page,
    context,
  }) => {
    // Durability is the property that makes the queue trustworthy: a change made
    // in a lift must still be there after the phone is picked up again. The
    // reload happens ONLINE (a dev server cannot serve a hydrated page offline —
    // a PWA-05 limitation, recorded in PWA_AND_OFFLINE.md), with the request to
    // the Task route still blocked, so the queue is genuinely re-read from
    // IndexedDB by a freshly booted page rather than remembered in memory.
    const taskId = "pwa12-durable";
    seedTask(taskId, "PWA12 durable change");

    try {
      await openTasks(page);
      await goOffline(context);

      await setRowPriority(page, "PWA12 durable change", "P1 · Urgent");
      await waitForQueued(page, 1);

      // Block only the mutation path, then reload with a working document load.
      await goOnline(context);
      await context.route("**/tasks/pwa12-durable", (route) =>
        route.abort("internetdisconnected"),
      );
      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: "Tasks" }),
      ).toBeVisible();

      // Read from storage by a page that has never seen the edit in memory.
      const afterReload = await readMutations(page);
      expect(afterReload).toHaveLength(1);
      expect(afterReload[0]).toMatchObject({
        entityId: taskId,
        operation: "set_priority",
        value: "p1",
      });
      // And the row still shows the owner's change, still marked as pending.
      await expect(
        rowFor(page, "PWA12 durable change").getByTestId("task-row-sync"),
      ).toBeVisible();

      // Unblocking the route is not itself a sync trigger: the connection never
      // became unhealthy (the document and the snapshot both loaded), so there is
      // no reconnection transition to recognise. Replay runs on the triggers the
      // product actually declares — application start, reconnection, foreground,
      // explicit retry (§22) — and this is the first of them. A second reload is
      // the honest way to reach it, and it also re-proves durability: the change
      // has now survived two page lifetimes.
      await context.unroute("**/tasks/pwa12-durable");
      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: "Tasks" }),
      ).toBeVisible();
      await waitForDrained(page);
      expect((await readServerTask(page, taskId))?.priority).toBe("p1");
    } finally {
      await goOnline(context);
      removeTask(taskId);
    }
  });

  /* ------------------------------------------------------------------------ */
  /* Recurrence                                                               */
  /* ------------------------------------------------------------------------ */

  test("completing a recurring task offline produces exactly one successor", async ({
    page,
    context,
  }) => {
    const taskId = "pwa12-recurring";
    seedTask(taskId, "PWA12 recurring bin night");
    d1Execute(
      `UPDATE task_details SET scheduled_date = '2026-08-12'
         WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND entity_id = ${sqlLiteral(taskId)};
       INSERT OR REPLACE INTO task_recurrence_rules
         (workspace_id, entity_id, frequency, interval, date_kind, weekdays, mode, series_id, sequence, created_at, updated_at)
         VALUES (${sqlLiteral(WORKSPACE_ID)}, ${sqlLiteral(taskId)}, 'week', 1, 'scheduled', NULL, 'fixed', 'pwa12-series', 0, ${sqlLiteral(NOW)}, ${sqlLiteral(NOW)});`,
    );

    /** How many LIVE occurrences this series has, straight from D1. */
    const seriesSize = (): number => {
      const rows = d1Query<{ n: number }>(
        `SELECT COUNT(*) AS n FROM task_recurrence_rules r
           JOIN entities e ON e.id = r.entity_id AND e.workspace_id = r.workspace_id
          WHERE r.workspace_id = ${sqlLiteral(WORKSPACE_ID)}
            AND r.series_id = 'pwa12-series' AND e.deleted_at IS NULL;`,
      );
      return Number(rows[0]?.n ?? -1);
    };

    try {
      await openTasks(page);
      await expect(rowFor(page, "PWA12 recurring bin night")).toBeVisible();
      expect(seriesSize()).toBe(1);

      await goOffline(context);
      await completeTaskRow(
        rowFor(page, "PWA12 recurring bin night"),
        "PWA12 recurring bin night",
      );
      await waitForQueued(page, 1);

      // While offline the client has NOT invented a successor. The recurrence
      // engine is server-side and has not run.
      expect(seriesSize()).toBe(1);

      await goOnline(context);
      await waitForDrained(page);

      // Exactly one, created by the canonical engine when the intent replayed.
      await expect.poll(seriesSize, { timeout: 20_000 }).toBe(2);

      // And it stays exactly one across a refresh — no second pass, no second
      // successor, no duplicate replay.
      await page.reload();
      await expect(
        page.getByRole("heading", { level: 1, name: "Tasks" }),
      ).toBeVisible();
      await waitForDrained(page);
      expect(seriesSize()).toBe(2);
    } finally {
      await goOnline(context);
      d1Execute(
        `DELETE FROM task_recurrence_rules WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND series_id = 'pwa12-series';`,
      );
      // The successor the engine created is not a fixture; remove it by title.
      d1Execute(
        `DELETE FROM task_details WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND entity_id IN
           (SELECT id FROM entities WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND title = 'PWA12 recurring bin night');
         DELETE FROM spine_records WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND entity_id IN
           (SELECT id FROM entities WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND title = 'PWA12 recurring bin night');
         DELETE FROM activity_subjects WHERE entity_id IN
           (SELECT id FROM entities WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND title = 'PWA12 recurring bin night');
         DELETE FROM entities WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND title = 'PWA12 recurring bin night';`,
      );
    }
  });

  /* ------------------------------------------------------------------------ */
  /* Conflict                                                                 */
  /* ------------------------------------------------------------------------ */

  test("a task changed elsewhere during the outage surfaces a real decision", async ({
    page,
    context,
  }) => {
    const taskId = "pwa12-conflict";
    seedTask(taskId, "PWA12 conflict target");

    try {
      await openTasks(page);
      await expect(rowFor(page, "PWA12 conflict target")).toBeVisible();

      await goOffline(context);
      await setRowPriority(page, "PWA12 conflict target", "P1 · Urgent");
      await waitForQueued(page, 1);

      // Another device changes the SAME field while this one is offline.
      d1Execute(
        `UPDATE task_details SET priority = 'p4'
           WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND entity_id = ${sqlLiteral(taskId)};`,
      );

      await goOnline(context);

      // Neither side is silently discarded. DalyHub says what happened, in plain
      // language, and shows both values.
      const panel = page.getByTestId("offline-changes");
      await expect(panel).toBeVisible({ timeout: 30_000 });
      await expect(
        panel.getByText(/changed on another device while you were offline/),
      ).toBeVisible();
      await expect(
        panel.getByRole("button", { name: "Keep my change" }),
      ).toBeVisible();
      await expect(
        panel.getByRole("button", { name: /Keep DalyHub/ }),
      ).toBeVisible();
      // Nothing was applied while the question stands.
      expect((await readServerTask(page, taskId))?.priority).toBe("p4");

      // The owner chooses. "Keep my change" rebases and sends.
      await panel.getByRole("button", { name: "Keep my change" }).click();
      await waitForDrained(page);
      expect((await readServerTask(page, taskId))?.priority).toBe("p1");
      await expect(page.getByTestId("offline-changes")).toHaveCount(0);
    } finally {
      await goOnline(context);
      removeTask(taskId);
    }
  });

  test("keeping DalyHub's value discards the queued change and touches nothing", async ({
    page,
    context,
  }) => {
    const taskId = "pwa12-conflict-server";
    seedTask(taskId, "PWA12 server wins target");

    try {
      await openTasks(page);
      await goOffline(context);
      await setRowPriority(page, "PWA12 server wins target", "P1 · Urgent");
      await waitForQueued(page, 1);

      d1Execute(
        `UPDATE task_details SET priority = 'p3'
           WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND entity_id = ${sqlLiteral(taskId)};`,
      );
      await goOnline(context);

      const panel = page.getByTestId("offline-changes");
      await expect(panel).toBeVisible({ timeout: 30_000 });
      await panel.getByRole("button", { name: /Keep DalyHub/ }).click();

      await waitForDrained(page);
      // The server's value stands, and the queued intent is gone.
      expect((await readServerTask(page, taskId))?.priority).toBe("p3");
      await expect(page.getByTestId("offline-changes")).toHaveCount(0);
    } finally {
      await goOnline(context);
      removeTask(taskId);
    }
  });

  /* ------------------------------------------------------------------------ */
  /* The offline failure experience                                           */
  /* ------------------------------------------------------------------------ */

  test("a loaded Tasks surface stays usable, and says so, through an outage", async ({
    page,
    context,
  }) => {
    const taskId = "pwa12-degrade";
    seedTask(taskId, "PWA12 degradation target");

    try {
      await openTasks(page);
      await goOffline(context);

      // Before PWA-12 the first mutation on a disconnected Tasks page produced a
      // refusal, and opening a task produced the framework's generic
      // "Something went wrong". Neither may happen now.
      await setRowPriority(page, "PWA12 degradation target", "P3 · Normal");
      await waitForQueued(page, 1);

      await expect(page.getByText("Something went wrong")).toHaveCount(0);
      await expect(page.getByText("We couldn’t find that page")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { level: 1, name: "Tasks" }),
      ).toBeVisible();

      // Opening a task while offline no longer takes the page down: the list's
      // loader is not re-run for a drawer parameter, so there is no request to
      // fail.
      await rowFor(page, "PWA12 degradation target")
        .getByRole("link", { name: "Open PWA12 degradation target" })
        .first()
        .click();
      await expect(page.getByText("Something went wrong")).toHaveCount(0);
      await expect(
        page.getByRole("heading", { level: 1, name: "Tasks" }),
      ).toBeVisible();

      // Connectivity loss is communicated truthfully, not by silence.
      await expect(page.getByTestId("task-row-sync")).toHaveText(
        "Waiting to sync",
      );

      await goOnline(context);
      await waitForDrained(page);
      expect((await readServerTask(page, taskId))?.priority).toBe("p3");
    } finally {
      await goOnline(context);
      removeTask(taskId);
    }
  });

  /* ------------------------------------------------------------------------ */
  /* Phone widths                                                             */
  /* ------------------------------------------------------------------------ */

  for (const width of [320, 375, 390, 430]) {
    test(`the pending and conflict surfaces fit a ${width}px phone`, async ({
      page,
      context,
    }) => {
      const taskId = `pwa12-phone-${width}`;
      seedTask(taskId, `PWA12 phone ${width}`);

      try {
        // The change is made at a desktop width and the surfaces are then
        // examined at the phone one. That is deliberate: what this test is for is
        // the PENDING and CONFLICT presentations at 320–430px, and driving the
        // row's own inline editor here would instead be re-testing the shared
        // inline field's phone sheet, which `inline-editor-overlay.spec.ts`
        // already owns. Resizing mid-session is also a real thing a device does.
        await openTasks(page);
        await goOffline(context);
        await setRowPriority(page, `PWA12 phone ${width}`, "P2 · High");
        await waitForQueued(page, 1);

        await page.setViewportSize({ width, height: 844 });

        // The row's pending line has to survive the narrowest supported width.
        await expect(
          rowFor(page, `PWA12 phone ${width}`).getByTestId("task-row-sync"),
        ).toHaveText("Waiting to sync");

        // Force the conflict so the two-value comparison is on screen at this
        // width — the one presentation that would be unsafe if it squeezed.
        d1Execute(
          `UPDATE task_details SET priority = 'p4'
             WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)} AND entity_id = ${sqlLiteral(taskId)};`,
        );
        await goOnline(context);

        const panel = page.getByTestId("offline-changes");
        await expect(panel).toBeVisible({ timeout: 30_000 });

        // Both values are named and readable, not one truncated pair.
        await expect(panel.getByText("Priority here")).toBeVisible();
        await expect(panel.getByText("Priority in DalyHub")).toBeVisible();

        // The page must never scroll sideways.
        const overflow = await page.evaluate(
          () =>
            document.documentElement.scrollWidth >
            document.documentElement.clientWidth + 1,
        );
        expect(overflow).toBe(false);

        // Both decisions remain reachable and large enough to press.
        for (const name of [/Keep my change/, /Keep DalyHub/]) {
          const control = panel.getByRole("button", { name });
          await expect(control).toBeVisible();
          const box = await control.boundingBox();
          expect(box!.height).toBeGreaterThanOrEqual(44);
        }
      } finally {
        await goOnline(context);
        removeTask(taskId);
      }
    });
  }
});
