import { describe, expect, it } from "vitest";

import { buildReportControls } from "~/modules/reports/reports-controls";
import { csvField, type ReportConfig } from "~/kernel/reports";

/**
 * V2.13 — the properties an automated review pass found missing, each pinned so
 * it cannot be lost again. The kernel holds the ones that need real D1
 * (bucket attribution, the due-report remainder, the Reviews window); these are
 * the ones a pure test can hold.
 */

const SAVED: ReportConfig = {
  version: 1,
  source: "finance",
  measure: "money_out",
  window: { kind: "preset", preset: "12-months" },
  breakdown: { by: "group", group: "category" },
  filters: {},
  sort: "value_desc",
  visual: "bars",
};

const hrefs = (config: ReportConfig, reportId?: string | null) =>
  buildReportControls({
    config,
    todayIso: "2026-09-07",
    reportId,
  }).flatMap((control) => control.options.map((option) => option.href));

describe("a control change keeps a saved report's identity", () => {
  /*
   * Every control used to navigate to `/reports/view`, which carries no report
   * id — so the next load saw no saved row, "Update this report" disappeared,
   * and editing a saved report could only ever produce a COPY. The definition
   * still travels in the query string; only the destination changed.
   */
  it("points every option at the saved report, not at /reports/view", () => {
    const links = hrefs(SAVED, "rep_123");
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((href) => href.startsWith("/reports/rep_123?"))).toBe(
      true,
    );
    expect(links.some((href) => href.startsWith("/reports/view?"))).toBe(false);
  });

  it("still carries the whole definition in the query string", () => {
    // Every option is a complete definition, so each carries its own source and
    // measure — including the SOURCE control's options, which are the ones that
    // deliberately change it.
    for (const href of hrefs(SAVED, "rep_123")) {
      const query = new URLSearchParams(href.slice(href.indexOf("?") + 1));
      expect(query.has("src")).toBe(true);
      expect(query.has("m")).toBe(true);
    }
  });

  it("escapes an id rather than pasting it into a path", () => {
    const links = hrefs(SAVED, "a b/c");
    expect(links.every((href) => href.startsWith("/reports/a%20b%2Fc?"))).toBe(
      true,
    );
  });

  it("leaves a BUILT-IN pointing at /reports/view, because it is not editable", () => {
    const links = hrefs(SAVED, null);
    expect(links.every((href) => href.startsWith("/reports/view?"))).toBe(true);
  });
});

/*
 * A CSV field is read by a SPREADSHEET, and a spreadsheet executes a field that
 * begins `=`, `+`, `-` or `@` as a formula whether or not it is quoted. Report
 * labels are record names — a category, an account, an obligation subject — so
 * quoting alone let a name become a formula in whatever opens the download.
 *
 * This exercises the REAL encoder the export route uses, which is why it lives
 * in the kernel: a rule only the route could see is a rule only the route could
 * be trusted about.
 */
describe("a CSV label cannot become a spreadsheet formula", () => {
  const field = csvField;

  it.each(["=1+1", "+1", "-cmd", "@SUM(A1)", "\tlead", "\rlead"])(
    "neutralises %j",
    (value) => {
      expect(field(value)).toBe(`"'${value}"`);
    },
  );

  it("leaves an ordinary label exactly as the owner wrote it", () => {
    expect(field("Groceries")).toBe('"Groceries"');
    expect(field("Rent & rates")).toBe('"Rent & rates"');
  });

  it("still escapes an embedded quote", () => {
    expect(field('He said "no"')).toBe('"He said ""no"""');
  });

  it("NEVER neutralises a number, because a negative amount begins with -", () => {
    // Prefixing this would turn a figure into text in every spreadsheet.
    expect(field(-1200)).toBe('"-1200"');
    expect(field(0)).toBe('"0"');
  });

  it("writes NO READING as empty rather than as a zero", () => {
    expect(field(null)).toBe("");
  });
});
