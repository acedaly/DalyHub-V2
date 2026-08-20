/**
 * One-time DHDS-01 migration from framework machinery names to DalyHub roles.
 * Idempotent: a second run makes no changes. Retained as the executable record
 * of the migration map until the product boundary has shipped and settled.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";

const ROOT = new URL("../app/styles/", import.meta.url);

const map = new Map([
  // Repair aliases emitted by the first migration draft before longest-first
  // matching was enforced. This keeps the migrator safe on older branches.
  ["--dh-text-label-weight-emphasized", "--dh-text-label-strong-weight"],
  ["--dh-ease-emphasized-decelerate", "--dh-ease-enter"],
  ["--md-app-color-surface-expressive", "--dh-color-surface-expressive"],
  ["--md-app-color-on-surface-expressive", "--dh-color-text-on-expressive"],
  ["--md-app-color-surface-supporting", "--dh-color-surface-supporting"],
  ["--dh-color-accent-container", "--dh-color-accent-subtle"],
  ["--dh-color-info-container", "--dh-color-info-subtle"],
  ["--dh-color-state-completed-container", "--dh-color-state-completed-subtle"],
  ["--dh-color-state-waiting-container", "--dh-color-state-waiting-subtle"],
  ["--dh-color-state-on-hold-container", "--dh-color-state-on-hold-subtle"],
  ["--dh-color-state-due-soon-container", "--dh-color-state-due-soon-subtle"],
  ["--dh-color-surface-quietest", "--dh-color-bg-sunken"],
  ["--md-sys-color-primary", "--dh-color-accent"],
  ["--md-sys-color-secondary", "--dh-color-accent"],
  ["--md-sys-color-tertiary", "--dh-color-info"],
  ["--md-sys-color-inverse-primary", "--dh-color-accent-subtle"],
  ["--md-sys-color-outline-variant", "--dh-color-border"],
  ["--md-sys-color-secondary-container", "--dh-color-surface-selected"],
  ["--md-sys-color-on-secondary-container", "--dh-color-text"],
  ["--md-sys-color-surface-container-high", "--dh-color-surface-quiet"],
  ["--md-sys-color-surface-container-highest", "--dh-color-bg-sunken"],
  ["--md-sys-color-inverse-surface", "--dh-color-overlay"],
  ["--md-sys-color-inverse-on-surface", "--dh-color-text-on-overlay"],
  ["--md-sys-color-shadow", "--dh-color-scrim"],
  ["--md-sys-color-error-container", "--dh-color-danger-subtle"],
  ["--md-sys-color-on-error-container", "--dh-color-text-on-danger-subtle"],
  ["--md-sys-color-warning-container", "--dh-color-warning-subtle"],
  ["--md-sys-color-on-warning-container", "--dh-color-text-on-warning-subtle"],
  ["--md-sys-color-success-container", "--dh-color-success-subtle"],
  ["--md-sys-color-on-success-container", "--dh-color-text-on-success-subtle"],
  ["--md-sys-color-info", "--dh-color-info"],
  ["--md-sys-color-info-container", "--dh-color-info-subtle"],
  ["--md-sys-color-on-info-container", "--dh-color-text-on-info-subtle"],
  ["--md-sys-color-state-completed", "--dh-color-state-completed"],
  [
    "--md-sys-color-state-completed-container",
    "--dh-color-state-completed-subtle",
  ],
  [
    "--md-sys-color-on-state-completed-container",
    "--dh-color-text-on-completed-subtle",
  ],
  ["--md-sys-color-state-waiting", "--dh-color-state-waiting"],
  ["--md-sys-color-state-waiting-container", "--dh-color-state-waiting-subtle"],
  [
    "--md-sys-color-on-state-waiting-container",
    "--dh-color-text-on-waiting-subtle",
  ],
  ["--md-sys-color-state-on-hold", "--dh-color-state-on-hold"],
  ["--md-sys-color-state-on-hold-container", "--dh-color-state-on-hold-subtle"],
  [
    "--md-sys-color-on-state-on-hold-container",
    "--dh-color-text-on-hold-subtle",
  ],
  ["--md-sys-color-state-due-soon", "--dh-color-state-due-soon"],
  [
    "--md-sys-color-state-due-soon-container",
    "--dh-color-state-due-soon-subtle",
  ],
  ["--md-sys-color-state-overdue-container", "--dh-color-state-overdue-subtle"],
  ["--md-sys-color-entity-meeting", "--dh-color-entity-meeting"],
  ["--md-sys-color-entity-person", "--dh-color-entity-person"],
  ["--md-sys-color-entity-diary", "--dh-color-entity-diary"],
  ["--md-sys-color-accent-violet", "--dh-color-accent-violet"],
  ["--md-sys-color-accent-blue", "--dh-color-accent-blue"],
  ["--md-sys-color-accent-green", "--dh-color-accent-green"],
  ["--md-sys-color-accent-amber", "--dh-color-accent-amber"],
  ["--md-sys-color-accent-teal", "--dh-color-accent-teal"],
  ["--md-sys-color-accent-coral", "--dh-color-accent-coral"],
  ["--md-sys-shape-corner-extra-small", "--dh-radius-sm"],
  ["--md-sys-shape-corner-small", "--dh-radius-control"],
  ["--md-sys-shape-corner-medium", "--dh-radius-md"],
  ["--md-sys-shape-corner-large", "--dh-radius-lg"],
  ["--md-sys-shape-corner-extra-large", "--dh-radius-xl"],
  ["--md-sys-shape-corner-full", "--dh-radius-pill"],
  ["--md-sys-elevation-1", "--dh-elevation-raised"],
  ["--md-sys-elevation-2", "--dh-elevation-overlay"],
  ["--md-sys-elevation-3", "--dh-elevation-modal"],
  ["--md-sys-motion-duration-none", "--dh-motion-none"],
  ["--md-sys-motion-duration-short2", "--dh-motion-instant"],
  ["--md-sys-motion-duration-short3", "--dh-motion-instant"],
  ["--md-sys-motion-duration-short4", "--dh-motion-fast"],
  ["--md-sys-motion-duration-medium2", "--dh-motion-base"],
  ["--md-sys-motion-duration-long2", "--dh-motion-slow"],
  ["--md-sys-motion-easing-standard", "--dh-ease-standard"],
  ["--md-sys-motion-easing-emphasized", "--dh-ease-emphasized"],
  ["--md-sys-motion-easing-emphasized-decelerate", "--dh-ease-enter"],
  ["--md-sys-state-hover-state-layer-opacity", "--dh-state-hover-opacity"],
  ["--md-sys-state-focus-state-layer-opacity", "--dh-state-focus-opacity"],
  ["--md-sys-state-pressed-state-layer-opacity", "--dh-state-pressed-opacity"],
  [
    "--md-sys-state-disabled-content-opacity",
    "--dh-state-disabled-content-opacity",
  ],
  [
    "--md-sys-state-disabled-container-opacity",
    "--dh-state-disabled-container-opacity",
  ],
  ["--md-sys-typescale-body-small-size", "--dh-text-meta-size"],
  ["--md-sys-typescale-body-small-line-height", "--dh-text-meta-line-height"],
  ["--md-sys-typescale-body-small-weight", "--dh-text-meta-weight"],
  ["--md-sys-typescale-body-small-tracking", "--dh-text-meta-tracking"],
  ["--md-sys-typescale-body-medium-size", "--dh-text-body-size"],
  ["--md-sys-typescale-body-medium-line-height", "--dh-text-body-line-height"],
  ["--md-sys-typescale-body-medium-tracking", "--dh-text-body-tracking"],
  ["--md-sys-typescale-body-large-size", "--dh-text-lead-size"],
  ["--md-sys-typescale-body-large-line-height", "--dh-text-lead-line-height"],
  ["--md-sys-typescale-body-large-tracking", "--dh-text-body-tracking"],
  ["--md-sys-typescale-label-small-size", "--dh-text-meta-size"],
  ["--md-sys-typescale-label-small-line-height", "--dh-text-meta-line-height"],
  ["--md-sys-typescale-label-small-weight", "--dh-text-label-weight"],
  ["--md-sys-typescale-label-small-tracking", "--dh-text-meta-tracking"],
  ["--md-sys-typescale-label-medium-size", "--dh-text-label-size"],
  [
    "--md-sys-typescale-label-medium-line-height",
    "--dh-text-label-line-height",
  ],
  ["--md-sys-typescale-label-medium-weight", "--dh-text-label-weight"],
  ["--md-sys-typescale-label-medium-tracking", "--dh-text-label-tracking"],
  ["--md-sys-typescale-label-large-size", "--dh-text-label-size"],
  ["--md-sys-typescale-label-large-line-height", "--dh-text-label-line-height"],
  ["--md-sys-typescale-label-large-weight", "--dh-text-label-weight"],
  [
    "--md-sys-typescale-label-large-weight-emphasized",
    "--dh-text-label-strong-weight",
  ],
  ["--md-sys-typescale-label-large-tracking", "--dh-text-label-tracking"],
  ["--md-sys-typescale-title-small-size", "--dh-text-compact-title-size"],
  [
    "--md-sys-typescale-title-small-line-height",
    "--dh-text-compact-title-line-height",
  ],
  ["--md-sys-typescale-title-small-weight", "--dh-text-label-weight"],
  ["--md-sys-typescale-title-small-tracking", "--dh-text-label-tracking"],
  ["--md-sys-typescale-title-medium-size", "--dh-text-section-title-size"],
  [
    "--md-sys-typescale-title-medium-line-height",
    "--dh-text-section-title-line-height",
  ],
  ["--md-sys-typescale-title-medium-weight", "--dh-text-section-title-weight"],
  ["--md-sys-typescale-title-large-size", "--dh-text-metric-size"],
  ["--md-sys-typescale-headline-small-size", "--dh-text-page-title-size"],
  [
    "--md-sys-typescale-headline-small-line-height",
    "--dh-text-page-title-line-height",
  ],
  ["--md-sys-typescale-headline-medium-size", "--dh-text-record-title-size"],
  [
    "--md-sys-typescale-headline-medium-line-height",
    "--dh-text-record-title-line-height",
  ],
  [
    "--md-sys-typescale-headline-medium-weight",
    "--dh-text-record-title-weight",
  ],
  ["--md-sys-typescale-headline-medium-tracking", "--dh-text-display-tracking"],
  ["--md-sys-typescale-headline-large-size", "--dh-text-display-size"],
  ["--md-sys-typescale-display-small-size", "--dh-text-display-size"],
  [
    "--md-sys-typescale-display-small-line-height",
    "--dh-text-display-line-height",
  ],
  [
    "--md-sys-typescale-display-small-weight-emphasized",
    "--dh-text-display-weight",
  ],
  ["--md-sys-typescale-display-small-tracking", "--dh-text-display-tracking"],
]);

for (let slot = 1; slot <= 6; slot += 1) {
  map.set(
    `--dh-color-area-${slot}-container`,
    `--dh-color-area-${slot}-subtle`,
  );
  map.set(`--md-sys-color-area-accent-${slot}`, `--dh-color-area-${slot}`);
  map.set(
    `--md-sys-color-area-accent-${slot}-container`,
    `--dh-color-area-${slot}-subtle`,
  );
  map.set(
    `--md-sys-color-on-area-accent-${slot}-container`,
    `--dh-color-text-on-area-${slot}-subtle`,
  );
}

const files = (await readdir(ROOT, { recursive: true }))
  .filter((file) => file.endsWith(".css") && file !== "tokens.css")
  .sort();

let changed = 0;
for (const file of files) {
  const url = new URL(file, ROOT);
  const before = await readFile(url, "utf8");
  let after = before;
  const orderedMap = [...map].sort(
    ([left], [right]) => right.length - left.length,
  );
  for (const [from, to] of orderedMap) after = after.replaceAll(from, to);

  if (after !== before) {
    await writeFile(url, after);
    changed += 1;
  }
}

const unresolved = [];
for (const file of files) {
  const content = await readFile(new URL(file, ROOT), "utf8");
  const matches = [...content.matchAll(/var\(\s*(--md-sys-[a-z0-9-]+)/g)].map(
    (match) => match[1],
  );
  for (const token of matches) unresolved.push(`${file}: ${token}`);
}

if (unresolved.length > 0) {
  process.stderr.write(
    `Unmapped machinery tokens:\n${unresolved.join("\n")}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(`Migrated ${changed} stylesheet(s) to DalyHub roles.\n`);
}
