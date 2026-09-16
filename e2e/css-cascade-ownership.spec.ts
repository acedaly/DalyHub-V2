import { readFileSync } from "node:fs";
import { join } from "node:path";

import { expect, test, type Page } from "@playwright/test";

/*
 * The ONE stylesheet allowed to be unlayered, read as TEXT so that the
 * exception this test permits is derived from the file rather than restated
 * beside it and left to drift.
 *
 * It is `markdown-editor-codemirror.css` and NOT `markdown-editor.css`: the
 * first version of this exception un-layered the whole editor stylesheet, which
 * then outranked the five product surfaces that legitimately override it and
 * cost an axe violation on the guided Review. Pointing the allowlist at the
 * exception file is what keeps it the size it has to be — widen that file and
 * this test widens with it, deliberately; put a rule anywhere else unlayered
 * and it fails. It held six rules when it was first narrowed and holds seven
 * now, the caret and the placeholder having been left behind in the layered
 * file where they lost to CodeMirror.
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

/**
 * The contrast of one element's colour against the first painted background
 * above it, measured the way the browser itself would.
 *
 * Colours are resolved by PAINTING them on a 1x1 canvas and reading the byte,
 * not by parsing `rgb()`. The product's tokens are `oklch()` under Tailwind v4
 * and an ancestor background computes as `oklch(0.145 0 none)`, which no rgb()
 * parser reads — the first version of this returned NaN and reported a passing
 * caret as a failure. The canvas is the browser's own conversion, so it cannot
 * drift from what is on screen; the same trick decides transparency during the
 * walk upwards.
 */
async function contrastAgainstBackground(
  page: Page,
  selector: string,
  property: "borderLeftColor" | "color",
): Promise<{ colour: string; background: string; ratio: number } | null> {
  return page.evaluate(
    ({ selector, property }) => {
      const element = document.querySelector(selector) as HTMLElement | null;
      if (!element) return null;

      const canvas = document.createElement("canvas");
      canvas.width = 1;
      canvas.height = 1;
      const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
      const bytes = (value: string) => {
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = value;
        ctx.fillRect(0, 0, 1, 1);
        return ctx.getImageData(0, 0, 1, 1).data;
      };
      const luminance = (value: string) => {
        const [r, g, b] = bytes(value);
        const channel = (v: number) => {
          const n = v / 255;
          return n <= 0.03928 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
        };
        return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
      };

      const colour = getComputedStyle(element)[property];

      /* The editor's surfaces are transparent up to the page, so walk for the
       * first one that actually paints rather than assuming which element does. */
      let node: HTMLElement | null = element;
      let background = "rgb(255, 255, 255)";
      while (node) {
        const bg = getComputedStyle(node).backgroundColor;
        if (bytes(bg)[3] > 0) {
          background = bg;
          break;
        }
        node = node.parentElement;
      }

      const a = luminance(colour);
      const b = luminance(background);
      const [hi, lo] = a > b ? [a, b] : [b, a];
      return { colour, background, ratio: (hi + 0.05) / (lo + 0.05) };
    },
    { selector, property },
  );
}

/**
 * Wait for the editor to say it is ready, then hand back its content element.
 *
 * `.cm-content` becoming visible is a CONSEQUENCE of the editor mounting, and
 * waiting on the consequence produces a bare `locator.waitFor: Test timeout` when
 * the mount is merely slow — which says nothing about why. `data-editor-ready`
 * is the signal `LiveMarkdownEditor` sets when CodeMirror has attached, so
 * waiting on it first turns that case into a sentence.
 *
 * It matters here more than elsewhere: this file's assertions are all about the
 * runtime-injected CodeMirror stylesheet, which does not exist until the editor
 * mounts — so an assertion that runs before it is not merely early, it is
 * measuring a document the test is not about.
 */
async function editorContent(page: Page) {
  await expect(
    page.locator('[data-editor-ready="true"]').first(),
    "the Markdown editor never reported itself ready — CodeMirror did not mount, " +
      "so its injected stylesheet does not exist and there is nothing to measure",
  ).toBeAttached({ timeout: 20_000 });
  const content = page.locator(".dh-md-editor__cm .cm-content").first();
  await content.waitFor();
  return content;
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
  for (const [label, path, mountsEditor] of [
    ["a surface with no runtime-injected CSS", "/design/record-layout", false],
    [
      "a surface that mounts the CodeMirror editor",
      "/notes/n-search-e2e",
      true,
    ],
  ] as const) {
    test(`only the documented exceptions are unlayered — ${label}`, async ({
      page,
    }) => {
      await page.goto(path);
      /*
       * The editor mounts after hydration and the injected sheet does not exist
       * until it does, which is the whole point of visiting this route — so wait
       * for the editor to SAY it is ready rather than for a duration.
       *
       * This was `waitForTimeout(2500)`, and the fixed wait was not merely slow:
       * it raced the route's own hydration, and `page.evaluate` below then threw
       * `Execution context was destroyed, most likely because of a navigation`.
       * OBSERVED on a local full-spec run, 16 September 2026. A duration cannot
       * express "after the thing I am measuring exists"; `data-editor-ready` can,
       * and it is the same signal `editor-geometry.spec.ts` waits on.
       */
      if (mountsEditor) {
        await editorContent(page);
      }

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
    const content = await editorContent(page);

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
      const content = await editorContent(page);
      // The caret only exists once the editor has focus.
      await content.click();

      const measured = await contrastAgainstBackground(
        page,
        ".dh-md-editor__cm .cm-cursor",
        "borderLeftColor",
      );

      expect(
        measured,
        "no `.cm-cursor` after focusing the editor — the caret could not be measured",
      ).not.toBeNull();

      expect(
        measured!.ratio,
        `the text cursor is ${measured!.colour} against ${measured!.background}, ` +
          `a contrast of ${measured!.ratio.toFixed(2)}:1. Below 3:1 an owner ` +
          `cannot see where they are typing. This is what a CodeMirror default ` +
          `winning over a layered DalyHub rule looks like`,
      ).toBeGreaterThanOrEqual(3);
    });
  }

  /**
   * The placeholder, for the same reason and with the same shape.
   *
   * It is a separate rule in the same exception file, and it had the same
   * defect: CodeMirror's `#888` was winning, which measures 3.54:1 against the
   * editor's white surface where DalyHub's own muted token gives 4.88:1.
   * Without this, moving or deleting that one override would recreate the
   * regression with the caret tests still green — which is exactly how the
   * caret got here, only the noticed half of a two-rule defect having a test.
   *
   * It fails in the MIRROR appearance to the caret, which is the argument for
   * running both on each. Deleting the override again:
   *
   *   ✘ light  rgb(136,136,136) on rgb(255,255,255)  3.54:1
   *   ✓ dark
   *
   * The caret's defect was total in dark and invisible in light; this one is
   * the other way round. Either test alone, in either appearance alone, misses
   * one of them.
   *
   * 4.5:1 is the WCAG 2.2 AA floor for text (1.4.3). A placeholder is a
   * borderline case under the spec and a real one for an owner, so it is held
   * to the text threshold rather than the non-text one the caret uses.
   *
   * The placeholder only exists on an empty document, so the seeded Note is
   * emptied to produce one — the same thing `editor-geometry.spec.ts` does for
   * its empty-caret assertion, in a different partition.
   */
  for (const scheme of ["light", "dark"] as const) {
    test(`the empty-state placeholder is legible in the ${scheme} appearance`, async ({
      page,
    }) => {
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto("/notes/n-search-e2e");
      const content = await editorContent(page);

      await content.click();
      await page.keyboard.press("ControlOrMeta+a");
      await page.keyboard.press("Backspace");
      await expect(page.locator(".cm-placeholder")).toBeVisible();

      const measured = await contrastAgainstBackground(
        page,
        ".dh-md-editor__cm .cm-placeholder",
        "color",
      );

      expect(
        measured,
        "no `.cm-placeholder` after emptying the document",
      ).not.toBeNull();

      expect(
        measured!.ratio,
        `the placeholder is ${measured!.colour} against ${measured!.background}, ` +
          `a contrast of ${measured!.ratio.toFixed(2)}:1. CodeMirror's own ` +
          `\`#888\` reads 3.54:1 against the editor's white surface; DalyHub's ` +
          `muted token gives 4.88:1`,
      ).toBeGreaterThanOrEqual(4.5);
    });
  }

  /**
   * V3-CSS-02 — the CodeMirror exception, DERIVED rather than written down.
   *
   * ── Why this test exists ────────────────────────────────────────────────────
   *
   * `markdown-editor-codemirror.css` is the architecture's one unlayered file,
   * and which rules belong in it is decided by a fact about a third-party
   * library: **which properties CodeMirror's runtime-injected stylesheet
   * declares, on which elements.** That fact has been written down by hand three
   * times and been wrong all three:
   *
   *   1. the whole editor stylesheet was un-layered, which handed it priority
   *      over the five product surfaces that legitimately override it — the
   *      guided Review lost its `50vh` cap and axe reported a serious
   *      `scrollable-region-focusable`;
   *   2. the narrowing that followed was written from a probe that printed 60 of
   *      CodeMirror's 320 selector/property pairs, so `.cm-cursor`'s
   *      `border-left-color` stayed layered and lost — the text caret rendered
   *      `rgb(0,0,0)`, **1.06:1** against the dark surface, on every writing
   *      surface in the product;
   *   3. the fix for that used the `background` shorthand on
   *      `.cm-selectionBackground`, which un-layered eight further longhands
   *      CodeMirror does not declare at all.
   *
   * Each was found by a person noticing a defect. This test finds them instead,
   * and it does so by asking the browser rather than by matching text.
   *
   * ── What it does ────────────────────────────────────────────────────────────
   *
   * With the editor mounted, focused and showing its placeholder — the three
   * states CodeMirror paints differently, and without all three a contested rule
   * reads as uncontested because neither side has an element — it walks the live
   * CSSOM and, for every element in the editor, computes two sets:
   *
   *   · what CODEMIRROR declares on it, from its unlayered injected sheet;
   *   · what DALYHUB declares on it, and from which side of the layer boundary.
   *
   * Properties are the LONGHANDS the browser expands each declaration into, so
   * `padding: X` is compared as four properties and `background: X` as nine —
   * which is how (3) above was found. Selectors are matched against actual
   * ELEMENTS with `Element.matches`, not compared as text, so a rule that
   * addresses the same element by a different route is still caught.
   *
   * ── The two failures, and why both matter ───────────────────────────────────
   *
   * **A layered DalyHub declaration that CodeMirror also declares on the same
   * element.** Unlayered beats layered unconditionally, so this declaration does
   * nothing — silently, and regardless of specificity. This is defect (2).
   *
   * **A declaration in the unlayered file that CodeMirror does not declare on
   * any element it matches.** It did not need to leave the cascade, and while it
   * is outside it no product surface can compose with it. This is defect (3),
   * and it is the direction a test that only looked for losses would miss.
   *
   * ── What it deliberately does not police ────────────────────────────────────
   *
   * An `!important` DalyHub declaration is not reported as losing, because it
   * does not lose: for important declarations the layer order is inverted and a
   * layered important beats an unlayered one. AGENTS.md forbids `!important`
   * anyway, and `e2e/css-cascade-ownership.spec.ts`'s sibling assertions are
   * where that is argued — this test simply must not report a false loss.
   */
  test("the unlayered CodeMirror exception is exactly what CodeMirror contests", async ({
    page,
  }) => {
    await page.goto("/notes/n-search-e2e");
    const content = await editorContent(page);

    /*
     * Produce the states CodeMirror only paints in. `.cm-focused` needs focus
     * and `.cm-placeholder` exists only on an empty document — and this matters
     * more than it looks: run without them and THREE of the exception's rules
     * report as unnecessary, because neither side has an element to contest.
     * An earlier draft of this test did exactly that and would have argued for
     * deleting the caret override that took two releases to get right.
     */
    await content.click();
    await page.keyboard.press("ControlOrMeta+a");
    await page.keyboard.press("Backspace");
    await expect(page.locator(".cm-placeholder").first()).toBeVisible();
    await expect(page.locator(".cm-focused").first()).toBeAttached();

    const report = await page.evaluate(() => {
      /*
       * Dynamic pseudo-classes are stripped before matching, and pseudo-elements
       * with them. `Element.matches` cannot evaluate either against a static
       * DOM, and the question here is "could these two rules ever address the
       * same element", not "do they right now" — a DalyHub rule that loses only
       * on `:hover` still loses.
       */
      const DYNAMIC_PSEUDO =
        /:(hover|focus|focus-visible|focus-within|active|target|checked|disabled|enabled|placeholder-shown|user-invalid|user-valid|invalid|valid|read-only|read-write|default|indeterminate)\b/g;

      type Declaration = { readonly name: string; readonly important: boolean };
      type Rule = {
        readonly selector: string;
        readonly declarations: Declaration[];
        readonly layered: boolean;
        readonly dalyhub: boolean;
      };

      const rules: Rule[] = [];

      const walk = (list: CSSRuleList, insideLayer: boolean) => {
        for (const rule of Array.from(list)) {
          const type = rule.constructor.name;
          if (type === "CSSLayerBlockRule") {
            walk((rule as CSSGroupingRule).cssRules, true);
            continue;
          }
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
          if (type !== "CSSStyleRule") continue;

          const styleRule = rule as CSSStyleRule;
          const selector = styleRule.selectorText ?? "";
          /* Only rules that can reach a CodeMirror element are in scope. */
          if (!selector.includes(".cm-") && !selector.includes("ͼ")) continue;

          const declarations: Declaration[] = [];
          for (let i = 0; i < styleRule.style.length; i += 1) {
            const name = styleRule.style.item(i);
            declarations.push({
              name,
              important:
                styleRule.style.getPropertyPriority(name) === "important",
            });
          }
          if (declarations.length === 0) continue;

          rules.push({
            selector,
            declarations,
            layered: insideLayer,
            /* Every DalyHub class carries the `dh-` prefix; CodeMirror's carry
             * `cm-` or are `style-mod`'s generated `ͼ*`. The sanity assertions
             * below fail loudly if that ever stops separating the two. */
            dalyhub: selector.includes(".dh-"),
          });
        }
      };

      for (const sheet of Array.from(document.styleSheets)) {
        try {
          walk(sheet.cssRules, false);
        } catch {
          /* Cross-origin sheets are not ours to police. */
        }
      }

      const elements = Array.from(
        document.querySelectorAll(".dh-md-editor, .dh-md-editor *"),
      );

      const matches = (element: Element, selector: string) => {
        for (const part of selector.split(",")) {
          const statik = part
            .replace(/::[a-z-]+(\([^)]*\))?/g, "")
            .replace(DYNAMIC_PSEUDO, "")
            .trim();
          if (!statik) continue;
          try {
            if (element.matches(statik)) return true;
          } catch {
            /* An unmatchable selector contests nothing we can prove. */
          }
        }
        return false;
      };

      /** Selector → the properties of it that lose to CodeMirror. */
      const losing: Record<string, string[]> = {};
      /** Selector → the properties of it CodeMirror actually contests. */
      const contested: Record<string, string[]> = {};
      const add = (
        bag: Record<string, string[]>,
        key: string,
        value: string,
      ) => {
        bag[key] ??= [];
        if (!bag[key].includes(value)) bag[key].push(value);
      };

      for (const element of elements) {
        const codemirror = new Set<string>();
        for (const rule of rules) {
          if (rule.dalyhub || rule.layered) continue;
          if (!matches(element, rule.selector)) continue;
          for (const declaration of rule.declarations) {
            codemirror.add(declaration.name);
          }
        }
        if (codemirror.size === 0) continue;

        for (const rule of rules) {
          if (!rule.dalyhub) continue;
          if (!matches(element, rule.selector)) continue;
          for (const declaration of rule.declarations) {
            if (!codemirror.has(declaration.name)) continue;
            if (rule.layered) {
              if (!declaration.important) {
                add(losing, rule.selector, declaration.name);
              }
            } else {
              add(contested, rule.selector, declaration.name);
            }
          }
        }
      }

      const unlayered = rules
        .filter((rule) => rule.dalyhub && !rule.layered)
        .map((rule) => ({
          selector: rule.selector,
          declarations: rule.declarations.map((d) => d.name),
        }));

      return {
        codemirrorRules: rules.filter((r) => !r.dalyhub && !r.layered).length,
        dalyhubLayeredRules: rules.filter((r) => r.dalyhub && r.layered).length,
        elementsScanned: elements.length,
        losing,
        unlayered: unlayered.map((rule) => ({
          ...rule,
          uncontested: rule.declarations.filter(
            (name) => !(contested[rule.selector] ?? []).includes(name),
          ),
        })),
      };
    });

    /*
     * Sanity first, and this is not ceremony: the historical failure of this
     * corner is an assertion that could not see the thing it was about. If
     * CodeMirror has not injected, or nothing was scanned, or the `dh-`/`cm-`
     * split has stopped separating the two authors, every assertion below passes
     * for the wrong reason.
     */
    expect(
      report.codemirrorRules,
      "CodeMirror injected no unlayered rules — the editor did not mount, and this test measured nothing",
    ).toBeGreaterThan(20);
    expect(
      report.elementsScanned,
      "no editor elements were scanned — this test measured nothing",
    ).toBeGreaterThan(10);
    expect(
      report.unlayered.length,
      "no unlayered DalyHub rule reached the editor — either the exception file is gone or it stopped matching, and this test measured nothing",
    ).toBeGreaterThan(0);

    /*
     * Direction 1 — a layered DalyHub declaration that CodeMirror also declares
     * on the same element. It does nothing, silently.
     */
    expect(
      report.losing,
      "a LAYERED DalyHub declaration contests a property CodeMirror's own " +
        "injected stylesheet declares on the same element. Unlayered beats " +
        "layered unconditionally, so that declaration silently does nothing — " +
        "this is how the text caret came to render black on a dark page. Move " +
        "the contested declaration into `app/styles/markdown-editor-codemirror.css`.",
    ).toEqual({});

    /*
     * Direction 2 — a declaration in the unlayered file that CodeMirror does not
     * declare on anything it matches. It never had to leave the cascade, and
     * while it is outside it no product surface can compose with it.
     */
    const unnecessary = report.unlayered
      .filter((rule) => rule.uncontested.length > 0)
      .map((rule) => ({
        selector: rule.selector,
        uncontested: rule.uncontested,
      }));

    expect(
      unnecessary,
      "`app/styles/markdown-editor-codemirror.css` declares something " +
        "CodeMirror does not declare on any element the rule matches. That " +
        "declaration did not need to leave the cascade, and while it is outside " +
        "it the rest of the product cannot compose with it. Move it to " +
        "`markdown-editor.css` (layer `dh-product`). Note that a SHORTHAND is " +
        "compared as the longhands the browser expands it into — `background` " +
        "is nine declarations, of which CodeMirror contests only " +
        "`background-color`.",
    ).toEqual([]);
  });
});
