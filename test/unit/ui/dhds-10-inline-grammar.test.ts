/**
 * DHDS-10 — the inline-manipulation grammar stays ONE grammar.
 *
 * Contract tests over the repository, in the shape DHDS-08's motion grammar and
 * DHDS-09's floating grammar established. What is worth protecting is not any
 * particular chevron; it is that there is exactly **one** place each of these
 * comes from:
 *
 *   - the read affordance and the state machine (`~/shared/inline-edit`);
 *   - the "quiet at rest" treatment (`[data-presentation="meta"]`);
 *   - the reveal it uses (`.dh-action-reveal`, DHDS-08);
 *   - the surface a choice opens (DHDS-09's `Menu`, `Picker`, `Popover`);
 *   - the vocabulary a choice offers (the kernel's own lists).
 *
 * Every divergence DHDS-10 repaired was a copy: a title editor declared inside
 * one module, a quiet-at-rest rule scoped to one stylesheet, and an escape
 * hatch that opened a record instead of a picker.
 *
 * The tests are deliberately narrow. They do not ban `useState` near a value or
 * `<input>` in a component — a form legitimately contains both. They ban the
 * specific shapes that mean "a second inline-editing system is being built".
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { appRelative, appSourceFiles, readAppFile } from "../tokens/token-css";

const STYLES = join(process.cwd(), "app", "styles");

function stylesheet(name: string): string {
  return readFileSync(join(STYLES, name), "utf8");
}

/** Every `app/` source file, as `{ path, text }`, comments included. */
function sources(): readonly {
  readonly path: string;
  readonly text: string;
}[] {
  return appSourceFiles().map((file) => ({
    path: appRelative(file),
    text: readFileSync(file, "utf8"),
  }));
}

/** Strip block/line comments, so a rule cannot be "broken" by prose about it. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
}

describe("DHDS-10 — one inline-manipulation grammar", () => {
  it("declares the quiet-at-rest treatment in inline-edit.css alone", () => {
    const inlineEdit = stylesheet("inline-edit.css");
    expect(inlineEdit).toContain('[data-presentation="meta"]');

    // No other stylesheet may DEFINE what a meta field looks like at rest.
    // Adjusting one on a specific surface (a column's `inline-size`) is
    // composition and stays legal; declaring the presentation is not.
    for (const { path, text } of sources()) {
      if (!path.endsWith(".css") || path.endsWith("styles/inline-edit.css")) {
        continue;
      }
      expect(
        code(text).includes('[data-presentation="meta"]'),
        `${path} declares the meta presentation; it belongs in inline-edit.css`,
      ).toBe(false);
    }
  });

  it("hides an inline field's caret through the SHARED reveal, never a private one", () => {
    /*
     * The specific copy this replaced: two hand-written
     * `opacity: 0 → 1 on :hover/:focus-within` pairs in `task-list.css`, which
     * were the third and fourth implementations of a contract `motion.css`
     * publishes. A stylesheet that opacity-toggles the caret is rebuilding it.
     */
    for (const { path, text } of sources()) {
      if (!path.endsWith(".css")) continue;
      const rules = code(text).split("}");
      for (const rule of rules) {
        if (!rule.includes(".dh-inline-select__caret")) continue;
        if (!/opacity\s*:/.test(rule)) continue;
        throw new Error(
          `${path} toggles the inline caret's opacity; use .dh-action-reveal (motion.css)`,
        );
      }
    }
    expect(stylesheet("motion.css")).toContain(".dh-action-reveal");
  });

  it("keeps the inline TITLE editor shared rather than per module", () => {
    /*
     * `TasksWorkspace` declared one privately, so Today and Plan — which draw
     * the same shared row over the same Tasks — simply had no way to rename.
     * A second one is how the three surfaces come to disagree about what
     * Escape does.
     */
    const owner = "shared/task-record/TaskTitleEditor.tsx";
    const declarations = sources().filter(
      ({ path, text }) =>
        path !== owner && /intent"?\s*[,:]\s*"rename"/.test(code(text)),
    );
    for (const { path, text } of declarations) {
      // A module may still POST a rename (a record heading's own field does).
      // What it may not do is grow a second inline title EDITOR for a task row.
      expect(
        /aria-label={`Rename /.test(text),
        `${path} builds its own inline rename input; use TaskTitleEditor`,
      ).toBe(false);
    }
  });

  it("never sends a metadata choice to a record Drawer", () => {
    /*
     * `task-move:` was the drawer key the Project field's "Search all Projects
     * and Areas…" opened — a full record editor for a one-value decision, which
     * is the friction this phase exists to remove (§11). It survives as a URL
     * the router still resolves (a bookmarked drawer must keep working), so
     * what is banned is a FIELD opening it.
     */
    for (const { path, text } of sources()) {
      if (!path.endsWith(".tsx")) continue;
      const body = code(text);
      if (!body.includes("task-move:")) continue;
      expect(
        /onSearchParents\s*:\s*\(\)\s*=>\s*openDrawer\(`task-move:/.test(body),
        `${path} opens the Task record from a metadata field; open the shared Picker`,
      ).toBe(false);
    }
  });

  it("builds every priority and status list from the module that owns it", () => {
    /*
     * DHDS-09 removed eight hand-built priority lists; DHDS-10 adds status and
     * asset-state choices and must not reintroduce the pattern. A control that
     * spells its own vocabulary is a control that will disagree with the row
     * behind it.
     */
    const forbidden: readonly { readonly re: RegExp; readonly use: string }[] =
      [
        {
          re: /value:\s*"p1"[\s\S]{0,120}value:\s*"p2"/,
          use: "TASK_PRIORITY_OPTIONS",
        },
        {
          re: /value:\s*"planned"[\s\S]{0,120}value:\s*"active"[\s\S]{0,120}value:\s*"on_hold"/,
          use: "PROJECT_WORKFLOW_STATUSES",
        },
        {
          re: /value:\s*"stored"[\s\S]{0,160}value:\s*"loaned"/,
          use: "ASSET_STATUSES",
        },
      ];
    for (const { path, text } of sources()) {
      if (!path.endsWith(".tsx") && !path.endsWith(".ts")) continue;
      // The owning modules are where the lists legitimately live.
      if (
        path === "shared/task-record/priority-options.ts" ||
        path.startsWith("kernel/")
      ) {
        continue;
      }
      const body = code(text);
      for (const { re, use } of forbidden) {
        expect(
          re.test(body),
          `${path} spells its own option vocabulary; derive it from ${use}`,
        ).toBe(false);
      }
    }
  });

  it("opens every inline choice on a DHDS-09 surface", () => {
    /*
     * The four fields are the only things allowed to decide what a choice
     * floats in, and each of them composes a shared surface. A field that
     * built its own popover would be the "second floating surface" DHDS-09 §23
     * calls a bug.
     */
    const fields = [
      "shared/inline-edit/InlineSelectField.tsx",
      "shared/inline-edit/InlinePickerField.tsx",
      "shared/inline-edit/InlineDateField.tsx",
    ];
    for (const path of fields) {
      const text = readAppFile(path);
      expect(text).toMatch(/from "~\/shared\/floating"/);
    }
  });

  it("keeps the record context line and the card as reveal CONTEXTS", () => {
    /*
     * A `meta` field is only quiet inside one. These two are where DHDS-10 put
     * editable metadata that is not a Task row, so losing the declaration would
     * silently make every one of those fields loud again — a regression with no
     * type error and no failing render.
     */
    expect(readAppFile("shared/record-layout/RecordHeader.tsx")).toContain(
      'data-dh-action-context="true"',
    );
    expect(readAppFile("shared/card/Card.tsx")).toContain(
      'data-dh-action-context="true"',
    );
    expect(readAppFile("shared/task-record/TaskRow.tsx")).toContain(
      'data-dh-action-context="true"',
    );
  });
});
