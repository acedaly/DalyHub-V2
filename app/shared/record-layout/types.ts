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

/**
 * A semantic tone. Tones map to DS-01 feedback tokens; they NEVER carry meaning
 * by colour alone — a tone is always paired with its text label.
 */
export type RecordTone =
  "neutral" | "accent" | "success" | "warning" | "danger" | "info";

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
}

/** Props for the record header region. */
export interface RecordHeaderProps {
  /** The record title (rendered as the record's heading). */
  readonly title: string;
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
  /** Optional summary region; omit to render no summary. */
  readonly summary?: RecordSummaryProps;
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
