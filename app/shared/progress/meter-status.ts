/**
 * POLISH-01 — what a METER is allowed to say.
 *
 * DalyHub has two colour systems and they answer different questions:
 *
 *   IDENTITY  — *what is this?*   The sixteen-slot ramp (IDENTITY-01). A glyph
 *               tile, an identity dot, a legend swatch, a chart series.
 *   STATUS    — *how is it going?* The feedback ramp. A meter, an attention
 *               dot, a health chip.
 *
 * IDENTITY-01 pointed every progress fill in the product at `--dh-identity`,
 * and that is the sentence above with the wrong half in it. A Goal reading
 * "60% — Ahead" drew a RED bar because the Goal's chosen colour was red; a
 * finished Project drew an orange one; a healthy Goal drew a bar the same
 * amber the product uses for "needs attention". The bar was answering "what is
 * this?" in the position where the eye reads "how is this going?".
 *
 * So a meter now takes a STATUS, and the identity ramp keeps everything it was
 * actually for — tiles, dots, marks, pills, legends and the Analytics
 * breakdowns where a colour IS a key. Nothing is removed from the identity
 * system; one misuse of it is.
 *
 * ── The ramp ────────────────────────────────────────────────────────────────
 * Deliberately the SAME five words `HealthTone` and `PillTone` already use, in
 * the same order of severity, so a card whose attention line says "3 overdue"
 * in danger cannot draw a bar in success beneath it. There is one status
 * vocabulary in DalyHub and this is a view of it, not a second one.
 *
 * `neutral` is a real answer, not a fallback for laziness: a Project with no
 * tasks, a Goal with no measurement and a count bar that measures volume
 * rather than health all have no honest status, and a neutral meter says so.
 * Guessing "success" for them is how a dashboard ends up congratulating
 * someone for work they have not started.
 *
 * Colour is never the only channel. Every surface that draws a meter also
 * states the value in words beside it and, where a status exists, names the
 * status in the attention line or the pill next to it (AGENTS.md §15).
 */

import type { BadgeTone } from "~/shared/ui/Badge";

/**
 * The four things a meter can say, plus `info` for the rare surface that
 * genuinely means "noteworthy, not good or bad".
 *
 * A strict subset of `BadgeTone`: `accent` is missing on purpose. `accent` is
 * the application's brand colour, and a bar painted in the brand is a bar that
 * has not been asked the question.
 */
export const METER_STATUSES = [
  "neutral",
  "success",
  "info",
  "warning",
  "danger",
] as const;

export type MeterStatus = (typeof METER_STATUSES)[number];

/**
 * Narrow any tone the product already computed onto the meter ramp.
 *
 * `accent` and a missing tone both become `neutral` — the honest answer when
 * the value is identity or absent rather than a judgement.
 */
export function meterStatusFromTone(
  tone: BadgeTone | null | undefined,
): MeterStatus {
  if (tone == null || tone === "accent") return "neutral";
  return tone;
}

/**
 * The DOM attribute a meter's container carries.
 *
 * Returned as a spreadable object for the same reason `identityAttribute` is:
 * a component should not have to decide whether to emit the attribute at all.
 * `neutral` emits nothing, so the CSS default IS the neutral paint and there is
 * one less rule to keep in sync.
 */
export function meterStatusAttribute(status: MeterStatus | null | undefined): {
  readonly "data-meter-status"?: MeterStatus;
} {
  if (status == null || status === "neutral") return {};
  return { "data-meter-status": status };
}
