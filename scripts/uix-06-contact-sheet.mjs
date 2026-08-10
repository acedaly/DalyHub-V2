/**
 * UIX-06 — the contact sheet.
 *
 * §65 of the convergence brief asks for a side-by-side overview of the whole
 * product, because the defects this pass exists to find are COMPARATIVE: one
 * page with older typography, one card with a different radius, one screen too
 * purple, one dark surface that does not match its neighbours. None of those is
 * visible in the screenshot of the page that has it — only in the row of twelve
 * beside it.
 *
 * Writes a self-contained HTML index over `docs/design/assets/uix-06-2026-08/`,
 * grouped by width and appearance, with BEFORE and AFTER paired where both
 * exist. It reads the directory rather than a list, so it stays correct as the
 * evidence set grows.
 *
 *   node scripts/uix-06-contact-sheet.mjs
 *   → docs/design/assets/uix-06-2026-08/contact-sheet.html
 */
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "docs",
  "design",
  "assets",
  "uix-06-2026-08",
);

const files = readdirSync(DIR).filter((f) => f.endsWith(".png"));

/** `before-tasks-1280-dark.png` → {phase, name, width, scheme}. */
function parse(file) {
  const m = /^(?:(before)-)?(.+)-(\d+)-(light|dark)\.png$/.exec(file);
  if (!m) return null;
  return { phase: m[1] ?? "after", name: m[2], width: m[3], scheme: m[4] };
}

const shots = files.map(parse).filter(Boolean);
const groups = new Map();
for (const s of shots) {
  const key = `${s.width}-${s.scheme}`;
  if (!groups.has(key)) groups.set(key, new Map());
  const byName = groups.get(key);
  if (!byName.has(s.name)) byName.set(s.name, {});
  byName.get(s.name)[s.phase] =
    `${s.phase === "before" ? "before-" : ""}${s.name}-${s.width}-${s.scheme}.png`;
}

const order = ["1280", "1440", "1024", "390", "320"];
const keys = [...groups.keys()].sort((a, b) => {
  const [aw, as] = a.split("-");
  const [bw, bs] = b.split("-");
  const ai = order.indexOf(aw),
    bi = order.indexOf(bw);
  return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || as.localeCompare(bs);
});

const sections = keys
  .map((key) => {
    const [width, scheme] = key.split("-");
    const byName = groups.get(key);
    const cells = [...byName.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, pair]) => {
        const shot = (phase) =>
          pair[phase]
            ? `<figure class="s"><img loading="lazy" src="${pair[phase]}" alt="${name} ${phase}"><figcaption>${phase}</figcaption></figure>`
            : "";
        return `<div class="cell"><h3>${name}</h3><div class="pair">${shot("before")}${shot("after")}</div></div>`;
      })
      .join("\n");
    return `<section data-scheme="${scheme}"><h2>${width}px · ${scheme}</h2><div class="grid">${cells}</div></section>`;
  })
  .join("\n");

writeFileSync(
  join(DIR, "contact-sheet.html"),
  `<!doctype html>
<meta charset="utf-8">
<title>UIX-06 contact sheet</title>
<style>
  :root { color-scheme: light dark; font-family: system-ui, sans-serif; }
  body { margin: 0; padding: 2rem; background: #f7f6fa; color: #1a1c1e; }
  h1 { font-size: 1.5rem; }
  h2 { font-size: 1rem; letter-spacing: .04em; text-transform: uppercase;
       color: #55525c; border-block-end: 1px solid #ddd; padding-block-end: .5rem; }
  section[data-scheme="dark"] { background: #1a1c1e; color: #e5e1e9; padding: 1rem; border-radius: 12px; }
  section[data-scheme="dark"] h2 { color: #c9c5d0; border-color: #333; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(20rem, 1fr)); gap: 1.5rem; }
  .cell h3 { font-size: .8rem; margin: 0 0 .4rem; font-weight: 600; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: .4rem; }
  .s { margin: 0; }
  .s img { width: 100%; border: 1px solid rgba(128,128,128,.35); border-radius: 6px; display: block; }
  .s figcaption { font-size: .65rem; color: #77747e; margin-block-start: .2rem; }
</style>
<h1>UIX-06 — whole-application contact sheet</h1>
<p>${shots.length} screenshots. Each cell pairs BEFORE (left) with AFTER (right) where both exist.</p>
${sections}
`,
);

console.log(
  `contact-sheet.html — ${shots.length} shots across ${keys.length} width/appearance groups`,
);
