/**
 * NOTES-04 — the Notes writing toolbar's action catalogue (pure, React-free).
 *
 * Each action pairs a stable id + an accessible label (also the tooltip) with
 * one of the pure `markdown-transforms.ts` functions. Keeping the catalogue as
 * plain data — with no React or DOM — lets the toolbar's contents be asserted
 * directly in a unit test (every action has a non-empty accessible label, ids
 * are unique, every transform is one of the exported source transforms) and
 * keeps the component itself a thin renderer.
 *
 * `title` is a short, unambiguous word (never an unlabelled icon): it is BOTH
 * the button's visible text and its accessible name, so sighted, keyboard and
 * screen-reader users all get the same unambiguous meaning. `hint` is the
 * longer `title`/tooltip text explaining the Markdown it inserts.
 */

import {
  blockquoteTransform,
  boldTransform,
  bulletListTransform,
  checklistTransform,
  codeBlockTransform,
  headingTransform,
  inlineCodeTransform,
  italicTransform,
  linkTransform,
  numberedListTransform,
  tableTransform,
  type MarkdownTransform,
} from "./markdown-transforms";

export interface NoteFormattingAction {
  /** Stable identifier (also the test/query hook). */
  readonly id: string;
  /** Visible button text AND accessible name — a plain, unambiguous word. */
  readonly label: string;
  /** Longer tooltip/help text describing what the action inserts. */
  readonly hint: string;
  /** The pure Markdown-source transform this action applies. */
  readonly transform: MarkdownTransform;
}

/**
 * The catalogue, in reading/keyboard order: emphasis first (the most common
 * quick formatting), then block structures, then insertions. This ordering is
 * also the roving-tabindex order in the toolbar.
 */
export const NOTE_FORMATTING_ACTIONS: readonly NoteFormattingAction[] = [
  {
    id: "heading",
    label: "Heading",
    hint: "Turn the line into a heading (cycles heading level)",
    transform: headingTransform,
  },
  {
    id: "bold",
    label: "Bold",
    hint: "Bold the selected text (**text**)",
    transform: boldTransform,
  },
  {
    id: "italic",
    label: "Italic",
    hint: "Italicise the selected text (_text_)",
    transform: italicTransform,
  },
  {
    id: "bulleted-list",
    label: "Bullets",
    hint: "Make a bulleted list",
    transform: bulletListTransform,
  },
  {
    id: "numbered-list",
    label: "Numbered",
    hint: "Make a numbered list",
    transform: numberedListTransform,
  },
  {
    id: "checklist",
    label: "Checklist",
    hint: "Make a checklist (- [ ] item)",
    transform: checklistTransform,
  },
  {
    id: "blockquote",
    label: "Quote",
    hint: "Quote the selected lines",
    transform: blockquoteTransform,
  },
  {
    id: "link",
    label: "Link",
    hint: "Insert a Markdown link",
    transform: linkTransform,
  },
  {
    id: "inline-code",
    label: "Code",
    hint: "Format as inline code",
    transform: inlineCodeTransform,
  },
  {
    id: "code-block",
    label: "Code block",
    hint: "Insert a fenced code block",
    transform: codeBlockTransform,
  },
  {
    id: "table",
    label: "Table",
    hint: "Insert a Markdown table",
    transform: tableTransform,
  },
];
