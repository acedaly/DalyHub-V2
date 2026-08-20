/**
 * DHDS-08 — the motion grammar is ONE grammar, and it stays one.
 *
 * These are contract tests over the stylesheets, not screenshot tests: what
 * DHDS-08 is worth protecting on is not any particular 4px, it is the property
 * that there is exactly ONE place a duration, a curve, a keyframe or a reveal
 * behaviour comes from. Every regression this phase repaired was a copy: a
 * second fade-in keyframe, a second reveal contract, a literal `ease`, a
 * private 360ms shimmer. A copy is what these assertions are for.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DH_MOTION_BASE_MS,
  DH_MOTION_DELIBERATE_MS,
  DH_MOTION_EXIT_MS,
} from "~/shared/motion";

const ROOT = process.cwd();
const STYLES = path.join(ROOT, "app", "styles");

const read = (...parts: string[]) =>
  readFileSync(path.join(ROOT, ...parts), "utf8");

const tokensCss = read("app", "styles", "tokens.css");
const motionCss = read("app", "styles", "motion.css");

/** Every stylesheet under `app/styles/`, as [name, text]. */
function styleSheets(): readonly (readonly [string, string])[] {
  return readdirSync(STYLES)
    .filter((file) => file.endsWith(".css"))
    .map(
      (file) => [file, readFileSync(path.join(STYLES, file), "utf8")] as const,
    );
}

/** Every `.ts`/`.tsx`/`.css` file under `app/`. */
function appFiles(): readonly string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (/\.(css|tsx?)$/.test(entry)) out.push(full);
    }
  };
  walk(path.join(ROOT, "app"));
  return out;
}

/** Read one `:root`-level token's declared value out of `tokens.css`. */
function tokenValue(name: string): string {
  const match = new RegExp(`--${name}:\\s*([^;]+);`).exec(tokensCss);
  if (match === null) throw new Error(`--${name} is not defined in tokens.css`);
  return match[1].trim();
}

describe("DHDS-08 — the duration vocabulary", () => {
  const RUNGS = [
    "dh-motion-none",
    "dh-motion-instant",
    "dh-motion-fast",
    "dh-motion-base",
    "dh-motion-deliberate",
    "dh-motion-exit",
  ] as const;

  it("publishes every rung as a literal duration", () => {
    for (const rung of RUNGS) {
      expect(tokenValue(rung), `--${rung}`).toMatch(/^\d+ms$/);
    }
  });

  it("is a vocabulary rather than a number line — no two rungs are synonyms", () => {
    /*
     * The defect DHDS-08 repaired: `instant` and `fast` were both 120ms and all
     * four curves were the same cubic-bezier. A vocabulary whose words mean the
     * same thing cannot express the distinctions its components need, so each
     * one invents its own — which is the drift the layer exists to prevent.
     */
    const values = RUNGS.map(tokenValue);
    expect(new Set(values).size).toBe(RUNGS.length);
  });

  it("orders the rungs by the weight of what they describe", () => {
    const ms = (name: string) => Number.parseInt(tokenValue(name), 10);
    expect(ms("dh-motion-none")).toBe(0);
    expect(ms("dh-motion-instant")).toBeLessThan(ms("dh-motion-fast"));
    expect(ms("dh-motion-fast")).toBeLessThan(ms("dh-motion-base"));
    expect(ms("dh-motion-base")).toBeLessThan(ms("dh-motion-deliberate"));
  });

  it("leaves faster than it arrives", () => {
    const ms = (name: string) => Number.parseInt(tokenValue(name), 10);
    expect(ms("dh-motion-exit")).toBeLessThan(ms("dh-motion-base"));
  });

  it("keeps the whole ramp inside the responsive range", () => {
    // §3: rarely beyond ~320ms. `deliberate` is the ceiling and nothing in the
    // product's transitions is slower — the two LOOP periods are deliberately
    // not part of this ramp and are asserted separately below.
    const ms = (name: string) => Number.parseInt(tokenValue(name), 10);
    expect(ms("dh-motion-deliberate")).toBeLessThanOrEqual(320);
    for (const rung of RUNGS) expect(ms(rung)).toBeLessThanOrEqual(320);
  });

  it("keeps the LOOP periods out of the transition ramp", () => {
    // A loop's rhythm is a different quantity from a transition's length.
    // Borrowing a transition rung for one is how a spinner ends up rotating
    // three times a second, which is exactly what DHDS-08 found.
    const ms = (name: string) => Number.parseInt(tokenValue(name), 10);
    expect(ms("dh-motion-spinner")).toBeGreaterThan(ms("dh-motion-deliberate"));
    expect(ms("dh-motion-shimmer")).toBeGreaterThan(ms("dh-motion-deliberate"));
  });
});

describe("DHDS-08 — the easing vocabulary", () => {
  const CURVES = [
    "dh-ease-standard",
    "dh-ease-enter",
    "dh-ease-exit",
    "dh-ease-emphasized",
  ] as const;

  it("publishes four curves that genuinely differ", () => {
    const values = CURVES.map(tokenValue);
    for (const value of values) expect(value).toMatch(/^cubic-bezier\(/);
    expect(new Set(values).size).toBe(CURVES.length);
  });

  it("never overshoots — no spring, no bounce, anywhere", () => {
    /*
     * A cubic-bezier overshoots when a control point's Y leaves [0, 1]. §28
     * rules out spring physics outright, and this is the mechanical statement
     * of that rule: an interface that wobbles is one asking to be watched.
     */
    for (const curve of CURVES) {
      const numbers = tokenValue(curve)
        .replace(/^cubic-bezier\(|\)$/g, "")
        .split(",")
        .map((part) => Number.parseFloat(part));
      expect(numbers, curve).toHaveLength(4);
      expect(numbers[1], `${curve} y1`).toBeGreaterThanOrEqual(0);
      expect(numbers[1], `${curve} y1`).toBeLessThanOrEqual(1);
      expect(numbers[3], `${curve} y2`).toBeGreaterThanOrEqual(0);
      expect(numbers[3], `${curve} y2`).toBeLessThanOrEqual(1);
    }
  });
});

describe("DHDS-08 — no module invents its own motion", () => {
  it("declares every keyframe in the motion layer, bar the documented exceptions", () => {
    /*
     * DHDS-08 found twenty-five `@keyframes` across the product: six separate
     * "fade a scrim in", four near-identical "rise a panel", two rotations and
     * two shimmers. The survivors below are each documented AT the rule, and a
     * new one appearing here is the beginning of a second motion system.
     */
    const EXPECTED_ELSEWHERE = new Map([
      // A centred sheet's resting transform is itself a `translate(-50%, -50%)`,
      // so a shared keyframe animating `translateY` would discard the centring.
      ["sheet.css", ["dh-sheet-dialog-in", "dh-sheet-dialog-out"]],
      // Not motion: a `visibility` flip on an 8s delay, used as a timer for the
      // "this page never hydrated" notice.
      ["offline.css", ["dh-offline-stalled-reveal"]],
    ]);

    for (const [file, text] of styleSheets()) {
      if (file === "motion.css") continue;
      const declared = [...text.matchAll(/@keyframes\s+([\w-]+)/g)].map(
        (match) => match[1],
      );
      expect(declared.sort(), `@keyframes in ${file}`).toEqual(
        [...(EXPECTED_ELSEWHERE.get(file) ?? [])].sort(),
      );
    }
  });

  it("names a duration and a curve rather than writing one down", () => {
    /*
     * A literal `200ms` or `cubic-bezier(…)` in a module stylesheet is a value
     * outside the vocabulary, which means it is a value nothing can change.
     * Only `tokens.css` may write one down.
     */
    /*
     * `offline.css` is the one exception, and it is not motion: a 1ms
     * `visibility` flip on an 8s delay, used as a TIMER for the "this page
     * never hydrated" notice. It is documented at the rule.
     */
    const TIMER_NOT_MOTION = new Map([["offline.css", ["1ms", "8s"]]]);

    for (const [file, text] of styleSheets()) {
      if (file === "tokens.css") continue;
      const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
      expect(
        withoutComments.match(/\b\d+(?:\.\d+)?m?s\b/g) ?? [],
        `literal durations in ${file}`,
      ).toEqual(TIMER_NOT_MOTION.get(file) ?? []);
      expect(
        withoutComments.match(/cubic-bezier\(/g) ?? [],
        `literal easing curves in ${file}`,
      ).toEqual([]);
    }
  });

  it("defines the shared reveal contract exactly once", () => {
    const hosts = styleSheets().filter(([, text]) =>
      /\.dh-action-reveal\s*\{/.test(text),
    );
    expect(hosts.map(([file]) => file)).toEqual(["motion.css"]);
  });

  it("holds the row affordance in layout so nothing shifts when it appears", () => {
    // §26 — the `…` button must never move the title. It fades; it does not
    // arrive. `opacity` is the only property the contract animates, and the
    // hidden state must not be clickable.
    expect(motionCss).toContain(
      "transition: opacity var(--dh-motion-fast) var(--dh-ease-standard)",
    );
    expect(motionCss).toContain("pointer-events: none");
    expect(motionCss).not.toMatch(
      /\.dh-action-reveal[^{]*\{[^}]*display:\s*none/s,
    );
  });
});

describe("DHDS-08 — the reduced-motion contract", () => {
  it("removes structural travel rather than merely shortening it", () => {
    const block = /@media \(prefers-reduced-motion: reduce\)([\s\S]*)$/.exec(
      motionCss,
    );
    expect(block).not.toBeNull();
    const text = block![1];
    // The travelling grammars lose their keyframe…
    for (const name of [
      ".dh-motion-reveal",
      ".dh-motion-lift",
      ".dh-motion-edge-inline",
      ".dh-motion-edge-block",
    ]) {
      expect(text, `${name} under reduced motion`).toContain(name);
    }
    // …and are given the FADE instead, so an exiting surface is filled to
    // `opacity: 0` rather than stranded at a translate it can never leave.
    expect(text).toContain("animation-name: dh-fade-in");
    expect(text).toContain("animation-name: dh-fade-out");
    // The pressed transform is physicality with no semantic content.
    expect(text).toContain("transform: none");
  });

  it("keeps the global floor that zeroes every duration", () => {
    const base = read("app", "styles", "base.css");
    expect(base).toContain("@media (prefers-reduced-motion: reduce)");
    expect(base).toContain(
      "transition-duration: var(--dh-motion-none) !important",
    );
    expect(base).toContain(
      "animation-duration: var(--dh-motion-none) !important",
    );
  });
});

describe("DHDS-08 — the completion grammar", () => {
  it("transitions a COLOUR rather than switching a decoration on", () => {
    // `text-decoration-line` cannot be interpolated; `text-decoration-color`
    // can. The rule is present and transparent at rest, so completing a task
    // draws it rather than making it appear — and reopening one erases it.
    expect(motionCss).toMatch(
      /\.dh-complete-strike\s*\{[^}]*text-decoration-color:\s*transparent/s,
    );
    expect(motionCss).toMatch(
      /\.dh-complete-strike\s*\{[^}]*transition:[^;]*text-decoration-color/s,
    );
    expect(motionCss).toMatch(
      /\[data-completed="true"\] \.dh-complete-strike[\s\S]{0,120}?text-decoration-color:\s*currentColor/,
    );
  });

  it("is worn by every canonical surface a Task title is drawn on", () => {
    for (const file of [
      ["app", "shared", "task-record", "TaskRow.tsx"],
      ["app", "shared", "card", "RecordRow.tsx"],
      ["app", "shared", "card", "Card.tsx"],
    ]) {
      expect(read(...file), file.join("/")).toContain("dh-complete-strike");
    }
  });

  it("never uses the `text-decoration` shorthand on a title that wears it", () => {
    /*
     * The shorthand resets `text-decoration-color` to `currentColor`, which
     * would reveal the strike on every INCOMPLETE row the pointer touched. The
     * two titles with a hover underline must therefore use longhands — and a
     * COMPLETED one must keep its strike while hovered, which is the defect
     * DHDS-08 found: pointing at a finished task made it look unfinished.
     */
    const HOVERED_TITLES = [
      ["task-list.css", ".dh-taskrow__title:hover"],
      ["card.css", ".dh-card__title-text"],
    ] as const;

    for (const [file, selector] of HOVERED_TITLES) {
      const text = read("app", "styles", file).replace(/\/\*[\s\S]*?\*\//g, "");
      const index = text.indexOf(selector);
      expect(index, `${selector} in ${file}`).toBeGreaterThan(-1);
      const rules = text.slice(index);
      expect(rules, `${selector} must use longhands`).toMatch(
        /text-decoration-line:\s*underline;/,
      );
      expect(rules, `${selector} must state its decoration colour`).toMatch(
        /text-decoration-color:\s*currentColor;/,
      );
      expect(rules, `a completed ${selector} keeps its strike`).toMatch(
        /text-decoration-line:\s*underline line-through;/,
      );
    }
  });
});

describe("DHDS-08 — the disclosure grammar", () => {
  it("opens to intrinsic height without a max-height guess", () => {
    expect(motionCss).toMatch(
      /\.dh-disclosure\s*\{[^}]*grid-template-rows:\s*1fr/s,
    );
    expect(motionCss).toMatch(
      /\.dh-disclosure\[data-dh-open="false"\]\s*\{[^}]*grid-template-rows:\s*0fr/s,
    );
    // The load-bearing half: a grid item's `auto` minimum would refuse to
    // shrink, and the region would never close.
    expect(motionCss).toMatch(
      /\.dh-disclosure__content\s*\{[^}]*min-block-size:\s*0/s,
    );
  });

  it("moves the indicator and the region as one interaction", () => {
    expect(motionCss).toMatch(
      /\.dh-disclosure-marker\s*\{[^}]*transition:\s*rotate var\(--dh-motion-base\)/s,
    );
  });

  it("is what the canonical grouped task section uses", () => {
    const list = read("app", "shared", "task-record", "TaskList.tsx");
    expect(list).toContain("dh-disclosure");
    expect(list).toContain("dh-disclosure-marker");
    // The collapsed END state is still `hidden` — out of the accessibility tree
    // and out of layout. It simply arrives when the transition finishes.
    expect(list).toContain("usePresence");
    expect(list).toContain("hidden={!bodyPainted}");
  });
});

describe("DHDS-08 — the JavaScript mirror cannot drift", () => {
  it("matches the stylesheet for every duration a timer needs", () => {
    expect(`${DH_MOTION_EXIT_MS}ms`).toBe(tokenValue("dh-motion-exit"));
    expect(`${DH_MOTION_BASE_MS}ms`).toBe(tokenValue("dh-motion-base"));
    expect(`${DH_MOTION_DELIBERATE_MS}ms`).toBe(
      tokenValue("dh-motion-deliberate"),
    );
  });

  it("mirrors ONLY the durations that drive removal", () => {
    // Everything else stays in CSS. Two copies of a value are two values, and
    // the ones worth copying are the ones React has to hold a timer for.
    const motionModule = read("app", "shared", "motion", "motion.ts");
    const mirrored = [...motionModule.matchAll(/=\s*(\d+);/g)].map(
      (match) => match[1],
    );
    expect(mirrored.sort()).toEqual(
      [
        `${DH_MOTION_EXIT_MS}`,
        `${DH_MOTION_BASE_MS}`,
        `${DH_MOTION_DELIBERATE_MS}`,
      ].sort(),
    );
  });
});

describe("DHDS-08 — performance and dependency boundaries", () => {
  it("adds no animation library", () => {
    const manifest = JSON.parse(read("package.json")) as {
      dependencies: Record<string, string>;
      devDependencies: Record<string, string>;
    };
    const all = Object.keys({
      ...manifest.dependencies,
      ...manifest.devDependencies,
    });
    for (const banned of [
      "framer-motion",
      "motion",
      "@motionone/dom",
      "react-spring",
      "@react-spring/web",
      "gsap",
      "animejs",
      "react-transition-group",
    ]) {
      expect(all, `${banned} must not be a dependency`).not.toContain(banned);
    }
  });

  it("does not scatter `will-change` through the product", () => {
    // A memory cost paid on every matching element forever. None of DHDS-08's
    // animations measured as needing one.
    for (const [file, text] of styleSheets()) {
      const withoutComments = text.replace(/\/\*[\s\S]*?\*\//g, "");
      expect(
        withoutComments.match(/will-change/g) ?? [],
        `will-change in ${file}`,
      ).toEqual([]);
    }
  });

  it("adds no route or page transition", () => {
    /*
     * §15 — module navigation is immediate. `startViewTransition` and a
     * `@view-transition` rule are the two ways a route animation gets in, and
     * neither belongs in a working application.
     */
    for (const file of appFiles()) {
      const text = readFileSync(file, "utf8");
      expect(text, file).not.toContain("startViewTransition");
      expect(text, file).not.toContain("@view-transition");
    }
  });
});
