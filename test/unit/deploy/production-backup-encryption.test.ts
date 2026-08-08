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
 *   6. prove the recovered file passes the same structural validation.
 *
 * The key here is a throwaway generated per test run. The production passphrase
 * lives only in the protected `production` GitHub environment and is never
 * available to, or needed by, a test.
 */

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

import { beforeAll, describe, expect, it } from "vitest";

const SCRIPT = join(process.cwd(), "scripts", "production-backup.mjs");

/** A dump that looks like a real one, including the data that must not leak. */
const SENSITIVE_EMAIL = "jamie.rivers@example.test";
const SENSITIVE_DIARY = "Slept badly and told no one about the diagnosis.";

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
    .map((table) => `CREATE TABLE ${table} (id TEXT NOT NULL PRIMARY KEY);`)
    .join("\n");
  // Padding so the confidentiality probe (a run from the middle of the file)
  // lands inside real content rather than in framing.
  const filler = Array.from(
    { length: 200 },
    (_, index) =>
      `INSERT INTO entities VALUES('e-${index}','ws','note','Private note ${index}');`,
  ).join("\n");
  return [
    "PRAGMA defer_foreign_keys=TRUE;",
    schema,
    filler,
    `INSERT INTO person_details VALUES('${SENSITIVE_EMAIL}');`,
    `INSERT INTO diary_entry_details VALUES('${SENSITIVE_DIARY}');`,
    filler,
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

  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "dalyhub-backup-test-"));
    dump = join(dir, "dump.sql");
    key = join(dir, "key.txt");
    encrypted = join(dir, "dump.sql.gpg");
    writeFileSync(dump, makeDump());
    // A throwaway key, generated for this run. Never the production one.
    writeFileSync(
      key,
      createHash("sha256").update(`test-${Date.now()}`).digest("hex"),
    );
  });

  it("validates a well-formed dump and rejects a truncated or partial one", async () => {
    const module: { validateDumpText: (text: string) => string[] } =
      await import(pathToFileURL(SCRIPT).href);

    expect(module.validateDumpText(makeDump())).toEqual([]);
    expect(module.validateDumpText("")).toEqual(["the dump is empty"]);
    // A dump cut off mid-statement: the failure that looks fine until it is
    // needed.
    const truncated = makeDump().slice(0, makeDump().length - 60);
    expect(module.validateDumpText(truncated).join(" ")).toContain(
      "does not end with a complete SQL statement",
    );
    // A dump missing the kernel schema is not a DalyHub database.
    expect(
      module.validateDumpText("CREATE TABLE entities (id TEXT);\n").join(" "),
    ).toContain("workspaces");
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
    "refuses to write a metadata file that names a credential",
    () => {
      const metadata = join(dir, "metadata.json");
      const ok = run([
        "metadata",
        "--encrypted",
        encrypted,
        "--in",
        dump,
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
      const serialised = readFileSync(metadata, "utf8");
      expect(serialised).not.toContain(readFileSync(key, "utf8"));
      expect(serialised).not.toContain(SENSITIVE_EMAIL);
      expect(serialised).not.toContain(SENSITIVE_DIARY);

      // And a future edit that tried to smuggle the key in is refused.
      const refused = run([
        "metadata",
        "--encrypted",
        encrypted,
        "--in",
        dump,
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
    },
  );

  it("is available in this environment", () => {
    // If gpg is ever absent from CI the recovery proof above would silently skip,
    // and a silently skipped recovery proof is exactly the "security theatre"
    // this work exists to avoid. Fail loudly instead.
    expect(gpgAvailable).toBe(true);
  });
});
