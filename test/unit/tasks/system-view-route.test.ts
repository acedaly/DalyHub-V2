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
import { tasksDestinationTitle } from "~/modules/tasks/destination";
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

describe("the destination's own title", () => {
  /*
   * POLISH-01 — the page says which place it IS.
   *
   * Every one of the three destinations used to render "Tasks" as its `h1`
   * while the tab, the rail and the address bar all said Inbox. The mismatch
   * undoes the reason these are routes at all (see the module comment above):
   * a place an owner can be in has to be able to say its own name.
   */
  it("titles each named destination as itself", () => {
    expect(tasksDestinationTitle("/inbox")).toBe("Inbox");
    expect(tasksDestinationTitle("/upcoming")).toBe("Upcoming");
  });

  it("titles the general workspace Tasks", () => {
    expect(tasksDestinationTitle("/tasks")).toBe("Tasks");
  });

  it("degrades to the general title rather than to nothing", () => {
    // A destination added to the manifest without a title here must render a
    // real heading, not an empty one.
    expect(tasksDestinationTitle("/somewhere-new")).toBe("Tasks");
  });

  it("agrees with the navigation label each route declares", () => {
    // The rail's label and the page's heading are the same words by
    // construction, which is the whole claim this fix makes.
    for (const [path, view] of [
      ["/inbox", "inbox"],
      ["/upcoming", "upcoming"],
    ] as const) {
      expect(tasksDestinationTitle(path)).toBe(findTaskSystemView(view)!.name);
    }
  });
});
