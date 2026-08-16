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
 */

import { Link } from "react-router";

import { AccentIcon } from "~/shared/entity";
import { OverflowMenu } from "~/shared/overflow-menu";
import { areaAccentForRank } from "~/shared/pill";
import { useRecordLifecycle } from "~/shared/record-lifecycle";

import type { ProjectCardData } from "./project-view";

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
          Projects, with their Area, progress, task counts and last update.
        </caption>
        <thead>
          <tr>
            <th scope="col">Project</th>
            <th scope="col">Area</th>
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
      // The SAME six-slot identity ramp the gallery card paints its mark and
      // bar from, resolved from the same stable rank — one identity across both
      // presentations, never a second colour decision for the table.
      data-accent={String(areaAccentForRank(card.colourRank))}
      data-muted={card.isArchived ? "true" : undefined}
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
              colourRank={card.colourRank}
              size="sm"
            />
          </span>
          <Link
            className="dh-ptable__open"
            to={`/projects/${encodeURIComponent(card.id)}`}
          >
            {card.title}
          </Link>
        </span>
      </th>
      {/* An absent value is an em dash with an accessible word behind it, never
       * an empty cell — a blank reads as "failed to load". */}
      <td>{card.areaLabel ?? <Absent label="No Area" />}</td>
      <td className="dh-ptable__progress">
        <span className="dh-ptable__progress-inner">
          {card.progress.has ? (
            <>
              <span
                className="dh-ptable__track"
                role="progressbar"
                aria-valuenow={card.progress.percent}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuetext={`${card.progress.percent}% — ${card.progress.summary} complete`}
                aria-label={`${card.title} progress`}
              >
                <span
                  className="dh-ptable__fill"
                  style={{ inlineSize: `${card.progress.percent}%` }}
                />
              </span>
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
