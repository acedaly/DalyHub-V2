/**
 * DHDS-13 — the commercial-quality gate's regression boundary.
 *
 * Each check below fixes ONE defect the gate's adversarial pass MEASURED in the
 * running application, and each is written against the source rather than
 * against a rendered pixel — a screenshot proves a defect existed, a source
 * assertion is what stops the same one coming back. Every `it` names the
 * measurement in its title so a future failure reads as "this is the thing that
 * was wrong", not as "a string moved".
 *
 * The behavioural half of the boundary — the phone task row's metadata, the
 * Plan page's frame — is asserted against the real DOM in
 * `e2e/dhds-13-commercial-quality.spec.ts`, because those are geometry and
 * geometry has to be measured.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

describe("DHDS-13 — floating surfaces read as floating", () => {
  it("paints the scrim token as authored rather than mixing it down again", () => {
    /*
     * Every modal scrim used `color-mix(… var(--dh-color-scrim) 32%,
     * transparent)` over a token that already carries 0.32/0.58 alpha, so the
     * shipped wash was 10.3% in light and 18.6% in dark against the 32%
     * DESIGN_SYSTEM.md specifies. No consumer may re-apply the strength.
     */
    for (const file of [
      "command.css",
      "drawer.css",
      "forms.css",
      "inspector.css",
      "search.css",
      "settings.css",
      "sheet.css",
      "shell.css",
    ]) {
      const css = read("app", "styles", file);
      expect(
        css,
        `${file} re-mixes --dh-color-scrim instead of painting it`,
      ).not.toMatch(/color-mix\([^)]*--dh-color-scrim[^)]*\)/s);
    }
  });

  it("gives the shared sheet the MODAL elevation its own token names", () => {
    // `--dh-elevation-modal` is documented as "a dialog, a sheet, a drawer";
    // the sheet took `--dh-elevation-raised`, which resolves to `none`.
    const css = read("app", "styles", "sheet.css");
    expect(css).toMatch(
      /\.dh-sheet\s*{[^}]*box-shadow:\s*var\(--dh-elevation-modal\)/s,
    );
    const tokens = read("app", "styles", "tokens.css");
    expect(tokens).toMatch(/--dh-elevation-raised:\s*none;/);
  });
});

describe("DHDS-13 — the tablet rail keeps its glyph", () => {
  it("hides the Capture LABEL without collapsing the button's type scale", () => {
    /*
     * `font-size: 0` collapsed the `1em`-authored plus icon too, so the rail's
     * primary action rendered as a blank violet block at every width in
     * 768–1023px.
     */
    const css = read("app", "styles", "premium.css");
    const band = css.slice(
      css.indexOf("@media (min-width: 48rem) and (max-width: 63.9375rem)"),
    );
    const block = band.slice(0, band.indexOf("\n}\n\n"));
    expect(block).not.toMatch(/font-size:\s*0/);
    expect(block).toMatch(/\.dh-sidebar__capture \.dh-button__label/);
  });
});

describe("DHDS-13 — a fact is never sliced mid-glyph", () => {
  it("reserves the priority mark's own width in the row's priority cell", () => {
    const css = read("app", "styles", "task-list.css");
    expect(css).toMatch(
      /\.dh-taskrow__cell--priority\s*{[^}]*min-inline-size:\s*3\.5rem;/s,
    );
  });

  it("yields the due date to the project below 21rem of list, not 19", () => {
    const css = read("app", "styles", "task-list.css");
    expect(css).toMatch(/@container tasklist \(max-width: 21rem\)/);
    expect(css).not.toMatch(/@container tasklist \(max-width: 19rem\)/);
  });

  it("truncates a Person's contact detail in a box an ellipsis can reach", () => {
    // The link is `display: flex`, so `text-overflow` never applied to its
    // anonymous text item and a long address was chopped instead of ellipsised.
    const row = read("app", "shared", "card", "PersonRow.tsx");
    expect(row).toMatch(/className="dh-prow__reach-value"/);
    const css = read("app", "styles", "card-family.css");
    expect(css).toMatch(
      /\.dh-prow \.dh-prow__reach-value\s*{[^}]*text-overflow:\s*ellipsis;/s,
    );
  });

  it("keeps the urgency chip inside the cell it was given", () => {
    const css = read("app", "styles", "task-signals.css");
    expect(css).toMatch(/\.dh-urgency\s*{[^}]*max-inline-size:\s*100%;/s);
    expect(css).toMatch(
      /\.dh-urgency__label\s*{[^}]*text-overflow:\s*ellipsis;/s,
    );
  });
});

describe("DHDS-13 — one row grammar across the collections", () => {
  it("draws the Views result list as one bounded surface, not a slab per row", () => {
    const css = read("app", "styles", "views.css");
    expect(css).toMatch(
      /\.dh-views__list\s*{[^}]*background:\s*var\(--dh-color-surface\);/s,
    );
    expect(css).toMatch(
      /\.dh-views__list > \.dh-views__row \+ \.dh-views__row\s*{[^}]*border-block-start:/s,
    );
    // The row itself no longer owns a surface or a radius.
    const row = css.slice(
      css.indexOf(".dh-views__row {"),
      css.indexOf(".dh-views__list > .dh-views__row"),
    );
    expect(row).not.toMatch(/background:/);
    expect(row).not.toMatch(/border-radius:/);
  });

  it("draws a Views row title in on-surface, never the relationship accent", () => {
    const css = read("app", "styles", "views.css");
    expect(css).toMatch(
      /\.dh-views__row \.dh-views__row-link[^{]*{[^}]*color:\s*var\(--dh-color-text\);/s,
    );
  });

  it("colours a Views date only when it is genuinely overdue", () => {
    const css = read("app", "styles", "views.css");
    expect(css).toMatch(
      /\.dh-views__row-date\[data-overdue="true"\]\s*{[^}]*color:\s*var\(--dh-color-danger\);/s,
    );
    const workspace = read("app", "modules", "views", "ViewsWorkspace.tsx");
    expect(workspace).toMatch(/data-overdue=\{item\.overdue/);
    const presentation = read(
      "app",
      "modules",
      "views",
      "views-presentation.ts",
    );
    expect(presentation).toMatch(/overdue: isOverdue\(result, todayIso\)/);
  });

  it("holds every list's trailing overflow back until the row is engaged with", () => {
    // The contract needs BOTH halves: the context on the row and the reveal
    // class on the trailing container (`motion.css`). The Projects table
    // declared the first and never the second; the Areas row declared neither.
    const table = read("app", "modules", "projects", "ProjectsTable.tsx");
    expect(table).toMatch(/data-dh-action-context="true"/);
    expect(table).toMatch(/className="dh-ptable__actions dh-action-reveal"/);

    const entityRow = read("app", "shared", "card", "EntityRowList.tsx");
    expect(entityRow).toMatch(
      /data-dh-action-context=\{overflow \? "true" : undefined\}/,
    );
    expect(entityRow).toMatch(/className="dh-erow__overflow dh-action-reveal"/);
  });

  it("drops the bespoke tray around the Assets filter band", () => {
    const css = read("app", "styles", "assets.css");
    const block = css.slice(
      css.indexOf(".dh-assets-filters {"),
      css.indexOf(".dh-assets-filters__search"),
    );
    expect(block).not.toMatch(/background:\s*var\(--dh-color-surface-subtle\)/);
    expect(block).not.toMatch(/border:\s*var\(--app-border-width-thin\)/);
  });
});

describe("DHDS-13 — the frame has one origin", () => {
  it("gives the Plan page the shared gutter it declared it did not need", () => {
    const css = read("app", "styles", "plan.css");
    expect(css).toMatch(
      /\.dh-plan\s*{[^}]*padding-inline:\s*var\(--dh-shell-gutter\);/s,
    );
    // The day rail's visually-hidden labels are absolutely positioned; without
    // a containing block on the day they escaped the strip and pushed the
    // document sideways at 320px.
    expect(css).toMatch(/\.dh-plan__rail-day\s*{[^}]*position:\s*relative;/s);
  });

  it("names the surface a scroll strip is covering on the Goal pane", () => {
    const css = read("app", "styles", "goals.css");
    expect(css).toMatch(
      /\.dh-goalpane__rail\s*{[^}]*--scroll-strip-cover:\s*var\(--dh-color-surface\);/s,
    );
  });
});

describe("DHDS-13 — landmarks stay navigable", () => {
  it("stops the Goal list from being a second region called Goals", () => {
    const workspace = read("app", "modules", "goals", "GoalWorkspace.tsx");
    expect(workspace).not.toMatch(
      /<section className="dh-goalspace__panel" aria-labelledby/,
    );
    expect(workspace).toMatch(/<div className="dh-goalspace__panel">/);
    // The heading stays — the outline is what a screen-reader user walks.
    expect(workspace).toMatch(
      /<h2 id=\{headingId\} className="dh-visually-hidden">/,
    );
  });
});
