/**
 * V2.13 RPT-04 / UNTITLED-17 — the Reports collection.
 *
 * Two lists and nothing else: the built-ins DalyHub ships, and the questions
 * the owner has saved. It executes NO report — every row shows a name and a
 * question, and the figures appear when one is opened.
 *
 * ── Deliberately not a dashboard ───────────────────────────────────────────
 * No grid, no widgets, no arrangement, no previews, no drag. Saved reports
 * first; a dashboard is a V3 decision and does not sneak in because several
 * reports now exist (ADR-116 decision 2).
 *
 * ── UNTITLED-17: rows, not cards, and the Untitled table card ──────────────
 *
 * This drew a gallery of `.dh-reports__card` anchors — a bounded box per
 * report, with its own background, radius, shadow and hover, and the QUESTION
 * inside the box at subtitle weight. Two things were wrong with it. A saved
 * report is a one-line DEFINITION, not a document with a preview, so a card the
 * height of three lines spends a page of vertical space on eight of them and
 * makes the questions — the only thing that distinguishes one from another —
 * hard to scan down. And the box was a third bespoke card family beside the
 * record card and the Untitled surface card (§48).
 *
 * It is the genuine Untitled `application/table` now: one `TableCard.Root` per
 * section, its `TableCard.Header` carrying the section's name, a count badge
 * and the sentence that used to float above the list, then a row per report —
 * name, question, and a state badge where there is one. Scanning eight
 * questions is now running the eye down one column.
 *
 * Presentation only — every string is computed server-side.
 */

import { Link } from "react-router";

import { EmptyState } from "~/shared/empty-state";
import { CollectionLayout } from "~/shared/collection-layout";
import { Badge, ButtonLink } from "~/shared/ui";
import { Table, TableCard } from "~/shared/ui/untitled/application/table/table";
import { TableCardHeader } from "~/shared/ui/untitled/overrides/table-card-header";
import { LabelledTableHead } from "~/shared/ui/untitled/overrides/table-head";

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
        <ReportSection
          title="Your reports"
          count={saved.length}
          description={
            saved.length === 0
              ? `You haven’t saved a report yet. Open one of the examples below, change the period or the grouping, and save it as your own — you can keep up to ${savedLimit}.`
              : undefined
          }
          entries={saved}
        />
        <ReportSection
          title="Examples"
          count={builtIns.length}
          description="These come with DalyHub. Opening one and changing it never changes the example — save it as your own report instead."
          entries={builtIns}
        />
      </div>
    </CollectionLayout>
  );
}

/**
 * One section, as an Untitled table card.
 *
 * COMPOSED from the vendored Untitled components — no Untitled source is copied
 * here; the vendored file carries the provenance. The columns are DalyHub's.
 *
 * A section with no rows draws its header and its sentence and no table at all:
 * an empty `<table>` announces a grid with nothing in it, which is a worse
 * answer than the sentence explaining why.
 */
function ReportSection({
  title,
  count,
  description,
  entries,
}: {
  readonly title: string;
  readonly count: number;
  readonly description?: string;
  readonly entries: readonly SerializedReportEntry[];
}) {
  return (
    <section className="dh-reports__section">
      <TableCard.Root
        size="sm"
        data-untitled-source="application/table:table-card"
      >
        <TableCardHeader
          title={title}
          size="sm"
          level={2}
          badge={count > 0 ? `${count}` : undefined}
          description={description}
        />
        {entries.length === 0 ? null : (
          <Table
            aria-label={title}
            size="sm"
            className="table-fixed bg-primary"
          >
            <Table.Header className="bg-secondary [&_th]:px-5 max-sm:[&_th]:px-3">
              <LabelledTableHead
                id="name"
                label="Report"
                isRowHeader
                className="w-[38%]"
              />
              <LabelledTableHead
                id="question"
                label="Question"
                className="w-[62%]"
              />
            </Table.Header>
            <Table.Body>
              {entries.map((entry) => (
                <Table.Row key={entry.id} id={entry.id} size="sm">
                  <Table.Cell className="px-5 py-3 text-sm font-medium break-words text-primary max-sm:px-3">
                    {/*
                     * The NAME is the link, not the whole row. A row-wide
                     * anchor wrapping two cells cannot exist inside a real
                     * table, and the name is what the owner is looking for.
                     */}
                    <Link
                      className="rounded-sm underline decoration-transparent underline-offset-2 outline-focus-ring transition duration-100 ease-linear hover:decoration-current focus-visible:outline-2 focus-visible:outline-offset-2"
                      to={entry.href}
                    >
                      {entry.title}
                    </Link>
                    {entry.needs || entry.incompatible ? (
                      <span className="mt-1 block">
                        {entry.needs ? (
                          <Badge tone="info" variant="outline">
                            Choose a {entry.needs.toLocaleLowerCase("en-AU")}
                          </Badge>
                        ) : (
                          <Badge tone="warning" variant="outline">
                            Different version
                          </Badge>
                        )}
                      </span>
                    ) : null}
                  </Table.Cell>
                  <Table.Cell className="px-5 py-3 text-sm break-words text-tertiary max-sm:px-3">
                    {entry.incompatible ?? entry.question}
                  </Table.Cell>
                </Table.Row>
              ))}
            </Table.Body>
          </Table>
        )}
      </TableCard.Root>
    </section>
  );
}
