/**
 * V2.7 RECALL-03 — the ONE description of the Waiting surface's address.
 *
 * Three places inside the Today module need to agree about it: the attention
 * rail writes a link to it, the palette contributes a command that opens it, and
 * the route itself decodes what arrives. Stating the path and the parameter name
 * three times is how a filtered destination quietly stops being filtered, so
 * they are stated once, here, and the round trip is asserted by test.
 *
 * The follow-up VALUE is not invented here either: it is a member of the kernel's
 * one declarative {@link TaskFollowUpState} vocabulary, validated on the way in
 * exactly as `/tasks` validates its own filter parameters. A crafted
 * `?followUp=` can therefore only ever name a state the repository already knows
 * how to answer, or nothing at all.
 *
 * The absence of a navigation entry for Waiting is deliberate and unchanged
 * (`routes.manifest.ts`): the surface is reached from the attention rail and the
 * command palette, and this file is what both of them reach it THROUGH.
 */

import { TASK_FOLLOW_UP_STATES, type TaskFollowUpState } from "~/kernel/tasks";

/** The Waiting surface's path. */
export const WAITING_HREF = "/today/waiting";

/** The URL parameter carrying the follow-up filter, matching `/tasks`' own name. */
export const WAITING_FOLLOW_UP_PARAM = "followUp";

/** The URL parameter carrying a keyset page cursor, matching every collection. */
export const WAITING_CURSOR_PARAM = "cursor";

/** The Waiting surface, narrowed to one follow-up state. */
export function waitingFollowUpHref(state: TaskFollowUpState): string {
  return `${WAITING_HREF}?${WAITING_FOLLOW_UP_PARAM}=${state}`;
}

/**
 * Narrow an untrusted `?followUp=` value to a known state, or `undefined`.
 *
 * Total and lenient, exactly like the Tasks configuration codec: an unknown or
 * malformed value degrades to "no filter" rather than to an error page.
 */
export function parseWaitingFollowUp(
  value: string | null | undefined,
): TaskFollowUpState | undefined {
  return typeof value === "string" &&
    (TASK_FOLLOW_UP_STATES as readonly string[]).includes(value)
    ? (value as TaskFollowUpState)
    : undefined;
}
