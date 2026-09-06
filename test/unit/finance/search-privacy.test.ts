/**
 * V2.12 — the Finance search provider's privacy boundary, asserted structurally.
 *
 * A result list is the surface most likely to be read over someone's shoulder,
 * and a transaction carries the most private facts in the product. So what the
 * provider may put in a result is a bounded list, and this file reads the
 * provider's own source — with comments stripped, so a rule written in a comment
 * cannot pass for a rule enforced in code — to prove it.
 *
 * This is deliberately a source assertion rather than a behavioural one. A
 * behavioural test proves the amounts are absent from the results it happened to
 * generate; this proves the provider has no way to produce one, which is the
 * property the owner actually needs.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { financeSearchProvider } from "~/modules/finance/search";

const SOURCE = path.join(
  process.cwd(),
  "app",
  "modules",
  "finance",
  "search.ts",
);

/** The source with block and line comments removed. */
function code(): string {
  return readFileSync(SOURCE, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

describe("V2.12 — Finance search never carries a figure", () => {
  const source = code();

  it("names no amount field anywhere in the provider", () => {
    /*
     * `amountMinor`, `balanceMinor`, `openingBalanceMinor`, `expectedAmount`.
     * None of them may be read here, in a title, a subtitle, an excerpt or a
     * filter. An amount the provider never touches is an amount it cannot leak.
     */
    for (const forbidden of [
      "amountMinor",
      "amount_minor",
      "balanceMinor",
      "balance_minor",
      "openingBalance",
      "money(",
      "formatMinorUnits",
    ]) {
      expect(source, `search must not read ${forbidden}`).not.toContain(
        forbidden,
      );
    }
  });

  it("matches the DISPLAY payee only, never the bank's raw text or a memo", () => {
    /*
     * `source_description` is raw bank text the owner never chose — terminal
     * ids, card fragments, suburb codes — so matching it would put `EFTPOS 4821`
     * in front of a query for `4821`. A memo is body content, governed by the
     * explicit-query boundary rather than by a collection search.
     */
    expect(source).toContain("payeeDisplay");
    expect(source).not.toContain("sourceDescription");
    expect(source).not.toContain("source_description");
    expect(source).not.toContain(".memo");
    expect(source).not.toContain("payeeKey");
  });

  it("returns nothing at all for an empty query", async () => {
    /*
     * The explicit-query boundary at its narrowest. Combined with
     * `finance_transaction` sitting in `RECENCY_EXCLUDED_TYPES`, it means a
     * transaction is never volunteered before the owner has typed something.
     */
    const empty = await financeSearchProvider.search({ text: "", limit: 10 }, {
      workspace: { id: "ws", slug: "ws", name: "ws" },
    } as never);
    expect(empty).toEqual([]);

    const blank = await financeSearchProvider.search(
      { text: "   ", limit: 10 },
      { workspace: { id: "ws", slug: "ws", name: "ws" } } as never,
    );
    expect(blank).toEqual([]);

    // And a zero limit, which is the other way a caller says "nothing".
    const none = await financeSearchProvider.search(
      { text: "everyday", limit: 0 },
      { workspace: { id: "ws", slug: "ws", name: "ws" } } as never,
    );
    expect(none).toEqual([]);
  });

  it("sends a transaction to the drawer by ID, never by its description", () => {
    /*
     * A URL is shoulder-surfable, shareable and logged. `?open=<id>` carries an
     * opaque identifier; a search-term or payee round trip would carry the
     * owner's week into a browser history.
     */
    expect(source).toContain("?open=${encodeURIComponent(");
    expect(source).not.toMatch(/\?q=\$\{[^}]*payee/);
  });

  it("declares both Finance entity types, so results are attributed honestly", () => {
    expect(financeSearchProvider.id).toBe("finance.search");
    expect([...(financeSearchProvider.entityTypes ?? [])].sort()).toEqual([
      "finance_account",
      "finance_transaction",
    ]);
  });
});
