/**
 * The icon key vocabulary and its catalogue must never drift apart.
 *
 * The kernel owns the list of keys a write may persist; the UI owns the mapping
 * from key to a drawn glyph. That split is deliberate — it keeps React out of
 * the Worker's validation path and lets a glyph be redrawn without touching a
 * stored row — and its one hazard is that the two halves can disagree. A key
 * with no catalogue entry renders nothing; a catalogue entry with no key can
 * never be chosen. These tests make either one a build failure.
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  ENTITY_ICON_KEYS,
  isEntityIconKey,
  isRejectedEntityIconKey,
  normaliseEntityIconKey,
} from "~/kernel/entities/entity-icon-keys";
import {
  ENTITY_ICON_CATEGORIES,
  ENTITY_ICON_OPTIONS,
  entityIconOption,
  entityIconOptionsByCategory,
  searchEntityIcons,
} from "~/shared/entity/entity-icon-catalogue";

describe("the entity icon catalogue", () => {
  it("covers every key exactly once", () => {
    const catalogueKeys = ENTITY_ICON_OPTIONS.map((option) => option.key);
    expect([...catalogueKeys].sort()).toEqual([...ENTITY_ICON_KEYS].sort());
    expect(new Set(catalogueKeys).size).toBe(catalogueKeys.length);
  });

  it("gives every option a real icon component and a human label", () => {
    for (const option of ENTITY_ICON_OPTIONS) {
      expect(
        typeof option.Icon,
        `${option.key} must resolve to a component`,
      ).toBe("function");
      expect(
        option.label.trim().length,
        `${option.key} needs a label`,
      ).toBeGreaterThan(0);
    }
  });

  it("uses no label twice", () => {
    // Two identical labels in a picker are two indistinguishable choices.
    const labels = ENTITY_ICON_OPTIONS.map((option) => option.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("places every option in a declared category", () => {
    for (const option of ENTITY_ICON_OPTIONS) {
      expect(ENTITY_ICON_CATEGORIES).toContain(option.category);
    }
  });

  /*
   * UNTITLED-15 — ONE IDIOM, and a BOUNDED exception list.
   *
   * The original rule (IDENTITY-01): every glyph an owner can pick is a STROKE
   * glyph, never a filled Material Symbol, because inside the identity tile — a
   * whisper of the record's hue as the fill and the saturated hue as the glyph
   * — a filled symbol reads as a solid blob of colour.
   *
   * That rule is unchanged. What changed is the SOURCE: eighty-four of the keys
   * are now `@untitledui/icons`, which strokes at weight 2, and seventeen are
   * still DalyHub drawings at 1.75, because the package has no paw, leaf,
   * campsite, coffee, plate of food, mountain, guitar or pram and DalyHub lets
   * an owner name an Area "Pets" or "Camping".
   *
   * So the assertion is stricter than "one weight" rather than looser: exactly
   * two weights exist, and the hand-drawn set is exactly seventeen. An
   * eighteenth hand-drawn glyph fails HERE, which is the point — it forces
   * whoever adds it to have first failed to find it upstream.
   */
  it("draws every glyph as a stroke, in exactly the two documented weights", () => {
    const byWeight = new Map<string, string[]>();
    for (const option of ENTITY_ICON_OPTIONS) {
      const markup = renderToStaticMarkup(createElement(option.Icon));
      expect(markup, `${option.key} must not be a filled glyph`).toContain(
        'fill="none"',
      );
      expect(markup, `${option.key} must be stroked`).toContain(
        'stroke="currentColor"',
      );
      // A Material Symbol arrives through `createIcon`, which wraps its geometry
      // in the 960-unit transform. Nothing in this set may carry one.
      expect(
        markup,
        `${option.key} must not be Material Symbols geometry`,
      ).not.toContain("scale(0.025)");

      const weight = /stroke-width="([^"]+)"/.exec(markup)?.[1];
      expect(
        weight,
        `${option.key} must declare a stroke weight`,
      ).toBeDefined();
      byWeight.set(weight!, [...(byWeight.get(weight!) ?? []), option.key]);
    }

    expect([...byWeight.keys()].sort()).toEqual(["1.75", "2"]);
    expect(
      byWeight.get("1.75") ?? [],
      "a hand-drawn glyph beyond the documented seventeen — search @untitledui/icons first",
    ).toHaveLength(17);
  });

  /*
   * Two keys sharing one drawing is catalogue rot: the picker offers the owner a
   * choice that is not a choice, and whichever they pick the record looks the
   * same. It is the specific failure a vocabulary invites as it grows — `pet`
   * beside `paw`, `career` beside `briefcase` — so it is checked rather than
   * remembered.
   */
  it("gives every key its own drawing", () => {
    const byComponent = new Map<unknown, string[]>();
    for (const option of ENTITY_ICON_OPTIONS) {
      byComponent.set(option.Icon, [
        ...(byComponent.get(option.Icon) ?? []),
        option.key,
      ]);
    }
    const shared = [...byComponent.values()].filter((keys) => keys.length > 1);
    expect(
      shared,
      `these keys share one glyph: ${shared.map((k) => k.join("/")).join(", ")}`,
    ).toEqual([]);
  });

  it("leaves no category empty", () => {
    for (const category of ENTITY_ICON_CATEGORIES) {
      expect(
        entityIconOptionsByCategory(category).length,
        `${category} has no icons`,
      ).toBeGreaterThan(0);
    }
  });
});

describe("resolving a stored key", () => {
  it("resolves every key the kernel permits", () => {
    for (const key of ENTITY_ICON_KEYS) {
      expect(entityIconOption(key), `${key} must resolve`).toBeDefined();
    }
  });

  it("returns undefined for an unknown key rather than throwing", () => {
    // A key can outlive its catalogue entry — an icon removed in a later
    // release, a row restored from an older export. The record must still
    // render, so the caller falls back to the entity default.
    expect(entityIconOption("no-such-icon")).toBeUndefined();
    expect(entityIconOption(null)).toBeUndefined();
    expect(entityIconOption(undefined)).toBeUndefined();
    expect(entityIconOption("")).toBeUndefined();
  });
});

describe("normalising a key from an untrusted boundary", () => {
  it("accepts a known key", () => {
    expect(normaliseEntityIconKey("travel")).toBe("travel");
    expect(normaliseEntityIconKey("  travel  ")).toBe("travel");
  });

  it("treats absence and emptiness as no choice", () => {
    expect(normaliseEntityIconKey(null)).toBeNull();
    expect(normaliseEntityIconKey(undefined)).toBeNull();
    expect(normaliseEntityIconKey("")).toBeNull();
    expect(normaliseEntityIconKey("   ")).toBeNull();
  });

  it("refuses anything that is not a known key", () => {
    for (const hostile of [
      "no-such-icon",
      "<svg onload=alert(1)>",
      "ProjectIcon",
      "https://example.test/icon.svg",
      "😀",
      "e900",
      42,
      {},
      [],
      true,
    ]) {
      expect(normaliseEntityIconKey(hostile), `${String(hostile)}`).toBeNull();
    }
  });

  it("distinguishes 'not chosen' from 'chosen badly'", () => {
    // Normalising folds both to null, which is right for storage and wrong for
    // validation: a form that silently drops a bad value tells the owner it
    // saved their choice.
    expect(isRejectedEntityIconKey(null)).toBe(false);
    expect(isRejectedEntityIconKey("")).toBe(false);
    expect(isRejectedEntityIconKey("   ")).toBe(false);
    expect(isRejectedEntityIconKey("travel")).toBe(false);
    expect(isRejectedEntityIconKey("no-such-icon")).toBe(true);
    expect(isRejectedEntityIconKey("<svg>")).toBe(true);
    expect(isRejectedEntityIconKey(7)).toBe(true);
  });

  it("guards the type predicate too", () => {
    expect(isEntityIconKey("folder")).toBe(true);
    expect(isEntityIconKey("Folder")).toBe(false);
    expect(isEntityIconKey(null)).toBe(false);
  });
});

describe("searching the catalogue", () => {
  it("returns everything for an empty query, so the picker opens full", () => {
    expect(searchEntityIcons("")).toHaveLength(ENTITY_ICON_OPTIONS.length);
    expect(searchEntityIcons("   ")).toHaveLength(ENTITY_ICON_OPTIONS.length);
  });

  it("matches the label, the key and the synonyms", () => {
    expect(searchEntityIcons("folder").map((o) => o.key)).toContain("folder");
    // A synonym the label does not contain — the reason `searchTerms` exists.
    expect(searchEntityIcons("car").map((o) => o.key)).toContain("vehicle");
    expect(searchEntityIcons("house").map((o) => o.key)).toContain("property");
    expect(searchEntityIcons("insurance").map((o) => o.key)).toContain(
      "shield",
    );
  });

  it("is case-insensitive", () => {
    expect(searchEntityIcons("TRAVEL").map((o) => o.key)).toContain("travel");
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(searchEntityIcons("zzzznothing")).toHaveLength(0);
  });
});
