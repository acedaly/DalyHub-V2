/**
 * V2.13 RPT-04 — the builder, from a blank definition (`/reports/new`).
 *
 * It REDIRECTS to `/reports/view` carrying the first source's first measure and
 * that measure's own declared defaults. There is no second screen and no second
 * set of defaults: "new" is a starting definition, and the definition already
 * has one place it comes from.
 */

import { redirect } from "react-router";

import { REPORT_SOURCE_DEFINITIONS } from "~/kernel/reports";

import { paramsFromConfig } from "../reports-url-state";
import type { Route } from "./+types/new";

export async function loader(_args: Route.LoaderArgs) {
  const measure = REPORT_SOURCE_DEFINITIONS[0].measures[0];
  const params = paramsFromConfig({
    version: 1,
    source: measure.source,
    measure: measure.key,
    window: measure.defaultWindow,
    breakdown: measure.defaultBreakdown,
    filters: {},
    sort: measure.defaultSort,
    visual: measure.defaultVisual,
  });
  return redirect(`/reports/view?${params.toString()}`);
}
