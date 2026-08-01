/**
 * X-04 — internal-link rewriting for the vault.
 *
 * Two properties matter more than anything else here:
 *
 *   1. everything that is NOT an internal link comes back byte-for-byte;
 *   2. a link that cannot be resolved keeps the author's words, is marked in
 *      place, and is reported — never dropped, never left as broken DalyHub
 *      syntax, and never a thrown error.
 */

import { describe, expect, it } from "vitest";

import { rewriteBodyForVault, type VaultLinkResolver } from "~/platform/export";

const RESOLVER: VaultLinkResolver = {
  byTitle: (title) =>
    title.toLowerCase() === "training notes" ? "Notes/Training notes.md" : null,
  byId: (id) => (id === "goal-1" ? "Goals/Run.md" : null),
};

const context = {
  fromPath: "Notes/Hub.md",
  sourceTitle: "Hub",
  resolver: RESOLVER,
};

describe("rewriteBodyForVault", () => {
  it("rewrites a resolvable wiki link to a relative Markdown link", () => {
    const result = rewriteBodyForVault(
      "See [[Training notes]] today.",
      context,
    );
    expect(result.markdown).toBe(
      "See [Training notes](<./Training notes.md>) today.",
    );
    expect(result.unresolved).toEqual([]);
  });

  it("keeps a wiki link's alias as the label", () => {
    const result = rewriteBodyForVault(
      "See [[Training notes|the plan]].",
      context,
    );
    expect(result.markdown).toBe("See [the plan](<./Training notes.md>).");
  });

  it("rewrites a resolvable dalyhub:// record link", () => {
    const result = rewriteBodyForVault(
      "The goal is [the half](dalyhub://goal/goal-1).",
      context,
    );
    expect(result.markdown).toBe("The goal is [the half](../Goals/Run.md).");
    expect(result.unresolved).toEqual([]);
  });

  it("marks an unresolvable wiki link in place and reports it", () => {
    const result = rewriteBodyForVault("See [[No such record]].", context);
    expect(result.markdown).toBe(
      "See No such record *(unresolved DalyHub link)*.",
    );
    expect(result.unresolved).toEqual([
      {
        sourcePath: "Notes/Hub.md",
        sourceTitle: "Hub",
        label: "No such record",
        reference: "No such record",
        reason: "no_matching_title",
      },
    ]);
    // Never broken DalyHub syntax in a file that has no DalyHub.
    expect(result.markdown).not.toContain("[[");
  });

  it("marks a record link whose target is not exported and reports it", () => {
    const result = rewriteBodyForVault(
      "Gone: [old note](dalyhub://note/missing-1).",
      context,
    );
    expect(result.markdown).toBe("Gone: old note *(unresolved DalyHub link)*.");
    expect(result.unresolved[0]).toMatchObject({
      reason: "target_not_exported",
      reference: "dalyhub://note/missing-1",
    });
    expect(result.markdown).not.toContain("dalyhub://");
  });

  it("leaves everything else byte-for-byte identical", () => {
    const source = [
      "# Heading",
      "",
      "Prose with  double  spaces and a trailing tab\t",
      "",
      "```md",
      "[[Training notes]] and [x](dalyhub://goal/goal-1)",
      "```",
      "",
      "`[[Training notes]]` inline code too.",
      "",
      "Final line with no newline",
    ].join("\r\n");
    const result = rewriteBodyForVault(source, context);
    // Nothing in this document is a genuine link node, so nothing changes —
    // including the CRLF line endings and the trailing tab.
    expect(result.markdown).toBe(source);
    expect(result.unresolved).toEqual([]);
  });

  it("does not rewrite a link inside a fenced code block", () => {
    const source = "```\n[[Training notes]]\n```\n\nAnd [[Training notes]].";
    const result = rewriteBodyForVault(source, context);
    expect(result.markdown).toContain("```\n[[Training notes]]\n```");
    expect(result.markdown).toContain(
      "[Training notes](<./Training notes.md>).",
    );
  });

  it("handles several links of both kinds in one document, in order", () => {
    const source =
      "A [[Training notes]] B [g](dalyhub://goal/goal-1) C [[No such record]] D";
    const result = rewriteBodyForVault(source, context);
    expect(result.markdown).toBe(
      "A [Training notes](<./Training notes.md>) B [g](../Goals/Run.md) C No such record *(unresolved DalyHub link)* D",
    );
    expect(result.unresolved).toHaveLength(1);
  });

  it("returns an empty body unchanged", () => {
    expect(rewriteBodyForVault("", context)).toEqual({
      markdown: "",
      unresolved: [],
    });
  });

  it("is deterministic", () => {
    const source = "A [[Training notes]] B [[No such record]]";
    expect(rewriteBodyForVault(source, context)).toEqual(
      rewriteBodyForVault(source, context),
    );
  });
});
