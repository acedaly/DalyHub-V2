/**
 * V2.16 CONSOL-04 — the operator procedure is CHECKED, not just written.
 *
 * `WORKSPACE_DELETION.md` is the only path DalyHub offers to "delete
 * everything", and it is prose. Prose beside derived code is the pair that
 * drifts, and here the drift is silent at the worst possible moment: an
 * operator at 2am, following a document, believing they have finished.
 *
 * V2.16's own independent review found the drift had already happened. The
 * document's R2 listing command named the prefix `attachments/<id>/file/`,
 * which matches **nothing** — the real key root is `workspaces/<id>/attachments/`.
 * An operator following it would have got an empty listing, concluded the
 * workspace had no files, and left every PDF, receipt and photograph the owner
 * ever attached sitting in the bucket after a "deletion" they were told had
 * removed it. The kernel rehearsal never caught it because the rehearsal calls
 * `attachmentWorkspacePrefix()` from code, exactly as it should — and therefore
 * proves nothing at all about the sentence a person actually reads.
 *
 * So this file reads the DOCUMENT and compares it to the CODE: the R2 prefix
 * against the key builder, the table figures against the classification, and
 * the generator flags the procedure names against the generator's own
 * arguments. Anything the operator is told to type is checked; anything they
 * are told is true about the data is measured.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { attachmentWorkspacePrefix } from "~/kernel/attachments";
import {
  WORKSPACE_TABLES,
  workspacePurgeOrder,
} from "~/platform/storage/d1/workspace-data-map";

const ROOT = process.cwd();
const DOC = readFileSync(
  path.join(ROOT, "docs/development/WORKSPACE_DELETION.md"),
  "utf8",
);

/** The literal an operator would paste, with the placeholder still in it. */
const PLACEHOLDER = "<workspace-id>";

/**
 * Only what is inside a fenced block counts as "what the operator types".
 *
 * The prose deliberately DISCUSSES commands that do not work — it has to, to
 * explain why `wrangler r2 object list` is not the answer — so a check reading
 * the whole document would have to be argued with every time somebody
 * documented a limitation. A fenced block is the promise; the prose around it
 * is the reasoning.
 */
const SHELL = [...DOC.matchAll(/```(?:bash|sh)?\n([\s\S]*?)```/g)]
  .map((match) => match[1])
  .join("\n");

describe("WORKSPACE_DELETION — what the operator is told to type", () => {
  it("names the R2 prefix the key builder actually derives", () => {
    const stated = SHELL.match(/^\s*(workspaces\/\S*)\s*$/m)?.[1];
    expect(stated, "the fenced object-prefix literal").toBeDefined();
    // Substitute a real-shaped id on both sides: the builder validates its
    // argument, and the document carries a placeholder rather than an id.
    const id = "ws0123456789";
    expect(stated?.replace(PLACEHOLDER, id)).toBe(
      attachmentWorkspacePrefix(id),
    );
  });

  it("names the bucket the application actually writes to", () => {
    expect(DOC).toContain("dalyhub-v2-attachments");
  });

  it("only ever tells the operator to run a wrangler command that EXISTS", () => {
    /*
     * V2.16's PR review found the document instructing an operator to run
     * `wrangler r2 object list … --prefix …`. There is no such subcommand:
     * `wrangler r2 object` offers `get`, `put` and `delete` and nothing that
     * enumerates a prefix. The procedure therefore stopped, silently, at the
     * step that removes the owner's evidence — the single most sensitive thing
     * a deletion has to reach.
     *
     * Prose naming a CLI is the same pair as prose naming a storage key: it
     * drifts, and the drift is invisible until somebody is following it under
     * pressure. So every `wrangler <group> <verb>` this document tells anyone
     * to type is checked against the surface Wrangler actually has, enumerated
     * here rather than shelled out to — a unit test must not depend on a
     * network-capable binary, and pinning the surface makes a Wrangler upgrade
     * that removes a verb a visible edit.
     */
    const WRANGLER_SURFACE: Record<string, readonly string[]> = {
      d1: [
        "execute",
        "export",
        "info",
        "list",
        "migrations",
        "create",
        "delete",
      ],
      // MEASURED against wrangler 4.112.0: `object` has three verbs and no
      // `list`; enumeration lives on `bucket`, which lists BUCKETS, not keys.
      "r2 object": ["get", "put", "delete"],
      "r2 bucket": ["create", "update", "list", "info", "delete"],
    };

    const commands = [
      ...SHELL.matchAll(/\bwrangler (r2 [a-z0-9-]+|[a-z0-9-]+) ([a-z0-9-]+)/g),
    ];
    // A regex that stopped matching would make this pass while proving nothing.
    expect(commands.length).toBeGreaterThan(2);

    for (const [text, group, verb] of commands) {
      const verbs = WRANGLER_SURFACE[group];
      expect(
        verbs,
        `\`${text}\` names a wrangler group this test does not know`,
      ).toBeDefined();
      expect(
        verbs?.includes(verb),
        `\`${text}\` is not a wrangler subcommand — an operator following this document would get "Unknown arguments"`,
      ).toBe(true);
    }
  });

  it("targets the REMOTE database on every command that touches production", () => {
    /*
     * The quietest defect in the whole procedure, and the review caught it.
     * `wrangler d1 execute` runs against the LOCAL database unless `--remote`
     * is given. Without the flag the purge deletes nothing in production AND
     * the verification block returns zero for all sixty tables — because the
     * local database is empty — so an operator reads sixty zeroes and believes
     * they are finished while every row is still there.
     *
     * `scripts/production-d1.mjs` already passes `--remote` on every production
     * command for exactly this reason; the document had not.
     */
    for (const [command] of SHELL.matchAll(/wrangler d1 execute[^\n]*/g)) {
      expect(
        command,
        "a d1 execute without --remote silently targets the local database",
      ).toContain("--remote");
    }
    // And the verification step must say so too, or step 4 reads local zeroes.
    expect(DOC).toMatch(/verification block[^.]*`--remote`/i);
  });

  it("gives a command that produces a RUNNABLE file, not one with an unbound parameter", () => {
    /*
     * The second half of the same defect. Every statement the generator emits
     * by default carries `:workspace_id`, and `wrangler d1 execute` has no
     * parameter-binding flag — so the documented procedure asked the operator
     * to hand-substitute an id into sixty statements, which is precisely the
     * typo the parameterisation exists to prevent.
     *
     * The generator is RUN here, on the real classification, rather than having
     * its output described. It opens no database and deletes nothing, which is
     * what makes that safe from a unit test.
     */
    expect(DOC).toContain("pnpm run workspace:purge:plan --workspace=");

    const plan = execFileSync(
      process.execPath,
      [
        path.join(ROOT, "scripts/workspace-purge-plan.mjs"),
        "--workspace=ws0123456789",
      ],
      { encoding: "utf8" },
    );
    expect(plan).not.toContain(":workspace_id");
    expect(plan).toContain(
      "DELETE FROM entities WHERE workspace_id = 'ws0123456789';",
    );
    // D1 rejects an explicit transaction from `wrangler d1 execute`, so a
    // runnable plan must not carry one.
    expect(plan).not.toContain("BEGIN TRANSACTION");
    expect(plan).not.toContain("COMMIT;");
  });

  it("REFUSES an id that is not one, rather than escaping it", () => {
    let failed = false;
    try {
      execFileSync(
        process.execPath,
        [
          path.join(ROOT, "scripts/workspace-purge-plan.mjs"),
          "--workspace=x'; DROP TABLE entities; --",
        ],
        { encoding: "utf8", stdio: "pipe" },
      );
    } catch (error) {
      failed = true;
      expect((error as { status?: number }).status).toBe(2);
      expect(String((error as { stderr?: Buffer }).stderr)).toContain(
        "Refusing to build a plan",
      );
    }
    expect(failed, "a malformed workspace id must produce no plan at all").toBe(
      true,
    );
  });

  it("keeps the default form UNBOUND, so a review copy cannot be run by accident", () => {
    const plan = execFileSync(
      process.execPath,
      [path.join(ROOT, "scripts/workspace-purge-plan.mjs")],
      { encoding: "utf8" },
    );
    expect(plan).toContain(":workspace_id");
  });
});

describe("WORKSPACE_DELETION — what the operator is told about the data", () => {
  it("states the table count the classification actually has", () => {
    /*
     * "Sixty" appears four times in this document, once in the ADR, once in the
     * export authority and once in the V3 boundary. All seven were correct when
     * written and all seven go stale at the next migration, silently, in a
     * programme whose whole theme is that the repository stops carrying untrue
     * sentences. Checking the one an operator acts on is the minimum; the
     * others are checked in `product-map-coherence.test.ts` and here.
     */
    const words: Record<number, string> = {
      50: "fifty",
      60: "sixty",
      70: "seventy",
      80: "eighty",
    };
    const word = words[WORKSPACE_TABLES.length];
    expect(
      word,
      `${WORKSPACE_TABLES.length} tables — add the word to this map and update the documents`,
    ).toBeDefined();

    for (const [file, doc] of [
      ["WORKSPACE_DELETION.md", DOC],
      [
        "EXPORT_AND_PORTABILITY.md",
        readFileSync(
          path.join(ROOT, "docs/development/EXPORT_AND_PORTABILITY.md"),
          "utf8",
        ),
      ],
      [
        "V3_BOUNDARY.md",
        readFileSync(path.join(ROOT, "docs/product/V3_BOUNDARY.md"), "utf8"),
      ],
      [
        // ADR-124 only. The rest of the ADR file is thirty releases of prose
        // in which "sixty" means many other things.
        "ADR-124",
        (() => {
          const adrs = readFileSync(
            path.join(ROOT, "docs/decisions/ARCHITECTURE_DECISIONS.md"),
            "utf8",
          );
          const start = adrs.indexOf("## ADR-124:");
          return start === -1 ? "" : adrs.slice(start);
        })(),
      ],
    ] as const) {
      expect(doc.length, `${file} was not found`).toBeGreaterThan(0);
      // Every "N tables" claim in the document must name the real count.
      const claims = [...doc.matchAll(/([A-Za-z-]+) tables\b/g)].map((m) =>
        m[1].toLowerCase(),
      );
      const wrong = claims.filter(
        (claim) =>
          /^(fifty|sixty|seventy|eighty)$/.test(claim) && claim !== word,
      );
      expect(wrong, `${file} states a stale table count`).toEqual([]);
    }
  });

  it("promises a verification block with one count per table", () => {
    expect(DOC).toMatch(
      new RegExp(`${"sixty"} \`SELECT COUNT\\(\\*\\)\``, "i"),
    );
    const plan = execFileSync(
      process.execPath,
      [path.join(ROOT, "scripts/workspace-purge-plan.mjs")],
      { encoding: "utf8" },
    );
    const counts = [...plan.matchAll(/^SELECT '[a-z_]+' AS t, COUNT\(\*\)/gm)];
    expect(counts).toHaveLength(workspacePurgeOrder().length);
  });
});
