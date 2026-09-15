import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

/*
 * The ONE stylesheet allowed to be unlayered, read as TEXT so that the
 * exception this test permits is derived from the file rather than restated
 * beside it and left to drift.
 */
const editorStylesheet = readFileSync(
  join(process.cwd(), "app/styles/markdown-editor.css"),
  "utf8",
);

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
   * than through one element: **the only unlayered rules in the document are the
   * two documented exceptions.**
   *
   * A single unlayered rule is enough to reintroduce the defect, because
   * unlayered beats layered unconditionally — so this counts rather than
   * samples.
   *
   * ── Why this runs on TWO routes, and what that cost to learn ───────────────
   *
   * It used to run only on a fixture route, and it passed while the product was
   * broken. CodeMirror injects its stylesheet at RUNTIME, so it exists only on a
   * page that mounts an editor — and the fixture route mounts none. The first CI
   * run of the layer architecture duly went green here and red in four
   * partitions, on the editor's lost left padding.
   *
   * So the sweep visits a surface WITH a third-party runtime-injected
   * stylesheet as well as one without, and it names the exceptions instead of
   * allowing an empty set. An assertion that cannot see the thing it is about is
   * not a gate.
   */
  for (const [label, path] of [
    ["a surface with no runtime-injected CSS", "/design/record-layout"],
    ["a surface that mounts the CodeMirror editor", "/notes/n-search-e2e"],
  ] as const) {
    test(`only the documented exceptions are unlayered — ${label}`, async ({
      page,
    }) => {
      await page.goto(path);
      /* The editor mounts after hydration; the injected sheet does not exist
       * until it does, which is the whole point of visiting this route. */
      await page.waitForTimeout(2500);

      const unlayered = await page.evaluate(() => {
        const offenders: { selector: string; sheet: string }[] = [];

        const walk = (
          rules: CSSRuleList,
          insideLayer: boolean,
          sheetLabel: string,
        ) => {
          for (const rule of Array.from(rules)) {
            const type = rule.constructor.name;

            if (type === "CSSLayerBlockRule") {
              walk((rule as CSSGroupingRule).cssRules, true, sheetLabel);
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
              walk((rule as CSSGroupingRule).cssRules, insideLayer, sheetLabel);
              continue;
            }
            /* At-rules that define a resource rather than paint an element are
             * not cascade participants and cannot be layered. */
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
              const selector =
                (rule as CSSStyleRule).selectorText ?? rule.cssText;
              offenders.push({
                selector: String(selector).slice(0, 120),
                sheet: sheetLabel,
              });
            }
          }
        };

        for (const sheet of Array.from(document.styleSheets)) {
          const label = sheet.href
            ? sheet.href.split("/").pop()!
            : "(runtime-injected <style>)";
          /* Same-origin only; a cross-origin sheet throws on `cssRules`. */
          try {
            walk(sheet.cssRules, false, label);
          } catch {
            /* Not ours to police. */
          }
        }
        return offenders;
      });

      /*
       * The two exceptions, and nothing else.
       *
       *   1. CodeMirror's own injected sheet — the `.cm-*` namespace, plus the
       *      generated `.ͼ*` classes `style-mod` emits, which carry no ASCII
       *      class name at all.
       *   2. `markdown-editor.css`, the stylesheet that configures CodeMirror.
       *      It cannot be layered while the thing it overrides is not; the
       *      argument is beside its import in `app/app.css`.
       *
       * The second set is READ FROM THE FILE rather than written out here. A
       * hand-maintained list of namespaces is a list that drifts: the first
       * draft of this test allowed `.dh-md-*` and missed
       * `.dh-record-link-picker*`, which the same file owns, so it failed on a
       * correct tree. Deriving the set means the exception is exactly "what
       * that one file declares", and a rule added unlayered anywhere else
       * still fails.
       */
      const allowedClasses = new Set(
        [...editorStylesheet.matchAll(/\.([A-Za-z_][\w-]*)/g)].map((m) => m[1]),
      );
      const unexpected = unlayered.filter(({ selector }) => {
        const classes = [...selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(
          (m) => m[1],
        );
        /* A selector with no ASCII class is CodeMirror's generated `.ͼ1` form
         * (or a bare element selector, which is never allowed unlayered). */
        if (classes.length === 0) return !selector.includes("ͼ");
        return !classes.every(
          (c) => allowedClasses.has(c) || c.startsWith("cm-"),
        );
      });

      expect(
        unexpected.slice(0, 20),
        `${unexpected.length} rule(s) sit outside every cascade layer and are ` +
          `not one of the two documented exceptions — they therefore outrank ` +
          `all of Untitled regardless of specificity`,
      ).toEqual([]);
    });
  }

  /**
   * The exception is BOUNDED, not open: the editor's own padding is proof that
   * `markdown-editor.css` still beats the library it configures.
   *
   * This is the assertion that would have caught the regression directly. It
   * fails if the file is ever put back into a layer, whatever the layer.
   */
  test("the editor stylesheet still beats CodeMirror's injected defaults", async ({
    page,
  }) => {
    await page.goto("/notes/n-search-e2e");
    const content = page.locator(".dh-md-editor__cm .cm-content");
    await content.waitFor();

    const padding = await content.evaluate((el) => {
      const s = getComputedStyle(el);
      return { left: s.paddingLeft, top: s.paddingTop };
    });

    /* CodeMirror's default is `4px 0`. DalyHub's is a token-derived inset that
     * lines the first character up with the toolbar's first icon. The exact
     * value is the stylesheet's business; that it is NOT zero is the contract,
     * and zero is precisely what a layered `markdown-editor.css` produced. */
    expect(
      Number.parseFloat(padding.left),
      "the editor's first line has no left inset — CodeMirror's injected " +
        "`padding: 4px 0` is winning, which means `markdown-editor.css` has " +
        "been put into a cascade layer again",
    ).toBeGreaterThan(0);
  });

  /**
   * The exception CUTS BOTH WAYS, and this is the half nothing pinned.
   *
   * `markdown-editor.css` beating CodeMirror (above) is the same fact as
   * `markdown-editor.css` beating every `dh-product` stylesheet — unlayered
   * normal declarations outrank layered ones unconditionally, and specificity
   * does not enter into it. So from V3-CSS-01 onwards a product surface can no
   * longer vary the editor's geometry by declaring a competing value, however
   * specific its selector.
   *
   * Six overrides that had worked for months went inert that way, MEASURED at
   * 1280x720 on `main` @ 77f8b55 against `main` @ 4f49c169:
   *
   *   .dh-review-guide__prompt … .cm-editor  max-block-size  none  → 504px
   *   .dh-meeting-workspace   … .cm-editor  max-block-size  432px → 504px
   *   .dh-meeting-workspace   … .cm-editor  min-block-size  128px → 288px
   *   .dh-meeting-workspace   … __fallback  min-block-size  128px → 288px
   *   .dh-note-workspace      … > *         max-inline-size none  → 641px
   *   .dh-meeting-workspace   … > *         max-inline-size none  → 641px
   *
   * The first was a WCAG 2.2 AA failure — the guided Review's reflection
   * surface began scrolling inside a scrolling page, and axe's
   * `scrollable-region-focusable` caught it on `.cm-scroller`
   * (`reviews-guided.spec.ts` Journey 6). The other five were silent.
   *
   * The Note workspace is the cheapest of the six to reach, and it is the same
   * mechanism as all of them: the surface sets `--dh-md-editor-measure`, the
   * editor reads it as the fallback in its own declaration, and the value
   * resolves by INHERITANCE rather than by winning a cascade contest. This test
   * fails if that configuration point is turned back into a literal — which is
   * the shape the regression had.
   */
  test("a dh-product surface can still vary the editor's geometry", async ({
    page,
  }) => {
    await page.goto("/notes/n-search-e2e");
    const editor = page.locator(".dh-note-workspace .dh-md-editor").first();
    await editor.waitFor();

    const measured = await editor.evaluate((el) => {
      const child = el.firstElementChild as HTMLElement | null;
      return {
        property: getComputedStyle(el)
          .getPropertyValue("--dh-md-editor-measure")
          .trim(),
        childMaxInlineSize: child
          ? getComputedStyle(child).maxInlineSize
          : "NO CHILD",
      };
    });

    expect(
      measured.property,
      "`.dh-note-workspace` no longer sets `--dh-md-editor-measure`, so the " +
        "workspace's own column is not reaching the editor",
    ).toBe("none");

    expect(
      measured.childMaxInlineSize,
      "the editor's bands are capped at the shared writing measure inside a " +
        "Note workspace that sets its column once, above them. An unlayered " +
        "`markdown-editor.css` declaration is beating `notes.css` again",
    ).toBe("none");
  });
});
