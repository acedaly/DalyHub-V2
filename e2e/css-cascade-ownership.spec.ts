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
 * small file is what keeps the exception the size it has to be — widen that
 * file and this test widens with it, deliberately; put a rule anywhere else
 * unlayered and it fails.
 */
const editorStylesheet = readFileSync(
  join(process.cwd(), "app/styles/markdown-editor-codemirror.css"),
  "utf8",
);

/*
 * Its layered counterpart — the editor stylesheet that STAYED in `dh-product`.
 * Read for the same reason: the question "is this file still free of rules that
 * CodeMirror contests?" is answered against the file, not against a list of
 * rules written down beside it.
 */
const layeredEditorStylesheet = readFileSync(
  join(process.cwd(), "app/styles/markdown-editor.css"),
  "utf8",
);

/*
 * `style-mod` — the injector CodeMirror builds its themes on — namespaces every
 * rule it emits with a generated class whose name is a single Greek letter,
 * `ͼ1`, `ͼ2` and so on. It is the one marker that identifies the injected sheet
 * without depending on where a bundler happens to put it: in `vite dev` the
 * application's own CSS is served as an inline `<style>` too, so "the sheet
 * with no href" is not CodeMirror's, and "the sheet with `.cm-` selectors" now
 * includes DalyHub's own exception file.
 */
const STYLE_MOD_MARKER = "ͼ";

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
   * The OTHER half of "bounded": nothing left in the layered editor stylesheet
   * needs to be out of a layer.
   *
   * ── Why this test exists, which is the only interesting thing about it ─────
   *
   * The first cut of this exception un-layered the whole editor stylesheet. The
   * second narrowed it by matching `.cm-(content|scroller|focused)` — a list I
   * wrote out by hand from a probe that PRINTED ONLY ITS FIRST 60 property
   * pairs. CodeMirror injects 320. `.cm-cursor`'s `border-left-color` and
   * `.cm-placeholder`'s `color` were below the cut, stayed in the layered file,
   * and lost: an insertion caret and an empty-state placeholder in the library's
   * colours rather than DalyHub's tokens. Codex caught it on review, which is
   * one round later than a test should have.
   *
   * Three hand-written lists have now been wrong in this one corner of the
   * codebase — the allowed namespaces, the CodeMirror classes, and the first
   * draft of the layer assignments. So this one is not written by hand. It reads
   * the injected sheet out of the live document and asks the only question that
   * matters:
   *
   *     does any rule still in `markdown-editor.css` declare a property that
   *     CodeMirror declares on the same element?
   *
   * If one does, it is losing — layered normal declarations lose to unlayered
   * ones unconditionally — and the fix is to move that rule into
   * `markdown-editor-codemirror.css`, never to out-specify it.
   *
   * ── The three things that make the comparison honest ───────────────────────
   *
   * 1. Both sides are parsed by the BROWSER. The DalyHub file is handed to a
   *    constructed `CSSStyleSheet`, which expands every shorthand into its
   *    longhands — `background` into nine, `outline` into three — including
   *    shorthands whose values are `var()`. A regex over the file text would
   *    have to know the shorthand table; this knows nothing and is still right.
   * 2. Sides are matched by ELEMENT, not by class name. CodeMirror's root rule
   *    is written `.ͼ1`, which names no `cm-` class at all and yet is the very
   *    element `.cm-editor` addresses. Running both selectors against the live
   *    editor makes that a non-question.
   * 3. Logical and physical properties are reconciled by MEASUREMENT. A rule
   *    setting `max-block-size` contests one setting `max-height`; one setting
   *    `min-block-size` does not contest one setting `height`, though the second
   *    changes the first's computed value. Rather than encode that, the test
   *    sets a sentinel on one property and reads the other, in both directions,
   *    and calls them the same property only if both directions agree.
   *
   * ── What it cannot see ─────────────────────────────────────────────────────
   *
   * A rule whose element is not in the DOM on this route — `.cm-placeholder`
   * exists only in an empty editor, `.cm-focused` only in a focused one — falls
   * back to comparing class names against the same derived map. And CodeMirror's
   * `!important` declarations are excluded from both tiers on purpose: those
   * beat a DalyHub rule whether it is layered or not, so moving one out of a
   * layer would fix nothing and the report would be a lie.
   */
  test("no rule left in the layered editor stylesheet contests CodeMirror", async ({
    page,
  }) => {
    await page.goto("/notes/n-search-e2e");
    await page.locator(".dh-md-editor__cm .cm-content").waitFor();

    const analysis = await page.evaluate(
      ({ layered, exception, marker }) => {
        type Rule = {
          selector: string;
          /** Longhands, `!important` excluded — see the doc comment. */
          properties: string[];
          elements: Element[];
        };

        /* A pseudo-element's declarations contest the originating element's, so
         * `.cm-line ::selection` is matched as `.cm-line`. `querySelectorAll`
         * would simply throw on the pseudo-element form. */
        const matchable = (selector: string) =>
          selector
            .replace(/::[a-zA-Z-]+(\([^)]*\))?/g, "")
            .replace(/[\s>+~]+$/, "")
            .trim();

        const elementsFor = (selector: string) => {
          const query = matchable(selector);
          if (!query) return [];
          try {
            return Array.from(document.querySelectorAll(query));
          } catch {
            return [];
          }
        };

        const collect = (rules: CSSRuleList | CSSRule[], into: Rule[]) => {
          for (const rule of Array.from(rules)) {
            const style = (rule as CSSStyleRule).selectorText;
            /* Grouping rules (`@media`, `@supports`) hold the rules that
             * matter; membership of one changes nothing about the contest,
             * which is decided by layer order and not by viewport. */
            if (!style && (rule as CSSGroupingRule).cssRules) {
              collect((rule as CSSGroupingRule).cssRules, into);
              continue;
            }
            if (!style) continue;
            const declaration = (rule as CSSStyleRule).style;
            const properties = Array.from(declaration).filter(
              (p) => declaration.getPropertyPriority(p) !== "important",
            );
            into.push({
              selector: style,
              properties,
              elements: elementsFor(style),
            });
          }
          return into;
        };

        /* CodeMirror's injected sheet, identified by `style-mod`'s namespace
         * class rather than by which `<style>` element it happens to be. */
        const codemirror: Rule[] = [];
        for (const sheet of Array.from(document.styleSheets)) {
          try {
            for (const rule of Array.from(sheet.cssRules)) {
              const selector = (rule as CSSStyleRule).selectorText;
              if (!selector || !selector.includes(marker)) continue;
              collect([rule], codemirror);
            }
          } catch {
            /* Cross-origin; not ours to police. */
          }
        }

        /* The fallback map, derived the same way: a CodeMirror rule's properties
         * belong to every class its selector names AND every class the elements
         * it matches actually carry — which is what resolves `.ͼ1` to
         * `cm-editor` without anybody writing that down. */
        const propertiesByClass = new Map<string, Set<string>>();
        for (const rule of codemirror) {
          const names = new Set(
            [...rule.selector.matchAll(/\.([A-Za-z_][\w-]*)/g)].map(
              (m) => m[1],
            ),
          );
          for (const el of rule.elements)
            for (const name of el.classList) names.add(name);
          for (const name of names) {
            const set = propertiesByClass.get(name) ?? new Set<string>();
            for (const p of rule.properties) set.add(p);
            propertiesByClass.set(name, set);
          }
        }

        /* Are two property names the same physical property? Asked of the
         * engine, in both directions, rather than answered from a table. */
        const sentinelProbe = document.createElement("div");
        document.body.append(sentinelProbe);
        const sentinel = (p: string) =>
          /color$/.test(p) ? "rgb(1, 2, 3)" : "37px";
        const setThenRead = (set: string, read: string) => {
          sentinelProbe.style.cssText =
            "writing-mode: horizontal-tb; direction: ltr;";
          sentinelProbe.style.setProperty(set, sentinel(set));
          return getComputedStyle(sentinelProbe).getPropertyValue(read);
        };
        const answered = new Map<string, boolean>();
        const samePhysicalProperty = (a: string, b: string) => {
          if (a === b) return true;
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          if (!answered.has(key))
            answered.set(
              key,
              setThenRead(a, b) === sentinel(a) &&
                setThenRead(b, a) === sentinel(b),
            );
          return answered.get(key)!;
        };

        const contestsIn = (cssText: string) => {
          const parsed = new CSSStyleSheet();
          parsed.replaceSync(cssText);
          const found: { selector: string; properties: string[] }[] = [];

          for (const rule of collect(parsed.cssRules, [])) {
            if (!rule.properties.length) continue;
            const hits = new Set<string>();

            /* Tier 1 — the same live element. */
            for (const cm of codemirror) {
              if (!cm.elements.some((el) => rule.elements.includes(el)))
                continue;
              for (const ours of rule.properties)
                for (const theirs of cm.properties)
                  if (samePhysicalProperty(ours, theirs)) hits.add(ours);
            }

            /* Tier 2 — only where tier 1 could see nothing, because the element
             * this rule addresses is not on the page in this state. */
            if (!hits.size) {
              const classes = [
                ...rule.selector.matchAll(/\.([A-Za-z_][\w-]*)/g),
              ].map((m) => m[1]);
              for (const name of classes) {
                const theirs = propertiesByClass.get(name);
                if (!theirs) continue;
                for (const ours of rule.properties)
                  for (const other of theirs)
                    if (samePhysicalProperty(ours, other))
                      hits.add(`${name}:${ours}`);
              }
            }

            if (hits.size)
              found.push({ selector: rule.selector, properties: [...hits] });
          }
          return found;
        };

        const result = {
          codeMirrorRuleCount: codemirror.length,
          inLayeredStylesheet: contestsIn(layered),
          inExceptionStylesheet: contestsIn(exception),
        };
        sentinelProbe.remove();
        return result;
      },
      {
        layered: layeredEditorStylesheet,
        exception: editorStylesheet,
        marker: STYLE_MOD_MARKER,
      },
    );

    /* Two guards, because a derivation that silently sees nothing would pass
     * this test for ever. The editor has to be mounted, and the detector has to
     * be demonstrably capable of firing — which the exception file, whose whole
     * reason for existing is that its rules ARE contested, proves for free. */
    expect(
      analysis.codeMirrorRuleCount,
      "CodeMirror injected no rules — the editor did not mount, so this test " +
        "measured nothing",
    ).toBeGreaterThan(0);
    expect(
      analysis.inExceptionStylesheet.length,
      "the detector found no contest even in the stylesheet that exists " +
        "BECAUSE its rules are contested — it is no longer measuring anything",
    ).toBeGreaterThan(0);

    /* The contract. */
    expect(
      analysis.inLayeredStylesheet,
      "these rules sit in `markdown-editor.css`, inside the `dh-product` " +
        "layer, and declare a property CodeMirror declares on the same " +
        "element — so CodeMirror's unlayered default wins and the DalyHub " +
        "rule does nothing. Move each one into " +
        "`app/styles/markdown-editor-codemirror.css`; do not out-specify it " +
        "and do not reach for `!important`",
    ).toEqual([]);
  });
});
