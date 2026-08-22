/**
 * AUDIT-11 — proof that the production backup artifact is genuinely recoverable,
 * not merely renamed.
 *
 * The finding was not "the file has the wrong extension"; it was "anyone with
 * Actions access can read the owner's entire life". A fix that produced an
 * opaque-looking file would close the ticket and none of the risk, so this suite
 * refuses to accept the pipeline on its own word and instead runs it end to end
 * against a REAL dump, a REAL key and the REAL `gpg` invocation the workflow
 * uses:
 *
 *   1. create a backup (a representative D1 dump containing recognisable
 *      personal data — the exact thing that must not leak);
 *   2. encrypt it through the same command line production runs;
 *   3. prove the plaintext is genuinely absent from the artifact;
 *   4. decrypt it;
 *   5. prove the recovered file is byte-identical to the original;
 *   6. prove the recovered file passes the same structural validation;
 *   7. **prove it RESTORES** — V2.4-GATE-01. Steps 4–6 answer "do the bytes come
 *      back, and do they look like a dump?"; they cannot answer "will a database
 *      load this?", and until the gate nothing did. `rehearse` executes the
 *      decrypted dump into a throwaway SQLite database and reads the kernel
 *      tables out of it, and the tests below prove it refuses a dump that would
 *      restore an empty life.
 *
 * The key here is a throwaway generated per test run. The production passphrase
 * lives only in the protected `production` GitHub environment and is never
 * available to, or needed by, a test.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts", "production-backup.mjs");

/** A dump that looks like a real one, including the data that must not leak. */
const SENSITIVE_EMAIL = "jamie.rivers@example.test";
const SENSITIVE_DIARY = "Slept badly and told no one about the diagnosis.";

/**
 * A dump that a database will actually LOAD, not merely one that matches the
 * structural checks.
 *
 * It used to declare every table as `(id TEXT NOT NULL PRIMARY KEY)` and then
 * insert four values into it — a fixture that satisfied `validate` (which is a
 * shape check by design, not a SQL parser) and that no SQLite in the world
 * would accept. That was invisible while nothing in the pipeline tried to
 * restore it, and V2.4-GATE-01's `rehearse` command found it on its first run:
 * `table entities has 1 columns but 4 values were supplied`. A recovery fixture
 * that is not recoverable is the same failure this suite exists to prevent, one
 * level down.
 */
function makeDump(): string {
  const tables = [
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
  const schema = tables
    .map(
      (table) =>
        `CREATE TABLE ${table} (id TEXT NOT NULL PRIMARY KEY, workspace_id TEXT, type TEXT, title TEXT);`,
    )
    .join("\n");
  // Padding so the confidentiality probe (a run from the middle of the file)
  // lands inside real content rather than in framing.
  const filler = (offset: number) =>
    Array.from(
      { length: 200 },
      (_, index) =>
        `INSERT INTO entities VALUES('e-${offset + index}','ws','note','Private note ${offset + index}');`,
    ).join("\n");
  return [
    "PRAGMA defer_foreign_keys=TRUE;",
    schema,
    filler(0),
    `INSERT INTO person_details (id, title) VALUES('p-1','${SENSITIVE_EMAIL}');`,
    `INSERT INTO diary_entry_details (id, title) VALUES('d-1','${SENSITIVE_DIARY}');`,
    filler(200),
    "",
  ].join("\n");
}

function run(args: readonly string[]): { status: number; stderr: string } {
  const result = spawnSync(process.execPath, [SCRIPT, ...args], {
    encoding: "utf8",
  });
  return {
    status: result.status ?? -1,
    stderr: `${result.stderr}${result.stdout}`,
  };
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

const gpgAvailable =
  spawnSync("gpg", ["--version"], { encoding: "utf8" }).status === 0;

describe("AUDIT-11 encrypted production backup", () => {
  let dir: string;
  let dump: string;
  let key: string;
  let encrypted: string;
  let receipt: string;

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "dalyhub-backup-test-"));
    dump = join(dir, "dump.sql");
    key = join(dir, "key.txt");
    encrypted = join(dir, "dump.sql.gpg");
    receipt = join(dir, "recovery-receipt.json");
    writeFileSync(dump, makeDump());
    // A throwaway key, generated for this run. Never the production one.
    writeFileSync(
      key,
      createHash("sha256").update(`test-${Date.now()}`).digest("hex"),
    );
  });

  afterAll(() => {
    // This suite writes real dumps, a real (throwaway) key and real ciphertext
    // to a temp directory, and never removed them. A file whose whole subject is
    // "the plaintext must not survive" should not leave a dozen copies of one in
    // the OS temp directory of every machine that runs the suite.
    rmSync(dir, { recursive: true, force: true });
  });

  /**
   * Driven through the CLI rather than by importing `validateDumpText`.
   *
   * The import used to work and stopped when V2.4-GATE-01 gave the script a
   * `rehearse` command over `node:sqlite`: this suite runs in the unit
   * project's happy-dom environment, and Vite refuses to bundle a Node built-in
   * for a client environment — so importing the module for one pure helper
   * broke on a dependency of a command the test never calls.
   *
   * Spawning is the better shape anyway, and it is what every other assertion
   * here already does: the workflow runs `node scripts/production-backup.mjs
   * validate`, so that is the thing whose refusals are worth holding.
   */
  function validate(text: string): { status: number; stderr: string } {
    const path = join(
      dir,
      `validate-${createHash("sha256").update(text).digest("hex").slice(0, 12)}.sql`,
    );
    writeFileSync(path, text);
    return run(["validate", "--in", path]);
  }

  it("validates a well-formed dump and rejects a truncated or partial one", () => {
    expect(validate(makeDump()).status).toBe(0);

    // An empty dump is refused before anything else is looked at. (`requireFile`
    // catches a zero-byte file first, which is the same refusal one step
    // earlier — either way nothing empty is ever encrypted and filed.)
    expect(validate("\n").status).not.toBe(0);

    // A dump cut off mid-statement: the failure that looks fine until it is
    // needed.
    const truncated = validate(makeDump().slice(0, makeDump().length - 60));
    expect(truncated.status).not.toBe(0);
    expect(truncated.stderr).toContain(
      "does not end with a complete SQL statement",
    );

    // A dump missing the kernel schema is not a DalyHub database.
    const partial = validate("CREATE TABLE entities (id TEXT);\n");
    expect(partial.status).not.toBe(0);
    expect(partial.stderr).toContain("workspaces");
  });

  it.runIf(gpgAvailable)(
    "encrypts, hides the plaintext, decrypts and recovers byte-for-byte",
    () => {
      const before = sha256(dump);

      expect(run(["validate", "--in", dump]).status).toBe(0);
      expect(
        run([
          "encrypt",
          "--in",
          dump,
          "--out",
          encrypted,
          "--passphrase-file",
          key,
        ]).status,
      ).toBe(0);
      expect(existsSync(encrypted)).toBe(true);

      // 3. The artifact does not contain the data. This is the assertion that
      //    distinguishes encryption from a rename, a ZIP or base64.
      const cipher = readFileSync(encrypted);
      expect(cipher.includes(Buffer.from(SENSITIVE_EMAIL))).toBe(false);
      expect(cipher.includes(Buffer.from(SENSITIVE_DIARY))).toBe(false);
      expect(cipher.includes(Buffer.from("CREATE TABLE entities"))).toBe(false);
      expect(cipher.includes(Buffer.from("INSERT INTO"))).toBe(false);
      // …and it is a real OpenPGP message, not an opaque blob of our own.
      expect(cipher.subarray(0, 1)[0]! & 0x80).toBe(0x80);

      // 4–5. The pipeline's own recovery proof, which is what the workflow runs
      //      on every single scheduled backup.
      const verified = run([
        "verify",
        "--in",
        dump,
        "--encrypted",
        encrypted,
        "--passphrase-file",
        key,
        "--receipt",
        receipt,
      ]);
      expect(verified.status).toBe(0);
      expect(verified.stderr).toContain("Recovery proved");

      // 6. Decrypt independently — the documented owner command — and check the
      //    recovered file is the original and still validates.
      const recovered = join(dir, "recovered.sql");
      const decrypt = spawnSync(
        "gpg",
        [
          "--batch",
          "--yes",
          "--no-tty",
          "--pinentry-mode",
          "loopback",
          "--passphrase-file",
          key,
          "--output",
          recovered,
          "--decrypt",
          encrypted,
        ],
        { encoding: "utf8" },
      );
      expect(decrypt.status).toBe(0);
      expect(sha256(recovered)).toBe(before);
      expect(readFileSync(recovered, "utf8")).toContain(SENSITIVE_EMAIL);
      expect(run(["validate", "--in", recovered]).status).toBe(0);
    },
  );

  it.runIf(gpgAvailable)("cannot be decrypted with the wrong key", () => {
    const wrong = join(dir, "wrong-key.txt");
    writeFileSync(wrong, "not-the-key");
    const out = join(dir, "should-not-exist.sql");
    const attempt = spawnSync(
      "gpg",
      [
        "--batch",
        "--yes",
        "--no-tty",
        "--pinentry-mode",
        "loopback",
        "--passphrase-file",
        wrong,
        "--output",
        out,
        "--decrypt",
        encrypted,
      ],
      { encoding: "utf8" },
    );
    expect(attempt.status).not.toBe(0);
  });

  it.runIf(gpgAvailable)(
    "restores the decrypted dump into a real database and reads rows back",
    () => {
      // The claim the round trip above cannot make. `verify` proves the bytes
      // return; this proves a database accepts them.
      const rehearsed = run([
        "rehearse",
        "--encrypted",
        encrypted,
        "--passphrase-file",
        key,
        "--receipt",
        receipt,
      ]);
      expect(rehearsed.status).toBe(0);
      expect(rehearsed.stderr).toContain("Restore rehearsed");
      expect(rehearsed.stderr).toContain("passes foreign_key_check");

      // Row COUNTS are reported, because "is my backup a backup?" is an
      // operational question. Row CONTENT never is.
      expect(rehearsed.stderr).toMatch(/entities=\d+/);
      expect(rehearsed.stderr).not.toContain(SENSITIVE_EMAIL);
      expect(rehearsed.stderr).not.toContain(SENSITIVE_DIARY);

      const countersigned = JSON.parse(readFileSync(receipt, "utf8")) as Record<
        string,
        unknown
      >;
      expect(countersigned.rehearsed).toBe(true);
    },
  );

  it.runIf(gpgAvailable)(
    "refuses a dump that carries the schema and no life",
    () => {
      // The failure this exists for: an export that produced every CREATE TABLE
      // and no rows passes `validate` — which is a shape check, not a load —
      // and would restore a workspace containing nothing at all. It is the one
      // shape a "the file exists and decrypts" pipeline cannot tell from a good
      // backup.
      const empty = join(dir, "schema-only.sql");
      const emptyEncrypted = join(dir, "schema-only.sql.gpg");
      const schemaOnly = makeDump().replace(/^INSERT INTO .*$/gm, "");
      writeFileSync(empty, `${schemaOnly}\nCREATE INDEX i ON entities (id);\n`);
      expect(run(["validate", "--in", empty]).status).toBe(0);

      expect(
        run([
          "encrypt",
          "--in",
          empty,
          "--out",
          emptyEncrypted,
          "--passphrase-file",
          key,
        ]).status,
      ).toBe(0);
      const rehearsed = run([
        "rehearse",
        "--encrypted",
        emptyEncrypted,
        "--passphrase-file",
        key,
      ]);
      expect(rehearsed.status).not.toBe(0);
      expect(rehearsed.stderr).toContain("holds no entities");
    },
  );

  it.runIf(gpgAvailable)("refuses a dump no database will load", () => {
    // Structurally plausible — every required CREATE TABLE, a terminated last
    // statement — and syntactically impossible. `validate` is deliberately not
    // a SQL parser, so this is exactly the class of corruption only a real
    // load catches.
    const broken = join(dir, "broken.sql");
    const brokenEncrypted = join(dir, "broken.sql.gpg");
    writeFileSync(
      broken,
      `${makeDump()}\nINSERT INTO entities VALUES('x','y' MISSING PAREN;\n`,
    );
    expect(run(["validate", "--in", broken]).status).toBe(0);
    expect(
      run([
        "encrypt",
        "--in",
        broken,
        "--out",
        brokenEncrypted,
        "--passphrase-file",
        key,
      ]).status,
    ).toBe(0);
    const rehearsed = run([
      "rehearse",
      "--encrypted",
      brokenEncrypted,
      "--passphrase-file",
      key,
    ]);
    expect(rehearsed.status).not.toBe(0);
    expect(rehearsed.stderr).toContain("could not be restored into a database");
  });

  it.runIf(gpgAvailable)(
    "will not publish a recovery claim without a receipt for THIS artifact",
    () => {
      // `recoveryVerified: true` used to be a constant in the metadata writer:
      // it asserted a verification the script had no way to know had happened,
      // and would have kept asserting it through any edit that dropped or
      // reordered the verify step.
      const metadata = join(dir, "metadata-unproven.json");
      const missing = run([
        "metadata",
        "--encrypted",
        encrypted,
        "--receipt",
        join(dir, "no-such-receipt.json"),
        "--out",
        metadata,
      ]);
      expect(missing.status).not.toBe(0);

      // A receipt from a DIFFERENT artifact is refused too, so a stale one
      // cannot vouch for a file it has never seen.
      const stale = join(dir, "stale-receipt.json");
      writeFileSync(
        stale,
        JSON.stringify({
          encryptedSha256: "0".repeat(64),
          plaintextSha256: "1".repeat(64),
          plaintextBytes: 1,
        }),
      );
      const wrongArtifact = run([
        "metadata",
        "--encrypted",
        encrypted,
        "--receipt",
        stale,
        "--out",
        metadata,
      ]);
      expect(wrongArtifact.status).not.toBe(0);
      expect(wrongArtifact.stderr).toContain("does not describe this artifact");
      expect(existsSync(metadata)).toBe(false);
    },
  );

  it.runIf(gpgAvailable)(
    "refuses to write a metadata file that names a credential",
    () => {
      const metadata = join(dir, "metadata.json");
      const ok = run([
        "metadata",
        "--encrypted",
        encrypted,
        "--receipt",
        receipt,
        "--out",
        metadata,
        "--field",
        "environment=production",
      ]);
      expect(ok.status).toBe(0);

      const written = JSON.parse(readFileSync(metadata, "utf8")) as Record<
        string,
        unknown
      >;
      // Non-sensitive facts only, and a SHA-256 is one-way — it lets the owner
      // confirm a future decryption produced the original without disclosing it.
      expect(written.encryption).toBe("gnupg-symmetric-aes256");
      expect(written.plaintextSha256).toBe(sha256(dump));
      expect(written.encryptedSha256).toBe(sha256(encrypted));
      // And it distinguishes the two claims rather than folding them into one
      // word: the rehearsal above countersigned this receipt, so the published
      // proof is a restore rather than merely a decryption.
      expect(written.recoveryVerified).toBe(true);
      expect(written.recoveryProof).toBe("decrypt+restore");
      const serialised = readFileSync(metadata, "utf8");
      expect(serialised).not.toContain(readFileSync(key, "utf8"));
      expect(serialised).not.toContain(SENSITIVE_EMAIL);
      expect(serialised).not.toContain(SENSITIVE_DIARY);

      // And a future edit that tried to smuggle the key in is refused.
      const refused = run([
        "metadata",
        "--encrypted",
        encrypted,
        "--receipt",
        receipt,
        "--out",
        metadata,
        "--field",
        "encryptionKey=hunter2",
      ]);
      expect(refused.status).not.toBe(0);
      expect(refused.stderr).toContain("Refusing to write a metadata field");
    },
  );

  it.runIf(gpgAvailable)(
    "fails loudly when the ciphertext does not decrypt back to the dump",
    () => {
      const tampered = join(dir, "tampered.gpg");
      const bytes = readFileSync(encrypted);
      bytes[Math.floor(bytes.length / 2)]! ^= 0xff;
      writeFileSync(tampered, bytes);
      const result = run([
        "verify",
        "--in",
        dump,
        "--encrypted",
        tampered,
        "--passphrase-file",
        key,
      ]);
      expect(result.status).not.toBe(0);

      // And the rehearsal refuses it too, from the artifact alone — the state an
      // owner is actually in on the day, holding a file and a key and no
      // original to compare against.
      const rehearsed = run([
        "rehearse",
        "--encrypted",
        tampered,
        "--passphrase-file",
        key,
      ]);
      expect(rehearsed.status).not.toBe(0);
    },
  );

  it("is available in this environment", () => {
    // If gpg is ever absent from CI the recovery proof above would silently skip,
    // and a silently skipped recovery proof is exactly the "security theatre"
    // this work exists to avoid. Fail loudly instead.
    expect(gpgAvailable).toBe(true);
  });
});
