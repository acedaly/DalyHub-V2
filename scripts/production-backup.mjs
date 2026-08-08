/**
 * AUDIT-11 — the ONE production-backup pipeline: validate, encrypt, prove.
 *
 * ── The problem this exists to remove ─────────────────────────────────────────
 * The scheduled production backup used to upload the complete production D1
 * database to a GitHub Actions artifact as a plain `.sql` file. The Cloudflare
 * credentials were handled correctly, and that was never the finding: the DUMP
 * is the owner's entire personal life — People and their contact details, Diary
 * entries, Meeting notes, Reviews — and anyone who could read the repository's
 * Actions could read it in full, for thirty days, in plain text.
 *
 * ── What this does instead ────────────────────────────────────────────────────
 * The dump never leaves the ephemeral runner unencrypted. This script is the one
 * path the workflow uses, for both the scheduled and the manually dispatched
 * run, so there is no "secure scheduled backup, insecure manual backup" split:
 *
 *   validate  structural checks on the dump — present, non-empty, complete
 *             schema, not truncated. A backup pipeline that cheerfully encrypts
 *             a corrupt dump every night is worse than none.
 *   encrypt   GnuPG symmetric AES-256, passphrase read from a FILE.
 *   verify    decrypt the encrypted file back and prove, byte for byte, that it
 *             reproduces the original — and that the original's bytes do not
 *             appear inside the ciphertext. Recoverability is demonstrated on
 *             every single run, not assumed from a file extension.
 *
 * ── Why GnuPG, and why not something bespoke ──────────────────────────────────
 * AGENTS.md §11 and the "no custom cryptography" rule both point the same way.
 * GnuPG is pre-installed on GitHub's Ubuntu runners, is mature and widely
 * audited, and — the property that actually matters for disaster recovery — its
 * output is decryptable with a single standard command on any machine, years
 * from now, with no DalyHub code present:
 *
 *     gpg --batch --decrypt --passphrase-file key.txt backup.sql.gpg > backup.sql
 *
 * A hand-rolled AES-GCM container built on `node:crypto` would be equally strong
 * and strictly worse to recover from, because it would make the owner's recovery
 * depend on this repository still existing. AES-256 with an iterated, salted S2K
 * is chosen explicitly rather than left to defaults so the parameters are
 * reviewable here instead of inferred from a GnuPG version.
 *
 * ── The passphrase ────────────────────────────────────────────────────────────
 * Read from a file, never from `argv` and never from an environment variable
 * interpolated into a shell command: `argv` is world-readable through `/proc` on
 * a shared host, and an interpolated secret can be echoed by `set -x`. The
 * workflow writes the secret to a file with `umask 077` and deletes it in a
 * `finally`. Nothing in this script ever prints the passphrase, its length, or
 * any part of the plaintext.
 *
 * ── Usage ─────────────────────────────────────────────────────────────────────
 *   node scripts/production-backup.mjs validate --in dump.sql
 *   node scripts/production-backup.mjs encrypt  --in dump.sql --out dump.sql.gpg \
 *                                               --passphrase-file key.txt
 *   node scripts/production-backup.mjs verify   --in dump.sql --encrypted dump.sql.gpg \
 *                                               --passphrase-file key.txt
 *   node scripts/production-backup.mjs metadata --encrypted dump.sql.gpg --in dump.sql \
 *                                               --out metadata.json [--field k=v …]
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* -------------------------------------------------------------------------- */
/* Cipher parameters — stated, not defaulted                                  */
/* -------------------------------------------------------------------------- */

/**
 * The GnuPG symmetric-encryption arguments, as data so a test can assert them.
 *
 * - `--symmetric` with `--cipher-algo AES256`: one passphrase, no key management
 *   infrastructure, and the strongest cipher GnuPG offers.
 * - `--s2k-mode 3` + `--s2k-count 65011712`: a SALTED and ITERATED key
 *   derivation at GnuPG's maximum iteration count, so a stolen artifact is not
 *   trivially brute-forceable if the passphrase is weaker than it should be.
 * - `--s2k-digest-algo SHA512`: the digest that derivation runs through.
 * - `--batch --yes --no-tty --pinentry-mode loopback`: never prompt, never touch
 *   a terminal — a prompt on a runner is a hang, not a safety net.
 * - `--no-symkey-cache`: nothing about this passphrase is kept by the agent.
 */
export const GPG_ENCRYPT_ARGS = [
  "--batch",
  "--yes",
  "--no-tty",
  "--pinentry-mode",
  "loopback",
  "--no-symkey-cache",
  "--symmetric",
  "--cipher-algo",
  "AES256",
  "--s2k-mode",
  "3",
  "--s2k-digest-algo",
  "SHA512",
  "--s2k-count",
  "65011712",
  "--compress-algo",
  "zlib",
];

/** The decryption arguments. Symmetric, batch, loopback — nothing else. */
export const GPG_DECRYPT_ARGS = [
  "--batch",
  "--yes",
  "--no-tty",
  "--pinentry-mode",
  "loopback",
  "--no-symkey-cache",
  "--decrypt",
];

/**
 * Tables whose presence proves the dump carries the real schema rather than a
 * partial or failed export.
 *
 * Deliberately the KERNEL tables plus the most sensitive module tables: if these
 * are absent, whatever was exported is not a DalyHub database and must not be
 * stored as one.
 */
export const REQUIRED_DUMP_TABLES = [
  "entities",
  "workspaces",
  "entity_links",
  "activities",
  "activity_subjects",
  "spine_records",
  "task_details",
  "note_details",
  "diary_entry_details",
  "person_details",
  "meeting_details",
  "review_details",
];

/* -------------------------------------------------------------------------- */
/* Pure validation                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Structurally validate a D1 SQL dump. PURE — takes the text, returns problems.
 *
 * It is deliberately not a SQL parser. It answers the questions a nightly job
 * actually needs answered: did an export happen, did it carry the schema, and
 * did it finish? Everything deeper is the restore's job, and a restore of a raw
 * dump is `wrangler d1 execute`, which will reject malformed SQL itself.
 */
export function validateDumpText(text) {
  const problems = [];
  if (text.trim().length === 0) {
    problems.push("the dump is empty");
    return problems;
  }
  for (const table of REQUIRED_DUMP_TABLES) {
    // D1 quotes identifiers inconsistently across versions, so match either.
    const pattern = new RegExp(
      `CREATE TABLE\\s+(IF NOT EXISTS\\s+)?["\`\\[]?${table}["\`\\]]?[\\s(]`,
      "i",
    );
    if (!pattern.test(text)) {
      problems.push(`the dump has no CREATE TABLE for "${table}"`);
    }
  }
  // A dump cut off mid-statement is the failure mode that looks fine until the
  // day it is needed. The last non-blank, non-comment line must end a statement.
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("--"));
  const last = lines[lines.length - 1] ?? "";
  if (!last.endsWith(";")) {
    problems.push("the dump does not end with a complete SQL statement");
  }
  return problems;
}

/* -------------------------------------------------------------------------- */
/* Small helpers                                                              */
/* -------------------------------------------------------------------------- */

function fail(message) {
  // `::error::` is the GitHub Actions annotation form. The message never carries
  // dump content — only file names, sizes and rule names.
  console.error(`::error::${message}`);
  process.exit(1);
}

function readArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = argv[index + 1];
      if (next === undefined || next.startsWith("--")) {
        args[key] = true;
      } else {
        if (args[key] === undefined) args[key] = next;
        else args[key] = [].concat(args[key], next);
        index += 1;
      }
    } else {
      args._.push(token);
    }
  }
  return args;
}

function sha256File(path) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function requireFile(path, what) {
  if (typeof path !== "string" || path.length === 0) {
    fail(`Missing --${what}.`);
  }
  if (!existsSync(path)) fail(`${what} file does not exist: ${path}`);
  if (statSync(path).size === 0) fail(`${what} file is empty: ${path}`);
  return path;
}

function runGpg(args, { input, expectOutputAt } = {}) {
  const result = spawnSync("gpg", args, {
    // Inherit stderr so a real GnuPG failure is diagnosable, but NEVER let
    // plaintext reach a stream: every invocation writes to a file with
    // `--output`, so stdout carries nothing.
    stdio: ["ignore", "ignore", "inherit"],
    input,
  });
  if (result.error) {
    fail(`gpg could not be run (${result.error.code ?? "unknown"}).`);
  }
  if (result.status !== 0) {
    fail(`gpg exited with status ${result.status}.`);
  }
  if (expectOutputAt !== undefined && !existsSync(expectOutputAt)) {
    fail(`gpg reported success but produced no file at ${expectOutputAt}.`);
  }
}

/* -------------------------------------------------------------------------- */
/* Commands                                                                   */
/* -------------------------------------------------------------------------- */

function commandValidate(args) {
  const input = requireFile(args.in, "in");
  const problems = validateDumpText(readFileSync(input, "utf8"));
  if (problems.length > 0) {
    for (const problem of problems) console.error(`::error::${problem}`);
    fail(
      `The production dump failed structural validation (${problems.length} problem(s)).`,
    );
  }
  console.log(
    `Dump OK: ${input} (${statSync(input).size} bytes, ${REQUIRED_DUMP_TABLES.length} required tables present). Contents are never printed.`,
  );
}

function commandEncrypt(args) {
  const input = requireFile(args.in, "in");
  const passphraseFile = requireFile(
    args["passphrase-file"],
    "passphrase-file",
  );
  const output = args.out;
  if (typeof output !== "string" || output.length === 0) fail("Missing --out.");
  if (existsSync(output)) rmSync(output);

  runGpg(
    [
      ...GPG_ENCRYPT_ARGS,
      "--passphrase-file",
      passphraseFile,
      "--output",
      output,
      input,
    ],
    { expectOutputAt: output },
  );

  const size = statSync(output).size;
  if (size === 0) fail("The encrypted backup is empty.");
  console.log(`Encrypted OK: ${output} (${size} bytes).`);
}

/**
 * Prove the encrypted artifact is genuinely recoverable.
 *
 * Two independent checks, because either alone is easy to pass by accident:
 *
 *   1. **Round trip.** Decrypt with the same passphrase and compare the SHA-256
 *      of the result to the original. This is what makes the artifact a backup
 *      rather than a file with a `.gpg` suffix.
 *   2. **Confidentiality.** Assert that a distinctive run of the plaintext does
 *      NOT appear in the ciphertext, which catches the whole family of
 *      "encryption" that is really an encoding.
 */
function commandVerify(args) {
  const input = requireFile(args.in, "in");
  const encrypted = requireFile(args.encrypted, "encrypted");
  const passphraseFile = requireFile(
    args["passphrase-file"],
    "passphrase-file",
  );

  const cipher = readFileSync(encrypted);
  const plain = readFileSync(input);
  // A run from the middle of the dump, long enough to be distinctive and short
  // enough to be a cheap scan. The middle rather than the head, because a header
  // could coincidentally survive compression framing.
  const probeStart = Math.floor(plain.length / 2);
  const probe = plain.subarray(probeStart, probeStart + 64);
  if (probe.length > 0 && cipher.includes(probe)) {
    fail(
      "The encrypted artifact contains plaintext from the dump. It is not encrypted.",
    );
  }

  const scratch = mkdtempSync(join(tmpdir(), "dalyhub-backup-verify-"));
  try {
    const roundTrip = join(scratch, "decrypted.sql");
    runGpg(
      [
        ...GPG_DECRYPT_ARGS,
        "--passphrase-file",
        passphraseFile,
        "--output",
        roundTrip,
        encrypted,
      ],
      { expectOutputAt: roundTrip },
    );
    const before = sha256File(input);
    const after = sha256File(roundTrip);
    if (before !== after) {
      fail(
        "The encrypted backup did not decrypt back to the original dump. It is not recoverable.",
      );
    }
    console.log(
      `Recovery proved: ${encrypted} decrypts to a byte-identical dump (sha256 ${after}).`,
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Write the artifact's non-sensitive metadata.
 *
 * Everything here is deliberately safe to read: file names, byte sizes, digests
 * and run identifiers. A SHA-256 is one-way, so publishing the PLAINTEXT digest
 * alongside the ciphertext lets the owner confirm a future decryption produced
 * the original file without disclosing anything about its contents. There is no
 * field for a key, and the writer refuses any extra field whose name suggests
 * one, so "the key ended up in the metadata" cannot happen by editing a template.
 */
function commandMetadata(args) {
  const encrypted = requireFile(args.encrypted, "encrypted");
  const input = requireFile(args.in, "in");
  const output = args.out;
  if (typeof output !== "string" || output.length === 0) fail("Missing --out.");

  const extra = {};
  for (const field of [].concat(args.field ?? [])) {
    if (typeof field !== "string") continue;
    const split = field.indexOf("=");
    if (split <= 0) continue;
    const key = field.slice(0, split);
    if (FORBIDDEN_METADATA_KEY.test(key)) {
      fail(`Refusing to write a metadata field named "${key}".`);
    }
    extra[key] = field.slice(split + 1);
  }

  const metadata = {
    artifact: encrypted.split("/").pop(),
    encryption: "gnupg-symmetric-aes256",
    encryptedBytes: statSync(encrypted).size,
    encryptedSha256: sha256File(encrypted),
    plaintextBytes: statSync(input).size,
    plaintextSha256: sha256File(input),
    recoveryVerified: true,
    decryptCommand:
      "gpg --batch --decrypt --passphrase-file <your-recovery-key-file> <artifact> > dalyhub-production.sql",
    purpose:
      "Infrastructure disaster recovery: a raw Cloudflare D1 SQL dump. For ordinary workspace recovery use a DalyHub backup archive and Settings > Privacy & data > Restore. See docs/development/BACKUP_AND_RESTORE.md.",
    ...extra,
  };
  const serialised = `${JSON.stringify(metadata, null, 2)}\n`;
  writeFileSync(output, serialised);
  console.log(`Metadata written: ${output}`);
}

/** Field names a metadata file must never carry. */
export const FORBIDDEN_METADATA_KEY =
  /(secret|token|passphrase|password|key|credential)/i;

/* -------------------------------------------------------------------------- */

const COMMANDS = {
  validate: commandValidate,
  encrypt: commandEncrypt,
  verify: commandVerify,
  metadata: commandMetadata,
};

// Only run when invoked directly, so the pure helpers above stay importable by
// tests without executing anything.
if (process.argv[1]?.endsWith("production-backup.mjs")) {
  const [, , command, ...rest] = process.argv;
  const run = COMMANDS[command];
  if (run === undefined) {
    fail(
      `Unknown command "${command ?? ""}". Expected one of: ${Object.keys(COMMANDS).join(", ")}.`,
    );
  }
  run(readArgs(rest));
}
