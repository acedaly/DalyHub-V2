#!/usr/bin/env node
/**
 * A one-shot surgical tool for the Untitled UI migration: remove the CSS rules
 * whose consumers have moved to Tailwind, and NOTHING else.
 *
 * The migration deletes legacy stylesheets a family at a time, as each family's
 * last consumer stops referencing it. Doing that by hand across 2 MB of CSS is
 * how a live rule gets deleted by accident, so this walks the stylesheet's real
 * block structure instead of matching on regular expressions:
 *
 *   · a rule is dropped only when EVERY selector in its list belongs to a family
 *     named on the command line — a rule that mixes a dead selector with a live
 *     one is reported and left alone, because that is a judgement call;
 *   · the comment immediately above a dropped rule goes with it, since it
 *     documents the rule rather than the file;
 *   · `@media` and other at-rules are recursed into, and one that ends up empty
 *     is dropped too.
 *
 * Usage:
 *   node scripts/strip-migrated-css.mjs <file> <family> [family…] [--dry-run]
 *
 * Families are matched on a class-name boundary, so `dh-nav` removes
 * `.dh-nav__link` and `.dh-nav` but never `.dh-navigation`.
 */

import { readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const [file, ...families] = args.filter((a) => a !== "--dry-run");

if (!file || families.length === 0) {
  console.error(
    "usage: strip-migrated-css.mjs <file> <family> [family…] [--dry-run]",
  );
  process.exit(1);
}

const inDeadFamily = (cls) =>
  families.some(
    (family) =>
      cls === family ||
      cls.startsWith(`${family}__`) ||
      cls.startsWith(`${family}--`),
  );

/**
 * True when EVERY class in `selector` belongs to a dead family.
 *
 * "Every", not "any", and the difference is not academic. `base.css` states the
 * shared state layer as one rule over a `:is(…)` list of eighteen controls, four
 * of which are shell controls this migration retired and fourteen of which are
 * the product's buttons. An `any` test called that whole selector dead and would
 * have deleted the state layer from every button in DalyHub — caught by the
 * dry-run's line count before anything was written.
 *
 * A descendant selector made only of dead classes (`.dh-sidebar--rail
 * .dh-nav__link`) is still dead, which is the case that matters for the families
 * this migration actually removes. A selector that MIXES the two is reported and
 * left alone: an `:is()` list needs its dead members pruned rather than the rule
 * dropped, and that is a judgement call, not a substitution.
 */
function isDead(selector) {
  const classes = [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map(
    (m) => m[1],
  );
  if (classes.length === 0) return false;
  return classes.every(inDeadFamily);
}

/** True when a selector names at least one dead class — used to flag mixtures. */
function touchesDead(selector) {
  return [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].some((m) =>
    inDeadFamily(m[1]),
  );
}

/** Split a selector list on commas that are not inside brackets or parens. */
function splitSelectors(list) {
  const out = [];
  let depth = 0;
  let current = "";
  for (const ch of list) {
    if (ch === "(" || ch === "[") depth += 1;
    else if (ch === ")" || ch === "]") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

const mixed = [];
let removed = 0;

/**
 * Walk one level of CSS and return the surviving source.
 *
 * Tracks the trailing comment separately so it can be discarded along with the
 * rule it introduces.
 */
function walk(css) {
  let out = "";
  let pendingComment = "";
  let i = 0;

  while (i < css.length) {
    // Whitespace is buffered with whatever comes next, so removing a rule does
    // not leave its blank line behind.
    if (/\s/.test(css[i])) {
      pendingComment += css[i];
      i += 1;
      continue;
    }

    // A comment: hold it until we know whether the next thing survives.
    if (css.startsWith("/*", i)) {
      const end = css.indexOf("*/", i + 2);
      const stop = end === -1 ? css.length : end + 2;
      pendingComment += css.slice(i, stop);
      i = stop;
      continue;
    }

    // Anything else begins a rule or at-rule: read up to its block.
    const braceAt = css.indexOf("{", i);
    const semiAt = css.indexOf(";", i);

    // A statement at-rule (`@import`, `@charset`) with no block.
    if (braceAt === -1 || (semiAt !== -1 && semiAt < braceAt)) {
      const stop = semiAt === -1 ? css.length : semiAt + 1;
      out += pendingComment + css.slice(i, stop);
      pendingComment = "";
      i = stop;
      continue;
    }

    const prelude = css.slice(i, braceAt).trim();

    // Find the matching close brace.
    let depth = 1;
    let j = braceAt + 1;
    while (j < css.length && depth > 0) {
      if (css[j] === "{") depth += 1;
      else if (css[j] === "}") depth -= 1;
      j += 1;
    }
    const body = css.slice(braceAt + 1, j - 1);

    if (prelude.startsWith("@")) {
      // A block at-rule. Recurse; drop it entirely if nothing survives inside.
      const inner = walk(body);
      if (inner.trim() === "") {
        removed += 1;
        pendingComment = "";
      } else {
        out += `${pendingComment}${prelude} {${inner}}`;
        pendingComment = "";
      }
      i = j;
      continue;
    }

    const selectors = splitSelectors(prelude);
    const deadCount = selectors.filter(isDead).length;

    if (deadCount === selectors.length) {
      removed += 1;
      pendingComment = "";
    } else if (deadCount > 0 || selectors.some(touchesDead)) {
      mixed.push(prelude.replace(/\s+/g, " ").slice(0, 120));
      out += `${pendingComment}${prelude} {${body}}`;
      pendingComment = "";
    } else {
      out += `${pendingComment}${prelude} {${body}}`;
      pendingComment = "";
    }
    i = j;
  }

  return out + pendingComment;
}

const original = readFileSync(file, "utf8");
let result = walk(original);
// Collapse the runs of blank lines removals leave behind.
result = result.replace(/\n{3,}/g, "\n\n").replace(/^\n+/, "");

if (mixed.length) {
  console.error(
    `\n${mixed.length} rule(s) mix a dead selector with a live one and were LEFT ALONE:\n  ` +
      mixed.join("\n  ") +
      "\nResolve these by hand.\n",
  );
}

const before = original.split("\n").length;
const after = result.split("\n").length;
console.log(
  `${file}: removed ${removed} rule(s), ${before} → ${after} lines (-${before - after}).`,
);

if (!dryRun) writeFileSync(file, result);
