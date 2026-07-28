/**
 * NOTES-05 — the heart of the live editor: turn the Markdown source's parse
 * tree into a set of CodeMirror decorations that STYLE the source in place, so
 * the document reads as formatted text while it is being typed (headings grow,
 * bold/italic/strikethrough/inline-code style, task items become checkboxes,
 * thematic breaks and tables render), WITHOUT ever leaving Markdown source.
 *
 * The one rule that makes this feel like Obsidian's Live Preview rather than a
 * WYSIWYG editor: a construct shows its *rendered* form only while the selection
 * is NOT inside it; move the caret into a heading, a link, a table… and its raw
 * Markdown source returns so it can be edited naturally. `isActive` encodes
 * that (the selection intersects the construct's range).
 *
 * This module is intentionally pure and free of the CodeMirror *view* — it takes
 * an `EditorState` and returns a `DecorationSet`, so every decoration position
 * is unit-tested directly against a parsed document with no browser. The only
 * `@codemirror/view` imports are the `Decoration`/`WidgetType` value factories,
 * which are plain data builders (their DOM is produced later, by the view).
 *
 * No HTML is emitted here and nothing is sanitised or rendered to HTML — the one
 * FND-08 pipeline remains the sole renderer/sanitiser (`markdown-boundary`
 * test). Styling is CSS classes on source ranges; the few widgets build DOM by
 * hand (`widgets.ts`), never `innerHTML`.
 */

import type { EditorState } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import { Decoration, type DecorationSet } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

import {
  HorizontalRuleWidget,
  ImagePlaceholderWidget,
  TableWidget,
  TaskCheckboxWidget,
} from "./widgets";

/** Hide a run of source (used for syntax markers when a construct is inactive). */
const CONCEAL = Decoration.replace({});

/** A callout header like `[!note]`, `[!warning] Title`. Captures the type. */
const CALLOUT_RE = /^\s*\[!([A-Za-z][\w-]*)\]/;

interface DecoRange {
  readonly from: number;
  readonly to: number;
  readonly value: Decoration;
}

/**
 * Build the full live-preview decoration set for `state`. Deterministic and
 * side-effect-free.
 */
export function buildLivePreviewDecorations(state: EditorState): DecorationSet {
  const ranges: DecoRange[] = [];
  const tree = syntaxTree(state);
  const doc = state.doc;

  /** Is any part of [from, to] within (or touching) the selection? If so the
   * construct is being edited and must show its raw source. */
  const isActive = (from: number, to: number): boolean =>
    state.selection.ranges.some((r) => r.from <= to && r.to >= from);

  const addLineClasses = (
    from: number,
    to: number,
    className: string,
  ): void => {
    let line = doc.lineAt(from);
    for (;;) {
      ranges.push({
        from: line.from,
        to: line.from,
        value: Decoration.line({ class: className }),
      });
      if (line.to >= to || line.number >= doc.lines) break;
      line = doc.lineAt(line.to + 1);
    }
  };

  const conceal = (from: number, to: number): void => {
    if (to > from) ranges.push({ from, to, value: CONCEAL });
  };

  const mark = (from: number, to: number, className: string): void => {
    if (to > from) {
      ranges.push({ from, to, value: Decoration.mark({ class: className }) });
    }
  };

  const childrenOfType = (node: SyntaxNode, type: string): SyntaxNode[] => {
    const out: SyntaxNode[] = [];
    for (let child = node.firstChild; child; child = child.nextSibling) {
      if (child.name === type) out.push(child);
    }
    return out;
  };

  const handleHeading = (node: SyntaxNode, level: number): void => {
    addLineClasses(node.from, node.to, `cm-dh-heading cm-dh-h${level}`);
    if (!isActive(node.from, node.to)) {
      // Hide the leading `#`s (and any trailing marker) plus the single space
      // after them, so the heading reads as a heading.
      for (const hm of childrenOfType(node, "HeaderMark")) {
        let to = hm.to;
        if (hm.from < node.to && doc.sliceString(hm.to, hm.to + 1) === " ") {
          to = hm.to + 1;
        }
        conceal(hm.from, to);
      }
    }
  };

  const handleInlineWrap = (
    node: SyntaxNode,
    markType: string,
    className: string,
  ): void => {
    mark(node.from, node.to, className);
    if (!isActive(node.from, node.to)) {
      for (const m of childrenOfType(node, markType)) conceal(m.from, m.to);
    }
  };

  const handleLink = (node: SyntaxNode): void => {
    const active = isActive(node.from, node.to);
    // Style the visible link text (between the first `[` and `]`).
    const marks = childrenOfType(node, "LinkMark");
    if (marks.length >= 2) {
      mark(marks[0].to, marks[1].from, "cm-dh-link");
    }
    if (!active) {
      // Hide every `[` `]` `(` `)`, the URL and any title — leaving just the
      // styled text. The destination is never turned into a real href here;
      // link resolution/sanitisation stays in the FND-08 pipeline.
      for (const m of marks) conceal(m.from, m.to);
      for (const u of childrenOfType(node, "URL")) conceal(u.from, u.to);
      for (const t of childrenOfType(node, "LinkTitle")) conceal(t.from, t.to);
    }
  };

  const handleImage = (node: SyntaxNode): void => {
    if (isActive(node.from, node.to)) return;
    let alt = "";
    const marks = childrenOfType(node, "LinkMark");
    if (marks.length >= 2) {
      alt = doc.sliceString(marks[0].to, marks[1].from);
    }
    ranges.push({
      from: node.from,
      to: node.to,
      value: Decoration.replace({ widget: new ImagePlaceholderWidget(alt) }),
    });
  };

  const handleBlockquote = (node: SyntaxNode): void => {
    const firstLine = doc.lineAt(node.from);
    const calloutMatch = CALLOUT_RE.exec(
      firstLine.text.replace(/^\s*>\s?/, ""),
    );
    const active = isActive(node.from, node.to);
    if (calloutMatch) {
      const type = calloutMatch[1].toLowerCase();
      addLineClasses(node.from, node.to, `cm-dh-callout cm-dh-callout-${type}`);
    } else {
      addLineClasses(node.from, node.to, "cm-dh-quote");
    }
    if (!active) {
      for (const qm of childrenOfType(node, "QuoteMark")) {
        let to = qm.to;
        if (doc.sliceString(qm.to, qm.to + 1) === " ") to = qm.to + 1;
        conceal(qm.from, to);
      }
    }
  };

  const handleFencedCode = (node: SyntaxNode): void => {
    addLineClasses(node.from, node.to, "cm-dh-code-block");
  };

  const handleHorizontalRule = (node: SyntaxNode): void => {
    if (isActive(node.from, node.to)) return;
    const line = doc.lineAt(node.from);
    ranges.push({
      from: line.from,
      to: line.to,
      value: Decoration.replace({
        widget: new HorizontalRuleWidget(),
        block: true,
      }),
    });
  };

  const handleTable = (node: SyntaxNode): void => {
    if (isActive(node.from, node.to)) return;
    const startLine = doc.lineAt(node.from);
    const endLine = doc.lineAt(node.to);
    const source = doc.sliceString(startLine.from, endLine.to);
    ranges.push({
      from: startLine.from,
      to: endLine.to,
      value: Decoration.replace({
        widget: new TableWidget(source),
        block: true,
      }),
    });
  };

  const handleListItem = (node: SyntaxNode): void => {
    const task = childrenOfType(node, "Task")[0];
    if (!task) return;
    const marker = childrenOfType(task, "TaskMarker")[0];
    if (!marker) return;
    if (isActive(node.from, node.to)) return;
    // The state character lives between the brackets: `[ ]` / `[x]`.
    const markerText = doc.sliceString(marker.from, marker.to);
    const stateChar = markerText.slice(1, 2);
    const checked = stateChar.toLowerCase() === "x";
    // Hide the list bullet (`- `) so only the checkbox shows.
    const listMark = childrenOfType(node, "ListMark")[0];
    if (listMark) {
      let to = listMark.to;
      if (doc.sliceString(listMark.to, listMark.to + 1) === " ") {
        to = listMark.to + 1;
      }
      conceal(listMark.from, to);
    }
    ranges.push({
      from: marker.from,
      to: marker.to,
      value: Decoration.replace({
        widget: new TaskCheckboxWidget(checked, marker.from + 1),
      }),
    });
  };

  const walk = (node: SyntaxNode): void => {
    switch (node.name) {
      case "ATXHeading1":
      case "SetextHeading1":
        handleHeading(node, 1);
        break;
      case "ATXHeading2":
      case "SetextHeading2":
        handleHeading(node, 2);
        break;
      case "ATXHeading3":
        handleHeading(node, 3);
        break;
      case "ATXHeading4":
        handleHeading(node, 4);
        break;
      case "ATXHeading5":
        handleHeading(node, 5);
        break;
      case "ATXHeading6":
        handleHeading(node, 6);
        break;
      case "StrongEmphasis":
        handleInlineWrap(node, "EmphasisMark", "cm-dh-strong");
        break;
      case "Emphasis":
        handleInlineWrap(node, "EmphasisMark", "cm-dh-em");
        break;
      case "Strikethrough":
        handleInlineWrap(node, "StrikethroughMark", "cm-dh-strike");
        break;
      case "InlineCode":
        handleInlineWrap(node, "CodeMark", "cm-dh-inline-code");
        break;
      case "Link":
        handleLink(node);
        break;
      case "Image":
        handleImage(node);
        break;
      case "Blockquote":
        handleBlockquote(node);
        break;
      case "FencedCode":
        handleFencedCode(node);
        break;
      case "HorizontalRule":
        handleHorizontalRule(node);
        break;
      case "Table":
        handleTable(node);
        return; // don’t descend into cells — the widget owns the whole block
      case "ListItem":
        handleListItem(node);
        break;
      default:
        break;
    }
    for (let child = node.firstChild; child; child = child.nextSibling) {
      walk(child);
    }
  };

  walk(tree.topNode);

  return Decoration.set(
    ranges.map((r) => r.value.range(r.from, r.to)),
    true,
  );
}
