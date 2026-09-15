import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test } from "@playwright/test";

/*
 * The ONE stylesheet allowed to be unlayered, read as TEXT so that the
 * exception this test permits is derived from the file rather than restated
 * beside it and left to drift.
 *
 * It is `markdown-editor-codemirror.css` and NOT `markdown-editor.css`: the
 * first version of this exception un-layered the whole editor stylesheet, which
 * then outranked the five product surfaces that legitimately override it and
 * cost an axe violation on the guided Review. Pointing the allowlist at the
 * six-rule file is what keeps the exception the size it has to be — widen that
 * file and this test widens with it, deliberately; put a rule anywhere else
 * unlayered and it fails.
 */
const editorStylesheet = readFileSync(
  join(process.cwd(), "app/styles/markdown-editor-codemirror.css"),
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
   * The caret is VISIBLE. Not "the caret takes a particular property from a
   * particular file" — visible, in both appearances, which is a contract a
   * person can check against the running product.
   *
   * This is deliberately not written as "`.cm-cursor` gets its
   * `border-left-color` from the exception file". That assertion would have
   * passed for the whole of the defect it exists to catch, because the rule WAS
   * there — in `markdown-editor.css`, in `dh-product`, losing to CodeMirror's
   * unlayered `border-left-color`. What was wrong was not which file declared it
   * but what an owner saw, and in the dark appearance what they saw was nothing:
   *
   *   caret, dark    rgb(0,0,0) on rgb(18,18,21)   =  1.12:1   (token: 16.88:1)
   *   caret, light   rgb(0,0,0) on rgb(246,246,248) = 19.46:1  (token: 17.59:1)
   *
   * Light mode hid it completely — black on near-white is *better* contrast than
   * the token, so the defect was invisible in the appearance most work happens
   * in and total in the other. That is why this runs in both, and why the
   * threshold is a contrast ratio rather than a colour.
   *
   * 3:1 is the WCAG 2.2 non-text contrast floor (1.4.11). The token gives ~17:1
   * either way, so there is a wide margin between passing and the defect's
   * 1.12:1 — this is not a test that needs retuning when a token moves.
   */
  for (const scheme of ["light", "dark"] as const) {
    test(`the text cursor is visible in the ${scheme} appearance`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/notes/n-search-e2e");
      const content = page.locator(".dh-md-editor__cm .cm-content").first();
      await content.waitFor();
      // The caret only exists once the editor has focus.
      await content.click();

      const measured = await page.evaluate(() => {
        /* Resolve ANY CSS colour to sRGB bytes by painting it. The product's
         * tokens are `oklch()` under Tailwind v4 and an ancestor background
         * computes as `oklch(0.145 0 none)`, which no rgb() parser can read —
         * the first version of this test returned NaN and reported a passing
         * caret as a failure. The canvas is the browser's own conversion, so it
         * cannot drift from what is actually on screen. */
        const canvas = document.createElement("canvas");
        canvas.width = 1;
        canvas.height = 1;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        const parse = (value: string): [number, number, number] => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = value;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
          return [r, g, b];
        };
        const luminance = ([r, g, b]: [number, number, number]) => {
          const channel = (v: number) => {
            const n = v / 255;
            return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
          };
          return (
            0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
          );
        };
        const caret = document.querySelector(
          ".dh-md-editor__cm .cm-cursor",
        ) as HTMLElement | null;
        if (!caret) return null;
        const caretColor = getComputedStyle(caret).borderLeftColor;

        /* The caret draws over the editor's surface, which is transparent all
         * the way up to the page — so the page's own background is what it is
         * actually seen against. Walk up for the first non-transparent one
         * rather than assuming which element paints. */
        let node: HTMLElement | null = caret;
        let background = "rgb(255, 255, 255)";
        while (node) {
          const bg = getComputedStyle(node).backgroundColor;
          /* Transparent in any colour space: alpha 0 after painting. */
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = bg;
          ctx.fillRect(0, 0, 1, 1);
          if (ctx.getImageData(0, 0, 1, 1).data[3] > 0) {
            background = bg;
            break;
          }
          node = node.parentElement;
        }

        const a = luminance(parse(caretColor));
        const b = luminance(parse(background));
        const [hi, lo] = a > b ? [a, b] : [b, a];
        return {
          caretColor,
          background,
          ratio: (hi + 0.05) / (lo + 0.05),
        };
      });

      expect(
        measured,
        "no `.cm-cursor` after focusing the editor — the caret could not be measured",
      ).not.toBeNull();

      expect(
        measured!.ratio,
        `the text cursor is ${measured!.caretColor} against ${measured!.background}, ` +
          `a contrast of ${measured!.ratio.toFixed(2)}:1. Below 3:1 an owner ` +
          `cannot see where they are typing. This is what a CodeMirror default ` +
          `winning over a layered DalyHub rule looks like`,
      ).toBeGreaterThanOrEqual(3);
    });
  }
});
