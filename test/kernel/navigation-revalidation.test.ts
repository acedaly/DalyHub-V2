/**
 * PERF-01 — the revalidation contract, pinned.
 *
 * A navigation that changes a search parameter is still a navigation, and React
 * Router re-runs every matched loader for one unless the route says otherwise.
 * On DalyHub the most common such navigation is opening a Drawer: `?drawer=…`.
 * Before PWA-12 that re-ran the whole shell; before this item it also re-ran the
 * whole of Today — thirty-eight statements across five round trips, to produce a
 * byte-for-byte identical payload, twice per Drawer (open, then close).
 *
 * These tests assert the rule at its two ends: that the skip HAPPENS for the
 * case it is for, and — the half that took two regressions to learn — that it
 * does NOT happen for a submission, for an explicit `revalidate()`, or for a
 * real move between pages. A rule written as "same pathname → skip" would pass
 * the first assertion and fail every one of the others, and the product symptom
 * would be a task created, renamed or completed that never appears.
 *
 * `isSameDocumentParameterChange` is additionally scoped to a device that is
 * OFFLINE, which is not a performance decision and is not this item's: declining
 * online lost the result of a revalidation that a subsequent navigation
 * superseded. The offline state is set explicitly here rather than assumed, so
 * these tests state which side of that they are exercising.
 */

import { afterEach, describe, expect, it } from "vitest";
import type { ShouldRevalidateFunctionArgs } from "react-router";

import { shouldRevalidate as shellShouldRevalidate } from "~/routes/app-shell";
import { shouldRevalidate as todayShouldRevalidate } from "~/modules/today/routes/index";
import { shouldRevalidate as tomorrowShouldRevalidate } from "~/modules/today/routes/tomorrow";
import { shouldRevalidate as upcomingShouldRevalidate } from "~/modules/today/routes/upcoming";
import { shouldRevalidate as tasksShouldRevalidate } from "~/modules/tasks/routes/index";
import { setRevalidationOffline } from "~/shared/router/revalidation";

type Rule = (args: ShouldRevalidateFunctionArgs) => boolean;

/** The routes that decline a re-read for a parameter they do not consult. */
const DRAWER_ROUTES: readonly (readonly [string, Rule])[] = [
  ["app shell", shellShouldRevalidate as Rule],
  ["/today", todayShouldRevalidate as Rule],
  ["/today/tomorrow", tomorrowShouldRevalidate as Rule],
  ["/today/upcoming", upcomingShouldRevalidate as Rule],
  ["/tasks", tasksShouldRevalidate as Rule],
];

/** A `shouldRevalidate` call, with only the fields these rules read. */
function args(
  current: string,
  next: string,
  extra: Partial<ShouldRevalidateFunctionArgs> = {},
): ShouldRevalidateFunctionArgs {
  return {
    currentUrl: new URL(current),
    nextUrl: new URL(next),
    currentParams: {},
    nextParams: {},
    defaultShouldRevalidate: true,
    ...extra,
  } as ShouldRevalidateFunctionArgs;
}

afterEach(() => {
  setRevalidationOffline(false);
});

describe("PERF-01 — opening a Drawer does not re-read the page", () => {
  it("declines the re-read for a Drawer parameter, offline", () => {
    setRevalidationOffline(true);
    for (const [name, rule] of DRAWER_ROUTES) {
      expect([
        name,
        rule(
          args(
            "https://hub.test/today",
            "https://hub.test/today?drawer=task%3At-1",
          ),
        ),
      ]).toEqual([name, false]);
    }
  });

  it("still re-reads for a SUBMISSION", () => {
    setRevalidationOffline(true);
    for (const [name, rule] of DRAWER_ROUTES) {
      expect([
        name,
        rule(
          args(
            "https://hub.test/today",
            "https://hub.test/today?drawer=task%3At-1",
            { formMethod: "POST" },
          ),
        ),
      ]).toEqual([name, true]);
    }
  });

  it("still re-reads for an EXPLICIT revalidation (an identical url)", () => {
    /*
     * The case that makes the difference between a skip and a bug. Every
     * mutation in DalyHub asks its surface to catch up with
     * `useRevalidator().revalidate()`, which arrives here with the SAME url —
     * so a rule that only compared pathnames would silence exactly the re-read
     * the owner is waiting for.
     */
    setRevalidationOffline(true);
    for (const [name, rule] of DRAWER_ROUTES) {
      expect([
        name,
        rule(
          args(
            "https://hub.test/today?drawer=task%3At-1",
            "https://hub.test/today?drawer=task%3At-1",
          ),
        ),
      ]).toEqual([name, true]);
    }
  });

  it("still re-reads for a real move between pages", () => {
    setRevalidationOffline(true);
    for (const [name, rule] of DRAWER_ROUTES) {
      expect([
        name,
        rule(args("https://hub.test/today", "https://hub.test/tasks")),
      ]).toEqual([name, true]);
    }
  });

  it("re-reads ONLINE, which is where the skip is deliberately not taken", () => {
    /*
     * Not a performance property — the opposite of one, and recorded as such.
     * Declining online looked free, and it lost the result of a revalidation
     * that a following navigation superseded: create a task, close the Drawer,
     * and the list stayed stale for good. The skip is scoped to the case that
     * genuinely needs it, where the request could not have succeeded anyway.
     */
    setRevalidationOffline(false);
    for (const [name, rule] of DRAWER_ROUTES) {
      expect([
        name,
        rule(
          args(
            "https://hub.test/today",
            "https://hub.test/today?drawer=task%3At-1",
          ),
        ),
      ]).toEqual([name, true]);
    }
  });
});

describe("PERF-01 — /tasks re-reads when the view it is showing changes", () => {
  it("re-reads when a filter it consults moves, even offline", () => {
    setRevalidationOffline(true);
    expect(
      tasksShouldRevalidate(
        args(
          "https://hub.test/tasks?view=active",
          "https://hub.test/tasks?view=completed",
        ),
      ),
    ).toBe(true);
  });

  it("declines when only a parameter it never reads moves", () => {
    setRevalidationOffline(true);
    expect(
      tasksShouldRevalidate(
        args(
          "https://hub.test/tasks?view=active",
          "https://hub.test/tasks?view=active&drawer=task%3At-1",
        ),
      ),
    ).toBe(false);
  });
});
