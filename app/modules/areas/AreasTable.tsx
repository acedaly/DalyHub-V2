/**
 * The Areas collection as a TABLE — UNTITLED-05.
 *
 * ── What this replaced ──────────────────────────────────────────────────────
 *
 * `EntityRowList`: a hand-composed grid of rows, hairlines between, with the
 * Area's relationships run together into one string ("2 Projects · 1 Goal") and
 * its open-task count floated to the far right. Its own source file states the
 * ambition exactly — *"the counts are what the eye is actually comparing down
 * the column"* — and then draws them as prose in a single flexible cell, where
 * nothing lines up and every row has to repeat the noun to be readable.
 *
 * A table is what that row was reaching for. The nouns move to column headings,
 * stated ONCE at the top instead of on every row; the figures land in columns
 * the eye can actually run down; and the row grammar, the header association,
 * the focus management and the keyboard navigation become React Aria's rather
 * than a hand-rolled set of `<div role>` attributes.
 *
 * Adapted from the vendored Untitled UI React `application/table` source
 * (`TableCard.Root` + `Table` + `Table.Header`/`Head`/`Body`/`Row`/`Cell`), in
 * the card-bounded arrangement Untitled's Pro Application UI dashboards use for
 * a collection table — the same composition `ProjectsTable` adopted, so the
 * spine's two collections now carry ONE table grammar.
 *
 * ── The columns, and the one that is deliberately absent ────────────────────
 *
 * Area · Projects · Goals · Open tasks · Completed · Updated · (actions).
 *
 * There is NO status or health column, and that is a decision rather than an
 * omission. DalyHub has an authoritative Area evaluator
 * (`evaluateAreaMomentum`), but it needs per-Project health facts for EVERY
 * Project aligned to the Area — a read this bounded collection page does not do
 * and must not start doing per row. The alternatives were both worse than an
 * absent column: a second, weaker momentum computed from the counts alone would
 * let the same Area read "steady" here and "Needs attention" on its own record,
 * which is exactly the third-measure drift STEER-03 spent a phase removing from
 * Goals; and an invented Area score is the one thing the brief is most explicit
 * about not fabricating.
 *
 * What the table DOES state is the genuine absence — an Area with nothing
 * running in it, in the record's own words ("No active work"), derived from the
 * same three counts the record's own empty check uses. See `AreaCardData`.
 *
 * ── Sorting ─────────────────────────────────────────────────────────────────
 *
 * None, and deliberate: `listAreas` has one ordering (the workspace's stable
 * `(created_at, id)` keyset, which is also what the identity ramp is ranked
 * over), and a sortable header would either sort the loaded page client-side —
 * a lie about a paginated collection — or need new repository orderings and
 * cursor scopes. Untitled's `Table.Head` offers `allowsSorting`; it is not set.
 */

import { useCallback } from "react";
import { Link } from "react-router";

import {
  AccentIcon,
  identityAttribute,
  resolveIdentity,
} from "~/shared/entity";
import { OverflowMenu } from "~/shared/overflow-menu";
import { UntitledStatusBadge } from "~/shared/pill";
import { useRecordLifecycle } from "~/shared/record-lifecycle";
import { LabelledTableHead } from "~/shared/ui/untitled/overrides/table-head";
import { Table, TableCard } from "~/shared/ui/untitled/application/table/table";

import type { AreaCardData } from "./area-view";

export function AreasTable({
  cards,
  onArchived,
}: {
  readonly cards: readonly AreaCardData[];
  readonly onArchived: () => void;
}) {
  return (
    // Adapted from the Untitled UI React `application/table` source, in the
    // card-bounded arrangement Untitled's Pro Application UI dashboards use for
    // a collection table. Changes: DalyHub Area columns and row controls.
    <TableCard.Root
      size="sm"
      className="rounded-lg bg-primary shadow-xs ring-1 ring-secondary"
      data-untitled-source="application/table:table-card"
    >
      <Table
        aria-label="Areas, with the Projects and Goals living in each, its open and completed work, and when it last changed."
        size="sm"
        /*
         * `table-fixed` is what makes the truncation real: in an auto layout a
         * long Area name simply widens its column and pushes the trailing ones
         * out of the card. Fixed layout hands every named column the width its
         * head declares, so the table fits its container at every width and the
         * name ellipsises instead of the row scrolling sideways.
         */
        className="table-fixed bg-primary max-md:block"
        data-testid="areas-table"
      >
        <Table.Header className="bg-secondary [&_th]:px-5 max-md:hidden">
          <LabelledTableHead
            id="area"
            label="Area"
            isRowHeader
            /*
             * Percentages, because the layout is FIXED: a fixed table hands each
             * column exactly the width its head declares and has no rule for
             * distributing what is left, so a column without one collapses to
             * its minimum and the table ends short of its own card.
             */
            className="w-[32%]"
          />
          <LabelledTableHead
            id="projects"
            label="Projects"
            className="w-[12%] whitespace-nowrap"
          />
          <LabelledTableHead
            id="goals"
            label="Goals"
            className="w-[10%] whitespace-nowrap"
          />
          <LabelledTableHead
            id="open"
            label="Open tasks"
            className="w-[14%] whitespace-nowrap"
          />
          <LabelledTableHead
            id="completed"
            label="Completed"
            className="w-[14%] whitespace-nowrap"
          />
          <LabelledTableHead
            id="updated"
            label="Updated"
            className="w-[14%] whitespace-nowrap"
          />
          {/*
           * The overflow column's header is NAMED, and invisible. An empty
           * column header is a real axe finding and a real one for a screen
           * reader: a grid cell announces its column, so the row's actions
           * would be announced under nothing at all.
           */}
          <LabelledTableHead
            id="actions"
            label="Actions"
            className="w-[4%] [&>span]:sr-only"
          />
        </Table.Header>
        <Table.Body>
          {cards.map((card) => (
            <AreaTableRow key={card.id} card={card} onArchived={onArchived} />
          ))}
        </Table.Body>
      </Table>
    </TableCard.Root>
  );
}

function AreaTableRow({
  card,
  onArchived,
}: {
  readonly card: AreaCardData;
  readonly onArchived: () => void;
}) {
  // The SAME lifecycle action the gallery card's overflow carries, through the
  // same shared hook and the same trusted endpoint — an Area can be archived
  // from either presentation because it is one collection, not two.
  const lifecycle = useAreaRowLifecycle(card, onArchived);

  return (
    <Table.Row
      id={card.id}
      size="sm"
      /*
       * `h-auto` first: the Untitled row declares a fixed `h-14`, which is right
       * for a desktop table and wrong for the phone row, where the name is
       * followed by the facts the hidden columns would have carried. Without it
       * the second line renders outside the row's box and is painted over.
       */
      className="h-auto min-h-14 bg-primary hover:bg-secondary max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-start max-md:gap-x-3 max-md:py-2"
      // The SAME identity the gallery card paints its mark from, resolved once
      // by the shared resolver — one identity across both presentations.
      {...identityAttribute(
        resolveIdentity({
          colourSlot: card.colourSlot,
          colourRank: card.colourRank,
        }).slot,
      )}
      /*
       * The reveal CONTEXT the shared `dh-action-reveal` contract reads: the
       * overflow fades in with the row rather than being painted on eleven rows
       * at rest. Inert outside a hover pointer, so touch, forced colours and the
       * keyboard are unchanged.
       */
      data-dh-action-context="true"
      data-testid="area-table-row"
    >
      <Table.Cell className="px-5 py-3 max-md:col-start-1 max-md:px-4">
        <span className="flex min-w-0 items-center gap-3">
          <span className="shrink-0" aria-hidden="true">
            <AccentIcon
              entityType="area"
              iconKey={card.iconKey}
              colourSlot={card.colourSlot}
              colourRank={card.colourRank}
              size="sm"
            />
          </span>
          <span className="flex min-w-0 flex-col">
            <Link
              className="truncate text-sm font-semibold text-primary outline-focus-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              to={`/areas/${encodeURIComponent(card.id)}`}
              // "Open <title>" is the product-wide accessible name for a
              // record's open link (AGENTS.md §7). The visible text is
              // contained in the name, so WCAG 2.5.3 holds.
              aria-label={`Open ${card.title}`}
            >
              {card.title}
            </Link>
            {card.sinceLabel ? (
              /*
               * `truncate` only from `md`. On a phone the row is a two-column
               * grid, and truncating this line inside it produced "Ongoing
               * since July 2…" — a date clipped mid-year, which is worse than
               * the second line it wraps to.
               */
              <span className="text-xs text-tertiary md:truncate">
                {card.sinceLabel}
              </span>
            ) : null}
          </span>
        </span>
        {/*
         * The phone row carries the facts the hidden columns would have, in one
         * quiet line below the name — the table does not become a horizontally
         * scrolling grid on a handset, and no fact is simply lost.
         */}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tertiary md:hidden">
          {card.hasActiveWork ? (
            /*
             * Only the dimensions the Area HAS. A zero would be drawn as "0
             * open tasks" beside a real count, which is the absence-as-state
             * defect AREA-01 removed from every Area row.
             */
            phoneFacts(card).map((fact) => <span key={fact}>{fact}</span>)
          ) : (
            <UntitledStatusBadge tone="neutral" dot size="sm">
              {card.quietLabel}
            </UntitledStatusBadge>
          )}
        </span>
      </Table.Cell>
      <NumberCell value={card.activeProjects} absent="No Projects yet" />
      <NumberCell value={card.openGoals} absent="No Goals yet" />
      <NumberCell value={card.openTasks} absent="No open tasks" />
      {/*
       * Completed Projects are the Area's HISTORY, never a warning: stated
       * quietly and never tinted, which is the same rule the momentum evaluator
       * applies when it files them as explanatory context. The column heading
       * carries the noun, so the cell is the figure alone.
       */}
      <NumberCell value={card.completedProjects} absent="None completed yet" />
      <Table.Cell className="px-5 py-3 text-sm whitespace-nowrap text-tertiary max-md:hidden">
        {card.updatedLabel?.replace(/^Updated /, "") ?? <Absent />}
      </Table.Cell>
      <Table.Cell className="dh-action-reveal px-3 py-3 max-md:col-start-2 max-md:row-start-1 max-md:px-2">
        <OverflowMenu
          items={lifecycle.overflowActions}
          label={`More actions for ${card.title}`}
        />
        {lifecycle.dialogs}
      </Table.Cell>
    </Table.Row>
  );
}

/**
 * A counted column.
 *
 * A zero is drawn as an ABSENCE rather than as "0": a column of zeros reads as
 * eleven warnings, and the fact is "there are none yet", which the sighted
 * reader takes from the dash and assistive technology takes from the words.
 */
function NumberCell({
  value,
  absent,
  suffix,
}: {
  readonly value: number;
  readonly absent: string;
  readonly suffix?: string;
}) {
  return (
    <Table.Cell className="px-5 py-3 text-sm whitespace-nowrap text-tertiary tabular-nums max-md:hidden">
      {value > 0 ? (
        <>
          <span className="font-medium text-primary">{value}</span>
          {suffix ? (
            <span className="ml-1.5 text-tertiary">{suffix}</span>
          ) : null}
        </>
      ) : (
        <Absent label={absent} />
      )}
    </Table.Cell>
  );
}

/** An absent value: a dash for the eye, a word for assistive tech. */
function Absent({ label = "Not recorded" }: { readonly label?: string }) {
  return (
    <span className="text-tertiary">
      <span aria-hidden="true">—</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

/**
 * The phone row's facts — the same figures the hidden columns carry, worded,
 * and only where the Area actually has them.
 */
function phoneFacts(card: AreaCardData): readonly string[] {
  const facts: string[] = [];
  if (card.activeProjects > 0) {
    facts.push(
      `${card.activeProjects} ${card.activeProjects === 1 ? "Project" : "Projects"}`,
    );
  }
  if (card.openGoals > 0) {
    facts.push(`${card.openGoals} ${card.openGoals === 1 ? "Goal" : "Goals"}`);
  }
  if (card.openTasks > 0) {
    facts.push(
      `${card.openTasks} open ${card.openTasks === 1 ? "task" : "tasks"}`,
    );
  }
  if (card.completedProjects > 0) {
    facts.push(`${card.completedProjects} completed`);
  }
  return facts;
}

/**
 * The row's archive action — the SAME shared hook and the SAME trusted
 * `/areas/:id/mutate` endpoint the gallery card posts to. An archived Area
 * leaves the active collection, so the list is re-read rather than patched: the
 * server decides what "active" means, not the browser.
 */
function useAreaRowLifecycle(card: AreaCardData, onArchived: () => void) {
  const archive = useCallback(async () => {
    const body = new FormData();
    body.set("intent", "archive");
    const response = await fetch(
      `/areas/${encodeURIComponent(card.id)}/mutate`,
      { method: "POST", body, headers: { accept: "application/json" } },
    );
    const result = (await response.json()) as {
      readonly ok: boolean;
      readonly formError?: string;
    };
    if (!result.ok) {
      throw new Error(
        result.formError ?? "That couldn’t be saved. Please try again.",
      );
    }
    onArchived();
  }, [card.id, onArchived]);

  return useRecordLifecycle({
    entityType: "area",
    title: card.title,
    onArchive: archive,
  });
}
