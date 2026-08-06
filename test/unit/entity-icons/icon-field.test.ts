/**
 * The form boundary is where the icon vocabulary is actually enforced.
 *
 * Migration 0032 leaves `icon_key` unconstrained on purpose, so this helper is
 * the whole of the enforcement. The property that matters most is the one a
 * type signature cannot express: an unrecognised value must be REFUSED, not
 * folded to `null`. A route that normalises hostile input to "no icon" and
 * saves happily reports success and then renders a default — the owner sees a
 * broken feature and no test fails, because nothing did.
 */

import { describe, expect, it } from "vitest";

import {
  ENTITY_ICON_FIELD_ERROR,
  readEntityIconField,
} from "~/platform/request/entity-icon-field";

function form(entries: Record<string, string | Blob>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.set(key, value);
  return data;
}

describe("reading the icon field", () => {
  it("accepts a key in the vocabulary", () => {
    expect(readEntityIconField(form({ iconKey: "travel" }))).toEqual({
      ok: true,
      iconKey: "travel",
    });
  });

  it("trims surrounding whitespace a form control may have added", () => {
    expect(readEntityIconField(form({ iconKey: "  travel  " }))).toEqual({
      ok: true,
      iconKey: "travel",
    });
  });

  it("treats an absent field as 'no icon on this form', not as a clear", () => {
    // A create form without an icon control, or an edit form saving unrelated
    // fields, must not be read as "remove the owner's icon".
    expect(readEntityIconField(form({ title: "Health" }))).toEqual({
      ok: true,
      iconKey: null,
    });
  });

  it("treats an explicitly empty field as reset-to-default", () => {
    // This is how the picker's "reset to default" reaches the server: the field
    // is submitted, and submitted empty.
    expect(readEntityIconField(form({ iconKey: "" }))).toEqual({
      ok: true,
      iconKey: null,
    });
    expect(readEntityIconField(form({ iconKey: "   " }))).toEqual({
      ok: true,
      iconKey: null,
    });
  });

  it("REFUSES anything outside the vocabulary rather than storing null", () => {
    for (const hostile of [
      "no-such-icon",
      "Travel",
      "<svg onload=alert(1)>",
      "ProjectIcon",
      "https://example.test/icon.svg",
      "😀",
      "e900",
      "../../etc/passwd",
      "travel; DROP TABLE area_details",
    ]) {
      const result = readEntityIconField(form({ iconKey: hostile }));
      expect(result, hostile).toEqual({
        ok: false,
        message: ENTITY_ICON_FIELD_ERROR,
      });
    }
  });

  it("refuses a file masquerading as the icon field", () => {
    // `String(file)` would be "[object File]", which would then be refused for
    // the wrong reason and produce a confusing message.
    const data = new FormData();
    data.set("iconKey", new Blob(["x"]), "icon.svg");
    expect(readEntityIconField(data).ok).toBe(false);
  });

  it("reads a caller-named field", () => {
    expect(
      readEntityIconField(form({ areaIcon: "shield" }), "areaIcon"),
    ).toEqual({ ok: true, iconKey: "shield" });
  });

  it("names the field the owner can act on, disclosing nothing else", () => {
    const result = readEntityIconField(form({ iconKey: "no-such-icon" }));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    // No stack, no internal identifier, no echo of the rejected value — an
    // error message is not a place to reflect untrusted input back at a page.
    expect(result.message).toBe(ENTITY_ICON_FIELD_ERROR);
    expect(result.message).not.toContain("no-such-icon");
  });
});
