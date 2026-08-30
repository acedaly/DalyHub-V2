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
 *   reorder   move every CREATE INDEX ahead of the data, so the dump can
 *             actually be RESTORED. A raw D1 export cannot be — measured on
 *             both restore paths, see `reorderDumpForRestore` and
 *             BACKUP_AND_RESTORE.md § 5.0a. A permutation of whole statements
 *             and nothing else; it refuses rather than transform on doubt.
 *   encrypt   GnuPG symmetric AES-256, passphrase read from a FILE.
 *   verify    decrypt the encrypted file back and prove, byte for byte, that it
 *             reproduces the original — and that the original's bytes do not
 *             appear inside the ciphertext. Recoverability is demonstrated on
 *             every single run, not assumed from a file extension.
 *   rehearse  the step above proves the CIPHERTEXT round-trips. This one proves
 *             the PAYLOAD is a database: decrypt the artifact, EXECUTE the SQL
 *             into a throwaway SQLite file, and read the kernel tables back out
 *             of it. See § "Why a round trip is not a recovery proof" below.
 *
 * ── Why a round trip is not a recovery proof (V2.4-GATE-01) ───────────────────
 * `verify` answers "can this file be decrypted back to the bytes we encrypted?".
 * That is necessary and it is not sufficient: the bytes it reproduces could be a
 * dump that no database will load. `validate` narrows that with structural
 * checks, but it is deliberately not a SQL parser (see its own docstring), so
 * "every required CREATE TABLE appears and the last statement is terminated" is
 * a shape check rather than a load.
 *
 * `rehearse` closes the gap the only way it can be closed — by restoring. It
 * starts from the ENCRYPTED artifact and the key, exactly as the owner would on
 * the day it matters, and finishes with rows read out of a database built from
 * it. Nothing it touches is production: the target is a throwaway file in a
 * scratch directory, created and deleted inside one command.
 *
 * `node:sqlite` is the engine, deliberately. It is Node's own standard library —
 * no dependency, no licence question, and the same binary the rest of this
 * pipeline already runs on — and D1 is SQLite, so a dump SQLite will not load is
 * a dump D1 will not load either.
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
 *   node scripts/production-backup.mjs reorder  --in dump.sql \
 *                                               --out dump-restorable.sql
 *   node scripts/production-backup.mjs encrypt  --in dump.sql --out dump.sql.gpg \
 *                                               --passphrase-file key.txt
 *   node scripts/production-backup.mjs verify   --in dump.sql --encrypted dump.sql.gpg \
 *                                               --passphrase-file key.txt \
 *                                               --receipt recovery.json
 *   node scripts/production-backup.mjs rehearse --encrypted dump.sql.gpg \
 *                                               --passphrase-file key.txt
 *   node scripts/production-backup.mjs metadata --encrypted dump.sql.gpg \
 *                                               --receipt recovery.json \
 *                                               --out metadata.json [--field k=v …]
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
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
/* Reordering a dump so it can actually be restored (DEBT-199)                */
/* -------------------------------------------------------------------------- */

/**
 * The statement classes, in the order a restorable dump must present them.
 *
 * Named rather than inlined so the ordering contract is one readable line, and
 * so a reader looking for "what order does this produce?" finds an answer rather
 * than a `flatMap`.
 */
export const REORDER_CLASSES = ["prologue", "table", "index", "data"];

/**
 * Which class a statement belongs to, from its first non-blank line. PURE.
 *
 * Deliberately narrow. Anything that is not a `PRAGMA`, a `CREATE TABLE` or a
 * `CREATE INDEX` is DATA — including `DELETE FROM sqlite_sequence`, which a D1
 * export emits immediately before the matching `INSERT INTO sqlite_sequence`.
 * Classifying it as data is what keeps that pair adjacent and in order: both
 * land in the same class, and relative order within a class is preserved.
 *
 * @param {string[]} statement lines belonging to one statement
 * @returns {"prologue" | "table" | "index" | "data" | null} null = unclassifiable
 */
export function classifyDumpStatement(statement) {
  const head = statement.find((line) => line.trim() !== "");
  if (head === undefined) return null;
  if (/^PRAGMA\b/i.test(head)) return "prologue";
  if (/^CREATE\s+TABLE\b/i.test(head)) return "table";
  if (/^CREATE\s+(UNIQUE\s+)?INDEX\b/i.test(head)) return "index";
  if (/^(INSERT|DELETE|UPDATE|REPLACE)\b/i.test(head)) return "data";
  return null;
}

/**
 * Split a dump into whole statements. PURE.
 *
 * A statement begins at the first line after the previous one ended and runs to
 * the first line whose trimmed text ends with `;`. That is exact for a D1 export
 * and it is checked rather than assumed: `reorderDumpForRestore` refuses unless
 * re-joining the parsed statements reproduces the input BYTE FOR BYTE, so a dump
 * whose shape this parser does not understand is rejected instead of mangled.
 *
 * Multi-row `INSERT`s spanning lines would break a naive line-wise split. They
 * do not occur — a D1 export writes one `INSERT` per line — and the byte-identity
 * check above is what turns that observation into a guarantee.
 *
 * @param {string} text
 * @returns {{ statements: string[][], endsWithNewline: boolean, complete: boolean }}
 *   `complete` is false when the input ends mid-statement — reported rather than
 *   thrown, so the caller can fail with the rest of its evidence at once.
 */
export function splitDumpStatements(text) {
  const lines = text.split("\n");
  const endsWithNewline = lines[lines.length - 1] === "";
  if (endsWithNewline) lines.pop();

  const statements = [];
  let current = null;
  for (const line of lines) {
    if (current === null) {
      current = [];
      statements.push(current);
    }
    current.push(line);
    if (line.trimEnd().endsWith(";")) current = null;
  }
  // `current !== null` means the file ends mid-statement. Left for the caller
  // to refuse, with the rest of its evidence, rather than thrown from here.
  return { statements, endsWithNewline, complete: current === null };
}

/**
 * Reorder a D1 SQL dump so it can be restored by `wrangler d1 execute --file`.
 * PURE — text in, text out, no I/O.
 *
 * ── The defect this exists for (DEBT-199, MEASURED 2026-08-30) ────────────────
 * A D1 export writes each table's DDL followed immediately by its rows, and
 * emits every `CREATE [UNIQUE] INDEX` at the END of the file. `entities`
 * declares `id TEXT NOT NULL PRIMARY KEY` with no inline `UNIQUE (workspace_id,
 * id)`; `entity_links` carries composite foreign keys referencing
 * `entities (workspace_id, id)`, whose parent key is unique ONLY because of
 * `entities_workspace_id_key` — an index the dump does not create for another
 * ~3,000 lines. SQLite therefore raises
 *
 *     foreign key mismatch - "entity_links" referencing "entities"
 *
 * on the first `INSERT INTO entity_links`, and stops. `foreign key mismatch` is
 * a SCHEMA error rather than a constraint violation, so the
 * `PRAGMA defer_foreign_keys=TRUE` the export itself emits on line 1 does not
 * defer it. Measured on BOTH restore paths: the local Miniflare executor
 * (2026-08-22) and Cloudflare's remote D1 import endpoint (2026-08-30).
 *
 * ── The fix, and why it is a permutation and nothing else ─────────────────────
 * Move every `CREATE INDEX` ahead of the data, so a composite foreign key's
 * parent index exists before the first row that depends on it. No statement is
 * edited, split, merged, added or removed, and relative order WITHIN each class
 * is preserved — so this cannot change what the dump means, only when each
 * statement runs. The invariants are asserted here rather than trusted:
 *
 *   - re-joining the parsed statements reproduces the input byte for byte;
 *   - every line is assigned to exactly one statement;
 *   - every statement is classifiable;
 *   - the output has the same statement count and the same byte length;
 *   - the multiset of statements is unchanged.
 *
 * A dump that fails any of them is REFUSED. Silently transforming input this
 * function does not understand is the one outcome worse than refusing: it would
 * produce a plausible file that restores something other than the backup.
 *
 * @param {string} text a D1 SQL dump
 * @returns {{ ok: true, text: string, census: Record<string, number> }
 *          | { ok: false, problems: string[] }}
 */
export function reorderDumpForRestore(text) {
  const problems = [];
  if (typeof text !== "string" || text.trim().length === 0) {
    return { ok: false, problems: ["the dump is empty"] };
  }

  const { statements, endsWithNewline, complete } = splitDumpStatements(text);
  if (!complete) {
    problems.push(
      "the dump ends mid-statement, so it cannot be split into whole statements",
    );
  }

  const join = (statement) => statement.join("\n");
  const render = (list) =>
    list.map(join).join("\n") + (endsWithNewline ? "\n" : "");

  // The parser is exact, or nothing below it means anything.
  if (render(statements) !== text) {
    problems.push(
      "the parsed statements do not reassemble into the original dump, so this is not a shape this command understands",
    );
  }

  const by = { prologue: [], table: [], index: [], data: [] };
  const unclassified = [];
  for (const statement of statements) {
    const kind = classifyDumpStatement(statement);
    if (kind === null) {
      // The leading SQL KEYWORDS only, and only letters — never an identifier,
      // a literal or a row of the owner's life. `ANALYZE 'jamie@example.test'`
      // must report `ANALYZE` and nothing more; a test asserts exactly that,
      // because the first version of this line sliced by characters and leaked
      // the literal into a diagnostic.
      const head = statement.find((l) => l.trim() !== "") ?? "";
      const keywords = (head
        .trimStart()
        .match(/^[A-Za-z]+(?:\s+[A-Za-z]+)?/) ?? [""])[0];
      unclassified.push(keywords.trim().toUpperCase());
      continue;
    }
    by[kind].push(statement);
  }
  if (unclassified.length > 0) {
    problems.push(
      `the dump contains ${unclassified.length} statement(s) this command cannot classify, beginning: ${[
        ...new Set(unclassified),
      ]
        .slice(0, 3)
        .map((s) => JSON.stringify(s))
        .join(", ")}`,
    );
  }
  if (problems.length > 0) return { ok: false, problems };

  const ordered = REORDER_CLASSES.flatMap((kind) => by[kind]);
  const out = render(ordered);

  // Permutation invariants, checked on the way out.
  const digest = (list) =>
    createHash("sha256")
      .update(list.map(join).slice().sort().join(" "))
      .digest("hex");
  if (ordered.length !== statements.length) {
    problems.push("the reordered dump has a different number of statements");
  }
  if (Buffer.byteLength(out) !== Buffer.byteLength(text)) {
    problems.push("the reordered dump has a different byte length");
  }
  if (digest(ordered) !== digest(statements)) {
    problems.push("the reordered dump does not carry the same statements");
  }
  if (problems.length > 0) return { ok: false, problems };

  return {
    ok: true,
    text: out,
    census: {
      prologue: by.prologue.length,
      table: by.table.length,
      index: by.index.length,
      data: by.data.length,
      total: statements.length,
    },
  };
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

/**
 * A scratch directory that is removed on EVERY exit path.
 *
 * A `finally` alone is not enough here, and the gap is not theoretical:
 * `fail()` calls `process.exit`, which does **not** run `finally` blocks. So a
 * refusal partway through `verify` or `rehearse` — a tampered artifact, a dump
 * that will not load — left the DECRYPTED production database sitting in the OS
 * temp directory, which is exactly the plaintext this pipeline exists to keep
 * from surviving a failure. An `exit` hook runs on both paths; the `finally`
 * blocks stay as well, so the directory is gone the moment the command is done
 * rather than at the end of the process.
 *
 * @param {string} prefix
 */
function makeScratch(prefix) {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  process.on("exit", () => {
    rmSync(dir, { recursive: true, force: true });
  });
  return dir;
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

/**
 * Refuse an output that is the input under another name (#239 review, P2).
 *
 * `reorder` guarantees the source artifact stays canonical and untouched, and
 * until this guard that guarantee held only when the operator never pointed
 * `--out` back at the input: `reorder --in raw.sql --out raw.sql` exited 0 and
 * replaced the canonical dump with its permutation — same byte length,
 * different bytes — silently invalidating the artifact's provenance checksum.
 * A symlink or a hard link to the input did the same through a second name.
 *
 * Identity is asked of the OPERATING SYSTEM rather than of the path strings:
 * the write follows symlinks, so the question is whether the file the output
 * path currently designates is the file the input designates. `dev` + `ino`
 * (bigint, so identity is never truncated) is that answer — two spellings of
 * one path, a symlink chain and a hard link all share it. Canonical-path
 * equality is kept as a second, independent net for a filesystem whose inode
 * numbers cannot be trusted. An output path that designates no existing file
 * cannot be the input, and passes through untouched.
 *
 * Runs BEFORE the input is read, so a refusal provably writes nothing, prints
 * nothing of the dump, and leaves the source byte-identical. Fail-closed on
 * doubt, for the same reason the transformation itself is: the property being
 * protected is that the artifact's bytes never depend on this command running.
 */
function assertOutputIsNotTheInput(input, output) {
  const inputStat = statSync(input, { bigint: true });
  const outputStat = statSync(output, {
    bigint: true,
    throwIfNoEntry: false,
  });
  if (outputStat === undefined) return;
  const sameUnderlyingFile =
    outputStat.dev === inputStat.dev && outputStat.ino === inputStat.ino;
  const sameCanonicalPath = realpathSync(output) === realpathSync(input);
  if (sameUnderlyingFile || sameCanonicalPath) {
    fail(
      `--out ${output} is the same underlying file as --in ${input}. ` +
        `Refusing to reorder the canonical source dump in place — write the ` +
        `restorable copy to a NEW file. The dump is unchanged.`,
    );
  }
}

/**
 * Write a restorable copy of a dump. Refuses rather than transforms on doubt.
 *
 * The output is the file to hand `wrangler d1 execute --remote --file`. The
 * input is left untouched: the ARTIFACT stays canonical, and the reordering is
 * a step in the restore rather than a change to what gets backed up — which is
 * why the output may not BE the input, however it is spelled or linked
 * (`assertOutputIsNotTheInput`).
 */
function commandReorder(args) {
  const input = requireFile(args.in, "in");
  const output = args.out;
  if (typeof output !== "string" || output.length === 0) fail("Missing --out.");
  assertOutputIsNotTheInput(input, output);

  const result = reorderDumpForRestore(readFileSync(input, "utf8"));
  if (!result.ok) {
    for (const problem of result.problems) console.error(`::error::${problem}`);
    fail(
      `Refusing to reorder ${input} (${result.problems.length} problem(s)). The dump is unchanged.`,
    );
  }
  writeFileSync(output, result.text);
  const { prologue, table, index, data, total } = result.census;
  console.log(
    `Reordered for restore: ${output} (${statSync(output).size} bytes, ` +
      `${total} statements — ${prologue} prologue, ${table} CREATE TABLE, ` +
      `${index} CREATE INDEX, ${data} data). Same statements, restorable order; ` +
      `contents are never printed.`,
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

  const scratch = makeScratch("dalyhub-backup-verify-");
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
    // The RECEIPT, and why it exists. `metadata` publishes
    // `recoveryVerified: true`, and until V2.4-GATE-01 it published that claim
    // unconditionally — it had no way to know whether this command had ever
    // run. A metadata file that asserts a verification nobody performed is
    // precisely the "proves a file exists rather than proving it is
    // recoverable" failure the gate was raised to remove, and it would survive
    // any edit that reordered or dropped the verify step.
    //
    // So the claim is now carried by evidence: this command writes the digests
    // it actually computed, and `metadata` refuses to publish the claim without
    // a receipt whose ciphertext digest matches the artifact in front of it.
    writeReceipt(args.receipt, {
      artifact: encrypted.split("/").pop(),
      encryptedSha256: sha256File(encrypted),
      plaintextSha256: after,
      plaintextBytes: statSync(input).size,
      encryptedBytes: statSync(encrypted).size,
      roundTrip: "byte-identical",
    });
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * Write a verification receipt, when one was asked for.
 *
 * Optional so an operator running `verify` by hand on a downloaded artifact does
 * not have to supply a path for a file they do not want. The pipeline always
 * asks for one, and `metadata` will not publish a recovery claim without it.
 *
 * @param {unknown} path
 * @param {Record<string, unknown>} receipt
 */
function writeReceipt(path, receipt) {
  if (typeof path !== "string" || path.length === 0) return;
  writeFileSync(path, `${JSON.stringify(receipt, null, 2)}\n`);
  console.log(`Recovery receipt written: ${path}`);
}

/**
 * The tables `rehearse` reads a row count out of after restoring.
 *
 * The kernel's own — a database in which these three cannot be queried is not a
 * database DalyHub could be brought back on. `entities` additionally must be
 * NON-EMPTY: a schema-only dump satisfies every structural check in this file
 * and would restore a workspace containing nothing at all.
 */
export const REHEARSAL_COUNT_TABLES = ["workspaces", "entities", "activities"];

/**
 * Prove the artifact is a RESTORABLE DATABASE, not merely a decryptable file.
 *
 * Starts where a real recovery starts — the encrypted artifact plus the key —
 * and ends with rows read out of a database built from it.
 *
 * ── Why this cannot be `wrangler d1 execute --file`, which is what the recovery
 *    documentation used to say (V2.4-GATE-01, MEASURED) ──────────────────────
 * It does not work, and it never did. A D1 export writes each table's DDL
 * followed immediately by its data, and puts every `CREATE UNIQUE INDEX` at the
 * END of the file. `entity_links` carries composite foreign keys —
 * `REFERENCES entities (workspace_id, id)` — whose parent key is unique only
 * because of `entities_workspace_id_key`, an index the dump does not create for
 * another ~2,700 lines. SQLite therefore raises
 *
 *     foreign key mismatch - "entity_links" referencing "entities"
 *
 * on the first `INSERT INTO entity_links`, and stops. This is a SCHEMA error
 * rather than a constraint violation, which is the part that makes it
 * unavoidable: the `PRAGMA defer_foreign_keys=TRUE` the export itself emits on
 * line 1 does NOT defer it — proven both inside a transaction and outside one —
 * and `PRAGMA foreign_keys=OFF` inside the file is ignored, because D1 does not
 * take that pragma from user SQL. See DEBT-199.
 *
 * The fix is the one every database's own restore uses: load with foreign-key
 * enforcement OFF, then check integrity once the schema is whole. That is
 * strictly stronger than enforcing statement by statement, because it asks
 * whether the RESTORED DATABASE is intact rather than whether every
 * intermediate state was.
 *
 * ── Why this is not the "one-click restore" BACKUP_AND_RESTORE.md § 5 refuses ─
 * That refusal is about an automated PRODUCTION restore, and it stands. This
 * command cannot perform one: it speaks to no network, holds no Cloudflare
 * credential, takes no database name or account id, and writes only to a local
 * SQLite file — a throwaway inside a scratch directory unless the caller names
 * one with `--into`. There is no argument to this command that could name
 * production, which is a stronger guarantee than a warning in a docstring.
 *
 * Counts are printed; contents never are. A row count is an operational fact
 * about the backup; the row itself is the owner's private life.
 */
async function commandRehearse(args) {
  // Imported HERE rather than at the top of the file, deliberately. The pure
  // helpers in this module (`validateDumpText`, the cipher parameters, the
  // required-table list) are imported directly by tests running under Vite,
  // which refuses to bundle a Node built-in for a client environment — a
  // top-level `node:sqlite` therefore broke the import of everything else in
  // the file. A dynamic import keeps the module graph free of it until the one
  // command that needs it actually runs.
  const { DatabaseSync } = await import("node:sqlite");
  const encrypted = requireFile(args.encrypted, "encrypted");
  const passphraseFile = requireFile(
    args["passphrase-file"],
    "passphrase-file",
  );
  // `--into` keeps the restored database instead of discarding it, so a
  // rehearsal can go on to BOOT the application against it — which is the half
  // of "an untested restore is not a backup" that reading row counts cannot
  // reach. Still a local SQLite file, still no network, still no credential.
  const into = args.into;
  if (into !== undefined && typeof into !== "string") {
    fail("--into needs a file path.");
  }

  const scratch = makeScratch("dalyhub-backup-rehearse-");
  try {
    const restored = join(scratch, "restored.sql");
    runGpg(
      [
        ...GPG_DECRYPT_ARGS,
        "--passphrase-file",
        passphraseFile,
        "--output",
        restored,
        encrypted,
      ],
      { expectOutputAt: restored },
    );

    // Re-validated on the way OUT as well as on the way in. The dump that was
    // checked before encryption and the dump that comes back out of the
    // artifact are the same bytes only if nothing went wrong; asserting it here
    // means the rehearsal is a complete proof on its own, runnable months later
    // against a downloaded artifact by someone who has no access to the run
    // that produced it.
    const text = readFileSync(restored, "utf8");
    const problems = validateDumpText(text);
    if (problems.length > 0) {
      for (const problem of problems) console.error(`::error::${problem}`);
      fail("The decrypted dump failed structural validation.");
    }

    const databasePath =
      typeof into === "string" && into.length > 0
        ? into
        : join(scratch, "rehearsal.sqlite");
    // A restore is a REPLACEMENT. Loading a dump on top of an existing database
    // would half-apply — `CREATE TABLE IF NOT EXISTS` silently no-ops while the
    // plain `CREATE TABLE` statements the export also emits fail on "table
    // already exists" — and leave something that is neither the old database nor
    // the new one. Refuse rather than produce that.
    if (databasePath !== join(scratch, "rehearsal.sqlite")) {
      for (const suffix of ["", "-wal", "-shm"]) {
        if (existsSync(`${databasePath}${suffix}`)) {
          fail(
            `--into must name a path that does not exist yet; found ${databasePath}${suffix}. A restore replaces a database, it does not merge into one.`,
          );
        }
      }
    }
    // `enableForeignKeyConstraints: false`, and it is load-bearing rather than
    // a relaxation. A D1 export opens with its own `PRAGMA
    // defer_foreign_keys=TRUE` because it writes tables in schema order, so a
    // child table is created and filled before its parent exists — that is what
    // a dump IS, and `wrangler d1 execute --file` restores it on the same
    // terms. `node:sqlite` turns foreign keys ON by default, and
    // `defer_foreign_keys` defers only to the end of a transaction, so outside
    // one it defers nothing: the very first restore attempt died on
    // `foreign key mismatch - "entity_links" referencing "entities"`, which
    // says nothing about the backup and everything about statement order.
    //
    // Enforcement is not dropped, it is MOVED — to `PRAGMA foreign_key_check`
    // over the finished database below, which is the stronger question anyway
    // ("is the restored database referentially intact?" rather than "was every
    // intermediate state?") and is exactly what BACKUP_AND_RESTORE.md § 5.4
    // asks an operator to run by hand after a real restore.
    let database;
    try {
      database = new DatabaseSync(databasePath, {
        enableForeignKeyConstraints: false,
      });
    } catch (error) {
      // A `--into` naming a directory that does not exist, or one that cannot be
      // written, is an operator mistake and deserves the same one-line refusal
      // every other bad argument gets — not a stack trace out of the runtime.
      fail(
        `Could not open ${databasePath} as a database: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    try {
      // The load itself. This is the assertion the structural checks cannot
      // make: SQLite either accepts every statement in the dump or it throws.
      try {
        database.exec(text);
      } catch (error) {
        fail(
          `The decrypted dump could not be restored into a database: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      const present = new Set(
        database
          .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
          .all()
          .map((row) => String(row.name)),
      );
      const missing = REQUIRED_DUMP_TABLES.filter(
        (table) => !present.has(table),
      );
      if (missing.length > 0) {
        fail(
          `The restored database is missing ${missing.length} required table(s): ${missing.join(", ")}.`,
        );
      }

      const counts = [];
      for (const table of REHEARSAL_COUNT_TABLES) {
        // The table name is from this file's own frozen list, never from input.
        const row = database
          .prepare(`SELECT COUNT(*) AS n FROM ${table}`)
          .get();
        counts.push([table, Number(row?.n ?? 0)]);
      }
      const entities = counts.find(([table]) => table === "entities")?.[1] ?? 0;
      if (entities === 0) {
        fail(
          "The restored database holds no entities. A schema-only dump passes every structural check and would restore an empty life.",
        );
      }

      // Referential integrity of the RESTORED database, which is the property
      // §5.4 of BACKUP_AND_RESTORE.md asks an operator to check by hand.
      const violations = database.prepare("PRAGMA foreign_key_check").all();
      if (violations.length > 0) {
        fail(
          `The restored database has ${violations.length} foreign-key violation(s).`,
        );
      }

      console.log(
        `Restore rehearsed: ${encrypted} decrypts, loads into ` +
          `${typeof into === "string" && into.length > 0 ? into : "a throwaway SQLite database"}, ` +
          `carries all ${REQUIRED_DUMP_TABLES.length} required tables and passes foreign_key_check.`,
      );
      console.log(
        `  rows: ${counts.map(([table, n]) => `${table}=${n}`).join(" ")} (counts only; no content is read or printed)`,
      );

      // Countersign the verification receipt, when the caller keeps one. This is
      // what lets the published metadata distinguish "this decrypts" from "this
      // restores", rather than leaving both under one word.
      if (typeof args.receipt === "string" && args.receipt.length > 0) {
        const existing = existsSync(args.receipt)
          ? JSON.parse(readFileSync(args.receipt, "utf8"))
          : {};
        const encryptedSha256 = sha256File(encrypted);
        if (
          existing.encryptedSha256 !== undefined &&
          existing.encryptedSha256 !== encryptedSha256
        ) {
          fail(
            "The recovery receipt describes a different artifact. Refusing to countersign it.",
          );
        }
        writeReceipt(args.receipt, {
          ...existing,
          encryptedSha256,
          rehearsed: true,
          restoredRowCounts: Object.fromEntries(counts),
        });
      }
    } finally {
      database.close();
    }
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
  const receiptPath = requireFile(args.receipt, "receipt");
  const output = args.out;
  if (typeof output !== "string" || output.length === 0) fail("Missing --out.");

  // The receipt is what makes `recoveryVerified` a fact rather than a wish. It
  // is cross-checked against the artifact actually in front of us, so a stale
  // receipt from an earlier run cannot vouch for a different file.
  let receipt;
  try {
    receipt = JSON.parse(readFileSync(receiptPath, "utf8"));
  } catch {
    fail(`The recovery receipt is not readable JSON: ${receiptPath}`);
  }
  const encryptedSha256 = sha256File(encrypted);
  if (receipt?.encryptedSha256 !== encryptedSha256) {
    fail(
      "The recovery receipt does not describe this artifact. Refusing to publish an unproven recovery claim.",
    );
  }
  if (typeof receipt?.plaintextSha256 !== "string") {
    fail("The recovery receipt carries no plaintext digest.");
  }

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
    encryptedSha256,
    // From the RECEIPT, not recomputed from a plaintext file that may no longer
    // be the one this artifact was made from — and by then may not exist at all,
    // which is the correct end state for a plaintext production dump.
    plaintextBytes: receipt.plaintextBytes,
    plaintextSha256: receipt.plaintextSha256,
    recoveryVerified: true,
    recoveryProof: receipt.rehearsed === true ? "decrypt+restore" : "decrypt",
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
  reorder: commandReorder,
  encrypt: commandEncrypt,
  verify: commandVerify,
  rehearse: commandRehearse,
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
  // Awaited: `rehearse` is async, because it imports `node:sqlite` on demand.
  await run(readArgs(rest));
}
