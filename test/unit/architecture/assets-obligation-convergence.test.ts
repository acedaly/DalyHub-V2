import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * V2.10 LIFE-01 — the Assets CONVERGENCE registry.
 *
 * The Assets module is a LENS over the one shared Obligation store. That is not
 * self-enforcing: the failure mode is not a broken test but a private read, a
 * private mutation or a query against the retired table reappearing months
 * later because the shared one was slightly inconvenient — which is exactly
 * what happened to the Task row before V2.8 CONV-01 pinned it.
 *
 * So this states what is true and fails when it stops being:
 *
 *   1. NOTHING in the application queries `asset_obligations`. The table was
 *      dropped by migration 0050; a reference to it is a runtime error waiting
 *      for the surface that carries it to be opened.
 *   2. The Assets module holds no obligation MUTATION of its own — no create,
 *      update, complete, dismiss or delete against an obligation store. It asks
 *      `scope.obligations`.
 *   3. `obligation_details` is written by exactly ONE adapter. A second writer
 *      is a second authority, whatever it is called.
 *   4. The Assets kernel declares no obligation RECORD type of its own. It
 *      extends the shared one or it uses it.
 *
 * Read as source with comments stripped, so prose about a rule can neither
 * satisfy nor trip it. The technique is CONV-01's
 * `test/unit/task-record/shared-row-consumers.test.ts`.
 */

const ROOT = process.cwd();

function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

function filesUnder(dir: string, extensions = [".ts", ".tsx"]): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? filesUnder(path.join(dir, entry.name), extensions)
      : extensions.some((ext) => entry.name.endsWith(ext))
        ? [path.join(dir, entry.name)]
        : [],
  );
}

describe("the retired table is retired", () => {
  it("is named by no application file", () => {
    const offenders = filesUnder(path.join(ROOT, "app"))
      .filter((file) =>
        /\basset_obligations\b/.test(code(readFileSync(file, "utf8"))),
      )
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });

  it("is named by no end-to-end fixture", () => {
    const offenders = filesUnder(path.join(ROOT, "e2e"), [
      ".ts",
      ".mjs",
      ".sql",
    ])
      .filter((file) =>
        /\basset_obligations\b/.test(readFileSync(file, "utf8")),
      )
      .map((file) => path.relative(ROOT, file));
    expect(offenders).toEqual([]);
  });
});

describe("the Assets module is a lens, not an owner", () => {
  it("writes no obligation of its own", () => {
    /*
     * The Assets module may READ obligations and render them; what it may not
     * do is mutate one through anything but the shared repository. A private
     * write is how the Assets record and Life Admin come to disagree about the
     * same rego.
     */
    const offenders: string[] = [];
    for (const file of filesUnder(
      path.join(ROOT, "app", "modules", "assets"),
    )) {
      const source = code(readFileSync(file, "utf8"));
      for (const match of source.matchAll(
        /\b(?:assetHistory|history)\.(createObligation|updateObligation|completeObligation|setObligationStatus|deleteObligation|linkObligationTask|unlinkObligationTask|listObligations|summariseObligations|listAttention)\b/g,
      )) {
        offenders.push(`${path.relative(ROOT, file)} → ${match[1]}`);
      }
      if (
        /INSERT INTO obligation_details|UPDATE obligation_details/.test(source)
      ) {
        offenders.push(
          `${path.relative(ROOT, file)} → writes obligation_details`,
        );
      }
    }
    expect(offenders).toEqual([]);
  });

  it("declares no obligation record type of its own", () => {
    const kernel = code(
      readFileSync(
        path.join(ROOT, "app", "kernel", "assets", "asset-obligation.ts"),
        "utf8",
      ),
    );
    // It may COMPOSE the shared record — the meter helpers take a `Pick` of it —
    // but a `type AssetObligation = { … }` of its own is a second model.
    expect(kernel).not.toMatch(/export type AssetObligation = \{/);
    expect(kernel).toContain('from "~/kernel/obligations"');
  });
});

describe("the store has one writer", () => {
  it("is written by exactly one adapter", () => {
    const adapters = filesUnder(
      path.join(ROOT, "app", "platform", "storage", "d1"),
      [".ts"],
    ).filter((file) =>
      /INSERT INTO obligation_details|UPDATE obligation_details/.test(
        code(readFileSync(file, "utf8")),
      ),
    );

    expect(adapters.map((f) => path.basename(f)).sort()).toEqual([
      // The Assets adapter clears a dangling proof pointer when the event that
      // proved a completion is deleted — one UPDATE of one column, and the
      // obligation's status and series position are deliberately untouched.
      "d1-asset-history-repository.ts",
      "d1-obligation-repository.ts",
    ]);
  });
});
