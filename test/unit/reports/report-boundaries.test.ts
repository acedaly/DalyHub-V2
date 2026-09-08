/**
 * V2.13 — the boundaries Reports must not cross, asserted STRUCTURALLY.
 *
 * Every rule below is an ABSENCE: no AI, no dashboard, no second codec, no
 * Activity, no logged figure, no query language. A behavioural test proves the
 * absence in the cases it happened to exercise; a source assertion proves the
 * code has no way to produce one, which is the property that actually holds
 * over the next release. The same choice `search-privacy.test.ts` made for
 * Finance, and for the same reason.
 *
 * Comments are stripped before matching, so a rule written in a comment can
 * never pass for a rule enforced in code.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  REPORT_MEASURE_DEFINITIONS,
  REPORT_SOURCE_DEFINITIONS,
} from "~/kernel/reports";
import { SAVED_VIEW_KINDS } from "~/kernel/views";

const ROOTS = [
  path.join(process.cwd(), "app", "kernel", "reports"),
  path.join(process.cwd(), "app", "platform", "reports"),
  path.join(process.cwd(), "app", "modules", "reports"),
];

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? filesUnder(full) : [full];
  });
}

/** Every Reports source file, with block and line comments removed. */
function sources(): readonly {
  readonly file: string;
  readonly code: string;
}[] {
  return ROOTS.flatMap(filesUnder)
    .filter((file) => file.endsWith(".ts") || file.endsWith(".tsx"))
    .map((file) => ({
      file: path.relative(process.cwd(), file),
      code: readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/(^|[^:])\/\/.*$/gm, "$1"),
    }));
}

const FILES = sources();

describe("no AI, anywhere on a Reports code path", () => {
  it("imports nothing from the AI kernel, platform or module", () => {
    /*
     * V2.14 consumes `ReportResult`; Reports does not consume V2.14. The seam
     * is a SHAPE, and a shape costs no dependency — so an import here would
     * invert the direction that makes the figures on a report DalyHub's own.
     */
    for (const { file, code } of FILES) {
      expect(code, `${file} must not reach the AI layer`).not.toMatch(
        /from ["']~\/(kernel|platform|modules)\/ai/,
      );
      expect(code, `${file} must not name a provider`).not.toMatch(
        /anthropic|openai|completion\s*\(|generateText/i,
      );
    }
  });

  /*
   * V2.14 AMENDED the rule below, and the amendment is deliberate rather than a
   * concession.
   *
   * Until V2.14 this said "Reports offers no Explain control", because the
   * feature that would justify one did not exist and a control that does
   * nothing is the dead surface ADR-121 forbids. The feature now exists, and
   * the roadmap requires the control to live ON the report — the interpretation
   * belongs beside the figures it interprets.
   *
   * What must stay true is the thing the old assertion was protecting: Reports
   * must not IMPLEMENT an AI surface. It renders a shared component and hands
   * it two pieces of plain data (the definition, and the identity of the
   * result); it builds no prompt, names no feature, holds no fact and makes no
   * request. Delete `~/shared/ai` and the report still draws every figure.
   */
  it("implements no AI surface of its own", () => {
    for (const { file, code } of FILES) {
      expect(code, `${file} must not build an AI request`).not.toMatch(
        /\/ai\/assist|\/ai\/apply|idempotencyKey|factBlock|promptVersion/i,
      );
      expect(code, `${file} must not name an AI feature`).not.toMatch(
        /report-explanation|weekly-review-assistant|workspace-question-answer|grounded-question-answer/,
      );
    }
  });

  it("keeps every figure on the page computed without AI", () => {
    /*
     * The one AI reference Reports may hold is the shared component, rendered
     * below the result. It is checked by name so that a SECOND one — an AI
     * control on the collection, an AI-written subtitle, an AI-chosen sort —
     * fails here rather than arriving quietly.
     */
    const referencing = FILES.filter((entry) =>
      /~\/shared\/ai/.test(entry.code),
    ).map((entry) => entry.file);
    expect(referencing).toEqual(["app/modules/reports/ReportScreen.tsx"]);
  });
});

describe("no dashboard", () => {
  it("builds no grid, widget, pinboard or arrangement", () => {
    /*
     * ADR-116 decision 2: a dashboard is out of V2, and it does not sneak in
     * because several reports now exist. The words below are the ones a
     * dashboard arrives under.
     */
    for (const { file, code } of FILES) {
      /*
       * No word boundary: a dashboard arrives as `DashboardWidgetGrid` at least
       * as often as it arrives as `widget`, and the first spelling slipped past
       * a `\bwidget` pattern when this was falsified.
       */
      expect(code, `${file} must not build a dashboard`).not.toMatch(
        /widget|pinboard|dashboard|gridlayout|draggable|reportgrid|resizable/i,
      );
    }
  });

  it("never executes more than one report per surface", () => {
    /*
     * Every surface that runs a report runs exactly ONE — the page that opens
     * it, and the CSV download of the same definition. A second call in one file
     * would be a surface drawing two answers, which is the first shape of a
     * dashboard.
     */
    const module = FILES.filter((entry) =>
      entry.file.startsWith("app/modules/reports"),
    );
    for (const entry of module) {
      const calls = entry.code.match(/runReport\(/g)?.length ?? 0;
      expect(calls, `${entry.file} runs more than one report`).toBeLessThan(2);
    }
    expect(
      module.filter((entry) => entry.code.includes("runReport(")).length,
    ).toBeGreaterThan(0);
    /*
     * And the COLLECTION loader in particular runs none: opening Reports must
     * never mean running six reports before first paint. Its body is read out
     * of the file it shares with the report page's loader, so the assertion is
     * about that function rather than about the module.
     */
    const loaders = module.find((entry) =>
      entry.code.includes("export async function loadReportsHome"),
    );
    const start = loaders?.code.indexOf(
      "export async function loadReportsHome",
    );
    const end = loaders?.code.indexOf("export async function loadReport(");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start ?? 0);
    const homeBody = loaders?.code.slice(start, end) ?? "";
    expect(homeBody).toContain("scope.reports.list(");
    expect(homeBody).not.toContain("runReport(");
  });
});

describe("no query language", () => {
  it("writes no SQL and names no table or column", () => {
    /*
     * The kernel and the module never touch a store; the ADAPTERS call
     * repositories. A `SELECT` here would be the second analytics engine this
     * release exists to prevent.
     */
    for (const { file, code } of FILES) {
      expect(code, `${file} must not author SQL`).not.toMatch(
        /\bSELECT\s|\bFROM\s+[a-z_]+\b|\bGROUP\s+BY\b|db\.prepare\(/,
      );
    }
  });

  it("evaluates nothing the owner could author", () => {
    for (const { file, code } of FILES) {
      expect(code, `${file} must not evaluate a definition`).not.toMatch(
        /\beval\(|new Function\(|Function\s*\(\s*["']/,
      );
    }
  });
});

describe("no Activity, and no figure in a log", () => {
  it("records no Activity type and appends no event", () => {
    // Reading is not history — the judgement Analytics and the Review's
    // evidence already made. A saved report writes no event either, because
    // saved views do not.
    for (const { file, code } of FILES) {
      expect(code, `${file} must not append Activity`).not.toMatch(
        /activityTypes|recordActivity|appendActivity|activity\.append/,
      );
    }
  });

  it("logs no result, and no figure", () => {
    /*
     * A Reports route may log a source key, a shape and a duration. A row
     * value, a total, an amount, a payee or a group label must not reach a log
     * line — the boundary `finance-facts.server.ts` holds.
     */
    for (const { file, code } of FILES) {
      const logs = code.match(/console\.[a-z]+\([^)]*\)/g) ?? [];
      for (const line of logs) {
        expect(line, `${file} logs a figure`).not.toMatch(
          /total|value|amount|minor|payee|rows|blocks|label/i,
        );
      }
    }
  });
});

describe("one saved-view codec authority", () => {
  it("adds a KIND rather than a second persistence path", () => {
    expect(SAVED_VIEW_KINDS).toEqual(["tasks", "cross", "report"]);
  });

  it("declares exactly one codec, and no repository of its own", () => {
    const codecs = FILES.filter((entry) =>
      /:\s*SavedViewCodec</.test(entry.code),
    );
    expect(codecs.map((entry) => entry.file)).toEqual([
      "app/kernel/reports/report-codec.ts",
    ]);
    for (const { file, code } of FILES) {
      expect(code, `${file} must not build a repository`).not.toMatch(
        /class\s+\w*ReportRepository|D1ReportRepository/,
      );
    }
  });

  it("adds no migration", () => {
    /*
     * The measurement RPT-00 rests on: the `kind` column carries no CHECK, so a
     * third kind needs no schema change. A migration mentioning reports would
     * mean that measurement was wrong.
     */
    const migrations = readdirSync(path.join(process.cwd(), "migrations"));
    expect(migrations.filter((name) => /report/i.test(name))).toEqual([]);
  });
});

describe("the registry stays honest", () => {
  it("declares no filter a read cannot apply", () => {
    /*
     * The property that makes a closed vocabulary trustworthy: a filter a
     * measure DECLARES must narrow the read behind it. One that no read applies
     * computes a BROADER figure than the owner asked for and presents it under
     * their name — invisible, because a total looks the same either way.
     *
     * V2.13's completion reads take no ancestry predicate, so the Tasks measure
     * declares no filters. This asserts it rather than trusting a reader to
     * remember (see `report-source.ts` for the reasoning).
     */
    const completed = REPORT_MEASURE_DEFINITIONS.find(
      (measure) => measure.key === "completed_count",
    );
    expect(completed?.filters).toEqual([]);
  });

  it("gives every source at least one measure, and every measure a question", () => {
    for (const source of REPORT_SOURCE_DEFINITIONS) {
      expect(source.measures.length, source.key).toBeGreaterThan(0);
      expect(source.moduleId.length, source.key).toBeGreaterThan(0);
      for (const measure of source.measures) {
        expect(measure.question, measure.key).toMatch(/\?$/);
      }
    }
  });
});
