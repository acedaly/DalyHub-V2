/**
 * REDESIGN-04 §5.4 — the Projects collection as a TABLE.
 *
 * `mockup3.png` puts a Grid/Table toggle at the trailing edge of the Projects
 * control row. The table is real data in another representation, so it is in
 * scope — and it is exactly that: the SAME rows, in the same order, from the
 * same loader, drawn as a table instead of as cards. It performs no reads, adds
 * no columns the gallery does not already have, and its cells are the same
 * derived display values `ProjectCardData` hands the card.
 *
 * ── Why a real `<table>` ────────────────────────────────────────────────────
 * Because it is tabular data, and the semantics are the accessibility. A grid
 * of divs would need `role="table"`, `role="row"`, `role="cell"` and a column
 * header association reimplemented by hand; a `<table>` with `<th scope="col">`
 * announces "Progress, column 4" for free, and the browser's own row/column
 * navigation works in every screen reader without a roving tabindex.
 *
 * ── Sorting ─────────────────────────────────────────────────────────────────
 * There is none, and its absence is deliberate. §5.4 permits sorting "only if
 * sorting already exists in the loader's vocabulary". `ListProjectsInput.orderBy`
 * has exactly two values — `created` and `recent` — and neither corresponds to
 * a column drawn here, so a clickable header would either sort the loaded page
 * client-side (a lie about the collection, which is paginated) or need new
 * repository orderings, new cursor scopes and new indexes. The collection's own
 * ordering is what the table shows, in both presentations.
 *
 * ── The columns ─────────────────────────────────────────────────────────────
 * Identity, Area, Progress, Tasks, Updated — the five §5.4 names, and every one
 * of them is a value the gallery card already draws or the list item already
 * carries. Nothing new is derived, and nothing new is read.
 *
 * ── DHDS-10 — the AREA cell is the control ──────────────────────────────────
 * Filing is what a table of Projects is FOR: it is the surface an owner scans
 * when deciding where work belongs, and until this phase the answer to "this
 * one is in the wrong Area" was open the record, find the Settings tab, find
 * the row, choose, come back — five interactions and two navigations, from the
 * cell that already states the answer.
 *
 * The cell is now the shared `InlinePickerField` over the same bounded
 * `/projects/parent-options?q=` endpoint the record's own Organisation row
 * uses, posting the same canonical `move` intent. No column was added, no
 * request is made until a picker is opened, and at rest the cell is still the
 * Area's name in ordinary text — `presentation="meta"` holds the caret back
 * until the row is engaged with, so a page of Projects reads as a table of
 * information rather than a page of dropdowns (§6).
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

import { ProgressTrack, meterStatusFromTone } from "~/shared/progress";

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
    <div className="dh-ptable__scroll">
      <table className="dh-ptable" data-testid="projects-table">
        <caption className="dh-visually-hidden">
          Projects, with the Area or Goal they sit under, progress, task counts
          and last update.
        </caption>
        <thead>
          <tr>
            <th scope="col">Project</th>
            {/*
             * DHDS-10 — the column is named for what it now CONTAINS.
             *
             * It showed the derived Area and is now the STRUCTURAL parent, which
             * for a Project advancing a Goal is the Goal — the value the `move`
             * intent actually sets, and the one a control must state honestly.
             * Heading it "Area" while it read "Learn Spanish" would be a column
             * whose title disagrees with its cells, and naming the control's
             * value differently from its visible text would break WCAG 2.5.3.
             * The Area is still named on the gallery card and on the record.
             */}
            <th scope="col">Area or Goal</th>
            <th scope="col">Progress</th>
            <th scope="col">Tasks</th>
            <th scope="col">Updated</th>
            {/* The actions column is named for assistive tech and unnamed
             * visually — a visible "Actions" heading over a 32px menu button is
             * a column title wider than its column. */}
            <th scope="col">
              <span className="dh-visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {cards.map((card) => (
            <ProjectTableRow
              key={card.id}
              card={card}
              onLifecycleChange={onLifecycleChange}
            />
          ))}
        </tbody>
      </table>
    </div>
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
    <tr
      className="dh-ptable__row"
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
       * DHDS-08's reveal CONTEXT, which DHDS-10's `meta` fields read: the Area
       * cell's caret fades in with the row exactly as the overflow button does,
       * from the one contract, rather than being drawn on forty rows at rest.
       */
      data-dh-action-context="true"
      data-testid="project-table-row"
    >
      <th scope="row" className="dh-ptable__identity">
        {/*
         * The flex row is an INNER element, never the cell itself: a `<th>` with
         * `display: flex` stops participating in table layout, so its column
         * loses its width and a long title stretches the whole table past the
         * viewport.
         */}
        <span className="dh-ptable__identity-inner">
          <span className="dh-ptable__mark" aria-hidden="true">
            <AccentIcon
              entityType="project"
              iconKey={card.iconKey}
              colourSlot={card.colourSlot}
              colourRank={card.colourRank}
              size="sm"
            />
          </span>
          <Link
            className="dh-ptable__open"
            to={`/projects/${encodeURIComponent(card.id)}`}
            /*
             * "Open <title>" is the product-wide accessible name for a record's
             * open link — `TaskRow`, `Card` and `EntityCard` all say it, and
             * AGENTS.md §7 makes one vocabulary a rule rather than a habit.
             * This row was the one collection surface that named itself
             * differently, so the same act was announced with different words
             * depending on which presentation of Projects the owner was in —
             * and after ADR-100 made the table the DEFAULT at forty Projects,
             * that is the announcement most owners get. The visible text is
             * contained in the name, so WCAG 2.5.3 (Label in Name) holds.
             */
            aria-label={`Open ${card.title}`}
          >
            {card.title}
          </Link>
        </span>
      </th>
      {/*
       * DHDS-10 — the Area, as a contextual choice.
       *
       * An ARCHIVED Project is read-only until it is restored (PROJ-05 §5), and
       * the repository already refuses the mutation; the cell renders the plain
       * value there rather than a control that could only ever fail.
       *
       * An absent value is still directly manipulable — "No Area" is the
       * invitation, held back until the row is engaged with — so the em dash
       * survives only for a Project that cannot be moved at all.
       */}
      <td className="dh-ptable__area">
        {card.isArchived ? (
          (card.areaLabel ?? <Absent label="No Area" />)
        ) : (
          <ProjectAreaCell card={card} onMoved={onLifecycleChange} />
        )}
      </td>
      <td className="dh-ptable__progress">
        <span className="dh-ptable__progress-inner">
          {card.progress.has ? (
            <>
              <ProgressTrack
                className="dh-ptable__track"
                label={`${card.title} progress`}
                percent={card.progress.percent}
                valueText={`${card.progress.summary} complete`}
                status={meterStatusFromTone(card.attention.tone)}
              />
              <span className="dh-ptable__percent">
                {card.progress.percent}%
              </span>
            </>
          ) : (
            // No tasks means no proportion, exactly as on the card: an empty
            // bar at 0% says "nothing done" when the truth is "nothing
            // planned".
            <Absent label="No tasks yet" />
          )}
        </span>
      </td>
      <td className="dh-ptable__numeric">
        {card.meta.map((fact) => fact.text).join(" · ")}
      </td>
      <td>{card.updatedLabel?.replace(/^Updated /, "") ?? <Absent />}</td>
      <td className="dh-ptable__actions">
        <OverflowMenu
          items={lifecycle.overflowActions}
          label={`More actions for ${card.title}`}
        />
        {lifecycle.dialogs}
      </td>
    </tr>
  );
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
    <span className="dh-ptable__absent">
      <span aria-hidden="true">—</span>
      <span className="dh-visually-hidden">{label}</span>
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
