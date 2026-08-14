/**
 * DS-03 — the shell's anatomy, asserted against the stylesheet and the source.
 *
 * These are STRUCTURAL guarantees rather than pixel values. The repository has
 * no visual-regression system and DS-03 did not add one, so what is worth
 * testing here is the set of properties that would silently rot: the rail being
 * dark in both appearances is a claim about a token, the tablet collapse being
 * one decision is a claim about a query stated twice, and "the shell consumes
 * the DalyHub vocabulary" is a claim that is true on the day it is written and
 * false the first time someone reaches for `--md-sys-color-…` out of habit.
 *
 * Each of them is a rule DS-03 established that a later change could break
 * without breaking anything a component test can see.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { COLLAPSED_RAIL_QUERY } from "~/shared/shell/collapsed-rail";

const shellCss = readFileSync(
  join(process.cwd(), "app", "styles", "shell.css"),
  "utf8",
);

function shellSource(file: string): string {
  return readFileSync(
    join(process.cwd(), "app", "shared", "shell", file),
    "utf8",
  );
}

/** `shell.css` with its comments removed — the rules the browser actually sees. */
function shellRules(): string {
  return shellCss.replace(/\/\*[\s\S]*?\*\//g, "");
}

describe("DS-03 the rail", () => {
  it("paints itself from the rail vocabulary, not from the page's", () => {
    // The rail is the one region whose value does not follow the appearance, so
    // reaching for `--dh-color-text` here paints near-black on near-black in the
    // light appearance — the exact defect the rail token family exists to make
    // impossible. Asserted on the RULE (`.dh-sidebar--rail { … }`) rather than
    // on the file, because the file also styles the phone sheet, which correctly
    // uses the ordinary vocabulary.
    const rule = /\.dh-sidebar--rail\s*\{([^}]*)\}/.exec(shellRules());
    expect(rule, "the .dh-sidebar--rail rule").not.toBeNull();
    expect(rule![1]).toContain("var(--dh-color-rail)");
    expect(rule![1]).toContain("var(--dh-color-rail-text)");
  });

  it("overrides the focus ring's colour for the whole region", () => {
    // Not just for the navigation rows: the account trigger takes focus on the
    // rail too, and `primary` fails 1.4.11 over the rail for both of them.
    expect(shellRules()).toMatch(
      /\.dh-sidebar--rail\s+:focus-visible\s*\{[^}]*outline-color:\s*var\(--dh-color-rail-focus\)/,
    );
  });

  it("restates the selected destination under forced colours", () => {
    // The rail's own selected rule is a TWO-class selector, so it outranks the
    // one-class forced-colours rule. A forced-colours block that named only the
    // short form would be silently overridden by a generated violet on exactly
    // the surface a forced-colours user depends on.
    const forced = /@media \(forced-colors: active\)\s*\{([\s\S]*?)\n\}/.exec(
      shellRules(),
    );
    expect(forced, "the forced-colours block").not.toBeNull();
    expect(forced![1]).toContain(
      '.dh-sidebar--rail .dh-nav__link[aria-current="page"]',
    );
    expect(forced![1]).toContain("Highlight");
  });

  it("is NOT a clipping ancestor — the destination list scrolls, the rail does not", () => {
    /*
     * The regression this exists for, found in review on PR #176.
     *
     * `overflow-y: auto` makes an element a scroll container and therefore a
     * CLIPPING ancestor for everything absolutely positioned inside it. That was
     * harmless while the rail held only links. DS-03 moved the ACCOUNT MENU into
     * it, and the menu's panel is 15rem wide — so the panel was clipped to the
     * rail's own width: MEASURED at 240px cut to 216 on a desktop, and to 68 on a
     * tablet, where Settings and Sign out were sliced to single letters.
     *
     * The rail was scrolling the wrong thing. The brand and the account are fixed
     * furniture at the two ends of the column; only the destinations between them
     * can ever be too long. Asserting BOTH halves, because either alone is a
     * broken rail — a non-scrolling list pushes the account off a short viewport,
     * and a scrolling rail clips the panel again.
     */
    const rail = /\.dh-sidebar--rail\s*\{([^}]*)\}/.exec(shellRules());
    expect(rail, "the .dh-sidebar--rail rule").not.toBeNull();
    expect(
      rail![1],
      "the rail must not clip the account panel it now contains",
    ).toContain("overflow: visible");
    expect(rail![1]).not.toMatch(/overflow-[xy]:\s*(auto|hidden|scroll)/);

    const list = /\.dh-sidebar--rail \.dh-nav\s*\{([^}]*)\}/.exec(shellRules());
    expect(list, "the rail's scrolling destination list").not.toBeNull();
    expect(list![1]).toContain("overflow-y: auto");
    // Without this a flex item refuses to shrink below its content size, so the
    // list would push the account off the bottom instead of scrolling.
    expect(list![1]).toContain("min-block-size: 0");
  });

  it("draws no stadium on any CONTROL in the frame", () => {
    /*
     * D33 — no button, field, navigation row or icon control is `corner-full`.
     * DS-02 §8 listed the shell's stadiums as debt #3 and handed them here; this
     * is the assertion that they do not come back. Retired in DS-03: the search
     * capsule, the create pill, the sheet's two 56px search entries, the skip
     * link, the account trigger and the sheet's close control.
     *
     * TWO survive, and D33 names the exception itself — "the stadium survives
     * where it is a DRAWING rather than a control's corner":
     *
     *   - `.dh-user-menu__avatar`, which is an avatar (D33's own example, and
     *     D26's circle for a person);
     *   - the phone bar's Capture indicator, which is a circle precisely
     *     BECAUSE it is not a destination — the shape says so before the colour
     *     does, which is what keeps it legible under forced colours (D15/UIX-01).
     *
     * Enumerated rather than counted, so a third one has to argue for itself
     * here instead of arriving under an incremented number.
     */
    const stadiums = shellRules()
      .split("}")
      .filter((rule) => rule.includes("--md-sys-shape-corner-full"))
      .map((rule) =>
        rule.slice(0, rule.indexOf("{")).trim().replace(/\s+/g, " "),
      );

    expect(stadiums.sort()).toEqual([
      ".dh-bottomnav__control--capture .dh-bottomnav__indicator",
      ".dh-user-menu__avatar",
    ]);
  });
});

describe("DS-03 the tablet collapse", () => {
  it("states the same width band in the stylesheet and in the component", () => {
    /*
     * The LAYOUT is the media query; the component mirrors it only to decide
     * whether a row's label is currently readable and therefore whether its
     * tooltip is needed. Two statements of one boundary is the shape that
     * silently drifts — a rail that collapses at 1024 while its tooltips appear
     * below 900 is a rail with fourteen unnamed glyphs across a 124px band, and
     * nothing would fail.
     */
    expect(COLLAPSED_RAIL_QUERY).toBe(
      "(min-width: 48rem) and (max-width: 63.9375rem)",
    );
    expect(shellCss).toContain(`@media ${COLLAPSED_RAIL_QUERY}`);
  });

  it("hides collapsed labels VISUALLY and keeps them in the document", () => {
    /*
     * `display: none` on a collapsed label takes the link's accessible name with
     * it and leaves fourteen unnamed destinations — the "ambiguous unlabeled
     * icons" failure the DS-03 brief names outright. The visually-hidden
     * treatment (`clip: rect(0, 0, 0, 0)`) keeps every name in the
     * accessibility tree at every width.
     */
    const collapsed = shellRules().split(`@media ${COLLAPSED_RAIL_QUERY}`);
    expect(collapsed.length).toBeGreaterThan(1);
    const labelRule = /\.dh-sidebar--rail \.dh-nav__label\s*\{([^}]*)\}/.exec(
      shellRules(),
    );
    expect(labelRule, "the collapsed label rule").not.toBeNull();
    expect(labelRule![1]).toContain("clip: rect(0, 0, 0, 0)");
    expect(labelRule![1]).not.toContain("display: none");
  });

  it("is a width rule and never a stored preference", () => {
    /*
     * DS-03 deliberately ships no user-toggleable collapse: it would need a
     * persisted preference, a server read to avoid a flash of the wrong width on
     * first paint, and an action to write it — shell customisation the brief
     * rules out (§9, §36) and which DS-07 owns if it is ever wanted. A width
     * rule is correct on the first byte and cannot disagree with itself between
     * the server and the browser.
     *
     * Stated as a test so that adding the preference is a deliberate act that
     * updates this reasoning, rather than a quiet `useState` in the shell.
     */
    for (const file of [
      "AppShell.tsx",
      "Sidebar.tsx",
      "PrimaryNavigation.tsx",
    ]) {
      expect(
        shellSource(file),
        `${file} must not persist a collapse state`,
      ).not.toMatch(
        /collaps(ed|e)\s*[,)]?\s*set[A-Z]|localStorage|dh_nav_collapsed/,
      );
    }
  });
});

describe("DS-03 the shell consumes the DalyHub vocabulary", () => {
  it("names no raw safe-area environment variable", () => {
    // MOBILE-01 consolidated 53 scattered `env(safe-area-inset-*)` calls into
    // one definition, half of which had lost the `0px` fallback that keeps them
    // composable inside `calc()`. DS-03 published that definition as
    // `--dh-safe-*`; this is the rule that stops a new bottom-anchored surface
    // reaching past it.
    expect(shellRules()).not.toContain("env(safe-area-inset");
  });

  it("clears the phone bar and the sheet by the safe-area tokens", () => {
    // The two surfaces a home indicator can actually cover.
    const bottomNav = /\.dh-bottomnav\s*\{([^}]*)\}/.exec(shellRules());
    expect(bottomNav, "the .dh-bottomnav rule").not.toBeNull();
    expect(bottomNav![1]).toContain("var(--dh-safe-bottom)");

    const panel = /\.dh-mobilenav__panel\s*\{([^}]*)\}/.exec(shellRules());
    expect(panel, "the .dh-mobilenav__panel rule").not.toBeNull();
    expect(panel![1]).toContain("var(--dh-safe-bottom)");
  });

  it("measures the frame with the published shell tokens", () => {
    // The frame's four measurements are agreed by the grid, the bar, the phone
    // bar and the navigation row. A number restated in `shell.css` is a number
    // that drifts from the one the pane, the FAB band and the notification
    // region read.
    for (const token of [
      "--dh-shell-rail-width",
      "--dh-shell-rail-width-collapsed",
      "--dh-shell-bar-height",
      "--dh-shell-mobile-bar-height",
      "--dh-shell-nav-row-height",
      "--dh-shell-gutter",
      "--dh-shell-content-max-width",
    ]) {
      expect(shellRules(), `shell.css should consume ${token}`).toContain(
        `var(${token})`,
      );
    }
  });

  it("gives the frame ONE origin — rail, gutter, then everything", () => {
    /*
     * The top bar's search field, the page title and the content beneath it all
     * start on the same vertical line, at every width. DS-03 moved search to the
     * leading edge precisely so that they could.
     *
     * The header's `margin-inline: auto` is what broke it, and only above ~1400px
     * — below the measure it is a no-op, which is why it survived every laptop
     * review. MEASURED at 1920 before the fix: the title started at x=347 and the
     * list it titles at x=256.
     */
    const header = /\.dh-pane-header\s*\{([^}]*)\}/.exec(shellRules());
    expect(header, "the .dh-pane-header rule").not.toBeNull();
    expect(
      header![1],
      "the page header must START-align, like the content it titles",
    ).toContain("margin-inline: 0");
    expect(header![1]).toContain("padding-inline: var(--dh-shell-gutter)");

    const bar = /\.dh-topbar\s*\{([^}]*)\}/.exec(shellRules());
    expect(bar, "the .dh-topbar rule").not.toBeNull();
    expect(
      bar![1],
      "the bar must hold its contents to the same gutter",
    ).toContain("padding-inline: var(--dh-shell-gutter)");
  });

  it("states no control height of its own in the frame's chrome", () => {
    /*
     * DS-02's rule, applied to the shell: nothing states a height, density does.
     * It is what makes the same stylesheet draw a 36px search field on a laptop
     * and a 45px one on a phone, and it is why the bar could come down to 56px
     * without a separate touch-target rule.
     *
     * The navigation ROW is the one exception and has its own published token,
     * because a destination is not a control — it is floored to the touch
     * minimum on a coarse pointer by `tokens.css`, alongside the density floor.
     */
    const chrome = [
      /\.dh-topbar__search\s*\{([^}]*)\}/,
      /\.dh-topbar__utility\s*\{([^}]*)\}/,
      /\.dh-sidebar__search-entry\s*\{([^}]*)\}/,
    ];
    for (const pattern of chrome) {
      const rule = pattern.exec(shellRules());
      expect(rule, `${pattern}`).not.toBeNull();
      expect(
        rule![1],
        `${pattern} must take its height from density`,
      ).toContain("var(--dh-control-height)");
    }
  });
});

describe("DS-03 the shell composes DS-02 primitives", () => {
  it("builds the top bar's create action and utilities from the shared ones", () => {
    // UIX-01 drew the create action by hand because the primitive layer did not
    // exist yet: its own height, corner, type and hover. Composing `Button` is
    // what gives the frame D33's corner and the compact density for free, and is
    // what stops the shell being a place where a button is drawn differently
    // from every other button in the product.
    const source = shellSource("DesktopTopBar.tsx");
    expect(source).toContain('from "~/shared/ui"');
    expect(source).toContain("<Button");
    expect(source).toContain("<IconButton");

    // …and the bespoke PAINT is gone with it: no colour, no corner, no type.
    // Those are the primitive's job, and restating any of them is how the shell
    // drifts back into drawing its own buttons.
    const create = /\.dh-topbar__create\s*\{([^}]*)\}/.exec(shellRules());
    expect(create, "the .dh-topbar__create rule").not.toBeNull();
    for (const property of ["background", "border-radius", "font-size"]) {
      expect(
        create![1],
        `.dh-topbar__create must not restate ${property}`,
      ).not.toContain(property);
    }
  });

  it("keeps the 44px target floor on the GLOBAL capture control", () => {
    /*
     * The regression this exists for, found by CI on PR #176.
     *
     * UIX-01's hand-rolled rule stated 44px with the note "so it clears WCAG 2.2
     * (2.5.8) without a separate hit area". Composing `Button` handed the height
     * to the density model — correct for every ordinary button, and 36px on a
     * fine pointer for this one. MEASURED at 36 against a required 44.
     *
     * It is the one control `creation-controls.spec.ts` asserts a target on at
     * EVERY route, and rightly: it is the global capture action, reachable from
     * every screen, and the product's most frequent creative act. The floor is
     * `--app-touch-target-min` rather than a number, so it is the same floor the
     * density model applies under a coarse pointer — this control just takes it
     * unconditionally.
     */
    const create = /\.dh-topbar__create\s*\{([^}]*)\}/.exec(shellRules());
    expect(create![1]).toContain("min-block-size: var(--app-touch-target-min)");
  });
});
