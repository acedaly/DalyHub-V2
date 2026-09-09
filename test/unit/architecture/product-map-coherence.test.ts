/**
 * V2.16 CONSOL-04 — the map is a GATE, not a picture.
 *
 * `docs/architecture/PRODUCT_MAP.md` is the document a reader is sent to when
 * they ask "where does this live?". It states three kinds of fact, and until
 * this file none of them was checked by anything:
 *
 *   1. **Where every destination is.** The five-questions table names each
 *      group's destinations and their routes. `docs:links:check` cannot see
 *      them, because a route is not a repository link — so a regroup, a
 *      relabel or a new module would have left the map quietly wrong while
 *      every other navigation test stayed green.
 *   2. **Which file is each authority's proof.** The shared-machinery table
 *      names a test per primitive, in code spans. A renamed or deleted test
 *      file is exactly the thing this map exists to make findable, and a code
 *      span is invisible to every link checker there is.
 *   3. **How much data there is.** "Sixty tables … 45 `exported`, 13
 *      `operational`, 2 `ephemeral`" is a measurement, and the next migration
 *      changes it.
 *
 * A map that can rot is worse than no map, because a reader trusts it. So all
 * three are read out of the markdown and checked against the real registry,
 * the real filesystem and the real classification.
 *
 * The route half is deliberately checked against the SAME discovered registry
 * `navigation-information-architecture.test.ts` uses, rather than against that
 * file's expectation table: two documents agreeing with each other proves
 * nothing if both drifted from the product.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { discoverModuleRegistry } from "~/modules/discover-modules";
import { WORKSPACE_TABLES } from "~/platform/storage/d1/workspace-data-map";
import { buildNavigationModel } from "~/platform/modules/navigation-adapter";

const ROOT = process.cwd();
const MAP_PATH = "docs/architecture/PRODUCT_MAP.md";
const map = readFileSync(path.join(ROOT, MAP_PATH), "utf8");

function navigation() {
  const registry = discoverModuleRegistry();
  return buildNavigationModel(
    registry.listRoutes(),
    (moduleId) => registry.getModule(moduleId)?.entityTypes[0]?.type,
  );
}

/** Every table row of the five-questions table, as `[group, labels, routes]`. */
function questionRows(): {
  group: string;
  labels: string[];
  routes: string[];
}[] {
  const rows: { group: string; labels: string[]; routes: string[] }[] = [];
  for (const line of map.split("\n")) {
    // `| question | \`group\` | A · B | \`/a\` \`/b\` |`
    const cells = line.split("|").map((cell) => cell.trim());
    if (cells.length !== 6) continue;
    const group = cells[2].match(/^`([a-z-]+)`$/)?.[1];
    if (group === undefined) continue;
    const routes = [...cells[4].matchAll(/`(\/[a-z-]*)`/g)].map((m) => m[1]);
    if (routes.length === 0) continue;
    rows.push({
      group,
      labels: cells[3].split("·").map((label) => label.trim()),
      routes,
    });
  }
  return rows;
}

describe("PRODUCT_MAP — the five questions match the real registry", () => {
  it("names a group's destinations in the registry's own order, with their real routes", () => {
    const rows = questionRows();
    // Six groups; a seventh would mean the map grew a row the rail has not.
    expect(rows.map((row) => row.group)).toEqual([
      "do",
      "organise",
      "deal-with",
      "money",
      "understand",
      "system",
    ]);

    const items = navigation();
    for (const row of rows) {
      const actual = items
        .filter((item) => item.group === row.group)
        .map((item) => [item.label, item.href] as const);
      expect(
        actual.map(([label]) => label),
        `PRODUCT_MAP's \`${row.group}\` destinations`,
      ).toEqual(row.labels);
      expect(
        actual.map(([, href]) => href),
        `PRODUCT_MAP's \`${row.group}\` routes`,
      ).toEqual(row.routes);
    }
  });

  it("accounts for EVERY navigable destination — the map cannot omit one", () => {
    const mapped = questionRows().flatMap((row) => row.routes);
    const real = navigation().map((item) => item.href);
    expect([...mapped].sort()).toEqual([...real].sort());
  });

  it("keeps Insight's historical route stated, because that is the one people doubt", () => {
    expect(map).toContain("**Insight's route is `/analytics` on purpose.**");
    const insight = navigation().find((item) => item.label === "Insight");
    expect(insight?.href).toBe("/analytics");
  });
});

describe("PRODUCT_MAP — every path it names exists", () => {
  it("resolves every repository path in a code span, glob or literal", () => {
    /*
     * Code spans that LOOK like a repository path: they start with one of the
     * three roots the map talks about. Anything else in a code span is a token
     * name, a column, a route or a bucket, and is checked elsewhere or not a
     * path at all — so the discriminator is deliberately narrow rather than
     * clever, and a path the map states outside a code span is out of scope by
     * the same rule.
     */
    const candidates = [
      ...new Set(
        [...map.matchAll(/`((?:app|test|scripts|migrations)\/[^`]+)`/g)].map(
          (m) => m[1],
        ),
      ),
    ];
    // If this ever reaches zero the regex has rotted and the test proves nothing.
    expect(candidates.length).toBeGreaterThan(10);

    const missing = candidates.filter((candidate) => {
      if (!candidate.includes("*")) {
        return !existsSync(path.join(ROOT, candidate));
      }
      // One `*` segment, which is every glob shape the map uses.
      const dir = path.dirname(candidate);
      const pattern = new RegExp(
        `^${path
          .basename(candidate)
          .split("*")
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
          .join(".*")}$`,
      );
      if (!existsSync(path.join(ROOT, dir))) return true;
      return !readdirSync(path.join(ROOT, dir)).some((name) =>
        pattern.test(name),
      );
    });
    expect(missing).toEqual([]);
  });
});

describe("PRODUCT_MAP — the data figures are measured, not remembered", () => {
  it("states the table count and the class split the classification actually has", () => {
    const counts = {
      total: WORKSPACE_TABLES.length,
      exported: WORKSPACE_TABLES.filter((t) => t.dataClass === "exported")
        .length,
      operational: WORKSPACE_TABLES.filter((t) => t.dataClass === "operational")
        .length,
      ephemeral: WORKSPACE_TABLES.filter((t) => t.dataClass === "ephemeral")
        .length,
    };
    const stated = map.match(
      /(\w+) tables, every one workspace-scoped except `workspaces` itself\. Classified in \[`workspace-data-map\.ts`\]\([^)]+\): (\d+) `exported`, (\d+) `operational`, (\d+) `ephemeral`/,
    );
    expect(stated, "the D1 row of PRODUCT_MAP's data table").not.toBeNull();
    const words: Record<string, number> = { Sixty: 60, Fifty: 50, Seventy: 70 };
    expect(words[stated?.[1] ?? ""] ?? Number(stated?.[1]), "table count").toBe(
      counts.total,
    );
    expect(Number(stated?.[2]), "exported").toBe(counts.exported);
    expect(Number(stated?.[3]), "operational").toBe(counts.operational);
    expect(Number(stated?.[4]), "ephemeral").toBe(counts.ephemeral);
  });

  it("claims no store outside an export policy, which the classification enforces", () => {
    expect(map).toContain(
      "There is no persistent owner-data table outside an explicit export policy.",
    );
    // Every table has a class; the kernel test proves the set is TOTAL over the
    // real schema. Here we only prove the map's sentence has a referent.
    expect(
      WORKSPACE_TABLES.filter(
        (t) => t.dataClass === "exported" && !t.collection,
      ),
    ).toEqual([]);
  });
});
