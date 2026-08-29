import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * V2.6 FIND-02 — acceptance criterion 1, asserted STRUCTURALLY.
 *
 * > One vocabulary source, asserted structurally: every tag-writing surface
 * > resolves through one module, **proven by import path rather than by
 * > behaviour agreeing today**.
 *
 * That wording is the whole point of this file, and it is why none of these
 * assertions call a function. Three tag validators agreed about trimming and
 * disagreed about case for a year — behaviour that agrees today is exactly what
 * DEBT-182 IS. A test that fed the same string to People, Assets and Notes and
 * compared the answers would have passed on `main` before this programme for
 * every input except a capital letter.
 *
 * So these read the SOURCE, and each fails if a fourth dialect becomes
 * possible — before it disagrees with anything.
 */

const ROOT = process.cwd();
const APP = path.join(ROOT, "app");

/** The one module that owns the tag rules. */
const KERNEL_TAGS = path.join("app", "kernel", "tags");

/** The one module that writes tag SQL. */
const TAG_SQL_OWNER = path.join(
  "app",
  "platform",
  "storage",
  "d1",
  "d1-entity-tags.ts",
);

/** The read port's own implementation, which reads the vocabulary tables. */
const TAG_READ_OWNER = path.join(
  "app",
  "platform",
  "storage",
  "d1",
  "d1-tag-repository.ts",
);

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = sourceFiles(APP).map((file) => ({
  relative: path.relative(ROOT, file),
  source: readFileSync(file, "utf8"),
}));

/** Strip comments, so prose about a rule never counts as an implementation. */
function code(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("*"))
    .map((line) => line.replace(/\/\/.*$/, ""))
    .join("\n");
}

describe("FIND-02 — the tag vocabulary is structurally singular", () => {
  it("defines the normalisation rule in exactly one module", () => {
    const definers = FILES.filter(
      (file) =>
        /\bfunction (normaliseTag|canonicalTagKey)\b/.test(code(file.source)) ||
        /\bconst (normaliseTag|canonicalTagKey)\s*=/.test(code(file.source)),
    ).map((file) => file.relative);
    expect(definers).toEqual([path.join(KERNEL_TAGS, "tag-normalisation.ts")]);
  });

  it("defines the tag validator in exactly one module", () => {
    const definers = FILES.filter((file) =>
      /\bfunction validateEntityTags\b/.test(code(file.source)),
    ).map((file) => file.relative);
    expect(definers).toEqual([path.join(KERNEL_TAGS, "tag-vocabulary.ts")]);
  });

  it("routes every module's tag validation through the kernel", () => {
    // People, Assets and Notes each keep a validator with their own ERROR TYPE,
    // which is legitimate — a caller catching `PersonValidationError` should keep
    // catching one. What they must not keep is their own RULE, so each is
    // required to import the shared validator rather than to re-implement it.
    const modules = [
      "app/kernel/people/person-validation.ts",
      "app/kernel/assets/asset-validation.ts",
      "app/kernel/notes/note-details.ts",
    ];
    for (const relative of modules) {
      const file = FILES.find(
        (candidate) => candidate.relative === path.normalize(relative),
      );
      expect(file, `${relative} is missing`).toBeDefined();
      expect(
        code(file!.source),
        `${relative} must resolve tags through ~/kernel/tags`,
      ).toMatch(/validateEntityTags[\s\S]*?from "~\/kernel\/tags"/);
      // …and must not hand-roll the fold that the one rule owns.
      expect(
        code(file!.source),
        `${relative} still folds case itself`,
      ).not.toMatch(/toLocaleLowerCase\(\)|toLowerCase\(\)/);
    }
  });

  it("writes tag SQL from exactly one module", () => {
    // Anything that INSERTs, UPDATEs or DELETEs a tag row is a tag-writing
    // surface. Only the shared statement builder may be one; a repository that
    // wrote its own would be a second vocabulary with the same table name.
    const writers = FILES.filter((file) => {
      const body = code(file.source);
      return /(INSERT[\s\S]{0,80}(INTO\s+)?(workspace_tags|entity_tags)|UPDATE\s+(workspace_tags|entity_tags)|DELETE\s+FROM\s+(workspace_tags|entity_tags))/.test(
        body,
      );
    }).map((file) => file.relative);
    expect(writers).toEqual([TAG_SQL_OWNER]);
  });

  it("reads the tag tables only through the shared projection or the read port", () => {
    const readers = FILES.filter((file) =>
      /\b(workspace_tags|entity_tags)\b/.test(code(file.source)),
    ).map((file) => file.relative);
    // A repository composes `entityTagsProjection` / `tagFilterPredicate` /
    // `tagSearchPredicate` into its own statement; it never names the tables.
    // The Notes tag FACET is the one deliberate exception and says so at its
    // call site: it is a grouped count over the collection in front of the
    // owner, which is a different question from "what words exist here".
    expect(readers.sort()).toEqual(
      [
        TAG_SQL_OWNER,
        TAG_READ_OWNER,
        path.join("app", "platform", "storage", "d1", "d1-note-repository.ts"),
        path.join(
          "app",
          "platform",
          "storage",
          "d1",
          "d1-workspace-restore-repository.ts",
        ),
        path.join(
          "app",
          "platform",
          "storage",
          "d1",
          "d1-workspace-snapshot-repository.ts",
        ),
      ].sort(),
    );
  });

  it("keeps `~/shared/forms/tags.ts` a re-export, never a second implementation", () => {
    const file = FILES.find(
      (candidate) =>
        candidate.relative === path.join("app", "shared", "forms", "tags.ts"),
    );
    expect(file).toBeDefined();
    const body = code(file!.source).trim();
    // Every non-empty statement in the file is an export-from. "Promoted, not
    // forked" (ADR-112 decision 4) is a claim about this file, and this is it.
    expect(body).toMatch(/^export \{[\s\S]*\} from "~\/kernel\/tags";$/);
  });

  it("introduces no second noun for a tag in the DOMAIN", () => {
    /*
     * ADR-112 decision 4, and DEBT-48's standing TASKS-04 warning that
     * *"recurrence and Inbox triage must not smuggle in a second `label`
     * field"*. Checked on the SHAPE that would carry one — a domain type with a
     * string collection called `labels` — rather than on the word, which is a
     * control's accessible name everywhere in the design system.
     *
     * `app/routes/design-*` is excluded, and the exclusion is a judgement rather
     * than a convenience: the DS-06 forms gallery draws a `SelectField multiple`
     * captioned "Labels" beside a `TagsField` captioned "Tags", precisely to
     * show that the two controls are different interactions. It is a fixture in
     * a component gallery with no route, no repository and no storage behind it.
     */
    const offenders = FILES.filter(
      (file) =>
        !/^app[\\/]routes[\\/]design-/.test(file.relative) &&
        /readonly labels\??:\s*readonly string\[\]/.test(code(file.source)),
    ).map((file) => file.relative);
    expect(offenders).toEqual([]);
  });
});
