/**
 * The ONE resolver's precedence, per entity type.
 *
 * Before IDENTITY-01 each surface worked identity out for itself, and they
 * disagreed: `AccentIcon`'s docstring described Area inheritance for a Project's
 * tile while REDESIGN-03/#130 had already given the Project's BAR the Project's
 * own rank. A card could therefore sit a red flame above a violet bar — the
 * product telling the owner two different things about one record.
 *
 * These assertions are the fix's guarantee rather than its implementation: they
 * say what a record's identity IS, for every combination of chosen, derived and
 * inherited, so a future surface cannot quietly reintroduce a second mapping.
 */

import { describe, expect, it } from "vitest";

import {
  DERIVED_IDENTITY_SLOTS,
  identityForRank,
} from "~/kernel/entities/identity-colour-slots";
import {
  identityAttribute,
  resolveIdentity,
} from "~/shared/entity/identity-resolution";

describe("colour precedence", () => {
  it("prefers the record's OWN chosen slot over everything", () => {
    expect(
      resolveIdentity({
        colourSlot: "amber",
        colourRank: 0,
        inherited: { colourSlot: "teal", colourRank: 3 },
      }).slot,
    ).toBe("amber");
  });

  it("falls back to the record's own DERIVED slot when it chose none", () => {
    expect(
      resolveIdentity({
        colourSlot: null,
        colourRank: 1,
        inherited: { colourSlot: "teal" },
      }).slot,
    ).toBe(identityForRank(1));
  });

  it("inherits only when the record has neither a choice nor a rank", () => {
    // This is a GOAL: it has no rank of its own, so its Area's identity is the
    // whole answer — chosen or derived.
    expect(
      resolveIdentity({
        colourRank: null,
        inherited: { colourSlot: "rose" },
      }).slot,
    ).toBe("rose");
    expect(
      resolveIdentity({
        colourRank: null,
        inherited: { colourSlot: null, colourRank: 2 },
      }).slot,
    ).toBe(identityForRank(2));
  });

  it("resolves to the NEUTRAL container when there is nothing to resolve", () => {
    // A designed outcome, not a failure: a Project with no Area and no choice
    // gets a colour that means nothing rather than a colour that means something
    // it does not mean.
    expect(resolveIdentity({}).slot).toBeNull();
    expect(
      resolveIdentity({ colourRank: null, inherited: { colourRank: null } })
        .slot,
    ).toBeNull();
  });

  it("treats a slot this build does not recognise as no choice", () => {
    // A row restored from an older export, or a slot retired in a later
    // release. It must degrade to the derived colour — which is exactly what the
    // record looked like before anyone chose anything — never throw.
    expect(
      resolveIdentity({ colourSlot: "chartreuse", colourRank: 0 }).slot,
    ).toBe(identityForRank(0));
    expect(resolveIdentity({ colourSlot: "#ff0000", colourRank: 0 }).slot).toBe(
      identityForRank(0),
    );
  });

  it("only ever resolves to a slot the derived ramp holds, when deriving", () => {
    for (let rank = 0; rank < 20; rank += 1) {
      expect(DERIVED_IDENTITY_SLOTS).toContain(
        resolveIdentity({ colourRank: rank }).slot,
      );
    }
  });
});

describe("icon precedence, walked independently of colour", () => {
  it("prefers the record's own key", () => {
    expect(
      resolveIdentity({ iconKey: "heart", inherited: { iconKey: "folder" } })
        .iconKey,
    ).toBe("heart");
  });

  it("inherits the key when the record has none", () => {
    expect(resolveIdentity({ inherited: { iconKey: "folder" } }).iconKey).toBe(
      "folder",
    );
  });

  it("resolves to the entity default when nothing is chosen anywhere", () => {
    expect(resolveIdentity({}).iconKey).toBeNull();
  });

  /*
   * The combination the reference actually draws, and the reason the two halves
   * are walked separately rather than as one "identity": a Goal that picked a
   * heart but no colour keeps the heart AND takes its Area's hue.
   */
  it("lets a record choose one half and inherit the other", () => {
    const identity = resolveIdentity({
      iconKey: "heart",
      colourSlot: null,
      colourRank: null,
      inherited: { iconKey: "folder", colourSlot: "green" },
    });
    expect(identity.iconKey).toBe("heart");
    expect(identity.slot).toBe("green");
  });
});

describe("the entity types, as the product resolves them", () => {
  /** An Area: its own rank, its own optional choice. */
  const area = (rank: number, slot: string | null = null) => ({
    colourRank: rank,
    colourSlot: slot,
  });

  it("gives an AREA its own rank", () => {
    expect(resolveIdentity(area(2)).slot).toBe(identityForRank(2));
  });

  /*
   * REDESIGN-03/#130, reconciled. A Project uses its OWN rank, never its Area's
   * — which is why the tile and the bar can no longer disagree, since both read
   * this one answer.
   */
  it("gives a PROJECT its own rank, never its Area's", () => {
    const project = resolveIdentity({
      colourRank: 1,
      inherited: { colourRank: 4 },
    });
    expect(project.slot).toBe(identityForRank(1));
    expect(project.slot).not.toBe(identityForRank(4));
  });

  it("gives a GOAL its Area's resolved identity when it has none", () => {
    expect(resolveIdentity({ colourRank: null, inherited: area(3) }).slot).toBe(
      identityForRank(3),
    );
    expect(
      resolveIdentity({ colourRank: null, inherited: area(3, "sky") }).slot,
    ).toBe("sky");
  });

  it("lets a GOAL's own choice beat its Area's", () => {
    expect(
      resolveIdentity({
        colourSlot: "fuchsia",
        colourRank: null,
        inherited: area(3, "sky"),
      }).slot,
    ).toBe("fuchsia");
  });
});

describe("the DOM attribute", () => {
  it("carries the slot by NAME, so a ramp reorder cannot repaint a record", () => {
    expect(identityAttribute("teal")).toEqual({ "data-identity": "teal" });
  });

  it("emits NO attribute for the neutral identity", () => {
    // So the element keeps the neutral defaults `:root` publishes, rather than
    // matching a slot rule that would give it a colour meaning nothing.
    expect(identityAttribute(null)).toEqual({});
  });
});
