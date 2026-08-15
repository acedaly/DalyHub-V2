/**
 * DS-07 — the whole-app ADAPTIVE and ACCESSIBILITY audit, as one command.
 *
 * A visual pass across a dozen modules and nine widths cannot be judged by
 * looking at screenshots alone: horizontal overflow at 320px, a control that has
 * shrunk below its touch target, and a contrast pair that dark mode broke are all
 * invisible on a capture and all disqualifying. This drives the running dev
 * server and reports the three of them per (route × width × appearance).
 *
 * It uses axe-core through `@axe-core/playwright`, the same engine the E2E
 * accessibility spec uses, so a finding here is a finding there.
 *
 * Not part of the gate: it is an audit instrument, and it prints rather than
 * asserts. The gate's assertions live in `e2e/accessibility.spec.ts`.
 *
 *   node scripts/ds-final-audit.mjs
 *   node scripts/ds-final-audit.mjs --widths 320,390 --schemes light
 */
import { existsSync } from "node:fs";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const args = new Map();
for (let i = 2; i < process.argv.length; i += 2) {
  args.set(process.argv[i].replace(/^--/, ""), process.argv[i + 1]);
}

const BASE = args.get("base") ?? "http://localhost:4173";
const ROUTES = (
  args.get("routes") ??
  "/today,/tasks,/projects,/areas,/goals,/notes,/diary,/meetings,/reviews,/analytics,/people,/assets,/settings"
).split(",");
const WIDTHS = (args.get("widths") ?? "320,390,768,1366,1920")
  .split(",")
  .map(Number);
const SCHEMES = (args.get("schemes") ?? "light,dark").split(",");
const AXE_WIDTHS = new Set(
  (args.get("axeWidths") ?? "390,1366").split(",").map(Number),
);

const executablePath = existsSync("/opt/pw-browsers/chromium")
  ? "/opt/pw-browsers/chromium"
  : undefined;
const browser = await chromium.launch(executablePath ? { executablePath } : {});

const findings = [];

for (const width of WIDTHS) {
  const phone = width <= 430;
  for (const scheme of SCHEMES) {
    const context = await browser.newContext({
      viewport: { width, height: phone ? 844 : 950 },
      colorScheme: scheme,
      ...(phone ? { isMobile: true, hasTouch: true } : {}),
    });
    const page = await context.newPage();

    for (const route of ROUTES) {
      await page
        .goto(`${BASE}${route}`, { waitUntil: "networkidle", timeout: 40000 })
        .catch(() => undefined);
      await page.waitForTimeout(300);

      /*
       * OVERFLOW — the document, not an element. A wide table inside its own
       * `overflow-x: auto` box is correct; the page scrolling sideways never is.
       * The 1px tolerance absorbs sub-pixel layout rounding, which reports as a
       * 0.5px overflow on a fractional-density viewport and is not one.
       */
      const overflow = await page.evaluate(() => {
        const el = document.documentElement;
        return Math.round(el.scrollWidth - el.clientWidth);
      });
      if (overflow > 1) {
        findings.push({
          kind: "overflow",
          route,
          width,
          scheme,
          detail: `document scrolls ${overflow}px sideways`,
        });
      }

      /*
       * TOUCH TARGETS, on a coarse pointer, against the DECLARED floor.
       *
       * DalyHub's own floor is 44px — stricter than WCAG 2.2 AA's 24px — and the
       * density model promises it back unconditionally on a coarse pointer, so
       * this checks a promise the token layer makes at the width where it
       * matters. An earlier version compared against 40×24 while the comment
       * claimed 44, which let a 43×43 control through the audit that states the
       * contract.
       *
       * The threshold alone is not enough, because the product legitimately
       * builds a small control with a LARGE hit area: `.dh-check-circle` is a
       * 20px input inside a 44px target, and `.dh-settings-page__nav-link` is a
       * 21px link whose `::after` covers a 44px row. Measuring the element's own
       * box reports both as failures, which is how a real 44px floor produced a
       * page of false positives the first time it was tried.
       *
       * So the EFFECTIVE target is measured: where a control stretches itself
       * over an ancestor with an absolutely-positioned `::after` — the pattern
       * DalyHub uses everywhere for this — the nearest positioned ancestor is
       * the box the finger actually gets, and that is what is compared.
       */
      if (phone) {
        const small = await page.evaluate(() => {
          const FLOOR = 44;
          /*
           * The box a finger actually lands on, not the box the element paints.
           *
           * DalyHub builds an oversized hit area two ways, and both are read
           * here because measuring the element's own box reports both as
           * failures:
           *
           *   1. a stretched `::after` over a positioned ancestor — the whole
           *      card, the whole settings row (`.dh-pcard__open`,
           *      `.dh-settings-page__nav-link`);
           *   2. a wrapping `<label>` sized to the target, with a small painted
           *      control inside it (`.dh-check-circle` in
           *      `.dh-check-circle-target`). A label forwards its clicks, so the
           *      label IS the target.
           *
           * Anything else is measured as it stands. This is a heuristic, and it
           * is the honest limit of a DOM-geometry audit: a hit area produced by
           * some third mechanism will read as a false positive here rather than
           * be silently excused by a lower threshold.
           */
          const effectiveRect = (node) => {
            const own = node.getBoundingClientRect();

            const label = node.closest("label");
            if (label && label !== node) {
              const rect = label.getBoundingClientRect();
              if (rect.width >= own.width && rect.height >= own.height) {
                return rect;
              }
            }

            const after = getComputedStyle(node, "::after");
            if (after.position !== "absolute" || after.content === "none") {
              return own;
            }
            for (let el = node.parentElement; el; el = el.parentElement) {
              if (getComputedStyle(el).position === "static") continue;
              const rect = el.getBoundingClientRect();
              // Only if it genuinely CONTAINS the control — a distant positioned
              // ancestor (the page, a drawer) is not this control's target.
              if (rect.width >= own.width && rect.height >= own.height) {
                return rect;
              }
              break;
            }
            return own;
          };

          const out = [];
          const controls = document.querySelectorAll(
            'button, a[href], input:not([type="hidden"]), select, [role="button"], [role="tab"], [role="menuitem"]',
          );
          for (const node of controls) {
            const own = node.getBoundingClientRect();
            if (own.width === 0 || own.height === 0) continue;
            const style = getComputedStyle(node);
            if (style.visibility === "hidden" || style.display === "none")
              continue;
            // An inline link inside a sentence is exempt from target-size by the
            // same rule WCAG exempts it: it is text, and the sentence sets its box.
            if (style.display.startsWith("inline") && node.tagName === "A")
              continue;
            const rect = effectiveRect(node);
            if (rect.height < FLOOR || rect.width < FLOOR) {
              out.push(
                `${node.tagName.toLowerCase()}.${(node.className || "").toString().split(" ")[0]} ${Math.round(rect.width)}×${Math.round(rect.height)}`,
              );
            }
          }
          return [...new Set(out)].slice(0, 6);
        });
        for (const detail of small) {
          findings.push({ kind: "target", route, width, scheme, detail });
        }
      }

      if (AXE_WIDTHS.has(width)) {
        const results = await new AxeBuilder({ page })
          .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
          .analyze()
          .catch(() => null);
        for (const violation of results?.violations ?? []) {
          findings.push({
            kind: `axe:${violation.id}`,
            route,
            width,
            scheme,
            detail: `${violation.nodes.length}× — ${violation.nodes[0]?.target?.join(" ") ?? ""}`,
          });
        }
      }
    }
    await context.close();
  }
}

await browser.close();

if (findings.length === 0) {
  process.stdout.write("No overflow, target-size or axe findings.\n");
} else {
  const byKind = new Map();
  for (const finding of findings) {
    byKind.set(finding.kind, [...(byKind.get(finding.kind) ?? []), finding]);
  }
  for (const [kind, list] of [...byKind].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    process.stdout.write(`\n## ${kind} — ${list.length}\n`);
    for (const f of list.slice(0, 12)) {
      process.stdout.write(
        `  ${f.route} @${f.width} ${f.scheme}: ${f.detail}\n`,
      );
    }
    if (list.length > 12)
      process.stdout.write(`  … ${list.length - 12} more\n`);
  }
}
