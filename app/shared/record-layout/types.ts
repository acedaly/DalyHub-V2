/**
 * DS-02 — the Shared Record Layout public contract.
 *
 * One reusable, ENTITY-AGNOSTIC scaffold that every record view (Area, Goal,
 * Project, Task, Person, Note, …) composes: header, summary, tabs and a
 * state-aware content region (DESIGN_SYSTEM.md → Record Header / Summary Panel /
 * Tabs). The layout knows nothing about any specific entity type — callers pass
 * plain, typed data. The API is intentionally small and documented; add a field
 * only when a real record needs it.
 */

import type { ReactNode } from "react";

import type { OverflowMenuItem } from "~/shared/overflow-menu";
import type { ProgressMeterProps } from "~/shared/progress";

/**
 * A semantic tone. Tones map to DS-01 colour tokens; they NEVER carry meaning by
 * colour alone — a tone is always paired with its text label.
 *
 * THEME-01 added three LIFECYCLE tones (`completed`, `waiting`, `on-hold`)
 * alongside the four feedback tones. They previously borrowed `success`,
 * `warning` and `neutral`, which read the same in the two original themes but says
 * the wrong thing: a task waiting on someone else is not a warning, and a theme
 * should be able to colour "paused" without changing what a real warning looks
 * like. Each has its own token triple in every theme.
 */
export type RecordTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "completed"
  | "waiting"
  | "on-hold";

/** A status pill shown in the record header (e.g. "In progress", "Done"). */
export interface RecordStatus {
  /** The visible, human status text (always present — status is not colour-only). */
  readonly label: string;
  /** Optional tone; defaults to `neutral`. */
  readonly tone?: RecordTone;
}

/** One step in the parent/context breadcrumb up the Area hierarchy. */
export interface RecordBreadcrumbItem {
  readonly id: string;
  readonly label: string;
  /** Optional in-app href; the current (last) item is typically hrefless. */
  readonly href?: string;
}

/**
 * A record action. Rendered as a link when `href` is set, otherwise a button.
 * Exactly one action in a header should be `primary`; the rest are `secondary`.
 */
export interface RecordAction {
  readonly id: string;
  /** The visible label (also the accessible name unless `ariaLabel` overrides). */
  readonly label: string;
  readonly href?: string;
  readonly onSelect?: () => void;
  readonly variant?: "primary" | "secondary";
  readonly disabled?: boolean;
  /** Accessible-name override (use when the visible label is terse or an icon). */
  readonly ariaLabel?: string;
}

/** A key/value metadata entry (header chips or summary description list). */
export interface RecordMetaItem {
  readonly id: string;
  readonly label: string;
  readonly value: ReactNode;
}

/** One tab in the record tab strip. */
export interface RecordTab {
  readonly id: string;
  readonly label: string;
  /** The panel content shown when this tab is active. */
  readonly content?: ReactNode;
  /** Disabled tabs are visible but not selectable/focusable. */
  readonly disabled?: boolean;
  /** Hidden tabs are omitted entirely (e.g. a tab not available for this record). */
  readonly hidden?: boolean;
  /** Optional trailing badge (e.g. a count). Decorative — not the accessible name. */
  readonly badge?: ReactNode;
  /**
   * RECORD-01 — whether this tab's panel draws the contained record surface.
   *
   * `panel` (the default) is the DS-14 contained surface every scannable tab
   * uses. `plain` is for a tab whose content ALREADY brings its own single
   * surface — the Note record's writing surface is the canonical case: the
   * shared editor deliberately draws one outline around its toolbar and its
   * text (EDIT-01), so a panel drawing a second one around that produced a
   * frame inside a frame, two left edges 21px apart, and a narrower column to
   * write in.
   *
   * It is a property of the CONTENT, not of the module, which is why it is
   * declared per tab rather than per record: the same Note record's Backlinks,
   * Links and Activity tabs are ordinary panels.
   */
  readonly surface?: "panel" | "plain";
}

/** Props for the record header region. */
export interface RecordHeaderProps {
  /** The record title (rendered as the record's heading). */
  readonly title: string;
  /**
   * DS-16 — an editable presentation of the title, rendered INSIDE the record's
   * heading element in place of the plain text.
   *
   * The `title` string stays required and stays the source of every derived
   * name (the overflow's accessible label, the tablist's, the document title),
   * so a record whose heading is interactive is still named the same way to
   * assistive tech as one whose heading is text. The slot only changes what the
   * heading RENDERS.
   */
  readonly titleSlot?: ReactNode;
  /** Heading element id, so the layout landmark can be `aria-labelledby` it. */
  readonly titleId?: string;
  /** Heading level for correct document outline; defaults to 1. */
  readonly headingLevel?: 1 | 2 | 3;
  /** Optional entity-type label (e.g. "Project"). */
  readonly typeLabel?: string;
  /** Optional entity icon/accent treatment (decorative; `typeLabel` names it). */
  readonly icon?: ReactNode;
  readonly status?: RecordStatus;
  readonly breadcrumb?: readonly RecordBreadcrumbItem[];
  readonly metadata?: readonly RecordMetaItem[];
  readonly primaryAction?: RecordAction;
  readonly secondaryActions?: readonly RecordAction[];
  /**
   * DS-12 — the overflow (⋯) menu: the ONE home for a record's secondary and
   * destructive actions (Archive / Restore / Delete). Rendered after the primary
   * action through the shared `OverflowMenu`, so every record in the product
   * carries the same affordance in the same place. An empty list renders nothing.
   */
  readonly overflowActions?: readonly OverflowMenuItem[];
  /** Accessible name for the overflow trigger. Defaults to `More actions for <title>`. */
  readonly overflowLabel?: string;
}

/**
 * RECORD-01 — one derived signal in the compact summary band: a short sentence,
 * optionally toned. The TEXT always carries the meaning; the tone only tints it.
 */
export interface RecordSignal {
  readonly id: string;
  readonly text: ReactNode;
  readonly tone?: "neutral" | "info" | "warning" | "danger" | "success";
}

/**
 * Props for the compact summary BAND (RECORD-01) — the replacement for the
 * per-module roll-up dashboard cards. Hard budget: one meter, one state chip,
 * one signal line, one context line. Anything more belongs in a tab.
 */
export interface RecordSummaryBarProps {
  /**
   * Genuine PROSE the record's summary carries — a Goal's definition of done,
   * an archived explanation. When present the band takes the card surface,
   * following the DS-02 rule that a container is earned by real content rather
   * than granted automatically; a band of derived state alone stays on the page
   * canvas. This is what lets a record have prose AND compact derived state in
   * ONE summary region rather than stacking two.
   */
  readonly description?: ReactNode;
  /** The record's headline progress, shown as the shared compact meter. */
  readonly progress?: ProgressMeterProps;
  /** The record's current-state chip (health, stay-in-touch, next obligation). */
  readonly state?: ReactNode;
  /** Derived signals, stated ONCE. */
  readonly signals?: readonly RecordSignal[];
  /** Quiet secondary context (parent Area, Goal, organisation). */
  readonly facts?: readonly RecordMetaItem[];
  /** A single calm line — an archived banner, or a compact current-state sentence. */
  readonly note?: ReactNode;
  /** Accessible name for the region. Defaults to "Summary". */
  readonly label?: string;
}

/** Props for the summary region. */
export interface RecordSummaryProps {
  /** Optional description or rich summary content (already-safe nodes). */
  readonly description?: ReactNode;
  /** Optional key/value metadata rendered as a description list. */
  readonly metadata?: readonly RecordMetaItem[];
  /** Text shown when the summary is requested but has no content yet. */
  readonly emptyLabel?: string;
}

/** Props for the state-aware content region. Precedence: error → loading → empty
 * → children. Each state has a sensible default slot that a caller can override. */
export interface RecordContentProps {
  readonly isLoading?: boolean;
  readonly isEmpty?: boolean;
  /** Truthy renders the error slot (and, by default, this node as the message). */
  readonly error?: ReactNode;
  readonly loadingSlot?: ReactNode;
  readonly emptySlot?: ReactNode;
  readonly errorSlot?: ReactNode;
  /** Accessible label for the content region landmark. */
  readonly label?: string;
  readonly children?: ReactNode;
}

/** Props for the tab strip + panels. Controlled (`activeTabId` + `onTabChange`)
 * or uncontrolled (`defaultTabId`). */
export interface RecordTabsProps {
  readonly tabs: readonly RecordTab[];
  /** Accessible name for the tablist. */
  readonly label?: string;
  readonly activeTabId?: string;
  readonly defaultTabId?: string;
  readonly onTabChange?: (tabId: string) => void;
  /** Id prefix so multiple tab strips on a page keep unique tab/panel ids. */
  readonly idPrefix?: string;
}

/** Props for the whole Shared Record Layout. */
export interface RecordLayoutProps extends RecordHeaderProps {
  /**
   * Optional summary CARD, for a record whose summary is genuine prose.
   * Ignored when `summaryBar` is also supplied — see `RecordLayout`.
   */
  readonly summary?: RecordSummaryProps;
  /**
   * RECORD-01 — the compact derived-state band most records want in place of a
   * summary card.
   */
  readonly summaryBar?: RecordSummaryBarProps;
  /** Optional tabs; when present the content region is the active tab's panel. */
  readonly tabs?: readonly RecordTab[];
  /** Accessible name for the tablist (defaults to "<title> sections"). */
  readonly tabsLabel?: string;
  readonly activeTabId?: string;
  readonly defaultTabId?: string;
  readonly onTabChange?: (tabId: string) => void;
  /** Content region shown when there are no tabs. */
  readonly children?: ReactNode;
}
