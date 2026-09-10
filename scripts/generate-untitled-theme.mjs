#!/usr/bin/env node
/**
 * UNTITLED-01 — generate `app/styles/untitled/theme.css` from the vendored
 * Untitled UI theme.
 *
 * Untitled UI React ships one theme file that resolves dark mode from a
 * `.dark-mode` CLASS and hard-codes its own violet brand ramp. DalyHub resolves
 * dark mode from `<html data-appearance>` plus `prefers-color-scheme`, decided
 * during SSR with no bootstrapping script (APPEARANCE-01), and owns its own
 * brand. Neither difference can be expressed by editing the vendored file in
 * place without forking it, so this script does what
 * `scripts/generate-m3-scheme.mjs` already does for the M3 scheme: it treats the
 * upstream file as INPUT and writes the stylesheet the cascade actually loads.
 *
 * Two transformations, and nothing else:
 *
 *   1. THE DARK BLOCK IS RE-SELECTORED, and emitted TWICE — once under
 *      `:root[data-appearance='dark']` and once inside a
 *      `prefers-color-scheme: dark` media block guarded by
 *      `:not([data-appearance='light'])`. That is the same pair of conditions
 *      `tokens.css` already publishes, so one appearance decision drives both
 *      token systems and they cannot disagree. The duplication is upstream of a
 *      generator on purpose — CSS has no mixin, and `tokens.css` duplicates for
 *      exactly this reason.
 *
 *   2. THE BRAND RAMP IS REPLACED with one anchored on DalyHub's own accent.
 *      Untitled's ramp SHAPE is preserved perceptually — each step keeps its
 *      OKLCH lightness relationship to the 600 step — while hue and chroma move
 *      onto `--accent` (#5b4bd6). Untitled supplies the machinery; DalyHub
 *      supplies the identity, which is the whole theme strategy in one line.
 *
 * Usage:
 *   node scripts/generate-untitled-theme.mjs            # write
 *   node scripts/generate-untitled-theme.mjs --check    # fail on drift
 */

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SOURCE = fileURLToPath(
  new URL("../app/styles/untitled/theme.source.css", import.meta.url),
);
const OUTPUT = fileURLToPath(
  new URL("../app/styles/untitled/theme.css", import.meta.url),
);
const TOKENS = fileURLToPath(
  new URL("../app/styles/tokens.css", import.meta.url),
);
const PROVENANCE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./untitled-provenance.json", import.meta.url)),
    "utf8",
  ),
);

/* ── Colour maths: sRGB ⇄ OKLCH ──────────────────────────────────────────────
 *
 * Enough of it to move a ramp between hues perceptually, and no more. The
 * formulae are Björn Ottosson's published OKLab conversion; `srgbToLinear` and
 * its inverse are the standard sRGB transfer function.
 */

const srgbToLinear = (c) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const linearToSrgb = (c) =>
  c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055;

function rgbToOklch([r, g, b]) {
  const lr = srgbToLinear(r / 255);
  const lg = srgbToLinear(g / 255);
  const lb = srgbToLinear(b / 255);

  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );

  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;

  return {
    L,
    C: Math.hypot(A, B),
    H: (Math.atan2(B, A) * 180) / Math.PI,
  };
}

function oklchToRgb({ L, C, H }) {
  const h = (H * Math.PI) / 180;
  const A = C * Math.cos(h);
  const B = C * Math.sin(h);

  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;

  const lr = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;

  return [lr, lg, lb].map((v) =>
    Math.max(0, Math.min(255, Math.round(linearToSrgb(v) * 255))),
  );
}

const parseHex = (hex) => {
  const h = hex.replace("#", "").trim();
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

/* ── Inputs ───────────────────────────────────────────────────────────────── */

const source = readFileSync(SOURCE, "utf8");
const tokens = readFileSync(TOKENS, "utf8");

/**
 * DalyHub's accent, read from `tokens.css` rather than restated here, so the
 * generator cannot drift from the value the product actually paints.
 */
function readAccent(name) {
  const match = tokens.match(
    new RegExp(`^\\s*--${name}:\\s*(#[0-9a-fA-F]{6});`, "m"),
  );
  if (!match) {
    throw new Error(`Could not read --${name} from tokens.css`);
  }
  return match[1];
}

const ACCENT = readAccent("accent");

/** The steps Untitled publishes, plus the 25 the DalyHub ramp adds. */
const STEPS = [25, 50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

/**
 * Untitled's own brand ramp, read out of the vendored source. It is the SHAPE
 * the DalyHub ramp inherits — its lightness ladder is a designed artefact and
 * re-deriving one from scratch would be strictly worse.
 */
function readUpstreamBrandRamp() {
  const ramp = new Map();
  for (const step of STEPS) {
    const m = source.match(
      new RegExp(
        `--color-brand-${step}:\\s*rgb\\((\\d+)\\s+(\\d+)\\s+(\\d+)\\)`,
      ),
    );
    if (m) ramp.set(step, [+m[1], +m[2], +m[3]]);
  }
  if (!ramp.has(600)) {
    throw new Error("Vendored theme has no --color-brand-600 to anchor on.");
  }
  return ramp;
}

/**
 * Re-anchor Untitled's ramp on DalyHub's accent.
 *
 * The 600 step lands on `--accent` EXACTLY — it is the colour the product
 * already paints on its one primary control, and a ramp that only approximates
 * it would quietly change the brand. Every other step keeps DalyHub's hue and
 * its share of the 600 step's chroma, and has its lightness remapped
 * PIECEWISE-LINEARLY so that the two ends of the ladder stay where Untitled put
 * them: 25 stays near-white, 950 stays near-black, and only the middle moves to
 * meet the new anchor.
 *
 * Shifting every step by one offset instead — the obvious thing — drags the pale
 * end down with the anchor and turns brand-25/50 into grey, which is precisely
 * what those two steps exist not to be.
 */
function buildBrandRamp() {
  const upstream = readUpstreamBrandRamp();
  const anchor = rgbToOklch(upstream.get(600));
  const target = rgbToOklch(parseHex(ACCENT));

  const lightnesses = new Map(
    STEPS.map((step) => {
      // Step 25 is not in Untitled's ramp; extrapolate it one notch above 50.
      const base = upstream.get(step) ?? upstream.get(50);
      const lift = step === 25 && !upstream.has(25) ? 0.012 : 0;
      return [step, rgbToOklch(base).L + lift];
    }),
  );

  const palest = lightnesses.get(STEPS[0]);
  const darkest = lightnesses.get(STEPS[STEPS.length - 1]);

  /** Move `L` so the anchor lands on target, holding both ends of the ladder. */
  const remap = (L) => {
    if (L === anchor.L) return target.L;
    const [from, to] = L > anchor.L ? [palest, anchor.L] : [darkest, anchor.L];
    const span = to - from;
    if (span === 0) return L;
    return from + ((L - from) / span) * (target.L - from);
  };

  const ramp = new Map();
  for (const step of STEPS) {
    const from = rgbToOklch(upstream.get(step) ?? upstream.get(50));
    ramp.set(step, {
      L: Math.max(0, Math.min(1, remap(lightnesses.get(step)))),
      C: anchor.C === 0 ? 0 : (from.C / anchor.C) * target.C,
      H: target.H,
    });
  }
  return ramp;
}

const brandRamp = buildBrandRamp();

const brandDeclarations = STEPS.map((step) => {
  const [r, g, b] = oklchToRgb(brandRamp.get(step));
  return `    --color-brand-${step}: rgb(${r} ${g} ${b});`;
}).join("\n");

/* ── Split the vendored file into its two blocks ─────────────────────────── */

const darkOpen = source.indexOf(".dark-mode {");
if (darkOpen === -1) {
  throw new Error("Vendored theme has no `.dark-mode` block to re-selector.");
}

/** Everything before `@layer base { .dark-mode {` — the `@theme` block. */
const themeBlockEnd = source.lastIndexOf("@layer base", darkOpen);
const themeBlock = source.slice(0, themeBlockEnd).trimEnd();

/** The dark declarations, without the `.dark-mode {` wrapper or its braces. */
const darkBody = (() => {
  const bodyStart = darkOpen + ".dark-mode {".length;
  let depth = 1;
  let i = bodyStart;
  while (i < source.length && depth > 0) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") depth -= 1;
    i += 1;
  }
  return (
    source
      .slice(bodyStart, i - 1)
      .replace(/^\n+|\s+$/g, "")
      // Re-indent from Untitled's 8-space nesting to this file's 4.
      .replace(/^ {8}/gm, "    ")
  );
})();

/* ── Emit ─────────────────────────────────────────────────────────────────── */

const BANNER = `/*
 * GENERATED FILE — DO NOT EDIT.
 *
 * Written by \`scripts/generate-untitled-theme.mjs\` from
 * \`app/styles/untitled/theme.source.css\` (Untitled UI React, MIT). The source
 * revision is \`${PROVENANCE.revision}\` (sync marker \`${PROVENANCE.syncMarker}\`,
 * retrieved ${PROVENANCE.retrieved}); edit the source or the generator;
 * \`pnpm run untitled:theme:check\` fails the build on a
 * hand-edit here, the same guard \`scheme:check\` puts on the M3 scheme.
 *
 * Two DalyHub adaptations are applied, and are the only differences from
 * upstream:
 *
 *   BRAND    The ramp is re-anchored on DalyHub's \`--accent\` (${ACCENT}), keeping
 *            Untitled's perceptual lightness ladder. One identity, not two.
 *   DARK     Untitled's \`.dark-mode\` class is replaced by DalyHub's own two
 *            conditions — \`[data-appearance='dark']\`, and \`prefers-color-scheme:
 *            dark\` where the owner has not pinned light (APPEARANCE-01). One
 *            appearance decision now drives both token systems.
 */`;

const DARK_HEADER = `/*
 * DARK MODE.
 *
 * Emitted twice because CSS has no mixin and the two conditions cannot be
 * expressed as one selector: an explicit \`dark\` preference is a selector, and
 * \`system\` is a media query. \`tokens.css\` duplicates for the same reason.
 */`;

const output = `${BANNER}

${themeBlock}

@layer base {
    /*
     * BRAND — DalyHub's accent, wearing Untitled's ramp shape.
     *
     * Declared after the \`@theme\` block rather than inside it so the substitution
     * is legible as a substitution: everything above is upstream, this is ours.
     */
    :root {
${brandDeclarations}
    }

    ${DARK_HEADER.replace(/\n/g, "\n    ")}
    :root[data-appearance="dark"] {
${darkBody}
    }

    @media (prefers-color-scheme: dark) {
        :root:not([data-appearance="light"]) {
${darkBody.replace(/^ {4}/gm, "        ")}
        }
    }
}
`;

const existing = (() => {
  try {
    return readFileSync(OUTPUT, "utf8");
  } catch {
    return null;
  }
})();

if (process.argv.includes("--check")) {
  if (existing !== output) {
    console.error(
      "app/styles/untitled/theme.css is out of date or hand-edited.\n" +
        "Run `pnpm run untitled:theme` and commit the result.",
    );
    process.exit(1);
  }
  console.log("app/styles/untitled/theme.css is up to date.");
} else {
  writeFileSync(OUTPUT, output);
  console.log(
    `Wrote app/styles/untitled/theme.css — brand ramp anchored on ${ACCENT}.`,
  );
}
