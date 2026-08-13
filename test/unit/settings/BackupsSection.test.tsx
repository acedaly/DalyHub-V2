/**
 * BACKUP-02 — the Backups surface.
 *
 * Driven through `createRoutesStub` so `useFetcher` and `useRevalidator` are the
 * real ones and the "Back up now" button genuinely posts to a route, rather than
 * being tested against a hand-mocked hook that cannot disagree with the component.
 *
 * The assertions are deliberately about what the OWNER can see and do:
 *   - every health state states itself in words, never by colour alone;
 *   - a failure shows both the failure and the last good backup;
 *   - "no backups yet" is its own state and still offers to take one;
 *   - an unavailable status never reads as a failure;
 *   - the button cannot start a second backup while one is running;
 *   - no SQL, credential or infrastructure vocabulary appears anywhere;
 *   - and there is no restore, delete or import control on the page at all.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseBackupHistory,
  parseBackupStatus,
  type BackupRunView,
  type BackupStatusView,
} from "~/kernel/backup";
import { BackupsSection } from "~/modules/settings/BackupsSection";
import type { BackupSettingsData } from "~/platform/backup";

const SYDNEY = "Australia/Sydney";

/** 13 Aug 2026, 16:00 UTC — 02:00 on the 14th in Sydney. */
const LAST_NIGHT = "2026-08-13T16:00:00.000Z";

/**
 * The section reads `new Date()` once per render, so the clock is PINNED here.
 * Without it, "Today" versus "Tomorrow" depends on when the suite happens to run
 * and these assertions would rot within hours of being written.
 *
 * Only `Date` is faked: React Testing Library's `waitFor` and the fetcher rely on
 * real timers, and replacing those would deadlock the async assertions.
 */
const NOW = new Date("2026-08-14T03:00:00.000Z");

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

function run(overrides: Partial<BackupRunView> = {}): BackupRunView {
  return {
    id: "f9412c3c-f613-4d4a-87ea-22ee5035f43f",
    trigger: "daily",
    status: "success",
    startedAt: LAST_NIGHT,
    completedAt: "2026-08-13T16:00:09.000Z",
    objectKey: "production/daily/2026/08/dalyhub-v2-2026-08-13T160000Z.sql",
    sizeBytes: 1_420_000,
    retentionDays: 90,
    stage: null,
    message: null,
    ...overrides,
  };
}

function status(overrides: Partial<BackupStatusView> = {}): BackupStatusView {
  return {
    ...parseBackupStatus({
      available: true,
      health: "healthy",
      reason: "recent_success",
      latestAttempt: run(),
      lastSuccessfulBackup: run(),
      retainedBackupCount: 31,
      retainedBackupCountExact: true,
      retentionDays: { daily: 90, manual: 365 },
      schedule: "0 16 * * *",
      scheduleTimeZone: "UTC",
      intervalHours: 24,
      graceHours: 6,
      staleAfterHours: 30,
      databaseName: "dalyhub-v2",
    }),
    ...overrides,
  };
}

/**
 * Render the section with a stubbed `/settings/backups/run` action, so the button
 * exercises a real fetcher submission.
 */
function renderSection(
  data: Partial<BackupSettingsData> = {},
  action?: () => unknown,
) {
  const settings: BackupSettingsData = {
    status: data.status ?? status(),
    history: data.history ?? [run()],
    timeZone: data.timeZone ?? SYDNEY,
  };
  const runAction =
    action ?? vi.fn(() => ({ ok: true, message: "Backup started." }));
  const Stub = createRoutesStub([
    {
      path: "/settings",
      Component: () => <BackupsSection data={settings} />,
    },
    { path: "/settings/backups/run", action: runAction },
  ]);
  render(<Stub initialEntries={["/settings"]} />);
  return { runAction };
}

/* -------------------------------------------------------------------------- */
/* Healthy                                                                    */
/* -------------------------------------------------------------------------- */

describe("the healthy state", () => {
  it("says Healthy in words, and shows the facts that back it up", () => {
    renderSection();
    expect(screen.getByTestId("backup-health")).toHaveTextContent("Healthy");
    // The last successful backup, in the OWNER's timezone: 16:00 UTC is 2:00 am
    // in Sydney, not 4:00 pm.
    expect(screen.getByTestId("backup-last-success")).toHaveTextContent(
      "Today, 2:00 am",
    );
    expect(screen.getByTestId("backup-last-attempt")).toHaveTextContent(
      "Successful",
    );
    expect(screen.getByTestId("backup-size")).toHaveTextContent("1.42 MB");
    expect(screen.getByTestId("backup-retention")).toHaveTextContent("90 days");
    expect(screen.getByTestId("backup-count")).toHaveTextContent("31");
  });

  it("represents the next automatic backup as approximate", () => {
    renderSection();
    // BACKUP-02 §13: the schedule is a UTC cron, so the local time is not an
    // invariant and the surface must not pretend it is.
    expect(screen.getByTestId("backup-next")).toHaveTextContent(
      "approximately",
    );
  });

  it("offers Back up now, enabled", () => {
    renderSection();
    const button = screen.getByTestId("backup-run");
    expect(button).toBeEnabled();
    expect(button).toHaveAccessibleName(/back up now/i);
  });

  it("lists recent backups with date, kind, outcome and size", () => {
    renderSection({
      history: [
        run(),
        run({
          id: "manual-1",
          trigger: "manual",
          startedAt: "2026-08-11T09:18:00.000Z",
        }),
      ],
    });
    const history = screen.getByTestId("backup-history");
    expect(history).toHaveTextContent("Automatic");
    expect(history).toHaveTextContent("Manual");
    expect(history).toHaveTextContent("Successful");
    expect(history).toHaveTextContent("1.42 MB");
  });
});

/* -------------------------------------------------------------------------- */
/* Failure, running, empty, unavailable                                       */
/* -------------------------------------------------------------------------- */

describe("the failure state", () => {
  it("shows the failure AND the last successful backup", () => {
    renderSection({
      status: status({
        health: "attention",
        reason: "latest_failed",
        latestAttempt: run({
          id: "failed-run",
          status: "failed",
          startedAt: "2026-08-14T16:01:00.000Z",
          completedAt: "2026-08-14T16:01:20.000Z",
          objectKey: null,
          sizeBytes: null,
          stage: "r2-write",
          message: "The backup could not be saved to storage.",
        }),
        lastSuccessfulBackup: run(),
      }),
    });
    expect(screen.getByTestId("backup-health")).toHaveTextContent(
      "Backup needs attention",
    );
    expect(screen.getByTestId("backup-last-attempt")).toHaveTextContent(
      "Failed",
    );
    // Both facts are present: the problem, and what the owner still has.
    const summary = screen.getByText(/could not be saved to storage/i);
    expect(summary).toHaveTextContent(/Last successful backup:/i);
  });

  it("shows the canned failure sentence in history, never raw error text", () => {
    renderSection({
      history: [
        run({
          status: "failed",
          objectKey: null,
          sizeBytes: null,
          stage: "export-start",
          message: "DalyHub could not start a database export.",
        }),
      ],
    });
    const history = screen.getByTestId("backup-history");
    expect(history).toHaveTextContent("Failed");
    expect(history).toHaveTextContent("could not start a database export");
    expect(history.textContent).not.toMatch(/stack|Error:|api\.cloudflare/i);
  });
});

describe("the running state", () => {
  it("says a backup is in progress and disables the button", () => {
    renderSection({
      status: status({
        health: "running",
        reason: "running",
        latestAttempt: run({
          status: "running",
          completedAt: null,
          objectKey: null,
          sizeBytes: null,
        }),
      }),
    });
    expect(screen.getByTestId("backup-health")).toHaveTextContent(
      "Backup in progress",
    );
    const button = screen.getByTestId("backup-run");
    expect(button).toBeDisabled();
    // A disabled control with no explanation is a dead end.
    expect(screen.getByText(/already running/i)).toBeInTheDocument();
  });
});

describe("the no-backups-yet state", () => {
  it("says so plainly and still offers to take one", () => {
    renderSection({
      status: status({
        health: "unknown",
        reason: "no_runs",
        latestAttempt: null,
        lastSuccessfulBackup: null,
        retainedBackupCount: 0,
      }),
      history: [],
    });
    expect(
      screen.getByText(/first scheduled backup has not completed/i),
    ).toBeInTheDocument();
    expect(screen.getByTestId("backup-last-success")).toHaveTextContent("None");
    expect(screen.getByTestId("backup-run")).toBeEnabled();
    expect(screen.getByText(/no backups recorded yet/i)).toBeInTheDocument();
  });
});

describe("the unavailable state", () => {
  it("does not imply the backups have failed", () => {
    renderSection({
      status: parseBackupStatus(null),
      history: [],
    });
    expect(screen.getByTestId("backup-health")).toHaveTextContent(
      "Backup status unavailable",
    );
    expect(
      screen.getByText(/does not mean a backup has failed/i),
    ).toBeInTheDocument();
    // Not presented as a count of zero, which would be a claim.
    expect(screen.getByTestId("backup-count")).toHaveTextContent("—");
  });

  it("still allows a manual backup — not knowing is a reason to take one", () => {
    renderSection({ status: parseBackupStatus(null), history: [] });
    expect(screen.getByTestId("backup-run")).toBeEnabled();
  });
});

/* -------------------------------------------------------------------------- */
/* The manual action                                                          */
/* -------------------------------------------------------------------------- */

describe("Back up now", () => {
  it("posts to the run action and reports that the backup started", async () => {
    const { runAction } = renderSection();
    fireEvent.click(screen.getByTestId("backup-run"));

    await waitFor(() => expect(runAction).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("Backup started.")).toBeInTheDocument();
  });

  it("disables itself the moment a backup has been started", async () => {
    // This is the guarantee the COMPONENT owns: once a trigger is accepted the
    // control is disabled, so a browser cannot submit it again. The complementary
    // server-side guarantee — the backup service refusing a second run even if a
    // request did arrive — is asserted in test/kernel/backup-service.test.ts,
    // because a disabled attribute is a UI affordance and not a safety property.
    const { runAction } = renderSection();
    const button = screen.getByTestId("backup-run");
    expect(button).toBeEnabled();
    fireEvent.click(button);
    // Both assertions inside one `waitFor`: the control passes through a brief
    // submitting state on the way to the settled one, and asserting them
    // separately would sample two different renders.
    await waitFor(() => {
      expect(button).toBeDisabled();
      expect(button).toHaveTextContent(/in progress/i);
    });
    expect(runAction).toHaveBeenCalledTimes(1);
  });

  it("shows a useful message when the backup could not be started", async () => {
    renderSection({}, () => ({
      ok: false,
      message: "A backup is already running.",
    }));
    fireEvent.click(screen.getByTestId("backup-run"));
    expect(
      await screen.findByText("A backup is already running."),
    ).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Safety and accessibility                                                   */
/* -------------------------------------------------------------------------- */

describe("what this page must never contain", () => {
  it("has no restore, delete, purge or import control", () => {
    renderSection();
    for (const forbidden of [
      /restore now/i,
      /^delete/i,
      /empty bucket/i,
      /import/i,
      /roll ?back/i,
    ]) {
      expect(screen.queryByRole("button", { name: forbidden })).toBeNull();
    }
    // Exactly one button on the page, and it is the backup trigger.
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("says that production restores happen outside DalyHub", () => {
    renderSection();
    expect(
      screen.getByText(/intentionally performed outside DalyHub/i),
    ).toBeInTheDocument();
  });

  it("shows no SQL and no credential anywhere in the page", () => {
    renderSection();
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/CREATE TABLE|INSERT INTO|PRAGMA/i);
    expect(text).not.toMatch(/Bearer|signed_url|api_token|D1_REST/i);
  });

  it("keeps the storage path out of the default view", () => {
    renderSection();
    // `textContent` reports text inside a CLOSED `<details>` too, so the check
    // has to exclude the disclosures rather than scan the whole body — the path
    // is deliberately present in the DOM and deliberately not on screen.
    const body = document.body.cloneNode(true) as HTMLElement;
    for (const details of body.querySelectorAll("details")) details.remove();
    expect(body.textContent ?? "").not.toContain("production/daily/2026/08");
  });

  it("keeps the storage path available behind an explicit disclosure", () => {
    renderSection();
    const details = screen.getByText(/technical details/i);
    expect(details.closest("details")).not.toHaveAttribute("open");
  });

  it("gives the health state a text label and a live region", () => {
    renderSection();
    const health = screen.getByTestId("backup-health");
    // Colour is never the only carrier: the state is in the text.
    expect(health.textContent?.trim()).toBe("Healthy");
    expect(health).toHaveAttribute("aria-live", "polite");
  });

  it("labels every history row's outcome in words", () => {
    renderSection({
      history: [run(), run({ id: "f2", status: "failed", stage: "r2-write" })],
    });
    const history = screen.getByTestId("backup-history");
    expect(history).toHaveTextContent("Successful");
    expect(history).toHaveTextContent("Failed");
  });
});

/* -------------------------------------------------------------------------- */
/* Narrow widths                                                              */
/* -------------------------------------------------------------------------- */

describe("the mobile layout", () => {
  it("renders history as a list of rows, not a table", () => {
    // A desktop table forced onto a 320px phone is either horizontally scrolling
    // or illegible, so there is deliberately no table element here at all.
    renderSection({ history: [run(), run({ id: "second" })] });
    expect(screen.queryByRole("table")).toBeNull();
    const list = screen.getByTestId("backup-history");
    expect(list.tagName).toBe("UL");
    expect(list.querySelectorAll("li")).toHaveLength(2);
  });

  it("keeps every history row's facts labelled, so a stacked layout still reads", () => {
    renderSection({ history: [run()] });
    const history = screen.getByTestId("backup-history");
    // `dt`/`dd` pairs, so the stacked phone layout keeps "Size 1.42 MB" together
    // instead of leaving a bare number.
    expect(history.querySelectorAll("dt").length).toBeGreaterThanOrEqual(2);
    expect(history).toHaveTextContent("Size");
    expect(history).toHaveTextContent("Kind");
  });

  it("puts the important state before the secondary metadata", () => {
    renderSection({ history: [run()] });
    const item = screen.getByTestId("backup-history").querySelector("li");
    const head = item?.querySelector(".dh-backup-history__head");
    const facts = item?.querySelector(".dh-backup-history__facts");
    expect(head).not.toBeNull();
    expect(facts).not.toBeNull();
    // The outcome pill precedes size/duration in DOM order, which is also
    // reading order for a screen reader and visual order on a phone.
    expect(
      head!.compareDocumentPosition(facts!) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});

/* -------------------------------------------------------------------------- */

describe("history parsing at the boundary", () => {
  it("renders only the runs that validated", () => {
    const history = parseBackupHistory({
      available: true,
      runs: [run(), { id: "" }, run({ id: "ok-2" })],
    });
    renderSection({ history });
    expect(
      screen.getByTestId("backup-history").querySelectorAll("li"),
    ).toHaveLength(2);
  });
});
