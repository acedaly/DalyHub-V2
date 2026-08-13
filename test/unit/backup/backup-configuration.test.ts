/**
 * BACKUP-01 — configuration, and the operator script's safety checks.
 *
 * Two things are held here:
 *
 *  1. The Worker refuses to run against a placeholder or a missing secret. This
 *     is what stops a bypassed deploy producing a Worker that fails every night
 *     with a 404 that reads like a Cloudflare outage.
 *  2. The committed Wrangler config keeps the properties that make the backup
 *     Worker private and correctly scheduled. These are asserted against the
 *     REAL file, so an edit that adds a route or changes the cron fails here.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  checkBackupConfig,
  CONFIG_PLACEHOLDERS,
} from "../../../infra/backup/src/config";
import {
  BACKUP_CRON,
  BUCKET_NAME,
  LIFECYCLE_RULES,
  WORKER_NAME,
  WORKFLOW_NAME,
  checkCommittedBackupConfig,
  checkProductionIdentifiers,
} from "../../../scripts/backup-worker.mjs";
import {
  BACKUP_PREFIX,
  BACKUP_RETENTION_DAYS,
} from "../../../infra/backup/src/object-key";

const ROOT = join(import.meta.dirname, "..", "..", "..");
const CONFIG_TEXT = readFileSync(
  join(ROOT, "infra", "backup", "wrangler.jsonc"),
  "utf8",
);

const VALID = {
  CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
  D1_DATABASE_ID: "00000000-0000-4000-8000-000000000000",
  D1_DATABASE_NAME: "dalyhub-v2",
  BACKUP_ENVIRONMENT: "production",
  D1_REST_API_TOKEN: "a-token-value",
};

describe("checkBackupConfig", () => {
  it("accepts a fully configured environment", () => {
    const checked = checkBackupConfig(VALID);
    expect(checked.ok).toBe(true);
    if (!checked.ok) throw new Error("unreachable");
    expect(checked.config.databaseName).toBe("dalyhub-v2");
    expect(checked.config.apiToken).toBe("a-token-value");
  });

  it("refuses every committed placeholder", () => {
    for (const placeholder of CONFIG_PLACEHOLDERS) {
      const checked = checkBackupConfig({
        ...VALID,
        D1_DATABASE_ID: placeholder,
      });
      expect(checked.ok).toBe(false);
      expect(checked.problems.join(" ")).toContain("placeholder");
    }
  });

  it("refuses a database id that is not a UUID", () => {
    const checked = checkBackupConfig({
      ...VALID,
      D1_DATABASE_ID: "dalyhub-v2",
    });
    expect(checked.ok).toBe(false);
    expect(checked.problems.join(" ")).toMatch(/UUID/i);
  });

  it("refuses an account id that is not an account id", () => {
    const checked = checkBackupConfig({
      ...VALID,
      CLOUDFLARE_ACCOUNT_ID: "my-account",
    });
    expect(checked.ok).toBe(false);
    expect(checked.problems.join(" ")).toContain("CLOUDFLARE_ACCOUNT_ID");
  });

  it("refuses a missing secret and says exactly how to set it", () => {
    const checked = checkBackupConfig({ ...VALID, D1_REST_API_TOKEN: "" });
    expect(checked.ok).toBe(false);
    const message = checked.problems.join(" ");
    expect(message).toContain("wrangler secret put D1_REST_API_TOKEN");
    expect(message).toContain("D1 Edit");
  });

  it("collects every problem rather than stopping at the first", () => {
    const checked = checkBackupConfig({});
    expect(checked.ok).toBe(false);
    expect(checked.problems.length).toBeGreaterThanOrEqual(5);
  });

  it("never echoes the secret's value into a problem message", () => {
    const checked = checkBackupConfig({
      ...VALID,
      CLOUDFLARE_ACCOUNT_ID: "",
      D1_REST_API_TOKEN: "super-secret-token",
    });
    expect(checked.ok).toBe(false);
    expect(checked.problems.join(" ")).not.toContain("super-secret-token");
  });
});

describe("checkProductionIdentifiers", () => {
  it("accepts the real identifiers", () => {
    const checked = checkProductionIdentifiers({
      CLOUDFLARE_ACCOUNT_ID: VALID.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_D1_DATABASE_ID: VALID.D1_DATABASE_ID,
    });
    expect(checked.ok).toBe(true);
  });

  it("refuses to deploy with a placeholder database id", () => {
    const checked = checkProductionIdentifiers({
      CLOUDFLARE_ACCOUNT_ID: VALID.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_D1_DATABASE_ID:
        "PLACEHOLDER_SET_REAL_PRODUCTION_D1_DATABASE_ID",
    });
    expect(checked.ok).toBe(false);
    expect(checked.problems.join(" ")).toContain("placeholder");
  });

  it("refuses to deploy with nothing supplied", () => {
    const checked = checkProductionIdentifiers({});
    expect(checked.ok).toBe(false);
    expect(checked.problems.join(" ")).toContain("CLOUDFLARE_ACCOUNT_ID");
    expect(checked.problems.join(" ")).toContain("CLOUDFLARE_D1_DATABASE_ID");
  });

  it("reuses the repository's existing production variable names", () => {
    // Not a new BACKUP_* variable: docs/development/DEPLOYMENT.md already
    // documents these two, and a second name for the same value is a way to
    // deploy against the wrong database.
    const checked = checkProductionIdentifiers({
      CLOUDFLARE_ACCOUNT_ID: VALID.CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_D1_DATABASE_ID: VALID.D1_DATABASE_ID,
    });
    expect(checked.ok).toBe(true);
  });
});

describe("the committed backup Wrangler config", () => {
  it("passes its own safety checks", () => {
    expect(checkCommittedBackupConfig(CONFIG_TEXT)).toEqual([]);
  });

  it("names the Worker, Workflow and bucket BACKUP-01 specifies", () => {
    expect(CONFIG_TEXT).toContain(`"name": "${WORKER_NAME}"`);
    expect(CONFIG_TEXT).toContain(`"name": "${WORKFLOW_NAME}"`);
    expect(CONFIG_TEXT).toContain(`"bucket_name": "${BUCKET_NAME}"`);
  });

  it("schedules the backup nightly at 16:00 UTC", () => {
    expect(BACKUP_CRON).toBe("0 16 * * *");
    expect(CONFIG_TEXT).toContain(`"schedules": ["${BACKUP_CRON}"]`);
  });

  it("commits no real account id or database id", () => {
    // The production database UUID and the account id must never be committed.
    expect(CONFIG_TEXT).toContain("PLACEHOLDER_SET_REAL_CLOUDFLARE_ACCOUNT_ID");
    expect(CONFIG_TEXT).toContain(
      "PLACEHOLDER_SET_REAL_PRODUCTION_D1_DATABASE_ID",
    );
    expect(CONFIG_TEXT).not.toMatch(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i,
    );
    expect(CONFIG_TEXT).not.toMatch(
      /"CLOUDFLARE_ACCOUNT_ID":\s*"[0-9a-f]{32}"/i,
    );
  });

  it("declares no secret as a var", () => {
    // A committed var of the same name would override the deploy-time secret.
    expect(CONFIG_TEXT).not.toContain('"D1_REST_API_TOKEN":');
  });

  it("rejects a config that would give the Worker a public origin", () => {
    expect(
      checkCommittedBackupConfig(
        CONFIG_TEXT.replace('"workers_dev": false', '"workers_dev": true'),
      ),
    ).toContain(
      'infra/backup/wrangler.jsonc must set "workers_dev": false — the backup Worker must have no public origin.',
    );
  });

  it("rejects a config that adds a route", () => {
    const withRoute = CONFIG_TEXT.replace(
      '"workers_dev": false',
      '"routes": ["hub.daly.id.au/backup"],\n  "workers_dev": false',
    );
    expect(checkCommittedBackupConfig(withRoute).join(" ")).toMatch(
      /declares a route/i,
    );
  });

  it("rejects a config whose schedule has drifted", () => {
    expect(
      checkCommittedBackupConfig(
        CONFIG_TEXT.replace('"0 16 * * *"', '"0 4 * * *"'),
      ).join(" "),
    ).toContain("0 16 * * *");
  });
});

describe("lifecycle rules are the retention policy", () => {
  it("matches the prefixes and retention the object keys assume", () => {
    const daily = LIFECYCLE_RULES.find(
      (rule) => rule.prefix === BACKUP_PREFIX.daily,
    );
    const manual = LIFECYCLE_RULES.find(
      (rule) => rule.prefix === BACKUP_PREFIX.manual,
    );
    expect(daily?.expireDays).toBe(BACKUP_RETENTION_DAYS.daily);
    expect(manual?.expireDays).toBe(BACKUP_RETENTION_DAYS.manual);
    expect(daily?.expireDays).toBe(90);
    expect(manual?.expireDays).toBe(365);
  });

  it("covers every prefix backups are written to", () => {
    for (const prefix of Object.values(BACKUP_PREFIX)) {
      expect(LIFECYCLE_RULES.some((rule) => rule.prefix === prefix)).toBe(true);
    }
  });

  it("does not transition backups to Infrequent Access", () => {
    // BACKUP-01 deliberately keeps one storage class: IA adds a retrieval cost
    // and a minimum-duration charge to the objects an emergency needs fastest.
    for (const rule of LIFECYCLE_RULES) {
      expect(rule).not.toHaveProperty("iaTransitionDays");
    }
  });
});
