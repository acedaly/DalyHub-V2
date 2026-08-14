/**
 * DS-02 — the primitive layer speaks DalyHub.
 *
 * DS-01 built the `--dh-*` layer and left it with almost no consumers, noting
 * that DS-02's job was to "establish the approved consumption path for shared
 * primitives". A path nothing enforces is a convention, and the whole point of
 * DS-01 was that a convention is what the product already had.
 *
 * So this file holds `ui.css` — the one stylesheet written entirely in the
 * DalyHub vocabulary — to that standard, with two deliberate, NAMED exceptions
 * rather than a vague allowance. It does not police the other 78 stylesheets:
 * DS-01 §9 is explicit that a file speaking both vocabularies during the
 * migration is expected rather than debt, and DS-02's brief rules out a global
 * token migration.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { DALYHUB_TOKEN_NAMES } from "~/shared/tokens";

const STYLES = join(process.cwd(), "app", "styles");
const UI_CSS = readFileSync(join(STYLES, "ui.css"), "utf8");

/**
 * The two `--md-*`/`--app-*` references `ui.css` is allowed to make, each with
 * the reason it is allowed spelled out at the site.
 *
 * A list rather than a pattern, so adding a third is an edit to this file that
 * a reviewer sees, rather than something that slips under a regex.
 */
const PERMITTED_FOREIGN_TOKENS = [
  // MOBILE-01's anti-zoom floor. `body-medium` on a pointer device, floored at
  // 16px on a touch one. It is a PLATFORM behaviour rather than a design value,
  // it is published in exactly one place, and mirroring it as a `--dh-*` name
  // would create a second thing to keep in step with iOS. DS-08 decides where
  // it finally lives.
  "--app-field-font-size-compact",
  // The badge's four status CONTAINER pairs. The DalyHub layer publishes
  // `--dh-color-success` / `-warning` / `-danger` as ROLE colours; a container
  // pair is a second value each, and eight more published names whose only
  // consumer is one block. DS-01 §2.3 declined to flatten data vocabularies for
  // the same reason.
  "--md-sys-color-success-container",
  "--md-sys-color-on-success-container",
  "--md-sys-color-warning-container",
  "--md-sys-color-on-warning-container",
  "--md-sys-color-error-container",
  "--md-sys-color-on-error-container",
  "--md-sys-color-info-container",
  "--md-sys-color-on-info-container",
];

describe("DS-02 the primitive stylesheet consumes the DalyHub layer", () => {
  it("references no foreign token outside the named exceptions", () => {
    const referenced = [...UI_CSS.matchAll(/var\((--(?:md|app)-[\w-]+)/g)].map(
      (match) => match[1],
    );
    const unexpected = [
      ...new Set(
        referenced.filter((n) => !PERMITTED_FOREIGN_TOKENS.includes(n)),
      ),
    ];
    expect(
      unexpected,
      `ui.css is the DalyHub-vocabulary file. Reach for a --dh-* token, or add the ` +
        `reference to PERMITTED_FOREIGN_TOKENS with the reason: ${unexpected.join(", ")}`,
    ).toEqual([]);
  });

  it("references only DalyHub tokens that are actually published", () => {
    // A typo'd `var(--dh-colour-text)` resolves to nothing, the declaration is
    // dropped, and the control renders with an inherited value that is usually
    // ALMOST right — which is the hardest kind of styling bug to see.
    const published = new Set(DALYHUB_TOKEN_NAMES.map((n) => `--${n}`));
    const referenced = [...UI_CSS.matchAll(/var\((--dh-[\w-]+)/g)].map(
      (match) => match[1],
    );
    const unknown = [...new Set(referenced.filter((n) => !published.has(n)))];
    expect(
      unknown,
      `not published in app/shared/tokens/dalyhub.ts: ${unknown.join(", ")}`,
    ).toEqual([]);
  });

  it("authors no raw colour", () => {
    const hexes = UI_CSS.match(/#[0-9a-fA-F]{3,8}\b/g) ?? [];
    expect(hexes, `raw colour in ui.css: ${hexes.join(", ")}`).toEqual([]);
    for (const fn of ["rgb(", "rgba(", "hsl(", "oklch("]) {
      expect(UI_CSS.includes(fn), `authored colour function ${fn}`).toBe(false);
    }
  });

  it("hard-codes no length where a token exists", () => {
    // Lengths are allowed only inside `calc()` and as the `0`/`100%` structural
    // values every layout needs; a bare `12px` or `0.875rem` is a design value
    // that belongs in the token layer (AGENTS.md §9.8).
    //
    // The NEGATIVE case is spelled out because it is the one that got through
    // during DS-02: a checkbox tick optically centred with
    // `transform: translateY(-1px)`. A hard-coded length is a hard-coded length
    // inside a transform, and a `-` before the digit must not be mistaken for a
    // token name's hyphen — hence the `[\w]`-only lookbehind plus the explicit
    // sign in the pattern.
    const declarations = UI_CSS.replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((line) => /^\s*[a-z-]+\s*:/.test(line));
    const offenders = declarations.filter((line) =>
      /:\s*[^;]*?(?<![\w])-?\d*\.?\d+(px|rem|em)\b/.test(
        // `calc()` is where the layer's own tokens are composed, and the
        // affix inset and the multiline floor both genuinely need one.
        line.replace(/calc\([^)]*\)/g, ""),
      ),
    );
    expect(
      offenders.map((l) => l.trim()),
      "hard-coded length in ui.css",
    ).toEqual([]);
  });
});

describe("DS-02 the button family is not a stadium (D33)", () => {
  it("gives no button variant the pill radius", () => {
    // D13 reserved `corner-full` for primary and destructive actions; D33
    // retires it from the family altogether. The pill token still exists and is
    // still correct for a dot and a spinner, so this checks the button BLOCK
    // rather than the file.
    const buttonBlock = UI_CSS.slice(
      UI_CSS.indexOf("/* Button "),
      UI_CSS.indexOf("/* IconButton "),
    );
    const radii = [...buttonBlock.matchAll(/border-radius:\s*([^;]+);/g)].map(
      (m) => m[1].trim(),
    );
    expect(radii.length).toBeGreaterThan(0);
    for (const radius of radii) {
      // The spinner is a circle and is allowed to be one — it is not a button.
      if (radius === "var(--dh-radius-pill)") continue;
      expect(radius, "a button variant took the stadium").toBe(
        "var(--dh-radius-control)",
      );
    }
  });

  it("states no control height of its own — density owns it", () => {
    // The rule that makes `compact` safe: no primitive can be compact where a
    // finger has to reach it, because no primitive decides its own height.
    const heights = [
      ...UI_CSS.matchAll(/min-(?:block|inline)-size:\s*([^;]+);/g),
    ].map((m) => m[1].trim());
    const fixed = heights.filter(
      (value) => !value.includes("var(--dh-") && value !== "0",
    );
    expect(fixed, "a primitive hard-coded a control size").toEqual([]);
  });
});
