/**
 * V2.13 RPT-04 — one report's rows, as CSV (`/reports/export`).
 *
 * ── Why this exists, and why it is the ONLY output format ──────────────────
 * Answering a question is often the step before taking it somewhere else, and
 * the rows are already computed, already formatted and already bounded — so a
 * CSV of the result the owner is looking at costs one route and no new
 * arithmetic. Anything beyond it does not: a PDF is a layout engine, a print
 * designer is a product of its own, and V2.13 has neither.
 *
 * ── It is the SAME definition, executed the SAME way ───────────────────────
 * The definition comes from the query string through the same total codec the
 * page uses, and it runs through the same executor. There is no second
 * execution path, so a downloaded figure and the figure on screen cannot
 * differ — which is the whole reason the format is worth having.
 *
 * ── The currency travels with the number ───────────────────────────────────
 * A money result has one column per block and a `currency` column beside the
 * value, because a spreadsheet is exactly where two currencies would otherwise
 * be summed by whoever opens it. A row with NO reading is written empty rather
 * than as `0`, for the reason the whole result type exists.
 *
 * ── It is a download, and downloads are private ────────────────────────────
 * Behind the same authenticated boundary as every other route, `no-store`, and
 * named after the report rather than after its contents — a filename is visible
 * in a download shelf, and an amount must not be.
 */

import { env } from "cloudflare:workers";

import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { csvField, reportQuestion } from "~/kernel/reports";
import { runReport } from "~/platform/reports/report-execution.server";
import { requireAuthenticatedSession } from "~/platform/request";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

import { definitionFromParams } from "../reports-url-state";
import type { Route } from "./+types/export";

/** One CSV field, encoded by the kernel rule: quoted, and never executable. */
const field = csvField;

export async function loader({ request, context }: Route.LoaderArgs) {
  const session = requireAuthenticatedSession(context);
  const url = new URL(request.url);
  const definition = definitionFromParams(url.searchParams);
  if (!definition.ok) {
    return new Response("That question could not be understood.", {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const scope = await resolveAuthenticatedWorkspaceScope(env, session, {
    warmOwnerPreferences: true,
  });
  const preferences = await scope.appPreferences
    .get(session.user.subject)
    .catch(() => DEFAULT_APP_PREFERENCES);
  const todayIso = ownerCalendarIso(new Date(), preferences.timezone);

  const execution = await runReport(definition.config, {
    scope,
    todayIso,
    timeZone: preferences.timezone,
    hiddenModuleIds: preferences.navigation.hiddenModuleIds,
  });
  if (!execution.ok) {
    return new Response(execution.refusal.message, {
      status: 400,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const result = execution.result;
  if (result.availability !== "ok") {
    // A failed read is never an empty file: an empty CSV reads as "nothing
    // happened", which is a claim this route has no evidence for.
    return new Response(
      "These figures could not be read just now. Nothing has been changed.",
      { status: 503, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  const rows: string[] = [
    ["label", "value", "currency", "records", "period_start", "period_end"]
      .map(field)
      .join(","),
  ];
  for (const block of result.blocks) {
    for (const row of block.rows) {
      rows.push(
        [
          field(row.label),
          // `null` is NO READING and is written EMPTY, never as a zero.
          field(row.value),
          field(block.currencyCode),
          field(row.detail),
          field(row.period?.startIso ?? null),
          field(row.period?.endIso ?? null),
        ].join(","),
      );
    }
    if (block.remainder) {
      rows.push(
        [
          field(`${block.remainder.groups} others`),
          field(block.remainder.value),
          field(block.currencyCode),
          field(block.remainder.detail),
          field(null),
          field(null),
        ].join(","),
      );
    }
  }

  /*
   * The notes travel WITH the figures. A spreadsheet is exactly where an
   * approximation gets forgotten, so every qualification the surface printed is
   * in the file too — as comment rows above the data, which every spreadsheet
   * reads as text and no reader can miss.
   */
  const header = [
    `# ${reportQuestion(definition.config)}`,
    `# ${result.window.periodStart} to ${result.window.periodEnd}`,
    ...result.notes.map((note) => `# ${note.text.replace(/\r?\n/g, " ")}`),
  ].map((line) => field(line));

  const body = `${header.join("\n")}\n${rows.join("\n")}\n`;
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      // Named for the SOURCE and the measure, never for a value: a filename is
      // visible in a download shelf.
      "content-disposition": `attachment; filename="dalyhub-${definition.config.source}-${definition.config.measure}.csv"`,
      "cache-control": "no-store",
    },
  });
}
