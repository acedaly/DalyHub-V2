/**
 * NOTIFY-01 — the notification bell, the inbox, and the Settings gate.
 *
 * TWO browser journeys, deliberately. A browser is the right tool for exactly
 * two things here:
 *
 *   1. the frame's count → the sheet → tapping a row navigates and marks it read;
 *   2. the Settings section, and the rule that a channel cannot be switched on
 *      before it has been proven to work.
 *
 * Everything else — the evaluator, the digest, insert-first concurrency, the
 * purge, the Pushover formatter — is pure logic or HTTP and is proved where it
 * can actually be asserted: `test/unit/notifications/**` and
 * `test/kernel/notifications.test.ts`, against the real Workers runtime and real
 * D1. A browser cannot prove that two cron ticks produce one row.
 *
 * The Pushover API is never contacted. The Settings journey stops at the gate —
 * the control the owner sees, the reason it is disabled, and the fact that it
 * stays disabled — which is the part a browser can prove without faking a third
 * party into the dev server.
 */

import { expect, test } from "@playwright/test";

import { d1Execute, sqlLiteral } from "./d1";
import {
  expectNoAxeViolations,
  expectNoHorizontalOverflow,
  gotoFixture,
  setSwitch,
} from "./helpers";

/**
 * BOTH top bars render a bell and both are in the DOM at every width — the
 * desktop one is `display: none` on a phone and vice versa — so each names its
 * own test id and a query has to say which frame it means.
 */
const DESKTOP_BELL = "topbar-notifications";
const PHONE_BELL = "mobilebar-notifications";

/** The workspace id is server CONFIGURATION, never a request value. */
const WORKSPACE_ID = "local-dev-workspace";
const SETTINGS = "/settings?section=notifications";

/** A recognisable fixture, so the assertions cannot match seeded product data. */
const DIGEST_TITLE = "E2E digest — your day";
const OBLIGATION_TITLE = "E2E Hilux — Registration renewal";

function seedNotifications(): void {
  const now = new Date().toISOString();
  const earlier = new Date(Date.now() - 3_600_000).toISOString();
  d1Execute([
    `DELETE FROM notification_deliveries WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)};`,
    `DELETE FROM notifications WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)};`,
    `INSERT INTO notifications
       (id, workspace_id, kind, subject_entity_id, dedupe_key, title, body, href, created_at, read_at)
     VALUES
       ('e2e-notify-digest', ${sqlLiteral(WORKSPACE_ID)}, 'digest', NULL,
        'e2e:digest', ${sqlLiteral(DIGEST_TITLE)}, '3 tasks for today', '/today',
        ${sqlLiteral(now)}, NULL);`,
    `INSERT INTO notifications
       (id, workspace_id, kind, subject_entity_id, dedupe_key, title, body, href, created_at, read_at)
     VALUES
       ('e2e-notify-asset', ${sqlLiteral(WORKSPACE_ID)}, 'obligation', NULL,
        'e2e:asset:7', ${sqlLiteral(OBLIGATION_TITLE)}, 'Due in 7 days', '/assets',
        ${sqlLiteral(earlier)}, NULL);`,
    // A recorded FAILURE, so the row's badge can be asserted. The notification
    // exists whatever the channel did — that is the point of recording first.
    `INSERT INTO notification_deliveries
       (workspace_id, notification_id, channel, status, attempted_at, detail)
     VALUES (${sqlLiteral(WORKSPACE_ID)}, 'e2e-notify-asset', 'pushover', 'failed',
             ${sqlLiteral(earlier)}, 'unreachable');`,
  ]);
}

function clearNotifications(): void {
  d1Execute([
    `DELETE FROM notification_deliveries WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)};`,
    `DELETE FROM notifications WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)};`,
    `DELETE FROM notification_settings WHERE workspace_id = ${sqlLiteral(WORKSPACE_ID)};`,
  ]);
}

test.describe("NOTIFY-01 the notification inbox", () => {
  test.beforeEach(() => {
    seedNotifications();
  });

  test.afterEach(() => {
    clearNotifications();
  });

  test("counts unread work, opens the log, and marks a row read by opening it", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");

    // The bell carries the count IN ITS NAME — a number drawn in a corner is
    // invisible to a screen reader, and colour-plus-position is not information.
    const bell = page.getByTestId(DESKTOP_BELL);
    await expect(bell).toHaveAccessibleName(/2 unread/);

    await bell.click();
    const sheet = page.getByTestId("notification-inbox");
    await expect(sheet).toBeVisible();

    // Newest first, and both rows present.
    const rows = page.getByTestId("notification-row");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText(DIGEST_TITLE);
    await expect(rows.nth(1)).toContainText(OBLIGATION_TITLE);

    // A failed external delivery is STATED on its row, in DalyHub's own words —
    // never a provider's. "I never got a push" has an answer inside the app.
    await expect(page.getByTestId("notification-failure")).toContainText(
      /could not be reached/i,
    );

    // Tapping a row goes where the event pointed, and marks it read on the way.
    await rows.first().click();
    await expect(page).toHaveURL(/\/today/);
    await expect(sheet).toBeHidden();

    // The count is server-resolved, so it must have actually moved.
    await expect(bell).toHaveAccessibleName(/1 unread/);
  });

  test("marks everything read in one action, and the count goes to none", async ({
    page,
  }) => {
    await gotoFixture(page, "/today");
    await page.getByTestId(DESKTOP_BELL).click();

    await page.getByTestId("notification-mark-all").click();
    // The control disappears with the last unread row: there is nothing left to
    // mark, and a control that can do nothing is not offered.
    await expect(page.getByTestId("notification-mark-all")).toBeHidden();

    await page.keyboard.press("Escape");
    await expect(page.getByTestId(DESKTOP_BELL)).toHaveAccessibleName(
      /none unread/,
    );
  });

  test("says something useful when there is nothing in the log", async ({
    page,
  }) => {
    clearNotifications();
    await gotoFixture(page, "/today");
    await page.getByTestId(DESKTOP_BELL).click();
    // The empty state teaches the next action rather than apologising, and is
    // honest about WHY it is empty — notifications are off by default.
    await expect(page.getByTestId("notification-inbox-empty")).toContainText(
      /turn notifications on in Settings/i,
    );
  });

  test("meets the accessibility and narrow-viewport contract", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await gotoFixture(page, "/today");
    // The PHONE bar's bell — the desktop one is `display: none` at this width.
    await page.getByTestId(PHONE_BELL).click();
    await expect(page.getByTestId("notification-inbox")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});

test.describe("NOTIFY-01 Settings → Notifications", () => {
  test.afterEach(() => {
    clearNotifications();
  });

  test("is off by default, and will not enable a channel it has never seen work", async ({
    page,
  }) => {
    clearNotifications();
    await gotoFixture(page, SETTINGS);
    await expect(
      page.getByRole("heading", {
        name: "Notifications",
        exact: true,
        level: 2,
      }),
    ).toBeVisible();

    // Off by default. A product that reaches a phone must be asked to.
    const master = page.getByTestId("notification-toggle-enabled");
    await expect(master.locator("input")).not.toBeChecked();

    // The honest copy about what leaves the Worker is on the page, at the point
    // of the decision — not buried in a policy document.
    await expect(
      page.getByText(/pass through Pushover's servers/i),
    ).toBeVisible();

    // In-app has no switch, and the surface says why rather than offering a
    // control that would break the system.
    await expect(page.getByText(/There is nothing to switch/i)).toBeVisible();

    // THE GATE. No validated credentials, so the channel cannot be turned on and
    // the test control cannot be pressed.
    await expect(
      page.getByTestId("notification-toggle-pushoverEnabled").locator("input"),
    ).toBeDisabled();
    await expect(page.getByTestId("pushover-test")).toBeDisabled();
    await expect(
      page.getByText(/Send a test notification first/i),
    ).toBeVisible();
  });

  test("turns notifications on, and states the timezone the digest is read in", async ({
    page,
  }) => {
    clearNotifications();
    await gotoFixture(page, SETTINGS);

    // Driven the way the shared switch's other real input method drives it —
    // its visible label intercepts a pointer click by design (see `setSwitch`).
    const master = page
      .getByTestId("notification-toggle-enabled")
      .locator("input");
    await setSwitch(master, true);

    // The send time and the zone are both real controls once notifications are
    // on, and the EFFECTIVE zone is stated rather than left to be inferred from
    // when a message arrives.
    await expect(page.getByTestId("notification-send-time")).toBeEnabled();
    await expect(
      page.getByText(/Currently using .+ — from your profile/),
    ).toBeVisible();

    const sendTime = page.getByTestId("notification-send-time");
    await sendTime.fill("06:30");
    await sendTime.blur();
    await page.reload();
    await expect(page.getByTestId("notification-send-time")).toHaveValue(
      "06:30",
    );
  });

  test("meets the accessibility and narrow-viewport contract", async ({
    page,
  }) => {
    clearNotifications();
    await page.setViewportSize({ width: 320, height: 800 });
    await gotoFixture(page, SETTINGS);
    await expect(
      page.getByRole("heading", {
        name: "Notifications",
        exact: true,
        level: 2,
      }),
    ).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await expectNoAxeViolations(page);
  });
});
