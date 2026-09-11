/**
 * The Projects collection as a TABLE — UNTITLED-04.
 *
 * ── What this is now ────────────────────────────────────────────────────────
 * The genuine Untitled Application UI table: `TableCard.Root`, `Table`,
 * `Table.Header`, `Table.Head`, `Table.Body`, `Table.Row` and `Table.Cell` from
 * the vendored `application/table` source, in the card-bounded arrangement
 * Untitled's Pro dashboards draw a data table in. It replaces the hand-written
 * `<table class="dh-ptable">` this surface carried, along with its stylesheet's
 * column, row, hover, reveal and responsive rules.
 *
 * The React Aria table underneath is what makes that a structural change rather
 * than a restyle: column/row semantics, the header association, focus
 * management and keyboard navigation are the library's, not a hand-rolled set of
 * `scope` attributes, and the row grammar is now the same one `/tasks` uses.
 *
 * ── What did not change ─────────────────────────────────────────────────────
 * Every fact, in the same order, from the same loader: the same rows, the same
 * `ProjectCardData` the gallery card is drawn from, no extra reads and no extra
 * derivations. The Area cell is still the contextual `InlinePickerField` over
 * the bounded `/projects/parent-options?q=` endpoint, posting the same canonical
 * `move` intent; the overflow is still the shared DS-12 menu over the same
 * `/projects/:id/mutate` lifecycle contract, kept because its phone-sheet
 * transformation, dialog ordering and focus return are DalyHub behaviour that
 * Untitled's dropdown does not carry.
 *
 * ── Sorting ─────────────────────────────────────────────────────────────────
 * Still none, and still deliberate. `ListProjectsInput.orderBy` has exactly two
 * values — `created` and `recent` — and neither corresponds to a column drawn
 * here, so a sortable header would either sort the loaded page client-side (a
 * lie about a paginated collection) or need new repository orderings, cursor
 * scopes and indexes. Untitled's `Table.Head` offers `allowsSorting`; it is not
 * set, because the collection's own ordering is what the table shows.
 *
 * ── The columns ─────────────────────────────────────────────────────────────
 * Identity, Status, Progress, Area or Goal, Tasks, Updated. Status is the one
 * addition: the chip was previously only on the gallery card, so the table — the
 * DEFAULT presentation above forty Projects (ADR-100) — was the presentation
 * that could not answer "which of these is at risk?". It is the same
 * `projectCardStatus` precedence the card draws, in an Untitled badge.
 */

import { useCallback, useState } from "react";
import { Link } from "react-router";

import {
  AccentIcon,
  identityAttribute,
  resolveIdentity,
} from "~/shared/entity";
import type { PickerOption } from "~/shared/floating";
import { InlinePickerField } from "~/shared/inline-edit";
import type { InlineSaveOutcome } from "~/shared/inline-edit";
import { OverflowMenu } from "~/shared/overflow-menu";
import { useRecordLifecycle } from "~/shared/record-lifecycle";

import { UntitledStatusBadge } from "~/shared/pill";
import { LabelledProgressBar } from "~/shared/ui/untitled/overrides/labelled-progress-bar";
import { Table, TableCard } from "~/shared/ui/untitled/application/table/table";

import type { ProjectCardData } from "./project-view";
import { useParentOptionsSearch } from "./use-parent-options-search";

export function ProjectsTable({
  cards,
  onLifecycleChange,
}: {
  readonly cards: readonly ProjectCardData[];
  readonly onLifecycleChange: () => void;
}) {
  return (
    // Adapted from the Untitled UI React `application/table` source, in the
    // card-bounded arrangement Untitled's Pro Application UI dashboards use for
    // a collection table. Changes: DalyHub project columns and row controls.
    <TableCard.Root
      size="sm"
      className="rounded-lg bg-primary shadow-xs ring-1 ring-secondary"
      data-untitled-source="application/table:table-card"
    >
      <Table
        aria-label="Projects, with the Area or Goal they sit under, status, progress, task counts and last update."
        size="sm"
        /*
         * `table-fixed` is what makes the truncation real: in an auto layout a
         * long project name simply widens its column and pushes the trailing
         * ones out of the card. Fixed layout hands every named column the width
         * declared on its head and gives the Project column what is left, so the
         * table fits its container at every width and the name ellipsises
         * instead of the row scrolling sideways.
         */
        className="table-fixed bg-primary max-md:block"
        data-testid="projects-table"
      >
        <Table.Header className="bg-secondary [&_th]:px-5 max-md:hidden">
          <Table.Head
            id="project"
            label="Project"
            isRowHeader
            /*
             * Percentages, because the layout is FIXED: a fixed table hands each
             * column exactly the width its head declares and has no rule for
             * distributing what is left over, so a column without one collapses
             * to its minimum and the table ends short of its own card. Stating
             * all seven as a share of the card is also what keeps the proportions
             * stable from a 1024 laptop to a 1920 desktop.
             */
            className="w-[28%]"
          />
          <Table.Head id="status" label="Status" className="w-[12%]" />
          <Table.Head id="progress" label="Progress" className="w-[16%]" />
          <Table.Head id="parent" label="Area or Goal" className="w-[16%]" />
          <Table.Head
            id="tasks"
            label="Tasks"
            className="w-[14%] whitespace-nowrap"
          />
          <Table.Head
            id="updated"
            label="Updated"
            className="w-[10%] whitespace-nowrap"
          />
          {/*
           * The overflow column's header is NAMED, and hidden.
           *
           * An empty column header is `empty-table-header` — a real axe finding
           * on the Projects collection, and a real one for a screen reader: a
           * grid cell announces its column, so the row's actions were announced
           * under nothing at all. Untitled's `label` renders visibly, so the
           * name goes on the element instead and the header stays blank to the
           * eye, which is what the column wants.
           */}
          <Table.Head id="actions" className="w-[4%]">
            <span className="sr-only">Actions</span>
          </Table.Head>
        </Table.Header>
        <Table.Body>
          {cards.map((card) => (
            <ProjectTableRow
              key={card.id}
              card={card}
              onLifecycleChange={onLifecycleChange}
            />
          ))}
        </Table.Body>
      </Table>
    </TableCard.Root>
  );
}

function ProjectTableRow({
  card,
  onLifecycleChange,
}: {
  readonly card: ProjectCardData;
  readonly onLifecycleChange: () => void;
}) {
  // The SAME lifecycle actions the gallery card's overflow carries, through the
  // same shared hook and the same trusted endpoint — a Project can be archived
  // from either presentation because it is one collection, not two.
  const lifecycle = useProjectRowLifecycle(card, onLifecycleChange);

  return (
    <Table.Row
      id={card.id}
      size="sm"
      /*
       * `h-auto` first: the Untitled row declares a fixed `h-14`, which is right
       * for a desktop table and wrong for the phone row, where the name is
       * followed by the facts the hidden columns would have carried. Without it
       * the second line renders outside the row's box and is painted over by the
       * next one.
       */
      className="h-auto min-h-14 bg-primary hover:bg-secondary max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-start max-md:gap-x-3 max-md:py-2"
      // The SAME identity the gallery card paints its mark and bar from,
      // resolved once by the shared resolver — one identity across both
      // presentations, never a second colour decision for the table.
      {...identityAttribute(
        resolveIdentity({
          colourSlot: card.colourSlot,
          colourRank: card.colourRank,
        }).slot,
      )}
      data-muted={card.isArchived ? "true" : undefined}
      /*
       * The reveal CONTEXT the shared `dh-action-reveal` contract reads: the
       * overflow fades in with the row rather than being painted on forty rows
       * at rest. Inert outside a hover pointer, so touch, forced colours and the
       * keyboard are unchanged.
       */
      data-dh-action-context="true"
      data-testid="project-table-row"
    >
      <Table.Cell className="px-5 py-3 max-md:col-start-1 max-md:px-4">
        <span className="flex min-w-0 items-center gap-3">
          <span className="shrink-0" aria-hidden="true">
            <AccentIcon
              entityType="project"
              iconKey={card.iconKey}
              colourSlot={card.colourSlot}
              colourRank={card.colourRank}
              size="sm"
            />
          </span>
          <Link
            className="truncate text-sm font-semibold text-primary outline-focus-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
            to={`/projects/${encodeURIComponent(card.id)}`}
            /*
             * "Open <title>" is the product-wide accessible name for a record's
             * open link — `TaskRow`, `Card` and `EntityCard` all say it, and
             * AGENTS.md §7 makes one vocabulary a rule rather than a habit. The
             * visible text is contained in the name, so WCAG 2.5.3 (Label in
             * Name) holds.
             */
            aria-label={`Open ${card.title}`}
          >
            {card.title}
          </Link>
        </span>
        {/*
         * The phone row carries the facts the hidden columns would have, in one
         * quiet line below the name — the table does not become a horizontally
         * scrolling grid on a handset, and no fact is simply lost.
         */}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tertiary md:hidden">
          <UntitledStatusBadge tone={card.status.tone} dot size="sm">
            {card.status.label}
          </UntitledStatusBadge>
          {card.progress.has ? <span>{card.progress.percent}%</span> : null}
          {card.parentLabel ? <span>{card.parentLabel}</span> : null}
        </span>
      </Table.Cell>
      <Table.Cell className="px-5 py-3 max-md:hidden">
        <UntitledStatusBadge
          tone={card.status.tone}
          dot
          size="sm"
          data-testid="project-table-status"
        >
          {card.status.label}
        </UntitledStatusBadge>
      </Table.Cell>
      <Table.Cell className="px-5 py-3 max-md:hidden">
        {card.progress.has ? (
          <LabelledProgressBar
            label={`${card.title} progress`}
            value={card.progress.percent}
            valueText={`${card.progress.summary} complete`}
            tone={progressTone(card.attention.tone)}
            showValue
          />
        ) : (
          // No tasks means no proportion, exactly as on the card: an empty bar
          // at 0% says "nothing done" when the truth is "nothing planned".
          <Absent label="No tasks yet" />
        )}
      </Table.Cell>
      {/*
       * The Area, as a contextual choice.
       *
       * An ARCHIVED Project is read-only until it is restored (PROJ-05 §5), and
       * the repository already refuses the mutation; the cell renders the plain
       * value there rather than a control that could only ever fail.
       *
       * An absent value is still directly manipulable — "No Area" is the
       * invitation, held back until the row is engaged with — so the em dash
       * survives only for a Project that cannot be moved at all.
       */}
      <Table.Cell className="truncate px-5 py-3 text-sm text-tertiary max-md:hidden">
        {card.isArchived ? (
          (card.areaLabel ?? <Absent label="No Area" />)
        ) : (
          <ProjectAreaCell card={card} onMoved={onLifecycleChange} />
        )}
      </Table.Cell>
      <Table.Cell className="truncate px-5 py-3 text-sm text-tertiary max-md:hidden">
        {card.meta.length > 0 ? (
          card.meta.map((fact) => fact.text).join(" · ")
        ) : (
          <Absent />
        )}
      </Table.Cell>
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
 * The bar's tone, from the health evaluator's own tone.
 *
 * A card must never draw a calm bar over the words "3 overdue", so the measure
 * takes the signal the attention line already carries. `info` and `neutral` are
 * both "nothing to say", which is the brand-coloured default.
 */
function progressTone(
  tone: ProjectCardData["attention"]["tone"],
): "neutral" | "positive" | "caution" | "critical" {
  switch (tone) {
    case "success":
      return "positive";
    case "warning":
      return "caution";
    case "danger":
      return "critical";
    default:
      return "neutral";
  }
}

/**
 * The Area cell's contextual choice.
 *
 * Its own component so the search hook mounts PER ROW rather than per table —
 * and, more importantly, so its one seeded request is made when a picker opens
 * rather than when the table renders. `useParentOptionsSearch` fetches only
 * when `onSearch` is called, and the shared `Picker` calls it on open, so a
 * forty-row table costs zero requests until an owner asks a question (§43).
 *
 * It writes through the canonical `move` intent on `/projects/:id/mutate` — the
 * same one the record's Organisation row posts — and asks the collection to
 * re-read afterwards, because moving a Project can change which Area group,
 * filter or segment it belongs to. The server decides that, not the row.
 */
function ProjectAreaCell({
  card,
  onMoved,
}: {
  readonly card: ProjectCardData;
  readonly onMoved: () => void;
}) {
  // Seeded with the CURRENT parent only — never the whole Area/Goal catalogue —
  // so the cell's own label always resolves before anything is typed.
  const [seed] = useState<readonly PickerOption[]>(() =>
    card.parentId === null
      ? []
      : [
          {
            id: card.parentId,
            label:
              (card.parentKind === "goal" ? card.goalLabel : card.areaLabel) ??
              card.parentId,
            support: card.parentKind === "goal" ? "Goal" : "Area",
          },
        ],
  );
  const search = useParentOptionsSearch(
    seed.map((option) => ({
      value: option.id,
      label: option.label,
      ...(option.support ? { description: option.support } : {}),
    })),
  );

  const save = useCallback(
    async (next: string): Promise<InlineSaveOutcome> => {
      // A Project's parent is REQUIRED — every Project sits under an Area or
      // advances a Goal — so there is no clear command and an empty choice is
      // not a state the field can reach.
      if (next.length === 0) return { ok: true };
      const body = new FormData();
      body.set("intent", "move");
      body.set("parentId", next);
      const response = await fetch(
        `/projects/${encodeURIComponent(card.id)}/mutate`,
        { method: "POST", body, headers: { accept: "application/json" } },
      );
      const result = (await response.json()) as {
        readonly ok: boolean;
        readonly message?: string;
        readonly formError?: string;
      };
      if (!result.ok) {
        return {
          ok: false,
          message:
            result.message ??
            result.formError ??
            "That couldn’t be saved. Please try again.",
        };
      }
      onMoved();
      return { ok: true };
    },
    [card.id, onMoved],
  );

  const options: readonly PickerOption[] = search
    .withSelected(card.parentId ?? "")
    .map((option) => ({
      id: option.value,
      label: option.label,
      ...(option.description ? { support: option.description } : {}),
    }));

  return (
    <InlinePickerField
      label="Area or Goal"
      value={card.parentId ?? ""}
      options={options}
      onSave={save}
      onSearch={search.onSearch}
      // The first, unfiltered page — asked for on OPEN rather than on render,
      // so a table of Projects makes no requests until an owner opens one.
      onOpen={() => search.onSearch("")}
      loading={search.loading}
      emptyLabel="No Area"
      presentation="meta"
      data-testid="project-table-area"
    />
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
 * The row's archive/restore actions — the SAME shared hook and the SAME trusted
 * `/projects/:id/mutate` endpoint the gallery card posts to. Archiving moves a
 * Project between lifecycle segments, so the list is re-read rather than
 * patched: the server decides which segment it now belongs to.
 */
function useProjectRowLifecycle(
  card: ProjectCardData,
  onLifecycleChange: () => void,
) {
  return useRecordLifecycle({
    entityType: "project",
    title: card.title,
    archived: card.isArchived,
    onArchive: () =>
      postProjectLifecycle(card.id, "archive", onLifecycleChange),
    onRestore: () =>
      postProjectLifecycle(card.id, "restore", onLifecycleChange),
  });
}

async function postProjectLifecycle(
  id: string,
  intent: "archive" | "restore",
  onLifecycleChange: () => void,
): Promise<void> {
  const body = new FormData();
  body.set("intent", intent);
  const response = await fetch(`/projects/${encodeURIComponent(id)}/mutate`, {
    method: "POST",
    body,
    headers: { accept: "application/json" },
  });
  const result = (await response.json()) as {
    readonly ok: boolean;
    readonly formError?: string;
  };
  if (!result.ok) {
    throw new Error(
      result.formError ?? "That couldn’t be saved. Please try again.",
    );
  }
  onLifecycleChange();
}
