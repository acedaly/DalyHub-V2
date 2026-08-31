/**
 * TODAY-01 / DS-09 — Today's registry-discovered command contributions.
 *
 * Honest, fixture-free NAVIGATION commands (ADR-024 §24.15): they open Today, or
 * the Waiting sub-view. Both reuse the validated DS-08 `SearchResultTarget` route
 * contract — no bespoke navigation type — and neither persists anything.
 *
 * "Focus Quick Capture" was retired with the Today redesign. It navigated to
 * `/today?capture=1`, which scrolled to and focused a Quick Capture WIDGET on the
 * dashboard; that widget is gone, because capture belongs to the ONE global `+`
 * and Today should not offer a second entry to it. Nothing was lost from the
 * palette: every module still contributes its own "New …" / "Capture …" command,
 * and those open the same shared capture sheet the `+` opens.
 *
 * Because these are declarative navigations, they carry no `run` handler and never
 * cross the server execution boundary — the palette navigates to them directly.
 */

import type { CommandContribution } from "~/kernel/modules";

import { WAITING_HREF, waitingFollowUpHref } from "./waiting-destination";

export const todayCommands: readonly CommandContribution[] = [
  {
    id: "today.open",
    title: "Go to Today",
    subtitle: "The calm daily home",
    keywords: ["today", "home", "dashboard", "focus"],
    kind: "navigate",
    target: { kind: "route", to: "/today" },
  },
  {
    id: "today.open_waiting",
    title: "Open Waiting",
    subtitle: "Tasks blocked on someone or something else",
    keywords: ["waiting", "blocked", "delegated", "waiting for", "stuck"],
    kind: "navigate",
    target: { kind: "route", to: WAITING_HREF },
  },
  {
    /*
     * V2.7 RECALL-03 — the commitment, one interaction from the palette.
     *
     * A DECLARATIVE navigation like its neighbour: the destination is the same
     * Waiting surface narrowed by the one `followUp` filter dimension, so this
     * command adds a shortcut and not a private query. "Due" is resolved
     * SERVER-side against the owner's calendar day, which is what lets a static
     * route string mean "today" without the palette knowing what day it is.
     */
    id: "today.open_follow_ups_due",
    title: "Open follow-ups due",
    subtitle: "Delegated work you said you would chase by today",
    keywords: [
      "follow up",
      "follow-up",
      "chase",
      "due",
      "delegated",
      "waiting",
      "commitment",
    ],
    kind: "navigate",
    target: { kind: "route", to: waitingFollowUpHref("due") },
  },
];
