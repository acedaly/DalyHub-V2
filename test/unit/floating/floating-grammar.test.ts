import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { appRelative, appSourceFiles, readAppFile } from "../tokens/token-css";

/**
 * DHDS-09 — the floating-surface architecture stays ONE architecture.
 *
 * These are contract tests over the repository, in the shape DHDS-08's motion
 * grammar established. What is worth protecting is not any particular radius; it
 * is that there is exactly **one** place a floating surface's appearance, its
 * placement, its layer and its option row come from. Every divergence DHDS-09
 * repaired was a copy: six panels that each decided their own border, three
 * placement solvers, three bare `z-index` numbers, and eight hand-built priority
 * option lists.
 *
 * The tests are deliberately narrow. They do not ban `background`, `box-shadow`
 * or `z-index` — a card, a sticky header and a swipe tray all legitimately use
 * them. They ban the specific shapes that mean "a second floating-surface
 * system is being built", which is what a broad rule would fail to say and what
 * the next author would route around.
 */

const STYLES_DIR = join(process.cwd(), "app", "styles");

function stylesheets(): readonly { name: string; text: string }[] {
  return readdirSync(STYLES_DIR)
    .filter((name) => name.endsWith(".css"))
    .map((name) => ({
      name,
      text: readFileSync(join(STYLES_DIR, name), "utf8"),
    }));
}

/** Split into `selector { declarations }`, comments stripped. */
function rules(css: string): readonly { selector: string; body: string }[] {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, "");
  const out: { selector: string; body: string }[] = [];
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(withoutComments)) !== null) {
    out.push({
      selector: match[1]!.trim().replace(/\s+/g, " "),
      body: match[2]!,
    });
  }
  return out;
}

describe("DHDS-09 — one floating surface", () => {
  it("declares the shared surface and the option row in floating.css alone", () => {
    const floating = readFileSync(join(STYLES_DIR, "floating.css"), "utf8");
    // The two class names the whole system is built from.
    expect(floating).toContain(".dh-floating {");
    expect(floating).toContain(".dh-option {");

    // Nothing else may DEFINE them. Adjusting one on a specific surface (
    // `.dh-inline-select__menu .dh-option__support`) is composition and stays
    // legal; a bare `.dh-option {` elsewhere is a second definition.
    const offenders = stylesheets()
      .filter(({ name }) => name !== "floating.css")
      .filter(({ text }) =>
        rules(text).some(
          ({ selector }) =>
            selector === ".dh-option" || selector === ".dh-floating",
        ),
      )
      .map(({ name }) => name);
    expect(
      offenders,
      `.dh-floating / .dh-option are defined outside floating.css: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("gives the shared surface a border, a surface tone and one shadow — and no glass", () => {
    const floating = readFileSync(join(STYLES_DIR, "floating.css"), "utf8");
    const surface = rules(floating).find(
      ({ selector }) => selector === ".dh-floating",
    );
    expect(surface).toBeDefined();
    const body = surface!.body;

    expect(body).toMatch(/border:\s*var\(--dh-border-width\)/);
    expect(body).toContain("var(--dh-color-surface-raised)");
    expect(body).toContain("var(--dh-elevation-overlay)");

    /*
     * The direction's prohibitions, as assertions rather than as prose: no
     * glassmorphism, no backdrop blur, no glow. A floating surface is obvious
     * because it is physically above the canvas.
     */
    expect(floating).not.toMatch(/backdrop-filter/);
    expect(floating).not.toMatch(/\bfilter:\s*blur/);
  });

  it("uses the two elevation rungs and invents no third", () => {
    const floating = readFileSync(join(STYLES_DIR, "floating.css"), "utf8");
    const shadows = [...floating.matchAll(/box-shadow:\s*([^;]+);/g)].map(
      (match) => match[1]!.trim(),
    );
    // An anchored surface, a centred modal, and the sheet's subtraction to none.
    expect(new Set(shadows)).toEqual(
      new Set([
        "var(--dh-elevation-overlay)",
        "var(--dh-elevation-modal)",
        "none",
      ]),
    );
  });
});

describe("DHDS-09 — one placement solver", () => {
  it("has exactly one module that computes where an anchored surface goes", () => {
    const solvers = appSourceFiles()
      .map((file) => appRelative(file))
      .filter((relative) =>
        /placeAnchored|placeMenu/.test(readAppFile(relative)),
      )
      .filter((relative) => !relative.startsWith("shared/anchored/"));

    expect(
      solvers,
      `these files compute anchored placement outside ~/shared/anchored: ${solvers.join(", ")}`,
    ).toEqual([]);
  });

  it("keeps the surface's position, layer and clamp in anchored.css alone", () => {
    const anchored = readFileSync(join(STYLES_DIR, "anchored.css"), "utf8");
    expect(anchored).toContain("position: fixed");
    expect(anchored).toContain("z-index: var(--dh-layer-anchored)");
    // `floating.css` is appearance ONLY — restating the geometry there would be
    // the same value decided in two files.
    const floating = readFileSync(join(STYLES_DIR, "floating.css"), "utf8");
    expect(floating).not.toMatch(/position:\s*fixed/);
    expect(floating).not.toMatch(/^\s*z-index:\s*var\(--dh-layer-(?!sticky)/m);
  });
});

describe("DHDS-09 — one layer vocabulary", () => {
  it("never writes a bare z-index for a floating surface", () => {
    /*
     * A bare number is legal for stacking WITHIN a component — a swipe tray
     * behind its card, a pseudo-element under its label — and those are all
     * `0`, `1` or `-1`. Anything larger is a component picking a rung of the
     * page's layer scale by guessing, which is what `z-index: 20` on the hover
     * card, the saved-view panel and the filter popover was.
     */
    const offenders: string[] = [];
    for (const { name, text } of stylesheets()) {
      for (const { selector, body } of rules(text)) {
        const match = /z-index:\s*(-?\d+)\s*;/.exec(body);
        if (!match) continue;
        const value = Number(match[1]);
        if (Math.abs(value) <= 1) continue;
        offenders.push(`${name}: ${selector} → z-index: ${value}`);
      }
    }
    expect(
      offenders,
      `name a --dh-layer-* role instead of guessing a rung:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("names a DalyHub layer rather than the machinery scale", () => {
    /*
     * `--app-z-raised` survives: it is within-page stacking (a row lifted over
     * its neighbour) rather than one of the six floating layers, and it has no
     * DalyHub role because nothing floats at it.
     */
    const offenders: string[] = [];
    for (const { name, text } of stylesheets()) {
      if (name === "tokens.css") continue;
      for (const line of text.split("\n")) {
        const match = /z-index:\s*var\(\s*(--app-z-[\w-]+)/.exec(line);
        if (match && match[1] !== "--app-z-raised") {
          offenders.push(`${name}: ${match[1]}`);
        }
      }
    }
    expect(
      offenders,
      `these consume the machinery z-index scale directly: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});

describe("DHDS-09 — no second panel appearance", () => {
  /**
   * The shape that means "a private floating panel": a rule that paints a
   * background AND a box-shadow AND a border-radius on one selector, outside
   * the files allowed to describe a surface.
   *
   * The allowed list is short and each entry is a surface with a genuine reason
   * to look like itself, recorded here so a new one has to be argued for.
   */
  const SURFACE_OWNERS = new Set([
    // The shared appearance itself.
    "floating.css",
    // A tooltip is a dark chip rather than a page surface (`--dh-color-overlay`).
    "tooltip.css",
    // A hover card is a rich tooltip; DEBT-181 tracks bringing it onto the
    // shared surface once its pointer-containment dismissal is portable.
    "linked-items.css",
    // The centred command/search surfaces and the shell's own panels.
    "command.css",
    "search.css",
    "shell.css",
    "sheet.css",
    "drawer.css",
    "inspector.css",
    // Cards, and the development-only demo routes.
    "card.css",
    "card-family.css",
    "premium.css",
    // A toast is FEEDBACK about something that happened elsewhere rather than a
    // surface the owner opened; it rises from an edge, carries its own tone and
    // is never anchored to anything.
    "feedback.css",
  ]);

  it("no module stylesheet grows a private floating panel", () => {
    const offenders: string[] = [];
    for (const { name, text } of stylesheets()) {
      if (SURFACE_OWNERS.has(name) || name.endsWith("-demo.css")) continue;
      for (const { selector, body } of rules(text)) {
        const paints =
          /\bbackground(-color)?\s*:/.test(body) &&
          /box-shadow:\s*var\(--dh-elevation-(overlay|modal)\)/.test(body) &&
          /border-radius\s*:/.test(body);
        if (paints) offenders.push(`${name}: ${selector}`);
      }
    }
    expect(
      offenders,
      `compose .dh-floating instead of describing a panel again:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

describe("DHDS-09 — one priority vocabulary", () => {
  it("builds its option list in exactly one module", () => {
    /*
     * Eight surfaces used to map `TASK_PRIORITIES` into their own
     * `{ value, label }` list. Most agreed, because most read the same label
     * function — but two did not, and the ones that disagreed were the ones
     * nobody was looking at: `/views` offered the bare codes `P1`…`P4`, and a
     * Project template offered `value.toUpperCase()`.
     */
    const offenders = appSourceFiles()
      .map((file) => appRelative(file))
      // PRESENTATION only. The kernel legitimately walks `TASK_PRIORITIES` to
      // order and validate a stored value; what must not be rebuilt is the
      // OPTION LIST a control offers.
      .filter(
        (relative) =>
          relative.startsWith("modules/") || relative.startsWith("shared/"),
      )
      .filter(
        (relative) => relative !== "shared/task-record/priority-options.ts",
      )
      .filter((relative) =>
        /TASK_PRIORITIES\s*\.\s*map/.test(readAppFile(relative)),
      );

    expect(
      offenders,
      `import TASK_PRIORITY_OPTIONS instead of rebuilding the list: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
