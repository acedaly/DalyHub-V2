/**
 * V2.16 CONSOL-03 — the ONE per-Task href, and the contract it has to satisfy.
 *
 * DEBT-243: nine call sites across four files built a per-Task link by hand,
 * pointing `/tasks` at a search parameter the Tasks collection has never read.
 * Every one of them landed on the collection's default view. It survived five
 * releases because the one test that covered it pinned the STRING rather than
 * the behaviour — the claim was checkable in principle and not in fact.
 *
 * So this file does not pin a string. It asserts the two properties that make
 * the link work, against the Drawer's own URL reader:
 *
 *   1. the href DECODES to the drawer key the Task drawer opens on;
 *   2. it preserves nothing else, invents no other parameter, and survives an
 *      id that needs encoding.
 *
 * The browser half — that a `/tasks?drawer=task:<id>` URL genuinely opens the
 * Task — is already proven end to end by `e2e/dhds-11-drag-reorder.spec.ts`
 * (which navigates to exactly that shape) and `e2e/command-palette.spec.ts`
 * (which deep-links a Task drawer). Adding a third journey for it would be
 * paying the gate twice for one claim.
 */

import { describe, expect, it } from "vitest";

import { taskDrawerHref } from "~/kernel/task-views";
import { readDrawerStack } from "~/shared/drawer/drawer-url";

/** Read a built href back the way the Drawer provider does. */
function drawerStackOf(href: string): readonly string[] {
  const query = href.slice(href.indexOf("?") + 1);
  return readDrawerStack(new URLSearchParams(query));
}

describe("taskDrawerHref", () => {
  it("decodes to the drawer key the Task drawer opens on", () => {
    expect(drawerStackOf(taskDrawerHref("tsk_123"))).toEqual(["task:tsk_123"]);
  });

  it("targets the Tasks collection and nothing else", () => {
    const href = taskDrawerHref("tsk_123");
    expect(href.startsWith("/tasks?")).toBe(true);
    const params = new URLSearchParams(href.slice(href.indexOf("?") + 1));
    expect([...params.keys()]).toEqual(["drawer"]);
  });

  it("carries an id that needs encoding, and still decodes", () => {
    // Ids are generated and safe, but a helper that only works for safe input
    // is a helper with an undocumented precondition.
    const awkward = "a b&c=d";
    expect(drawerStackOf(taskDrawerHref(awkward))).toEqual([`task:${awkward}`]);
  });

  it("writes no percent-encoding for an ordinary id", () => {
    /*
     * The colon stays bare. It is legal in a query value, every drawer key the
     * product already writes carries one, and the Review insight model forbids
     * a `%` in its serialised shape for an unrelated and good reason — no
     * percentages, because a percentage reads as a score. A helper that put one
     * there would have failed that rule for a formatting choice.
     */
    expect(taskDrawerHref("tsk_123")).toBe("/tasks?drawer=task:tsk_123");
  });
});
