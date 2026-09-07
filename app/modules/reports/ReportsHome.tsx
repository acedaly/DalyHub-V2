/**
 * V2.13 RPT-04 — the Reports collection.
 *
 * Two lists and nothing else: the built-ins DalyHub ships, and the questions
 * the owner has saved. It executes NO report — every card shows a name and a
 * question, and the figures appear when one is opened.
 *
 * ── Deliberately not a dashboard ───────────────────────────────────────────
 * No grid, no widgets, no arrangement, no previews, no drag. Saved reports
 * first; a dashboard is a V3 decision and does not sneak in because several
 * reports now exist (ADR-116 decision 2).
 *
 * Presentation only — every string is computed server-side.
 */

import { Link } from "react-router";

import { EmptyState } from "~/shared/empty-state";
import { CollectionLayout } from "~/shared/collection-layout";
import { Badge, ButtonLink } from "~/shared/ui";

import type { ReportsHomeData, SerializedReportEntry } from "./reports-view";

export function ReportsHome({
  builtIns,
  saved,
  savedLimit,
  failed,
}: ReportsHomeData) {
  return (
    <CollectionLayout
      className="dh-reports"
      title="Reports"
      headingLevel={1}
      subtitle="One saved definition, many questions."
      primaryAction={
        <ButtonLink href="/reports/new" variant="primary">
          New report
        </ButtonLink>
      }
      error={
        failed ? (
          <EmptyState
            title="We couldn’t read your saved reports"
            description="The built-in reports below still work. Nothing in your workspace has changed — try again in a moment."
          />
        ) : undefined
      }
    >
      <div className="dh-reports__body">
        <section
          className="dh-reports__section"
          aria-labelledby="reports-saved"
        >
          <h2 className="dh-reports__heading" id="reports-saved">
            Your reports
          </h2>
          {saved.length === 0 ? (
            <p className="dh-reports__absent">
              You haven’t saved a report yet. Open one of the examples below,
              change the period or the grouping, and save it as your own — you
              can keep up to {savedLimit}.
            </p>
          ) : (
            <ul className="dh-reports__list">
              {saved.map((entry) => (
                <ReportCard key={entry.id} entry={entry} />
              ))}
            </ul>
          )}
        </section>

        <section
          className="dh-reports__section"
          aria-labelledby="reports-builtin"
        >
          <h2 className="dh-reports__heading" id="reports-builtin">
            Examples
          </h2>
          <p className="dh-reports__lede">
            These come with DalyHub. Opening one and changing it never changes
            the example — save it as your own report instead.
          </p>
          <ul className="dh-reports__list">
            {builtIns.map((entry) => (
              <ReportCard key={entry.id} entry={entry} />
            ))}
          </ul>
        </section>
      </div>
    </CollectionLayout>
  );
}

function ReportCard({ entry }: { readonly entry: SerializedReportEntry }) {
  return (
    <li className="dh-reports__item">
      <Link className="dh-reports__card" to={entry.href}>
        <span className="dh-reports__title">{entry.title}</span>
        <span className="dh-reports__question">
          {entry.incompatible ?? entry.question}
        </span>
        {entry.needs ? (
          <span className="dh-reports__badge">
            <Badge tone="info" variant="outline">
              Choose a {entry.needs.toLocaleLowerCase("en-AU")}
            </Badge>
          </span>
        ) : null}
        {entry.incompatible ? (
          <span className="dh-reports__badge">
            <Badge tone="warning" variant="outline">
              Different version
            </Badge>
          </span>
        ) : null}
      </Link>
    </li>
  );
}
