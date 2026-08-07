/**
 * NOTES-05 / EDIT-01 — the writing editor's formatting action catalogue (pure,
 * React-free apart from the icon component each action names).
 *
 * Each action pairs a stable id + an accessible label (also the tooltip) with
 * one of the pure `markdown-transforms.ts` functions, the glyph that draws it,
 * and the GROUP it belongs to. Keeping the catalogue as plain data lets the
 * toolbar's contents be asserted directly in a unit test (every action has a
 * non-empty accessible label and an icon, ids are unique, every transform is one
 * of the exported source transforms) and keeps the component a thin renderer.
 *
 * ── EDIT-01: icons with names, not words ─────────────────────────────────────
 * NOTES-04/05 rendered the WORD as the button ("Bold", "Checklist", "Code
 * block"), which is unambiguous but costs a phone most of its writing space and
 * reads nothing like the editors this product is measured against. The words are
 * now the ACCESSIBLE NAME and the tooltip while the glyph is the visible
 * treatment — the same information, an order of magnitude less chrome. Nothing
 * is icon-ONLY in the accessibility sense: `label` is still on every control.
 *
 * ── What is NOT here, and why ────────────────────────────────────────────────
 * **Underline.** CommonMark and GFM have no underline node; the only way to
 * produce one is raw `<u>`, which the FND-08 sanitising renderer strips. A
 * control that silently does nothing is worse than an absent one, so underline
 * is deliberately absent (AGENTS.md §9.7 — the canonical format decides what the
 * toolbar may offer, never the other way round).
 *
 * **Undo/redo.** They are history commands, not source transforms: they belong
 * to the editing SURFACE, not to the Markdown. `EditorToolbar` renders them from
 * host-supplied handlers with their own enabled state.
 */

import type { ComponentType } from "react";

import {
  BoldIcon,
  BulletListIcon,
  ChecklistIcon,
  ClearFormattingIcon,
  CodeBlockIcon,
  CodeIcon,
  HeadingIcon,
  ItalicIcon,
  LinkIcon,
  NumberedListIcon,
  QuoteIcon,
  StrikethroughIcon,
  TableIcon,
  type IconProps,
} from "~/shared/icons";

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
  removeFormattingTransform,
  strikethroughTransform,
  tableTransform,
  type MarkdownTransform,
} from "./markdown-transforms";

/**
 * The toolbar's visual grouping. Related controls sit together and a hairline
 * separator divides the groups — spacing and a rule rather than a border around
 * every button, which is what made the old row read as a strip of tiles.
 */
export type FormattingGroup = "emphasis" | "block" | "insert" | "clean";

export const FORMATTING_GROUP_ORDER: readonly FormattingGroup[] = [
  "emphasis",
  "block",
  "insert",
  "clean",
];

export interface MarkdownFormattingAction {
  /** Stable identifier (also the test/query hook). */
  readonly id: string;
  /** The button's ACCESSIBLE NAME — a plain, unambiguous word. */
  readonly label: string;
  /**
   * The TOOLTIP's text: what the action does, in a phrase.
   *
   * M3-TIP — it deliberately does NOT spell the keyboard shortcut. That used to
   * be written in here ("Bold (⌘B / Ctrl+B)") because the browser `title`
   * attribute is a single string with nowhere else to put it; the shared tooltip
   * renders `shortcut` itself, through the one platform-correct formatter, so
   * repeating it here would print it twice and on the wrong platform half the
   * time.
   */
  readonly hint: string;
  /** The glyph rendered inside the button. Decorative; `label` names it. */
  readonly icon: ComponentType<IconProps>;
  /** Which visual group the control belongs to. */
  readonly group: FormattingGroup;
  /**
   * Optional keyboard shortcut, bound in the editor keymap and rendered as a
   * chip by the shared tooltip. Uses the `Mod` convention (⌘ on macOS, Ctrl
   * elsewhere), e.g. `Mod-b`. Actions without one are toolbar-only.
   */
  readonly shortcut?: string;
  /**
   * Whether this action is offered DIRECTLY in the toolbar. The rest sit one tap
   * away behind the toolbar's "More" toggle — still the same toolbar, still one
   * Tab stop, still Arrow-key reachable.
   *
   * Defaults to false (secondary).
   */
  readonly primary?: boolean;
  /**
   * Whether the control reports an ACTIVE state (`aria-pressed`) derived from
   * the selection by `formatting-state.ts`. False for one-shot insertions like
   * "table", which are not a state the text can be IN.
   */
  readonly stateful?: boolean;
  /** The pure Markdown-source transform this action applies. */
  readonly transform: MarkdownTransform;
}

/**
 * The catalogue, in reading/keyboard order: emphasis first (the most common
 * quick formatting), then block structures, then insertions, then the cleaner.
 * This ordering is also the roving-tabindex order in the toolbar.
 */
export const MARKDOWN_FORMATTING_ACTIONS: readonly MarkdownFormattingAction[] =
  [
    {
      id: "bold",
      primary: true,
      stateful: true,
      group: "emphasis",
      label: "Bold",
      hint: "Bold",
      icon: BoldIcon,
      shortcut: "Mod-b",
      transform: boldTransform,
    },
    {
      id: "italic",
      primary: true,
      stateful: true,
      group: "emphasis",
      label: "Italic",
      hint: "Italic",
      icon: ItalicIcon,
      shortcut: "Mod-i",
      transform: italicTransform,
    },
    {
      id: "strikethrough",
      primary: true,
      stateful: true,
      group: "emphasis",
      label: "Strikethrough",
      hint: "Strikethrough",
      icon: StrikethroughIcon,
      shortcut: "Mod-Shift-x",
      transform: strikethroughTransform,
    },
    {
      id: "heading",
      primary: true,
      stateful: true,
      group: "block",
      label: "Heading",
      hint: "Heading — press again to change level",
      icon: HeadingIcon,
      transform: headingTransform,
    },
    {
      id: "bulleted-list",
      primary: true,
      stateful: true,
      group: "block",
      label: "Bulleted list",
      hint: "Bulleted list",
      icon: BulletListIcon,
      transform: bulletListTransform,
    },
    {
      id: "numbered-list",
      primary: true,
      stateful: true,
      group: "block",
      label: "Numbered list",
      hint: "Numbered list",
      icon: NumberedListIcon,
      transform: numberedListTransform,
    },
    {
      id: "checklist",
      primary: true,
      stateful: true,
      group: "block",
      label: "Checklist",
      hint: "Checklist",
      icon: ChecklistIcon,
      shortcut: "Mod-Shift-9",
      transform: checklistTransform,
    },
    {
      id: "blockquote",
      stateful: true,
      group: "block",
      label: "Quote",
      hint: "Quote the selected lines",
      icon: QuoteIcon,
      shortcut: "Mod-Shift-.",
      transform: blockquoteTransform,
    },
    {
      id: "link",
      primary: true,
      group: "insert",
      label: "Link",
      hint: "Insert a link",
      icon: LinkIcon,
      shortcut: "Mod-k",
      transform: linkTransform,
    },
    {
      id: "inline-code",
      stateful: true,
      group: "insert",
      label: "Code",
      hint: "Format as inline code",
      icon: CodeIcon,
      shortcut: "Mod-e",
      transform: inlineCodeTransform,
    },
    {
      id: "code-block",
      group: "insert",
      label: "Code block",
      hint: "Insert a fenced code block",
      icon: CodeBlockIcon,
      transform: codeBlockTransform,
    },
    {
      id: "table",
      group: "insert",
      label: "Table",
      hint: "Insert a table",
      icon: TableIcon,
      transform: tableTransform,
    },
    {
      id: "remove-formatting",
      primary: true,
      group: "clean",
      label: "Remove formatting",
      hint: "Remove emphasis and code marks from the selection",
      icon: ClearFormattingIcon,
      transform: removeFormattingTransform,
    },
  ];

/** The actions offered directly in the toolbar. */
export const PRIMARY_FORMATTING_ACTIONS: readonly MarkdownFormattingAction[] =
  MARKDOWN_FORMATTING_ACTIONS.filter((action) => action.primary === true);

/** The actions behind the toolbar's "More" toggle. */
export const SECONDARY_FORMATTING_ACTIONS: readonly MarkdownFormattingAction[] =
  MARKDOWN_FORMATTING_ACTIONS.filter((action) => action.primary !== true);
