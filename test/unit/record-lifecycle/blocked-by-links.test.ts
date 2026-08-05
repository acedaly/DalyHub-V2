/**
 * AUDIT-FIX-03 — the wording shown when a permanent delete is REFUSED because
 * active relationships still reference the record.
 *
 * Reviews used to have no such wording at all: the purge silently deleted the
 * live links to make itself succeed. Assets refused correctly but reported it in
 * module-local prose. Both now derive one sentence from the shared lifecycle
 * vocabulary, so "you must unlink first" reads the same on every entity.
 *
 * The rules these assertions defend: state the count when one is known, degrade
 * to the plain sentence when it is not, and never leak a table name, a foreign
 * key or any other storage detail into something a person reads (§17).
 */

import { describe, expect, it } from "vitest";

import { ENTITY_TYPES, type EntityType } from "~/shared/entity";
import { lifecycleBlockedByLinks } from "~/shared/record-lifecycle";

/** Storage vocabulary that must never reach a reader. */
const RAW_STORAGE_TEXT =
  /D1|SQLITE|foreign key|constraint|entity_links|activity_subjects|SQL/i;

describe("lifecycleBlockedByLinks", () => {
  it("names the count and the entity in the product's own nouns", () => {
    expect(lifecycleBlockedByLinks("review", 1)).toBe(
      "This review is still linked to 1 record. Unlink it before deleting it permanently.",
    );
    expect(lifecycleBlockedByLinks("review", 3)).toBe(
      "This review is still linked to 3 records. Unlink them before deleting it permanently.",
    );
    expect(lifecycleBlockedByLinks("asset", 2)).toBe(
      "This asset is still linked to 2 records. Unlink them before deleting it permanently.",
    );
  });

  it("degrades to the plain sentence when no count is known", () => {
    // An unknown count must never render as "0 records" or "undefined records":
    // saying less is honest, saying a wrong number is not.
    for (const count of [undefined, 0]) {
      expect(lifecycleBlockedByLinks("review", count)).toBe(
        "Unlink this review’s related records before deleting it permanently.",
      );
    }
  });

  it("produces calm, storage-free prose for every entity type", () => {
    for (const type of ENTITY_TYPES as readonly EntityType[]) {
      for (const count of [undefined, 1, 5]) {
        const message = lifecycleBlockedByLinks(type, count);
        expect(message).not.toMatch(RAW_STORAGE_TEXT);
        // Always tells the reader the remedy, and always ends as a sentence.
        expect(message).toContain("Unlink");
        expect(message.endsWith(".")).toBe(true);
      }
    }
  });
});
