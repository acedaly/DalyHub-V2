/**
 * DS-02 — the Shared Record Layout.
 *
 * The universal, entity-agnostic scaffold every record view composes: a header,
 * an optional summary, and either a tab strip (whose active panel is the content
 * region) or a plain content region. It is a labelled `article` landmark titled
 * by its heading, so assistive tech announces "what am I looking at". It assumes
 * nothing about the entity — Areas, Goals, Projects, Tasks, People and Notes all
 * pass the same typed props (DESIGN_SYSTEM.md → Record Header).
 *
 * Responsive behaviour and visual language come entirely from DS-01 tokens
 * (record-layout.css); this component owns structure and accessibility only.
 */

import { useId } from "react";

import { useSetMobileTopBar } from "~/shared/shell/mobile-top-bar-context";

import { RecordHeader } from "./RecordHeader";
import { RecordSummary } from "./RecordSummary";
import { RecordTabs } from "./RecordTabs";
import type { RecordLayoutProps } from "./types";

export function RecordLayout({
  // Header
  title,
  titleSlot,
  titleId,
  headingLevel,
  typeLabel,
  icon,
  status,
  breadcrumb,
  metadata,
  primaryAction,
  secondaryActions,
  overflowActions,
  overflowLabel,
  // Summary
  summary,
  // Tabs
  tabs,
  tabsLabel,
  activeTabId,
  defaultTabId,
  onTabChange,
  // Content (no-tabs path)
  children,
}: RecordLayoutProps) {
  const generatedId = useId();
  const resolvedTitleId = titleId ?? `record-title-${generatedId}`;
  const hasTabs = tabs !== undefined && tabs.length > 0;

  // MOBILE-01 — the phone bar says which RECORD you are in, and its Back goes
  // where the breadcrumb already says this record lives, so the bar needs no
  // navigation knowledge of its own. Every record view composes this layout, so
  // one call here covers the product rather than one per module. Desktop is
  // unaffected: the bar it feeds is `display: none` above `md`.
  useSetMobileTopBar({
    title,
    // The last step is often the record itself and hrefless, so Back goes to the
    // nearest ancestor that IS a destination.
    backTo:
      [...(breadcrumb ?? [])].reverse().find((step) => step.href)?.href ?? null,
  });

  return (
    /*
     * DS-14 §4 — a record is a Collection region by default.
     *
     * Its header, status, metadata, tabs, linked items and activity are all
     * things the owner SCANS, and that is the majority of every record in the
     * product. The minority — a note body, an area vision, a project
     * description, a meeting summary, a review response — declares its own
     * Reading region around the prose itself, and the nearest wrapper wins. So
     * the mixed record the brief describes composes without either surface
     * having to know about the other.
     */
    <article className="record-layout" aria-labelledby={resolvedTitleId}>
      <RecordHeader
        title={title}
        titleSlot={titleSlot}
        titleId={resolvedTitleId}
        headingLevel={headingLevel}
        typeLabel={typeLabel}
        icon={icon}
        status={status}
        breadcrumb={breadcrumb}
        metadata={metadata}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
        overflowActions={overflowActions}
        overflowLabel={overflowLabel}
      />

      {summary !== undefined && (
        <RecordSummary
          description={summary.description}
          metadata={summary.metadata}
          emptyLabel={summary.emptyLabel}
        />
      )}

      {hasTabs ? (
        <RecordTabs
          tabs={tabs}
          label={tabsLabel ?? `${title} sections`}
          activeTabId={activeTabId}
          defaultTabId={defaultTabId}
          onTabChange={onTabChange}
        />
      ) : (
        children !== undefined && (
          <div className="record-layout__content">{children}</div>
        )
      )}
    </article>
  );
}
