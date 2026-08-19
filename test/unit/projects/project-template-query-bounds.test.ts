/**
 * PROJECT-02 — the template read BUDGET, asserted at the source.
 *
 * `test/kernel/project-templates.test.ts` counts the statements for real and
 * proves a page of twelve templates costs the same three statements one costs.
 * This file guards the other half: that no loader ever reads a template from
 * inside a loop — the edit that would turn a bounded read into an N+1 without
 * changing a single line of the repository.
 *
 * It is a text check for the reason `plan-query-bounds.test.ts` and
 * `task-checklist-query-bounds.test.ts` give: the shape that would catch the
 * regression at runtime is a workspace nobody seeds, while the defect itself is
 * plainly visible in the source.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  MAX_TEMPLATE_CHECKLIST_ITEMS,
  MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK,
  MAX_TEMPLATE_TASKS,
} from "~/kernel/project-templates";

/** Every loader that reads templates, and where it lives. */
const TEMPLATE_LOADERS = [
  ["the Templates collection", "app/modules/projects/routes/templates.tsx"],
  ["the Projects collection", "app/modules/projects/routes/index.tsx"],
  ["the template record", "app/modules/projects/routes/template-detail.tsx"],
] as const;

const REPOSITORY = "app/platform/storage/d1/d1-project-template-repository.ts";

function read(relative: string): string {
  return readFileSync(path.join(process.cwd(), relative), "utf8");
}

/** A read site that appears INSIDE an iteration — the N+1 signature, in text. */
function readsInsideIteration(source: string, call: string): boolean {
  const lines = source.split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    if (!lines[index]!.includes(call)) continue;
    // Look back a short way for a loop or a `.map(` opening that has not closed.
    const window = lines.slice(Math.max(0, index - 12), index).join("\n");
    if (
      /\bfor\s*\(/.test(window) ||
      /\bwhile\s*\(/.test(window) ||
      /\.map\(\s*(async\s*)?\(/.test(window) ||
      /\.forEach\(/.test(window)
    ) {
      return true;
    }
  }
  return false;
}

describe("PROJECT-02 template read bounds", () => {
  it.each(TEMPLATE_LOADERS)(
    "%s reads templates at most once, never inside a loop",
    (_name, file) => {
      const source = read(file);
      const listSites = source.split("listTemplates(").length - 1;
      const detailSites = source.split("getTemplateDetail(").length - 1;
      expect(listSites).toBeLessThanOrEqual(1);
      expect(detailSites).toBeLessThanOrEqual(1);
      expect(readsInsideIteration(source, "listTemplates(")).toBe(false);
      expect(readsInsideIteration(source, "getTemplateDetail(")).toBe(false);
    },
  );

  it("resolves a page's counts with GROUPED aggregates, never per template", () => {
    const source = read(REPOSITORY);
    /*
     * The two aggregates that make "12 tasks · 3 checklist items" free for a
     * whole page. Both must GROUP BY the template, which is the difference
     * between one statement for the page and one per row.
     */
    expect(source).toContain("GROUP BY template_id");
    expect(source).toContain("GROUP BY t.template_id");
    // The counts are read from ONE helper, so a future surface cannot invent a
    // second, unbounded way to obtain them.
    expect(source.split("#countContents(").length - 1).toBeGreaterThanOrEqual(
      2,
    );
    expect(readsInsideIteration(source, "#countContents(")).toBe(false);
  });

  it("binds ids in chunks that stay well under D1's parameter ceiling", () => {
    const source = read(REPOSITORY);
    const match = /const TEMPLATE_ID_CHUNK = (\d+);/.exec(source);
    expect(match).not.toBeNull();
    const chunk = Number(match![1]);
    /*
     * D1 accepts at most 100 bound parameters per statement and the workspace
     * id is one of them — the limit TASKS-13 measured the hard way on a real
     * workspace. The chunk must leave real headroom, and must also be at least
     * `MAX_TEMPLATE_TASKS` so a whole template's checklist is one statement.
     */
    expect(chunk).toBeLessThanOrEqual(90);
    expect(chunk).toBeGreaterThanOrEqual(MAX_TEMPLATE_TASKS);
  });

  it("keeps the instantiation batch provably small", () => {
    /*
     * The arithmetic behind the bounds, stated as an assertion rather than as a
     * comment somebody could let drift.
     *
     * Instantiation writes, in ONE batch: the Project's entity, spine record,
     * structural link and detail row (4); four statements per Task; one per
     * checklist item; and the Activity append with its subjects (3). If a
     * future change raised a bound past what a request can commit, this fails
     * before anyone finds out from a 500.
     */
    const worstCase =
      4 + MAX_TEMPLATE_TASKS * 4 + MAX_TEMPLATE_CHECKLIST_ITEMS + 3;
    expect(worstCase).toBeLessThanOrEqual(400);
    // The per-task checklist bound must never be able to defeat the total on
    // its own — the total is what actually caps the batch.
    expect(MAX_TEMPLATE_CHECKLIST_ITEMS_PER_TASK).toBeLessThanOrEqual(
      MAX_TEMPLATE_CHECKLIST_ITEMS,
    );
  });
});
