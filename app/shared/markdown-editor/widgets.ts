/**
 * NOTES-05 — CodeMirror widgets for the live writing editor.
 *
 * Each widget REPLACES a run of Markdown source with a small rendered element
 * ONLY while the cursor is not inside that construct (see `live-decorations.ts`);
 * move the caret into it and the raw source returns, so editing stays natural.
 *
 * Every widget builds its DOM with `document.createElement` + `textContent`
 * (and, for the checkbox, a native `<input>`), never an HTML-string sink. That
 * keeps the FND-08 "one HTML sink" invariant
 * (`test/unit/markdown-boundary.test.ts`) completely intact: the live editor
 * introduces no second HTML-injection sink and no second sanitiser. Widget
 * content is either plain text the user typed or fixed, safe markup we build by
 * hand — user URLs are never fetched or turned into `href`/`src`, matching the
 * FND-08 remote-image and link policies.
 */

import { EditorView, WidgetType } from "@codemirror/view";

import { parseTableSource, type TableAlign } from "./table-source";

/** A thematic break (`---`/`***`/`___`) rendered as a real horizontal rule. */
export class HorizontalRuleWidget extends WidgetType {
  eq(): boolean {
    // All horizontal rules render identically.
    return true;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-dh-hr";
    wrap.setAttribute("aria-hidden", "true");
    wrap.appendChild(document.createElement("hr"));
    return wrap;
  }

  get estimatedHeight(): number {
    return 24;
  }
}

/**
 * An interactive task-list checkbox replacing the `[ ]` / `[x]` marker. Toggling
 * it dispatches a one-character source edit (`[ ]` ↔ `[x]`) through the normal
 * transaction path, so the Markdown source stays the single source of truth and
 * the change flows through autosave exactly like a keystroke.
 */
export class TaskCheckboxWidget extends WidgetType {
  constructor(
    readonly checked: boolean,
    /** Document offset of the state character (between the brackets). */
    readonly statePos: number,
  ) {
    super();
  }

  eq(other: TaskCheckboxWidget): boolean {
    return other.checked === this.checked && other.statePos === this.statePos;
  }

  toDOM(view: EditorView): HTMLElement {
    const label = document.createElement("label");
    label.className = "cm-dh-task";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.className = "cm-dh-task__checkbox";
    input.checked = this.checked;
    input.setAttribute(
      "aria-label",
      this.checked ? "Mark task not done" : "Mark task done",
    );
    input.addEventListener("mousedown", (event) => {
      // Preempt the editor's own selection handling and toggle the source.
      event.preventDefault();
      const next = this.checked ? " " : "x";
      view.dispatch({
        changes: { from: this.statePos, to: this.statePos + 1, insert: next },
      });
      view.focus();
    });
    label.appendChild(input);
    return label;
  }

  ignoreEvent(event: Event): boolean {
    // Let the checkbox handle its own pointer events; ignore everything else so
    // CodeMirror keeps ownership of keyboard/selection.
    return event.type === "mousedown";
  }
}

/**
 * A non-fetching image placeholder for `![alt](url)`. FND-08 forbids emitting
 * an `<img>` or making any network request for a Markdown image; the live
 * editor honours the same policy — the placeholder shows a picture glyph and
 * the alt text, never the remote image.
 */
export class ImagePlaceholderWidget extends WidgetType {
  constructor(readonly alt: string) {
    super();
  }

  eq(other: ImagePlaceholderWidget): boolean {
    return other.alt === this.alt;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("span");
    wrap.className = "cm-dh-image";
    const glyph = document.createElement("span");
    glyph.className = "cm-dh-image__glyph";
    glyph.setAttribute("aria-hidden", "true");
    glyph.textContent = "🖼";
    const text = document.createElement("span");
    text.className = "cm-dh-image__label";
    text.textContent = this.alt.trim().length > 0 ? this.alt : "Image";
    wrap.appendChild(glyph);
    wrap.appendChild(text);
    return wrap;
  }
}

/** A rendered GFM table built by hand from the parsed source (plain-text cells). */
export class TableWidget extends WidgetType {
  constructor(readonly source: string) {
    super();
  }

  eq(other: TableWidget): boolean {
    return other.source === this.source;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "cm-dh-table";
    const parsed = parseTableSource(this.source);
    if (!parsed) {
      // No recognisable delimiter row — show the raw source rather than an
      // empty table (defensive; the caller only builds this for Table nodes).
      wrap.textContent = this.source;
      return wrap;
    }
    const table = document.createElement("table");
    const applyAlign = (cell: HTMLElement, align: TableAlign | null): void => {
      if (align) {
        cell.style.textAlign = align;
      }
    };

    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");
    parsed.headers.forEach((header, index) => {
      const th = document.createElement("th");
      th.textContent = header;
      applyAlign(th, parsed.aligns[index] ?? null);
      headRow.appendChild(th);
    });
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement("tbody");
    for (const row of parsed.rows) {
      const tr = document.createElement("tr");
      for (let index = 0; index < parsed.headers.length; index += 1) {
        const td = document.createElement("td");
        td.textContent = row[index] ?? "";
        applyAlign(td, parsed.aligns[index] ?? null);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    return wrap;
  }
}
