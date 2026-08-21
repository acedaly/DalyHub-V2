/**
 * DHDS-11 — the drag grammar stays ONE grammar.
 *
 * Contract tests over the repository, in the shape DHDS-08's motion grammar,
 * DHDS-09's floating grammar and DHDS-10's inline grammar established. What is
 * worth protecting is not any particular grip; it is that there is exactly one
 * place each of these comes from:
 *
 *   - the session, the preview, the announcements and the keyboard grammar
 *     (`~/shared/drag`);
 *   - the states a drag paints (`drag.css`);
 *   - the DECISION about what a Task destination means
 *     (`modules/tasks/task-drop-targets.ts`);
 *   - the mutation a drop performs — which is always the canonical intent the
 *     contextual control beside it posts, and never a drag-only path.
 *
 * DHDS-11 began by REMOVING a second implementation: DS-04's
 * `ReorderableCardCollection`, with its own grip, its own announcements and its
 * own order model, used by a design fixture and by nothing in the product.
 * These tests exist so the next one has to be argued for rather than merged.
 *
 * They are deliberately narrow. They do not ban `pointermove` — a swipe, a
 * resize and a long-press legitimately use it. They ban the specific shapes
 * that mean "a second drag system is being built".
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { appRelative, appSourceFiles } from "../tokens/token-css";

const STYLES = join(process.cwd(), "app", "styles");

function stylesheet(name: string): string {
  return readFileSync(join(STYLES, name), "utf8");
}

function sources(): readonly {
  readonly path: string;
  readonly text: string;
}[] {
  return appSourceFiles().map((file) => ({
    path: appRelative(file),
    text: readFileSync(file, "utf8"),
  }));
}

/** Strip comments, so a rule cannot be "broken" by prose explaining it. */
function code(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");
}

const inDragModule = (path: string) => path.startsWith("shared/drag/");

/** Split a stylesheet into `selector { declarations }` rules. Crude on purpose. */
function rules(css: string): readonly { selector: string; body: string }[] {
  const out: { selector: string; body: string }[] = [];
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(css)) !== null) {
    out.push({
      selector: match[1]!.trim().replace(/\s+/g, " "),
      body: match[2]!,
    });
  }
  return out;
}

describe("DHDS-11 — one drag engine", () => {
  it("uses NO HTML5 drag-and-drop anywhere in the product", () => {
    /*
     * `dragstart`/`dataTransfer`/`draggable` cannot be driven from a keyboard,
     * are unusable on touch, and draw a browser bitmap instead of a DalyHub
     * object. Every one of those is a rule DHDS-11 states positively, so the
     * API is banned outright rather than discouraged.
     */
    const offenders = sources()
      .filter(({ text }) =>
        /\bdraggable\s*[=:]|\bdataTransfer\b|\bonDragStart\b|\bondragstart\b|"dragstart"|'dragstart'/.test(
          code(text),
        ),
      )
      .map(({ path }) => path);
    expect(
      offenders,
      `HTML5 drag-and-drop has no keyboard or touch path — use ~/shared/drag:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("starts a drag only from the shared session", () => {
    const offenders = sources()
      .filter(({ path }) => !inDragModule(path))
      .filter(({ text }) =>
        /\bstartPointerDrag\s*\(|\bstartKeyboardDrag\s*\(/.test(code(text)),
      )
      .map(({ path }) => path);
    expect(
      offenders,
      `compose useDragHandle instead of driving the session directly:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps the drag module free of any mutation of its own", () => {
    /*
     * The hard architectural requirement (§42 of the brief): a semantic move
     * calls the same operation as the contextual control that performs it. The
     * engine hands the payload back to the surface and knows nothing about
     * routes, intents or records.
     */
    const offenders = sources()
      .filter(({ path }) => inDragModule(path))
      .filter(({ text }) =>
        /\bfetch\s*\(|useFetcher|useRevalidator|useSubmit/.test(code(text)),
      )
      .map(({ path }) => path);
    expect(
      offenders,
      `the drag session must not mutate — onDrop hands back to the surface:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("has removed DS-04's parallel reorder collection", () => {
    const offenders = sources()
      .filter(({ text }) =>
        /ReorderableCardCollection|CardReorderHandle/.test(code(text)),
      )
      .map(({ path }) => path);
    expect(
      offenders,
      `the second drag system is gone — compose SortableList:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});

describe("DHDS-11 — one set of drag STATES", () => {
  /**
   * The STATES a drag paints. Each is a fact about the drag SESSION rather than
   * about any one surface, so a second declaration of one is a second opinion
   * about what a drag looks like.
   *
   * `.dh-drag-handle` is deliberately NOT in this list. A surface PLACING its
   * own grip — a track width, an alignment, or DHDS-11's rule that a Task row
   * has no grip on a coarse pointer — is composition, and the cascade note in
   * `app.css` requires exactly that to be possible without `!important`. What a
   * surface may not do is repaint the grip, which the next test asserts.
   */
  const DRAG_STATES = [
    ".dh-drag-preview",
    "[data-dh-drag-source",
    "[data-dh-drop-candidate",
    "[data-dh-drop-active",
    ".dh-drag-layer",
  ];

  it("declares every one of them in drag.css and nowhere else", () => {
    const drag = stylesheet("drag.css");
    for (const selector of [...DRAG_STATES, ".dh-drag-handle"]) {
      expect(drag, `${selector} belongs in drag.css`).toContain(selector);
    }
    const offenders: string[] = [];
    for (const { path, text } of sources()) {
      if (!path.endsWith(".css") || path.endsWith("styles/drag.css")) continue;
      for (const selector of DRAG_STATES) {
        if (code(text).includes(selector)) {
          offenders.push(`${path}: ${selector}`);
        }
      }
    }
    expect(
      offenders,
      `a drag state is declared twice:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("lets a surface PLACE the grip, and never repaint it", () => {
    const offenders: string[] = [];
    for (const { path, text } of sources()) {
      if (!path.endsWith(".css") || path.endsWith("styles/drag.css")) continue;
      for (const { selector, body } of rules(code(text))) {
        if (!selector.includes(".dh-drag-handle")) continue;
        if (
          /\b(color|background(-color)?|border(-color|-width)?)\s*:/.test(body)
        ) {
          offenders.push(`${path}: ${selector}`);
        }
      }
    }
    expect(
      offenders,
      `the grip's appearance belongs to drag.css:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("has exactly ONE grip cursor in the product", () => {
    const offenders = sources()
      .filter(({ path }) => path.endsWith(".css"))
      .filter(({ path }) => !path.endsWith("styles/drag.css"))
      .filter(({ text }) => /cursor:\s*grab(bing)?/.test(code(text)))
      .map(({ path }) => path);
    expect(
      offenders,
      `the grab cursor belongs to the shared handle:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("spells no drag motion of its own — DHDS-08 owns durations and curves", () => {
    const drag = code(stylesheet("drag.css"));
    const rawDurations = drag.match(
      /(?:transition|animation)[^;]*?\b\d+m?s\b/g,
    );
    expect(rawDurations ?? []).toEqual([]);
    expect(drag).not.toMatch(/cubic-bezier\(/);
    // …and it uses the published rungs.
    expect(drag).toMatch(/--dh-motion-(base|fast)/);
    expect(drag).toMatch(/--dh-ease-(emphasized|standard)/);
  });

  it("states a reduced-motion contract rather than relying on the global floor", () => {
    expect(stylesheet("drag.css")).toContain("prefers-reduced-motion: reduce");
  });

  it("draws the drag in forced colours, where every shadow is discarded", () => {
    const drag = stylesheet("drag.css");
    const forced = drag.slice(drag.indexOf("forced-colors: active"));
    expect(forced).toContain(".dh-drag-preview");
    expect(forced).toContain("[data-dh-drop-active");
  });
});

describe("DHDS-11 — the destination decision lives in one place", () => {
  it("maps a BUCKET to an intent in exactly one file", () => {
    /*
     * `set_parent`, `set_priority`, `set_status` and `set_sector` are posted all
     * over the Tasks module — by the bulk bar, by the row's own controls, by the
     * record — and that is correct: they are the canonical intents, and a drop
     * reusing them is the whole point. What must not happen twice is the
     * TRANSLATION: which grouping bucket means which intent, and with what
     * value. Everything that translation needs is named `TASK_DROP_*`, so a
     * second translator is a file that reaches for one of those names and then
     * spells an intent for itself.
     */
    const offenders = sources()
      .filter(({ path }) => path !== "modules/tasks/task-drop-targets.ts")
      .filter(({ text }) => {
        const body = code(text);
        return (
          /\bTASK_DROP_/.test(body) &&
          /intent:\s*"set_(parent|priority|status|sector)"/.test(body)
        );
      })
      .map(({ path }) => path);
    expect(
      offenders,
      `a drop's meaning belongs in task-drop-targets.ts:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("keeps the drop-target module free of React and of any request", () => {
    const text = code(
      readFileSync(
        join(process.cwd(), "app", "modules", "tasks", "task-drop-targets.ts"),
        "utf8",
      ),
    );
    expect(text).not.toMatch(/from "react"/);
    expect(text).not.toMatch(/\bfetch\s*\(/);
  });
});

describe("DHDS-11 — stable identity", () => {
  it("keys every sortable row by its canonical id, in the list itself", () => {
    /*
     * A reorderable row keyed by its index remounts every sibling on every
     * move: focus is lost, an in-flight edit is discarded, and the exit
     * animation plays on the wrong object. This is a FUNCTIONAL requirement of
     * the phase, not a React optimisation.
     *
     * The key is not a consumer's decision — `SortableList` owns it — so this
     * asserts the one place it is written.
     */
    const list = code(
      readFileSync(
        join(process.cwd(), "app", "shared", "drag", "SortableList.tsx"),
        "utf8",
      ),
    );
    expect(list).toContain("key={itemId}");
    expect(list).not.toMatch(/key=\{\s*index\s*\}/);
  });

  it("never derives an item's identity from its position", () => {
    const offenders = sources()
      .filter(({ text }) =>
        /getItemId=\{\s*\([^)]*,\s*(index|i)\s*\)/.test(code(text)),
      )
      .map(({ path }) => path);
    expect(
      offenders,
      `an item's id is the record's id, never where it happens to sit:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });

  it("registers every destination under a stable id, never an index", () => {
    const offenders = sources()
      .filter(({ text }) => /id:\s*`[^`]*\$\{\s*index\s*\}/.test(code(text)))
      .filter(({ text }) => /useDropTarget\s*\(/.test(code(text)))
      .map(({ path }) => path);
    expect(
      offenders,
      `a destination keyed by an index changes when the page does:\n${offenders.join("\n")}`,
    ).toEqual([]);
  });
});
