import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  countLabel,
  emptyCollectionTitle,
  ENTITY_IDENTITY,
  ENTITY_TYPES,
  filteredEmptyTitle,
  getSubtypeIcon,
  newRecordLabel,
  registerSubtypeIcons,
  SubtypeIcon,
} from "~/shared/entity";
import { assetTypeIcon } from "~/modules/assets/asset-icons";
import { entryTypeIcon } from "~/modules/diary/diary-icons";

/**
 * PX-05 / PX-06 — the two identity layers and the copy convention, as contracts.
 *
 * Both exist to make drift structurally impossible rather than merely discouraged:
 * a module cannot write "New project" beside "New Area" if the label is derived,
 * and a module cannot give a SUBTYPE another entity's glyph if subtypes resolve
 * through their own registry.
 */

describe("copy convention", () => {
  it("derives create labels from the identity map, so no module can drift", () => {
    expect(newRecordLabel("project")).toBe("New Project");
    expect(newRecordLabel("area")).toBe("New Area");
    expect(newRecordLabel("person")).toBe("New Person");
    for (const type of ENTITY_TYPES) {
      expect(newRecordLabel(type)).toBe(`New ${ENTITY_IDENTITY[type].label}`);
    }
  });

  it("keeps genuinely-empty and filtered-empty headings distinct", () => {
    expect(emptyCollectionTitle("project")).toBe("No Projects yet");
    expect(filteredEmptyTitle("project")).toBe("No matching Projects");
    // The identity map owns the irregular plural, so "People" is never "Persons".
    expect(emptyCollectionTitle("person")).toBe("No People yet");
  });

  it("counts with the correct singular/plural noun", () => {
    expect(countLabel("project", 1)).toBe("1 Project");
    expect(countLabel("project", 4)).toBe("4 Projects");
    expect(countLabel("person", 1)).toBe("1 Person");
    expect(countLabel("person", 2)).toBe("2 People");
  });
});

describe("subtype-icon registry", () => {
  it("resolves a registered subtype and falls back to the entity glyph otherwise", () => {
    // Diary registers its entry types at module load.
    expect(getSubtypeIcon("diary", "decision")).not.toBeNull();
    expect(getSubtypeIcon("diary", "not-a-real-type")).toBeNull();
    expect(getSubtypeIcon("diary", null)).toBeNull();
    // The module helper turns that `null` into the safe Diary identity glyph.
    expect(entryTypeIcon("not-a-real-type")).toBe(ENTITY_IDENTITY.diary.Icon);
  });

  it("never gives a SUBTYPE another ENTITY's glyph", () => {
    // The regression this guards: Diary's `meeting` entry type used to render the
    // Meeting *entity* icon, so a diary entry and a Meeting record were
    // indistinguishable — and every other subtype borrowed an entity glyph too.
    const entityGlyphs = new Set(
      ENTITY_TYPES.filter((type) => type !== "diary").map(
        (type) => ENTITY_IDENTITY[type].Icon,
      ),
    );
    for (const entryType of [
      "conversation",
      "meeting",
      "decision",
      "idea",
      "reflection",
      "travel",
      "observation",
    ]) {
      const icon = getSubtypeIcon("diary", entryType);
      expect(icon).not.toBeNull();
      expect(entityGlyphs.has(icon!)).toBe(false);
    }
  });

  it("resolves Asset types through the SAME shared registry, not a private map", () => {
    expect(getSubtypeIcon("asset", "vehicle")).toBe(assetTypeIcon("vehicle"));
    expect(assetTypeIcon("nonsense")).toBe(ENTITY_IDENTITY.asset.Icon);
  });

  it("renders the entity glyph for an unregistered subtype rather than a blank slot", () => {
    const { container } = render(
      <SubtypeIcon entityType="diary" subtype="not-a-real-type" />,
    );
    // The fallback is the accented entity identity marker.
    expect(
      container.querySelector('[data-entity="diary"]'),
    ).toBeInTheDocument();
  });

  it("lets a module register its own vocabulary without touching shared code", () => {
    const Custom = () => <svg data-testid="custom" />;
    registerSubtypeIcons("review", { weekly: Custom });
    expect(getSubtypeIcon("review", "weekly")).toBe(Custom);
    expect(getSubtypeIcon("review", "monthly")).toBeNull();
  });
});
