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
    // INT and TERM as well as EXIT — V2.4-GATE-01. A cancelled job (the
    // `timeout-minutes` backstop, or a person pressing Cancel) SIGNALS the step
    // rather than letting it exit, and a bare EXIT trap does not run then: the
    // owner's whole database would be left in plaintext on a runner nobody is
    // watching, which is the one moment it matters most.
    expect(WORKFLOW).toContain("trap cleanup EXIT INT TERM");
    expect(WORKFLOW).toContain('rm -rf "${scratch}"');
  });

  it("uses the shared toolchain action rather than its own copy of it", () => {
    // This job hand-rolled corepack + setup-node + install for its whole life,
    // which is exactly the drift `.github/actions/setup` exists to prevent: the
    // backup pipeline could quietly end up on a different Node from the one it
    // is tested on. Nothing about a backup justifies its own toolchain.
    expect(WORKFLOW).toContain("uses: ./.github/actions/setup");
    expect(WORKFLOW).not.toContain("corepack enable");
    expect(WORKFLOW).not.toContain("pnpm install --frozen-lockfile");
  });

  it("refuses a key that is present but not a key", () => {
    // `-z` accepts a passphrase made entirely of whitespace, and GnuPG would
    // encrypt the owner's entire life under it perfectly happily — producing an
    // artifact indistinguishable from a real backup and protected by nothing.
    expect(WORKFLOW).toContain("tr -d '[:space:]'");
    expect(WORKFLOW).toContain("at least 32 non-whitespace characters");
    // The length is compared and never printed, and neither is anything derived
    // from the value.
    expect(WORKFLOW).not.toMatch(
      /echo[^\n]*\$\{?(trimmed_length|BACKUP_ENCRYPTION_PASSPHRASE)/,
    );
  });

  it("guards the upload with an allow-list, not a deny-list", () => {
    // The previous rule refused `*.sql`, `*.json` and `*.zip`, so a plaintext
    // dump written as `dump.txt`, `dump.bak` or with no extension at all walked
    // past it into a thirty-day artifact. The question is not "does this look
    // dangerous?" but "is this one of the two files this artifact may contain?".
    expect(WORKFLOW).toContain(
      "! -name '*.sql.gpg' ! -name 'metadata.json' -print",
    );
    expect(WORKFLOW).not.toMatch(/-name '\*\.sql' -o -name '\*\.json'/);
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

  it("proves the payload RESTORES, not merely that it decrypts", () => {
    // V2.4-GATE-01. `verify` answers "do the bytes come back?"; it cannot
    // answer "will a database load them?", and `validate` is deliberately a
    // shape check rather than a SQL parser. `rehearse` executes the decrypted
    // dump into a throwaway SQLite database and reads the kernel tables out of
    // it, so a schema-only or unparseable export fails the run instead of
    // being filed as a month of recoverable history.
    expect(WORKFLOW).toContain("node scripts/production-backup.mjs rehearse");
    // And it happens BEFORE anything is published, which is the whole point of
    // proving it at all.
    const rehearse = WORKFLOW.indexOf(
      "node scripts/production-backup.mjs rehearse",
    );
    const upload = WORKFLOW.indexOf("Upload encrypted backup artifact");
    expect(rehearse).toBeGreaterThan(-1);
    expect(upload).toBeGreaterThan(rehearse);
  });

  it("publishes a recovery claim only when a receipt backs it", () => {
    // `recoveryVerified: true` was a constant in the metadata writer: it
    // asserted a verification the script had no way to know had happened, and
    // would have gone on asserting it through any edit that dropped or
    // reordered the steps above. The receipt is the evidence, and it is
    // cross-checked against the artifact it claims to describe.
    expect(WORKFLOW).toContain('--receipt "${receipt}"');
    expect(WORKFLOW).toContain('receipt="${scratch}/recovery-receipt.json"');
    // In the SCRATCH directory — the receipt is proof for the run, not part of
    // the artifact, and it is shredded with the plaintext.
    expect(WORKFLOW).not.toMatch(/receipt="backup\//);
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
