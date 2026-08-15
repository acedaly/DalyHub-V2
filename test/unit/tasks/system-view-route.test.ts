/**
 * The named Tasks destinations — `/inbox` and `/upcoming`.
 *
 * Both are the `/tasks` surface under a built-in system view. They own no loader
 * and no query of their own: they rewrite their request into the query string
 * that selects the view and hand it to the one `/tasks` loader, which is what
 * keeps a single task query path (ADR-043) while still giving the sidebar a real
 * place to point at.
 *
 * What matters, and what these pin:
 *
 *   - the view's defaults are applied, so `/inbox` IS the Inbox;
 *   - a parameter the owner set explicitly WINS, so sorting or filtering inside
 *     Inbox keeps you in Inbox rather than snapping back to its defaults;
 *   - the PATH is preserved, because a redirect to `/tasks?…` would leave the
 *     rail highlighting Tasks and lose the destination entirely;
 *   - an unknown view degrades to the standard workspace rather than throwing.
 */

import { describe, expect, it } from "vitest";

import { findTaskSystemView } from "~/kernel/task-views";
import { requestForSystemView } from "~/modules/tasks/routes/system-view";
import {
  paramsFromConfig,
  TASKS_PARAMS,
} from "~/modules/tasks/tasks-url-state";

function rewrite(url: string, viewId: string): URL {
  return new URL(requestForSystemView(new Request(url), viewId).url);
}

describe("requestForSystemView", () => {
  it("applies the system view's own configuration", () => {
    const applied = rewrite("https://dalyhub.test/inbox", "inbox");
    const expected = paramsFromConfig(findTaskSystemView("inbox")!.config);

    for (const [key, value] of expected) {
      expect(applied.searchParams.get(key), key).toBe(value);
    }
    // …and names the view, so the switcher reports Inbox rather than "Custom".
    expect(applied.searchParams.get(TASKS_PARAMS.savedView)).toBe("inbox");
  });

  it("keeps the route's own path", () => {
    // The whole reason these are routes rather than a redirect: the sidebar's
    // current row and the address bar both follow the pathname.
    expect(rewrite("https://dalyhub.test/inbox", "inbox").pathname).toBe(
      "/inbox",
    );
    expect(rewrite("https://dalyhub.test/upcoming", "upcoming").pathname).toBe(
      "/upcoming",
    );
  });

  it("lets an explicit parameter beat the view's default", () => {
    // Sorting within Inbox is still Inbox. If the view's defaults overwrote
    // what the owner asked for, every control on the page would be inert.
    const applied = rewrite(
      `https://dalyhub.test/inbox?${TASKS_PARAMS.sort}=title`,
      "inbox",
    );
    expect(applied.searchParams.get(TASKS_PARAMS.sort)).toBe("title");
  });

  it("preserves a parameter the view says nothing about", () => {
    const applied = rewrite(
      "https://dalyhub.test/upcoming?drawer=task%3At-1",
      "upcoming",
    );
    expect(applied.searchParams.get("drawer")).toBe("task:t-1");
  });

  it("degrades to the untouched request for an unknown view", () => {
    // Matches how a deleted default view already behaves in the /tasks loader:
    // the owner lands on the standard workspace, not on an error.
    const applied = rewrite("https://dalyhub.test/inbox?a=1", "nope");
    expect(applied.pathname).toBe("/inbox");
    expect(applied.searchParams.get("a")).toBe("1");
    expect(applied.searchParams.get(TASKS_PARAMS.savedView)).toBeNull();
  });
});
