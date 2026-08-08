/**
 * AUDIT-11 — the production-backup workflow's contract, asserted statically.
 *
 * A workflow cannot be unit-tested by running it, and the properties that matter
 * here are exactly the ones a future well-meaning edit would break quietly:
 * "we needed the plaintext for something, let's keep it around", "let's add the
 * key to the metadata so recovery is easier", "let's run this on pull requests
 * so we can test it". Each of those reintroduces the finding, and none of them
 * would fail any other test in the repository.
 *
 * So this suite reads the workflow and the pipeline script as text and holds the
 * decisions in place.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const WORKFLOW = readFileSync(
  join(process.cwd(), ".github", "workflows", "production-backup.yml"),
  "utf8",
);
const SCRIPT = readFileSync(
  join(process.cwd(), "scripts", "production-backup.mjs"),
  "utf8",
);

describe("production backup workflow (AUDIT-11)", () => {
  it("uploads only encrypted material and non-sensitive metadata", () => {
    // The artifact directory is `backup/`, and the only things written into it
    // are the .gpg file and metadata.json.
    expect(WORKFLOW).toContain(
      'encrypted="backup/dalyhub-v2-production-${stamp}.sql.gpg"',
    );
    expect(WORKFLOW).toContain("--out backup/metadata.json");
    // The plaintext goes to a scratch directory, never to the upload path.
    expect(WORKFLOW).toContain(
      'plain="${scratch}/dalyhub-v2-production-${stamp}.sql"',
    );
    expect(WORKFLOW).not.toMatch(/plain="backup\//);
    // And a guard step refuses to upload if that ever stops being true.
    expect(WORKFLOW).toContain("Refuse to upload anything unencrypted");
    expect(WORKFLOW).toContain("Refusing to upload");
  });

  it("removes the plaintext dump and the key file even when a step fails", () => {
    expect(WORKFLOW).toContain("trap cleanup EXIT");
    expect(WORKFLOW).toContain('rm -rf "${scratch}"');
  });

  it("never passes the passphrase on a command line and never prints it", () => {
    // The secret reaches disk under a restrictive umask and is referenced only
    // by path. Passing it as an argument would expose it through /proc.
    expect(WORKFLOW).toContain("umask 077");
    expect(WORKFLOW).toContain("--passphrase-file");
    expect(WORKFLOW).not.toContain("--passphrase ${");
    // The variable's NAME appears in the "it is not configured" message, which
    // is fine; its VALUE must never be expanded into an echoed string.
    expect(WORKFLOW).not.toMatch(/echo[^\n]*\$\{?BACKUP_ENCRYPTION_PASSPHRASE/);
    // A shell trace would echo every expanded command, secrets included.
    expect(WORKFLOW).not.toContain("set -x");
  });

  it("fails before exporting when no encryption key is configured", () => {
    // Ordering matters: discovering the key is missing AFTER the export has
    // already written the owner's database to the runner is too late.
    const guard = WORKFLOW.indexOf("Refuse to run without an encryption key");
    const exportStep = WORKFLOW.indexOf("Export, validate, encrypt and verify");
    expect(guard).toBeGreaterThan(-1);
    expect(exportStep).toBeGreaterThan(guard);
    expect(WORKFLOW).toContain(
      "Refusing to export production data that cannot be encrypted",
    );
  });

  it("proves recovery on every run rather than assuming it", () => {
    expect(WORKFLOW).toContain("node scripts/production-backup.mjs validate");
    expect(WORKFLOW).toContain("node scripts/production-backup.mjs encrypt");
    expect(WORKFLOW).toContain("node scripts/production-backup.mjs verify");
  });

  it("runs only from the schedule or a manual dispatch, in the production environment", () => {
    expect(WORKFLOW).toContain("schedule:");
    expect(WORKFLOW).toContain("workflow_dispatch:");
    // An untrusted pull request must never be able to run a job that holds
    // production secrets.
    expect(WORKFLOW).not.toMatch(/^on:[\s\S]*?pull_request/m);
    expect(WORKFLOW).not.toContain("pull_request_target");
    expect(WORKFLOW).not.toContain("push:");
    expect(WORKFLOW).toContain("environment: production");
  });

  it("keeps workflow permissions minimal", () => {
    expect(WORKFLOW).toMatch(/permissions:\n\s+contents: read/);
    expect(WORKFLOW).not.toContain("contents: write");
    expect(WORKFLOW).not.toContain("permissions: write-all");
    expect(WORKFLOW).not.toContain("id-token: write");
  });

  it("states its retention deliberately", () => {
    expect(WORKFLOW).toContain("retention-days: 30");
    // The reasoning is beside the value, so the next person changing it has to
    // engage with why it is 30 rather than guess.
    expect(WORKFLOW).toContain("Retention stays at 30 days");
  });

  it("uses one pipeline for scheduled and manual runs", () => {
    // Both triggers land in the same job with the same steps. A second script
    // path is how "secure scheduled backup, insecure manual backup" happens.
    expect(WORKFLOW.match(/runs-on:/g) ?? []).toHaveLength(1);
    expect(WORKFLOW.match(/^ {2}export:$/gm) ?? []).toHaveLength(1);
  });

  it("names which artifact is which, so recovery is never a guess", () => {
    expect(WORKFLOW).toContain("INFRASTRUCTURE disaster-recovery copy");
    expect(WORKFLOW).toContain("CANONICAL DalyHub backup");
    expect(WORKFLOW).toContain("BACKUP_AND_RESTORE.md");
  });

  it("hard-codes no key and reads the secret from the protected environment", () => {
    expect(WORKFLOW).toContain(
      "BACKUP_ENCRYPTION_PASSPHRASE: ${{ secrets.BACKUP_ENCRYPTION_PASSPHRASE }}",
    );
    // Nothing that looks like an embedded key or passphrase literal.
    expect(WORKFLOW).not.toMatch(/passphrase\s*[:=]\s*["'][^"'$]{6,}["']/i);
  });

  it("encrypts with reviewable parameters rather than whatever gpg defaults to", () => {
    expect(SCRIPT).toContain('"--cipher-algo",\n  "AES256"');
    expect(SCRIPT).toContain('"--s2k-mode",\n  "3"');
    expect(SCRIPT).toContain('"--s2k-digest-algo",\n  "SHA512"');
    expect(SCRIPT).toContain('"--s2k-count",\n  "65011712"');
    // No home-made cryptography anywhere in the pipeline.
    expect(SCRIPT).not.toContain("createCipheriv");
    expect(SCRIPT).not.toContain("createDecipheriv");
  });

  it("never writes backup contents to a log stream", () => {
    // Every gpg invocation writes to a file with --output, and stdout is ignored,
    // so plaintext has no route to a log even on an unexpected failure.
    expect(SCRIPT).toContain('stdio: ["ignore", "ignore", "inherit"]');
  });
});
