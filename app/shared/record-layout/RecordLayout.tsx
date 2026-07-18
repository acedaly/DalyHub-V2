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

import { RecordHeader } from "./RecordHeader";
import { RecordSummary } from "./RecordSummary";
import { RecordTabs } from "./RecordTabs";
import type { RecordLayoutProps } from "./types";

export function RecordLayout({
  // Header
  title,
  titleId,
  headingLevel,
  typeLabel,
  icon,
  status,
  breadcrumb,
  metadata,
  primaryAction,
  secondaryActions,
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

  return (
    <article className="record-layout" aria-labelledby={resolvedTitleId}>
      <RecordHeader
        title={title}
        titleId={resolvedTitleId}
        headingLevel={headingLevel}
        typeLabel={typeLabel}
        icon={icon}
        status={status}
        breadcrumb={breadcrumb}
        metadata={metadata}
        primaryAction={primaryAction}
        secondaryActions={secondaryActions}
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
