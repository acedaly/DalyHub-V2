/**
 * DEPLOY-01 — the migration rollback boundary, as an invariant rather than a
 * sentence in a document.
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 *
 * `DEPLOYMENT.md` gives an operator a required order — back up, preflight, look,
 * migrate, verify the schema, deploy, verify the deployment — and it justifies
 * putting the migration BEFORE the deploy with this:
 *
 *   > The reverse order is safe: the previous Worker ignores every table and
 *   > column `0006`–`0025` adds, so a migrated database serving the old code
 *   > keeps working — which is what makes step 3 independently reversible by
 *   > rolling the *application* back.
 *
 * That was true of `0006`–`0025`. The sequence now ends at `0056`, and FOUR
 * migrations in between REMOVE something:
 *
 *   0031  drops `owner_app_preferences.theme`          (the theme feature went)
 *   0049  drops `tags` from asset/note/person details  (→ the tag vocabulary)
 *   0050  drops the `asset_obligations` TABLE          (→ obligations + links)
 *   0051  drops `notification_settings.asset_obligations_enabled`
 *
 * Every one is deliberate and none loses data — each moves it into the structure
 * that replaced it. What each DOES close is the window the deployment order
 * relies on: between "migrated" and "deployed", the running Worker is a version
 * that may still read what the migration removed.
 *
 * ── Why this is a test and not a comment ────────────────────────────────────
 *
 * Because the answer changes every time someone writes a migration, and the
 * failure mode is an operator following a runbook whose premise silently
 * expired. `scripts/migration-compatibility.mjs` derives the boundary by
 * applying every migration to a throwaway SQLite database and diffing the schema
 * after each; `pnpm run db:compat:check` fails in CI when the committed ledger
 * stops matching the migrations. This file holds the two things that check
 * cannot: that the deploy preflight reads the ledger correctly, and that the
 * four known one-way migrations are still exactly the four the documentation
 * names — so adding a fifth is a deliberate edit here rather than a silent
 * widening.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..", "..");

/*
 * `scripts/deploy-production.mjs` is a plain Node ESM script outside the
 * type-checked program, loaded through a runtime-resolved dynamic import —
 * the same shape `release-preflight.test.ts` and `production-deploy-flow.test.ts`
 * use, and for the same reason.
 */
const MODULE_URL = pathToFileURL(
  join(ROOT, "scripts", "deploy-production.mjs"),
).href;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- untyped Node script under test.
type DeployModule = any;
let deploy: DeployModule;

beforeAll(async () => {
  deploy = await import(/* @vite-ignore */ MODULE_URL);
});

/** The function under test, read off the runtime-imported module. */
const classifyPendingMigrations = (
  pending: readonly string[],
  ledger: unknown,
) => deploy.classifyPendingMigrations(pending, ledger);

const ledger = JSON.parse(
  readFileSync(
    join(ROOT, "docs", "development", "migration-ledger.json"),
    "utf8",
  ),
) as {
  migrationCount: number;
  head: string;
  applicationRollbackUnsafe: { migration: string; reasons: string[] }[];
};

/**
 * The four, named. This list is the documentation's claim in executable form.
 *
 * If a migration is added that removes a table or a column, this fails and the
 * right response is to add it here AND to `DEPLOYMENT.md`'s recovery section —
 * not to delete the assertion.
 */
const KNOWN_ONE_WAY = [
  "0031_remove_theme_preference.sql",
  "0049_create_tag_vocabulary.sql",
  "0050_create_obligations.sql",
  "0051_obligation_notifications.sql",
];

describe("DEPLOY-01 — the migration rollback boundary", () => {
  it("names exactly the four migrations an application rollback cannot cross", () => {
    expect(
      ledger.applicationRollbackUnsafe.map((entry) => entry.migration),
      "a migration that removes a table or column changes the deployment " +
        "order's premise. Add it here and to DEPLOYMENT.md → “When the " +
        "migration succeeded and the deploy did not”, or make the migration additive.",
    ).toEqual(KNOWN_ONE_WAY);
  });

  it("gives a reason for every one of them, so an operator can act on it", () => {
    for (const entry of ledger.applicationRollbackUnsafe) {
      expect(
        entry.reasons.length,
        `${entry.migration} is marked one-way with no reason`,
      ).toBeGreaterThan(0);
      for (const reason of entry.reasons) {
        expect(reason).toMatch(/no longer exists|changed type|became NOT NULL/);
      }
    }
  });

  it("covers the whole committed sequence", () => {
    // A ledger that stopped short would report "all additive" for a migration
    // it never read, which is the worst possible wrong answer here.
    expect(ledger.migrationCount).toBeGreaterThanOrEqual(58);
    expect(ledger.head).toMatch(/^\d{4}_.+\.sql$/);
  });

  describe("classifyPendingMigrations", () => {
    it("separates a one-way migration from the additive ones around it", () => {
      const result = classifyPendingMigrations(
        [
          "0048_goal_condition.sql",
          "0050_create_obligations.sql",
          "0052_create_attachments.sql",
        ],
        ledger,
      );
      expect(
        result.oneWay.map((entry: { migration: string }) => entry.migration),
      ).toEqual(["0050_create_obligations.sql"]);
      expect(result.oneWay[0].reasons).toContain(
        "table `asset_obligations` no longer exists",
      );
      expect(result.reversible).toEqual([
        "0048_goal_condition.sql",
        "0052_create_attachments.sql",
      ]);
    });

    it("reports a wholly additive pending set as reversible", () => {
      const result = classifyPendingMigrations(
        ["0052_create_attachments.sql", "0053_create_finance.sql"],
        ledger,
      );
      expect(result.oneWay).toEqual([]);
      expect(result.reversible).toHaveLength(2);
    });

    it("is safe when the ledger is missing rather than claiming safety", () => {
      // A missing ledger must not read as "nothing is one-way". It reads as
      // "nothing is KNOWN to be one-way", and the deploy preflight says so by
      // printing the additive message only when it actually has a ledger — so
      // the failure mode here is a missing warning, never a false all-clear on a
      // migration the ledger listed.
      const result = classifyPendingMigrations(
        ["0050_create_obligations.sql"],
        null,
      );
      expect(result.oneWay).toEqual([]);
      expect(result.reversible).toEqual(["0050_create_obligations.sql"]);
    });

    it("classifies nothing when nothing is pending", () => {
      const result = classifyPendingMigrations([], ledger);
      expect(result.oneWay).toEqual([]);
      expect(result.reversible).toEqual([]);
    });
  });
});
