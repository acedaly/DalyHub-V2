/**
 * NOTES-05 — the writing editor's formatting action catalogue (pure,
 * React-free). Promoted to `~/shared/markdown-editor` from the NOTES-04
 * Notes-local toolbar so the one writing-first editor (Notes now, Diary next)
 * shares a single action catalogue.
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

export interface MarkdownFormattingAction {
  /** Stable identifier (also the test/query hook). */
  readonly id: string;
  /** Visible button text AND accessible name — a plain, unambiguous word. */
  readonly label: string;
  /** Longer tooltip/help text describing what the action inserts. */
  readonly hint: string;
  /**
   * Optional keyboard shortcut, shown in the tooltip and bound in the editor
   * keymap. Uses the `Mod` convention (⌘ on macOS, Ctrl elsewhere), e.g.
   * `Mod-b`. Actions without one are toolbar-only.
   */
  readonly shortcut?: string;
  /**
   * MOBILE-01 — whether this action is offered DIRECTLY in the toolbar.
   *
   * Only the formatting a writer reaches for constantly earns a permanent
   * button; the rest sit one tap away behind the toolbar's "More" toggle. A
   * permanently visible row of eleven controls is chrome that costs a phone the
   * rows it needs for writing — and makes the frequent commands harder to hit,
   * not easier, because every one is further along a scrolling row.
   *
   * Defaults to false (secondary).
   */
  readonly primary?: boolean;
  /** The pure Markdown-source transform this action applies. */
  readonly transform: MarkdownTransform;
}

/**
 * The catalogue, in reading/keyboard order: emphasis first (the most common
 * quick formatting), then block structures, then insertions. This ordering is
 * also the roving-tabindex order in the toolbar.
 *
 * MOBILE-01 marks six of them `primary`. Those render directly; the remaining
 * five (Numbered, Quote, Code, Code block, Table) sit behind the toolbar's
 * "More" toggle — still in the same toolbar, still one Tab stop, still fully
 * keyboard-reachable, but no longer occupying a phone's writing space by
 * default.
 */
export const MARKDOWN_FORMATTING_ACTIONS: readonly MarkdownFormattingAction[] =
  [
    {
      id: "heading",
      primary: true,
      label: "Heading",
      hint: "Turn the line into a heading (cycles heading level)",
      transform: headingTransform,
    },
    {
      id: "bold",
      primary: true,
      label: "Bold",
      hint: "Bold the selected text (**text**)",
      shortcut: "Mod-b",
      transform: boldTransform,
    },
    {
      id: "italic",
      primary: true,
      label: "Italic",
      hint: "Italicise the selected text (_text_)",
      shortcut: "Mod-i",
      transform: italicTransform,
    },
    {
      id: "bulleted-list",
      primary: true,
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
      primary: true,
      label: "Checklist",
      hint: "Make a checklist (- [ ] item)",
      shortcut: "Mod-Shift-9",
      transform: checklistTransform,
    },
    {
      id: "blockquote",
      label: "Quote",
      hint: "Quote the selected lines",
      shortcut: "Mod-Shift-.",
      transform: blockquoteTransform,
    },
    {
      id: "link",
      primary: true,
      label: "Link",
      hint: "Insert a Markdown link",
      shortcut: "Mod-k",
      transform: linkTransform,
    },
    {
      id: "inline-code",
      label: "Code",
      hint: "Format as inline code",
      shortcut: "Mod-e",
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

/** The actions offered directly in the toolbar (MOBILE-01). */
export const PRIMARY_FORMATTING_ACTIONS: readonly MarkdownFormattingAction[] =
  MARKDOWN_FORMATTING_ACTIONS.filter((action) => action.primary === true);

/** The actions behind the toolbar's "More" toggle (MOBILE-01). */
export const SECONDARY_FORMATTING_ACTIONS: readonly MarkdownFormattingAction[] =
  MARKDOWN_FORMATTING_ACTIONS.filter((action) => action.primary !== true);
