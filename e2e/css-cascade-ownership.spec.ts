import { expect, test } from "@playwright/test";

/**
 * V3-CSS-01 — the CASCADE OWNERSHIP canary.
 *
 * This is the test the layer architecture exists for, and it is deliberately
 * the only one in the suite that asserts a cascade fact rather than a product
 * fact. It answers one question against a real browser and the real production
 * stylesheet: **when a DalyHub rule and an Untitled utility both address the
 * same element and the same property, which one wins?**
 *
 * ── Why it cannot be a unit test ─────────────────────────────────────────────
 *
 * Cascade layers are resolved by the browser's cascade, not by a parser. jsdom
 * does not implement `@layer` precedence, and reading the stylesheet text tells
 * you the declared order, never the applied result. The only honest answer is a
 * computed style from a rendering engine, which is what this reads.
 *
 * ── What it measures, and why THIS probe ─────────────────────────────────────
 *
 * `.dh-surface` (`ui.css`) is the generic bounded box — item 2 of the named
 * maintenance debt register, "a generic bounded box, and Untitled ships no
 * generic Card", 12 rules and 38 consumers. It declares `background` and
 * `border-radius` from `--dh-*` tokens with a single class of specificity. It is
 * the ideal probe precisely because it is ordinary: nothing about it is special,
 * so what happens to it is what happens to every legacy paint rule.
 *
 * The probe carries `.dh-surface` AND two Untitled utilities that contest the
 * same two properties. Both sides are single-class selectors, so specificity
 * cannot decide the contest and LAYER ORDER is the only thing left that can.
 *
 * ── The measurement on `main` @ 77f8b55, BEFORE the layer architecture ───────
 *
 * Every DalyHub stylesheet was unlayered — 600,574 of the production
 * stylesheet's 814,944 bytes (73.7%), emitted after the last `@layer` block.
 * Unlayered declarations outrank layered ones unconditionally, so the probe
 * MEASURED:
 *
 *     background-color  rgb(255, 255, 255)   ← `.dh-surface`, from --dh-color-surface
 *     border-radius     12px                 ← `.dh-surface`, from --dh-radius-md
 *
 * The Untitled utilities lost, and they lost for a reason that has nothing to do
 * with intent, authorship or specificity: they were in a layer and the legacy
 * rule was not. That is the defect this canary pins.
 */

/* A fixture route, so the canary never depends on product data or a signed-in
 * workspace — only on the one stylesheet the whole application loads. */
const ANY_PRODUCT_ROUTE = "/design/record-layout";

type Probe = {
  /** The rendered value of each contested property. */
  backgroundColor: string;
  borderRadius: string;
  /** Untitled's own values, read from a probe carrying ONLY the utilities. */
  untitledBackgroundColor: string;
  untitledBorderRadius: string;
  /** The legacy values, read from a probe carrying ONLY the legacy class. */
  legacyBackgroundColor: string;
  legacyBorderRadius: string;
};

/**
 * Mount three probes in the live document and read what the engine resolves.
 *
 * Reading all three in one pass is what makes the assertion legible: the
 * contested element's value is compared against the two uncontested ones, so a
 * failure says WHICH owner won rather than naming a colour nobody recognises.
 */
async function readProbe(
  page: import("@playwright/test").Page,
): Promise<Probe> {
  return page.evaluate(() => {
    const mount = (className: string) => {
      const el = document.createElement("div");
      el.className = className;
      el.setAttribute("data-cascade-probe", "");
      document.body.append(el);
      return el;
    };

    /* `bg-brand-solid` and `rounded-none` are Untitled utilities that contest
     * exactly the two properties `.dh-surface` paints. `rounded-none` is chosen
     * over a sized radius because 0px cannot be produced by any legacy token,
     * so the two owners can never be confused for one another. */
    const contested = mount("dh-surface bg-brand-solid rounded-none");
    const untitledOnly = mount("bg-brand-solid rounded-none");
    const legacyOnly = mount("dh-surface");

    const read = (el: Element) => {
      const s = getComputedStyle(el);
      return {
        backgroundColor: s.backgroundColor,
        borderRadius: s.borderTopLeftRadius,
      };
    };

    const c = read(contested);
    const u = read(untitledOnly);
    const l = read(legacyOnly);

    for (const el of document.querySelectorAll("[data-cascade-probe]"))
      el.remove();

    return {
      backgroundColor: c.backgroundColor,
      borderRadius: c.borderRadius,
      untitledBackgroundColor: u.backgroundColor,
      untitledBorderRadius: u.borderRadius,
      legacyBackgroundColor: l.backgroundColor,
      legacyBorderRadius: l.borderRadius,
    };
  });
}

test.describe("V3-CSS-01 — cascade ownership", () => {
  test("Untitled owns the paint of a control a legacy rule also paints", async ({
    page,
  }) => {
    await page.goto(ANY_PRODUCT_ROUTE);
    const probe = await readProbe(page);

    /* The probe is only meaningful if the two owners actually disagree. If a
     * future change makes them agree, this test would pass for the wrong reason,
     * so it fails loudly instead and asks to be re-pointed. */
    expect(
      probe.untitledBackgroundColor,
      "the probe no longer contests background-color — re-point it at a property the two owners still disagree about",
    ).not.toBe(probe.legacyBackgroundColor);
    expect(
      probe.untitledBorderRadius,
      "the probe no longer contests border-radius — re-point it at a property the two owners still disagree about",
    ).not.toBe(probe.legacyBorderRadius);

    /* The contract. Two single-class selectors address the same element and the
     * same properties; the LAYER ORDER decides, and it must decide for Untitled,
     * because generic control paint is Untitled's to own. */
    expect(
      probe.backgroundColor,
      "a legacy DalyHub rule is repainting a control Untitled owns — it is winning on layer order, not on intent",
    ).toBe(probe.untitledBackgroundColor);
    expect(
      probe.borderRadius,
      "a legacy DalyHub rule is reshaping a control Untitled owns — it is winning on layer order, not on intent",
    ).toBe(probe.untitledBorderRadius);
  });

  /**
   * The structural half of the same contract, measured through the CSSOM rather
   * than through one element: **no rule in the production stylesheet may sit
   * outside a cascade layer.**
   *
   * A single unlayered rule is enough to reintroduce the defect, because
   * unlayered beats layered unconditionally — so this counts rather than
   * samples. It catches the case the probe above cannot: a stylesheet added
   * later that nobody remembered to layer.
   */
  test("every rule in the production stylesheet belongs to a cascade layer", async ({
    page,
  }) => {
    await page.goto(ANY_PRODUCT_ROUTE);

    const unlayered = await page.evaluate(() => {
      const offenders: string[] = [];

      const walk = (rules: CSSRuleList, insideLayer: boolean) => {
        for (const rule of Array.from(rules)) {
          const type = rule.constructor.name;

          if (type === "CSSLayerBlockRule") {
            walk((rule as CSSGroupingRule).cssRules, true);
            continue;
          }
          /* `@layer a, b, c;` declares order and carries no rules. */
          if (type === "CSSLayerStatementRule") continue;
          /* Grouping rules inherit their parent's layer membership. */
          if (
            type === "CSSMediaRule" ||
            type === "CSSSupportsRule" ||
            type === "CSSContainerRule" ||
            type === "CSSScopeRule" ||
            type === "CSSStartingStyleRule"
          ) {
            walk((rule as CSSGroupingRule).cssRules, insideLayer);
            continue;
          }
          /* At-rules that define a resource rather than paint an element are not
           * cascade participants and cannot be layered. */
          if (
            type === "CSSFontFaceRule" ||
            type === "CSSKeyframesRule" ||
            type === "CSSPropertyRule" ||
            type === "CSSImportRule" ||
            type === "CSSNamespaceRule" ||
            type === "CSSCounterStyleRule" ||
            type === "CSSFontPaletteValuesRule"
          ) {
            continue;
          }

          if (!insideLayer) {
            const text = (rule as CSSStyleRule).selectorText ?? rule.cssText;
            offenders.push(String(text).slice(0, 120));
          }
        }
      };

      for (const sheet of Array.from(document.styleSheets)) {
        /* Same-origin only; a cross-origin sheet throws on `cssRules`. */
        try {
          walk(sheet.cssRules, false);
        } catch {
          /* Not ours to police. */
        }
      }
      return offenders;
    });

    expect(
      unlayered.slice(0, 20),
      `${unlayered.length} rule(s) sit outside every cascade layer and therefore outrank all of Untitled regardless of specificity`,
    ).toEqual([]);
  });
});
