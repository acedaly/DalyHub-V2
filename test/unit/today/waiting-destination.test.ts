/**
 * V2.7 RECALL-03 — the Waiting surface's address, written once and read once.
 *
 * Three places inside the Today module have to agree about it: the attention
 * rail writes the link, the palette contributes a command that opens it, and the
 * route decodes what arrives. Stating the path and the parameter three times is
 * how a filtered destination quietly stops being filtered, so this asserts the
 * round trip that keeps them one.
 */

import { describe, expect, it } from "vitest";

import { TASK_FOLLOW_UP_STATES } from "~/kernel/tasks";
import todayModule from "~/modules/today/module";
import {
  WAITING_CURSOR_PARAM,
  WAITING_FOLLOW_UP_PARAM,
  WAITING_HREF,
  parseWaitingFollowUp,
  waitingFollowUpHref,
} from "~/modules/today/waiting-destination";

const read = (href: string) =>
  new URL(href, "https://dalyhub.test").searchParams.get(
    WAITING_FOLLOW_UP_PARAM,
  );

describe("the follow-up destination round-trips", () => {
  it("writes a link the route decodes back to the same state", () => {
    for (const state of TASK_FOLLOW_UP_STATES) {
      const href = waitingFollowUpHref(state);
      expect(href.startsWith(`${WAITING_HREF}?`)).toBe(true);
      expect(parseWaitingFollowUp(read(href))).toBe(state);
    }
  });

  it("uses the SAME parameter name the Tasks collection uses", () => {
    // One vocabulary, one parameter: `/tasks?followUp=due` and
    // `/today/waiting?followUp=due` mean the same thing because they say it the
    // same way.
    expect(WAITING_FOLLOW_UP_PARAM).toBe("followUp");
    expect(WAITING_CURSOR_PARAM).toBe("cursor");
  });

  it("degrades an unknown or absent value to NO filter rather than an error", () => {
    expect(parseWaitingFollowUp("whenever")).toBeUndefined();
    expect(parseWaitingFollowUp("")).toBeUndefined();
    expect(parseWaitingFollowUp(null)).toBeUndefined();
    expect(parseWaitingFollowUp(undefined)).toBeUndefined();
    // A crafted value can only ever name a member of the published vocabulary.
    expect(parseWaitingFollowUp("due; DROP TABLE tasks")).toBeUndefined();
  });
});

describe("the palette reaches the commitment without a private query", () => {
  const navigationCommand = (id: string) => {
    const command = todayModule.commands?.find((entry) => entry.id === id);
    // A DECLARATIVE navigation carries a validated route target and no `run`
    // handler, so it never crosses the server execution boundary.
    expect(command?.kind).toBe("navigate");
    return command?.kind === "navigate" ? command : undefined;
  };

  it("contributes a declarative navigation to the FILTERED surface", () => {
    expect(navigationCommand("today.open_follow_ups_due")?.target).toEqual({
      kind: "route",
      to: waitingFollowUpHref("due"),
    });
  });

  it("keeps the unfiltered Waiting command beside it", () => {
    expect(navigationCommand("today.open_waiting")?.target).toEqual({
      kind: "route",
      to: WAITING_HREF,
    });
  });

  it("adds no navigation entry — Waiting is still palette-and-rail only", () => {
    // The deliberate no-nav-entry decision stands (TODAY-03, restated by
    // RECALL-03): the surface is reached from the attention rail and the
    // palette, never from the primary navigation.
    const waitingRoutes = (todayModule.routes ?? []).filter(
      (route) => route.path === "today/waiting",
    );
    expect(waitingRoutes).toHaveLength(1);
    // A route earns a sidebar entry by carrying `meta.navLabel`; this one never
    // has, and RECALL-03 did not give it one.
    expect(waitingRoutes[0]?.meta?.navLabel).toBeUndefined();
  });
});
