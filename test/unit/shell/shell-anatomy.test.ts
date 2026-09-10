/**
 * DS-03 / UNTITLED-02 — the shell's anatomy, asserted against its source.
 *
 * These are STRUCTURAL guarantees rather than pixel values. The repository has
 * no visual-regression system, so what is worth testing here is the set of
 * properties that would silently rot: the rail not clipping the panel that opens
 * out of it, the tablet collapse being one decision stated twice, and collapsed
 * labels staying in the accessibility tree.
 *
 * ── What UNTITLED-02 changed, and what it deliberately did not ──────────────
 *
 * The shell's presentation moved from ~1,900 lines of `shell.css` to Untitled
 * UI's components and Tailwind utilities, so assertions that read CSS RULES now
 * read COMPONENT SOURCE. Every invariant below is the same invariant it was —
 * the rail must not become a scroll container, a collapsed label must not be
 * `display: none`, the frame must not restate a measurement the tokens publish —
 * because each one describes a defect that has actually happened here, and the
 * defect is just as available in Tailwind as it was in CSS. The three that were
 * retired outright say why, at the foot of the file.
 *
 * The alternative — deleting this file because its selectors no longer exist —
 * would have traded the record of six regressions for a green run.
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

/**
 * A component's source with its comments removed.
 *
 * The same reasoning as `shellRules`, and it matters more here: these files
 * document what they replaced, so a bare `includes()` over the raw source would
 * happily match a class name inside a paragraph explaining why it was deleted.
 */
function sourceCode(file: string): string {
  return shellSource(file)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

describe("UNTITLED-02 the rail", () => {
  it("uses the semantic navigation-height token for every pointer", () => {
    const row = sourceCode("RailNavItem.tsx");
    expect(row).toContain("h-[var(--dh-shell-nav-row-height)]");
    expect(row).not.toContain('surface === "sheet" ? "min-h-11" : "h-9"');
  });

  it("is recessed under the page canvas, in Untitled's surface vocabulary", () => {
    /*
     * AGENTS.md §6 D35: the rail sits UNDER its own canvas rather than on it,
     * because it is a different surface from the page it frames. Untitled's
     * reference sidebar does the opposite — a `bg-primary` card inset from the
     * viewport with a ring and a shadow — so this is the one place the shell
     * deliberately departs from the component it adopted, and the departure has
     * to be pinned or the next re-sync quietly reverses it.
     */
    const rail = sourceCode("Sidebar.tsx");
    expect(rail).toContain("bg-secondary");
    expect(rail, "the rail draws one hairline, not an elevation").toContain(
      "border-r border-secondary",
    );
    expect(
      rail,
      "a stationary surface must not rely on elevation (migration brief)",
    ).not.toMatch(/isRail[\s\S]{0,400}shadow-(lg|xl|2xl)/);
  });

  it("is NOT a clipping ancestor — the destination list scrolls, the rail does not", () => {
    /*
     * The regression this exists for, found in review on PR #176, and just as
     * available in Tailwind as it was in CSS.
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
    const source = sourceCode("Sidebar.tsx");

    const navElement = /<nav[\s\S]*?\n {4}>/.exec(source);
    expect(navElement, "the rail's root element").not.toBeNull();
    expect(
      navElement![0],
      "the rail itself must not clip the account panel it contains",
    ).not.toMatch(/overflow-[xy]?-?(auto|hidden|scroll)/);

    // The destinations are the one part that can overflow, so they are the one
    // part that scrolls. `min-h-0` is what lets a flex item shrink below its
    // content size — without it the list refuses to shrink and pushes the
    // account off the bottom instead of scrolling.
    expect(source, "the destination list scrolls").toContain("overflow-y-auto");
    expect(source, "and can shrink below its content size").toContain(
      "min-h-0",
    );
  });

  it("marks the selected destination with a treatment that CONTRASTS with the rail", () => {
    /*
     * Untitled's nav item assumes it sits on `bg-primary` and marks the current
     * row `bg-secondary`. The rail is itself `bg-secondary`, so adopting that
     * pairing unchanged paints the current row in the exact colour it sits on —
     * which is what the first render of this shell did, leaving `/today` with no
     * "you are here" anchor at all.
     *
     * Asserted as the two surfaces being DIFFERENT rather than as specific
     * colours, so the treatment can be retuned but the two can never collapse
     * into each other again.
     */
    const row = sourceCode("RailNavItem.tsx");
    const rail = /rail:\s*\{([\s\S]*?)\}/.exec(row);
    const sheet = /sheet:\s*\{([\s\S]*?)\}/.exec(row);
    expect(rail, "the rail surface tones").not.toBeNull();
    expect(sheet, "the sheet surface tones").not.toBeNull();

    const railSelected = /selected:\s*"([^"]*)"/.exec(rail![1])?.[1];
    const sheetSelected = /selected:\s*"([^"]*)"/.exec(sheet![1])?.[1];
    expect(railSelected).toBeTruthy();
    expect(sheetSelected).toBeTruthy();
    expect(
      railSelected,
      "a selected row on the recessed rail must not be the rail's own colour",
    ).not.toBe(sheetSelected);
    expect(railSelected).toContain("bg-primary");
  });

  it("conveys the current destination semantically, not by colour alone", () => {
    // AGENTS.md §15. `aria-current` is the contract; the paint reinforces it.
    expect(sourceCode("RailNavItem.tsx")).toContain(
      'aria-current={current ? "page" : undefined}',
    );
  });
});

describe("DS-03 the tablet collapse", () => {
  it("states the same width band in the query and in the frame", () => {
    /*
     * The LAYOUT is the breakpoint; the component mirrors it only to decide
     * whether a row's label is currently readable and therefore whether its
     * tooltip is needed. Two statements of one boundary is the shape that
     * silently drifts — a rail that collapses at 1024 while its tooltips appear
     * below 900 is a rail with fourteen unnamed glyphs across a 124px band, and
     * nothing would fail.
     *
     * UNTITLED-02 moved the layout half onto Tailwind's `md:`/`lg:` breakpoints,
     * which are 48rem and 64rem — the same two numbers this query names. So the
     * assertion follows the frame rather than the stylesheet.
     */
    expect(COLLAPSED_RAIL_QUERY).toBe(
      "(min-width: 48rem) and (max-width: 63.9375rem)",
    );

    const frame = sourceCode("AppShell.tsx");
    expect(
      frame,
      "the collapsed band runs from `md` and ends where `lg` takes over",
    ).toContain("md:grid-cols-[var(--dh-shell-rail-width-collapsed)_1fr]");
    expect(frame).toContain("lg:grid-cols-[var(--dh-shell-rail-width)_1fr]");
  });

  it("hides collapsed labels VISUALLY and keeps them in the document", () => {
    /*
     * `display: none` on a collapsed label takes the link's accessible name with
     * it and leaves fourteen unnamed destinations — the "ambiguous unlabeled
     * icons" failure the DS-03 brief names outright.
     *
     * Tailwind's `sr-only` is the same visually-hidden technique the retired
     * `.dh-visually-hidden` used (`clip: rect(0,0,0,0)`), so every name stays in
     * the accessibility tree at every width. `hidden` is the trap, and it is one
     * word away.
     */
    for (const file of [
      "RailNavItem.tsx",
      "SidebarBrand.tsx",
      "UserMenu.tsx",
    ]) {
      const source = sourceCode(file);
      expect(source, `${file} hides collapsed text`).toContain("sr-only");
      expect(
        source,
        `${file} must not remove a collapsed label from the document`,
      ).not.toMatch(/collapsed\s*&&\s*"hidden"/);
    }
  });

  it("gives every collapsed row its name back to a POINTER", () => {
    // The accessible name survives the collapse; what a glyph-only row loses is
    // the name for a sighted pointer or keyboard user, which is what the shared
    // tooltip is for (M3-TIP finding 2). It is the DESCRIPTION, never the name.
    const nav = sourceCode("PrimaryNavigation.tsx");
    expect(nav).toContain("<Tooltip");
    expect(nav).toContain("disabled={!collapsed}");
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

describe("UNTITLED-02 the shell consumes the DalyHub vocabulary", () => {
  it("names no raw safe-area environment variable", () => {
    /*
     * MOBILE-01 consolidated 53 scattered `env(safe-area-inset-*)` calls into one
     * definition, half of which had lost the `0px` fallback that keeps them
     * composable inside `calc()`. DS-03 published that definition as `--dh-safe-*`.
     *
     * The rule now has to hold in the COMPONENTS too, because that is where the
     * insets are applied — an arbitrary Tailwind value is exactly as capable of
     * reaching past the token as a CSS declaration was.
     */
    expect(shellRules()).not.toContain("env(safe-area-inset");
    for (const file of ["BottomNav.tsx", "MobileTopBar.tsx", "MobileNav.tsx"]) {
      expect(sourceCode(file), `${file}`).not.toContain("env(safe-area-inset");
    }
  });

  it("clears the phone bar and the sheet by the safe-area tokens", () => {
    // The two surfaces a home indicator can actually cover…
    expect(sourceCode("BottomNav.tsx")).toContain("var(--dh-safe-bottom)");
    expect(sourceCode("MobileNav.tsx")).toContain("var(--dh-safe-bottom)");
    // …and the one a notch can.
    expect(sourceCode("MobileTopBar.tsx")).toContain("var(--dh-safe-top)");
  });

  it("measures the frame with the published shell tokens", () => {
    /*
     * The frame's measurements are agreed by the grid, the bar and the phone bar.
     * A number restated in a component is a number that drifts from the one the
     * pane, the FAB band and the notification region read.
     */
    const frame = sourceCode("AppShell.tsx");
    for (const token of [
      "--dh-shell-rail-width",
      "--dh-shell-rail-width-collapsed",
    ]) {
      expect(frame, `AppShell should consume ${token}`).toContain(
        `var(${token})`,
      );
    }
    expect(sourceCode("MobileTopBar.tsx")).toContain(
      "var(--dh-shell-mobile-bar-height)",
    );
    // The page frame still measures its gutter and its measure from the tokens.
    for (const token of ["--dh-shell-gutter", "--dh-shell-content-max-width"]) {
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

    // The bar holds its contents to the same origin.
    expect(sourceCode("DesktopTopBar.tsx")).toMatch(/px-4[\s\S]{0,40}lg:px-6/);
  });
});

describe("UNTITLED-02 the shell composes Untitled primitives", () => {
  it("builds the top bar's create action and utilities from the shared ones", () => {
    /*
     * UIX-01 drew the create action by hand because the primitive layer did not
     * exist yet: its own height, corner, type and hover. Composing the shared
     * button is what stops the shell being a place where a button is drawn
     * differently from every other button in the product.
     *
     * UNTITLED-02 changed WHICH shared layer that is — Untitled UI's `Button`
     * and `ButtonUtility`, not the DS-02 pair — and the assertion follows it.
     * The rule underneath is unchanged and is the point: the bar composes
     * primitives and paints nothing itself.
     */
    const source = shellSource("DesktopTopBar.tsx");
    expect(source).toContain('from "~/shared/ui/untitled/base/buttons/button"');
    expect(source).toContain(
      'from "~/shared/ui/untitled/base/buttons/button-utility"',
    );
    expect(source).toContain("<Button");
    expect(source).toContain("<ButtonUtility");

    // …and the bespoke PAINT is gone with it. The `.dh-topbar__*` family that
    // used to carry it has been deleted outright rather than emptied, which is a
    // stronger version of what this assertion always wanted.
    expect(shellRules()).not.toContain(".dh-topbar");
  });

  it("draws the frame's one primary control on Capture, and only there", () => {
    /*
     * The migration brief asks for one primary action per major surface, and
     * FINAL-UI §73 already demoted the bar's create control to `secondary` for
     * exactly that reason — two filled violet buttons were on screen at once on
     * every collection in the product.
     *
     * Capture is the exception the brief names outright ("do not bury it"), so
     * the rail's Capture control is the frame's ONLY primary-emphasis button.
     */
    expect(sourceCode("Sidebar.tsx")).toContain('color="primary"');
    expect(
      sourceCode("DesktopTopBar.tsx"),
      "the bar's create action is secondary — the page owns the primary",
    ).toContain('color="secondary"');
    expect(sourceCode("DesktopTopBar.tsx")).not.toContain('color="primary"');
  });

  it("keeps the touch-target floor on the phone's navigation controls", () => {
    /*
     * The regression this exists for, found by CI on PR #176: a hand-rolled rule
     * stated 44px, composing a primitive handed the button the density height
     * instead, and the floor was silently lost.
     *
     * The phone's bar, its top bar and the sheet's search entries are
     * hand-composed rather than built from a primitive that carries the floor —
     * so they state it, and this pins it. `min-h-14` (56px), `size-11` and
     * `min-h-11` (44px) all clear WCAG 2.5.8 and DalyHub's own promise.
     */
    expect(sourceCode("BottomNav.tsx")).toContain("min-h-14");
    expect(sourceCode("MobileTopBar.tsx")).toContain("size-11");
    expect(sourceCode("SidebarSearch.tsx")).toContain("min-h-11");
  });
});

/*
 * ── Three assertions UNTITLED-02 retired, and why ───────────────────────────
 *
 * "paints itself from the rail vocabulary, not from the page's" and "overrides
 * the focus ring's colour for the whole region" both existed because the rail
 * was a region whose colour did NOT follow the appearance — near-black under a
 * white page — so it needed its own `--dh-color-rail-*` family and its own focus
 * ring, or a component reaching for `--dh-color-text` out of habit painted
 * near-black on near-black.
 *
 * That condition is gone. The rail is now one tone away from the pane, both
 * following the appearance, both drawn from the one surface vocabulary every
 * other surface uses. There is no second colour system left for a component to
 * pick the wrong half of, so there is nothing for those two tests to catch — and
 * the recessed relationship they were really protecting is asserted directly by
 * "is recessed under the page canvas" above.
 *
 * "restates the selected destination under forced colours" is retired for a
 * related reason: it existed because the rail's selected rule was a TWO-class
 * selector that outranked the one-class forced-colours rule, so the short form
 * alone would have been silently overridden. There is no such selector any more.
 * Forced-colours behaviour is now carried by the `aria-current` semantics and
 * Untitled's own ring, and is verified where it can actually be measured — by
 * axe, in `e2e/accessibility.spec.ts`.
 *
 * "draws no stadium on any CONTROL in the frame" (D33) is retired as WRITTEN —
 * it counted `--dh-radius-pill` occurrences in a stylesheet that no longer
 * describes the frame — and is deliberately not replaced by a class-name count,
 * which would be the same brittleness in a new spelling. The rule still holds:
 * the two legitimate exceptions it enumerated (the account avatar, the phone
 * bar's Capture indicator) are both still circles, and both are drawings rather
 * than control corners.
 */
