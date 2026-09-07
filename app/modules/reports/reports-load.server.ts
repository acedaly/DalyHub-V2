/**
 * V2.13 RPT-04 — the Reports loaders.
 *
 * ## The collection executes NOTHING
 *
 * `/reports` lists DEFINITIONS: the six built-ins, which are code and cost no
 * read at all, and the owner's saved rows, which are one bounded statement.
 * Opening Reports must never mean running six reports before first paint — the
 * home would be the most expensive route in the product to draw thumbnails of
 * questions nobody asked. A report executes when it is OPENED.
 *
 * ## Nothing here logs a result
 *
 * A Reports route logs a source key, a shape and a duration. No amount, no
 * payee, no group label and no row value — the line `finance-facts.server.ts`
 * holds, held here too.
 */

import type { AuthenticatedSession } from "~/kernel/auth";
import { DEFAULT_APP_PREFERENCES } from "~/kernel/preferences";
import { MAX_SAVED_VIEWS_PER_KIND } from "~/kernel/views";
import {
  BUILT_IN_REPORTS,
  REPORT_FILTER_LABELS,
  REPORT_INCOMPATIBILITY_MESSAGES,
  findBuiltInReport,
  parseReportDefinition,
  reportMeasure,
  serialiseReportDefinition,
  type ReportConfig,
  type ReportDefinition,
} from "~/kernel/reports";
import { runReport } from "~/platform/reports/report-execution.server";
import {
  resolveAuthenticatedWorkspaceScope,
  type WorkspaceScope,
  type WorkspaceScopeEnv,
} from "~/platform/workspaces";
import { ownerCalendarIso } from "~/shared/datetime";

import {
  buildReportControls,
  type ReportFilterVocabulary,
} from "./reports-controls";
import { paramsFromConfig, definitionFromParams } from "./reports-url-state";
import {
  questionWords,
  serialiseReportResult,
  type ReportPageData,
  type ReportsHomeData,
  type SerializedReportEntry,
} from "./reports-view";

interface LoaderInput {
  readonly env: WorkspaceScopeEnv;
  readonly session: AuthenticatedSession;
  readonly request: Request;
}

/* -------------------------------------------------------------------------- */
/* The collection                                                              */
/* -------------------------------------------------------------------------- */

/** ONE statement: the owner's saved definitions. Built-ins cost nothing. */
export async function loadReportsHome(
  input: LoaderInput,
): Promise<ReportsHomeData> {
  const builtIns = BUILT_IN_REPORTS.map((builtIn): SerializedReportEntry => ({
    id: builtIn.id,
    title: builtIn.title,
    question: builtIn.question,
    href: `/reports/${builtIn.id}`,
    builtIn: true,
    needs:
      builtIn.requiredFilter === null
        ? null
        : REPORT_FILTER_LABELS[builtIn.requiredFilter],
    incompatible: null,
  }));

  try {
    const scope = await resolveAuthenticatedWorkspaceScope(
      input.env,
      input.session,
    );
    const saved = await scope.reports.list(input.session.user.subject);
    return {
      builtIns,
      saved: saved.map((view): SerializedReportEntry => {
        const definition = view.config;
        return {
          id: view.id,
          title: view.name,
          question: definition.ok
            ? questionWords(definition.config)
            : "Saved by a different version of DalyHub",
          href: `/reports/${view.id}`,
          builtIn: false,
          needs: null,
          incompatible: definition.ok
            ? null
            : REPORT_INCOMPATIBILITY_MESSAGES[definition.reason],
        };
      }),
      savedLimit: MAX_SAVED_VIEWS_PER_KIND,
      failed: false,
    };
  } catch {
    // The built-ins are code, so they still render: a failed read of the SAVED
    // list must not take the whole surface down.
    return {
      builtIns,
      saved: [],
      savedLimit: MAX_SAVED_VIEWS_PER_KIND,
      failed: true,
    };
  }
}

/* -------------------------------------------------------------------------- */
/* One report                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Load and EXECUTE one report.
 *
 * `reportId` addresses a saved row or a built-in; without one, the definition
 * comes entirely from the URL (the builder's own address). In every case the
 * definition is parsed through the same total codec, so a hand-edited parameter
 * and a corrupt row reach the same honest refusal.
 */
export async function loadReport(
  input: LoaderInput & { readonly reportId?: string },
): Promise<ReportPageData> {
  const url = new URL(input.request.url);
  const ownerId = input.session.user.subject;
  const builtIn = findBuiltInReport(input.reportId);

  const empty = (
    over: Partial<ReportPageData> & Pick<ReportPageData, "title">,
  ): ReportPageData => ({
    reportId: input.reportId ?? null,
    question: "",
    builtIn: builtIn !== null,
    modified: false,
    query: url.searchParams.toString(),
    controls: [],
    result: null,
    refusal: null,
    incompatible: null,
    needs: null,
    todayIso: ownerCalendarIso(new Date(), DEFAULT_APP_PREFERENCES.timezone),
    ...over,
  });

  let scope: WorkspaceScope;
  try {
    scope = await resolveAuthenticatedWorkspaceScope(input.env, input.session, {
      warmOwnerPreferences: true,
    });
  } catch {
    return empty({
      title: builtIn?.title ?? "Report",
      refusal:
        "This report could not be read just now. Nothing in your workspace has changed — try again in a moment.",
    });
  }

  const preferences = await scope.appPreferences
    .get(ownerId)
    .catch(() => DEFAULT_APP_PREFERENCES);
  const todayIso = ownerCalendarIso(new Date(), preferences.timezone);

  // The stored row, when this URL addresses one. A built-in id never reaches
  // storage: it is not an id the repository could hold.
  const stored =
    input.reportId !== undefined && builtIn === null
      ? await scope.reports.get(ownerId, input.reportId).catch(() => null)
      : null;

  if (input.reportId !== undefined && builtIn === null && stored === null) {
    return empty({
      title: "Report",
      todayIso,
      refusal:
        "That report is no longer available. It may have been deleted, or it belongs to another workspace.",
    });
  }

  const title = stored?.name ?? builtIn?.title ?? "New report";

  /*
   * Where the definition comes from, in order:
   *   1. the URL, when it carries one — the builder's own state, and what a
   *      "Save as new report" would store;
   *   2. the stored row;
   *   3. the built-in's code definition.
   * A saved report opened WITHOUT parameters therefore answers its stored
   * question; opened WITH them it answers the URL's, and says it is modified.
   */
  const fromUrl = url.searchParams.has("src")
    ? definitionFromParams(url.searchParams)
    : null;
  const base: ReportDefinition | null =
    fromUrl ??
    stored?.config ??
    (builtIn ? parseReportDefinition(builtIn.config) : null);

  if (base === null) {
    return empty({ title, todayIso });
  }

  if (!base.ok) {
    // A built-in that needs a filter the workspace supplies is not "broken":
    // it is a question waiting to be completed, and it says which part.
    if (builtIn?.requiredFilter && fromUrl === null) {
      return empty({
        title,
        todayIso,
        needs: REPORT_FILTER_LABELS[builtIn.requiredFilter],
        question: builtIn.question,
      });
    }
    return empty({
      title,
      todayIso,
      /*
       * The two ways a definition becomes unreadable need different sentences.
       * A STORED one was written by a different build, and the owner has lost
       * nothing — the bytes are untouched. A URL one was typed or edited, and
       * the honest answer is that the question itself could not be understood.
       * Neither is answered approximately.
       */
      incompatible:
        fromUrl !== null
          ? "That question could not be understood, so DalyHub has not guessed at it. Build it again with the controls."
          : REPORT_INCOMPATIBILITY_MESSAGES[base.reason],
    });
  }

  const config = base.config;
  const vocabularies = await readVocabularies(scope, config);
  const execution = await runReport(config, {
    scope,
    todayIso,
    timeZone: preferences.timezone,
    hiddenModuleIds: preferences.navigation.hiddenModuleIds,
  });

  return {
    reportId: input.reportId ?? null,
    title,
    question: questionWords(config),
    builtIn: builtIn !== null,
    modified:
      stored !== null &&
      fromUrl !== null &&
      serialiseReportDefinition(fromUrl) !==
        serialiseReportDefinition(stored.config),
    query: paramsFromConfig(config).toString(),
    controls: buildReportControls({ config, todayIso, vocabularies }),
    result: execution.ok ? serialiseReportResult(execution.result) : null,
    refusal: execution.ok ? null : execution.refusal.message,
    incompatible: null,
    needs: null,
    todayIso,
  };
}

/* -------------------------------------------------------------------------- */
/* Filter vocabularies                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The id-shaped filter vocabularies the builder can offer for THIS definition.
 *
 * Read only for the source in front of the owner, and only the ones a control
 * can populate cheaply — at most two bounded statements, and none at all for a
 * source whose filters are closed vocabularies. A filter with no vocabulary is
 * simply not offered; it stays expressible in the URL, so a shared link keeps
 * working when the offer is narrower than the vocabulary.
 *
 * A failed vocabulary read costs the CONTROL, never the report: the figures do
 * not depend on it.
 */
async function readVocabularies(
  scope: WorkspaceScope,
  config: ReportConfig,
): Promise<readonly ReportFilterVocabulary[]> {
  const measure = reportMeasure(config.measure);
  if (!measure) return [];

  try {
    if (config.source === "finance") {
      const [categories, accounts] = await Promise.all([
        scope.finance.listCategories(),
        scope.finance.listAccountsWithBalances({ includeClosed: true }),
      ]);
      return [
        {
          key: "categoryId",
          label: REPORT_FILTER_LABELS.categoryId,
          options: categories.map((category) => ({
            id: category.id,
            title: category.name,
          })),
        },
        {
          key: "accountId",
          label: REPORT_FILTER_LABELS.accountId,
          // A balance is the whole of an account and never appears in a
          // control label; only the name does.
          options: accounts.map((entry) => ({
            id: entry.account.id,
            title: entry.account.title,
          })),
        },
      ];
    }

    if (config.source === "goals") {
      const goals = await scope.goals.listGoals({ limit: 100 });
      return [
        {
          key: "goalId",
          label: REPORT_FILTER_LABELS.goalId,
          options: goals.items.map((goal) => ({
            id: goal.id,
            title: goal.title,
          })),
        },
      ];
    }
  } catch {
    return [];
  }
  return [];
}
