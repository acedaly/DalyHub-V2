/**
 * DHDS-01 — ratchet direct Material-machinery consumption out of product CSS.
 *
 * Foundation token sources are deliberately excluded: generated colour and
 * accessibility machinery may remain private beneath DalyHub's semantic layer.
 * Everything else in `app/` is product/shared presentation and must consume
 * `--dh-*` roles, whether the reference lives in CSS or an inline React style.
 *
 * The initial ceiling records the audited baseline. It may only move down.
 * Raising it is a design-system regression and requires an ADR, not a routine
 * snapshot update.
 */
import { readdir, readFile } from "node:fs/promises";

const ROOT = new URL("../app/", import.meta.url);
const BASELINE_DIRECT_REFERENCES = 0;
const TOKEN_PATTERN = /var\(\s*(--md-(?:sys|app)-[a-z0-9-]+)/g;
const check = process.argv.includes("--check");
const json = process.argv.includes("--json");

const files = (await readdir(ROOT, { recursive: true }))
  .filter(
    (file) =>
      /\.(?:css|ts|tsx)$/.test(file) &&
      file !== "styles/tokens.css" &&
      !file.startsWith("shared/tokens/"),
  )
  .sort();

const byFile = [];
const byToken = new Map();
let total = 0;

for (const file of files) {
  const content = await readFile(new URL(file, ROOT), "utf8");
  const matches = [...content.matchAll(TOKEN_PATTERN)].map((match) => match[1]);
  if (matches.length === 0) continue;

  total += matches.length;
  byFile.push({ file: `app/${file}`, references: matches.length });
  for (const token of matches) {
    byToken.set(token, (byToken.get(token) ?? 0) + 1);
  }
}

byFile.sort((left, right) => right.references - left.references);
const topTokens = [...byToken.entries()]
  .map(([token, references]) => ({ token, references }))
  .sort((left, right) => right.references - left.references)
  .slice(0, 20);

const report = {
  baseline: BASELINE_DIRECT_REFERENCES,
  directReferences: total,
  remaining:
    BASELINE_DIRECT_REFERENCES === 0
      ? total === 0
        ? "complete"
        : "regressed"
      : `${Math.round((total / BASELINE_DIRECT_REFERENCES) * 100)}%`,
  topFiles: byFile.slice(0, 20),
  topTokens,
};

if (json) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} else {
  process.stdout.write(
    [
      total === 0
        ? "DHDS token boundary: clean — 0 direct machinery references"
        : `DHDS token boundary: ${total} direct machinery references remain`,
      ...(total === 0
        ? [""]
        : [
            "",
            "Highest-consumption product files:",
            ...report.topFiles.map(
              ({ file, references }) =>
                `  ${references.toString().padStart(4)}  ${file}`,
            ),
            "",
            "Most-consumed machinery tokens:",
            ...topTokens.map(
              ({ token, references }) =>
                `  ${references.toString().padStart(4)}  ${token}`,
            ),
            "",
          ]),
    ].join("\n"),
  );
}

if (check && total > BASELINE_DIRECT_REFERENCES) {
  process.stderr.write(
    `DHDS token boundary regressed by ${total - BASELINE_DIRECT_REFERENCES} reference(s). ` +
      "Product CSS must consume DalyHub semantic tokens; do not raise the baseline.\n",
  );
  process.exitCode = 1;
}
