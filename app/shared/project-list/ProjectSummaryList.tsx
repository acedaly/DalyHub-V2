/**
 * UNTITLED-05 — the ONE way a Project is drawn INSIDE another record.
 *
 * ── What this replaced ──────────────────────────────────────────────────────
 *
 * An Area's Projects tab and a Goal's Projects tab each built their own
 * `CardProps` and handed them to the generic `Card`, which drew:
 *
 *     ▭ Spanish course                                         [Active]
 *     Goal: Learn Spanish  ▁▁  Task roll-up: 0 of 1 task  Health: ● Stale
 *     No progress since 1 Jan 2020
 *
 * — a 12px monochrome glyph where `/projects` draws the Project's identity
 * mark, a mini progress bar inlined mid-sentence, two labelled metadata pairs
 * run together, and a status chip floated to the far right with nothing
 * aligned to it. Nothing about it read as the same object `/projects` draws,
 * which is the exact defect the migration brief names: *a Project should look
 * and behave recognisably like a Project regardless of where it appears*.
 *
 * ── What it is now ──────────────────────────────────────────────────────────
 *
 * The genuine Untitled `application/table` composition, with the SAME column
 * vocabulary `ProjectsTable` uses on `/projects?present=table` — identity mark,
 * name, status badge, measure, task count — so a Project inside an Area, a
 * Project inside a Goal and a Project in its own collection are one grammar at
 * three densities. What differs is only which columns the host has facts for,
 * which each caller declares.
 *
 * ── Why a table rather than a list of cards ─────────────────────────────────
 *
 * Because that is what the data is. An Area record's Projects tab is seventeen
 * Projects with five facts each; a list of cards states each fact beside a
 * different label on every row, and a table states each label once. It is also
 * what makes the tab answer the question a record tab exists for — "which of
 * these needs me?" — at a glance rather than by reading seventeen sentences.
 *
 * ── Adapting density, preserving identity ───────────────────────────────────
 *
 * On a phone the table recomposes to a row with the name and one quiet line of
 * the facts the hidden columns carried — the same recomposition `ProjectsTable`
 * performs, so a Project inside an Area on a handset looks like a Project in
 * its own collection on a handset.
 *
 * Presentation only. It resolves no health, no colours and no arithmetic: the
 * caller hands it already-derived display data, which is what lets the Areas
 * module and the Goals module render the SAME component without either
 * reaching into the other (AGENTS.md §9).
 */

import type { ReactNode } from "react";
import { Link } from "react-router";

import {
  AccentIcon,
  identityAttribute,
  resolveIdentity,
} from "~/shared/entity";
import { UntitledStatusBadge, type PillTone } from "~/shared/pill";
import { LabelledProgressBar } from "~/shared/ui/untitled/overrides/labelled-progress-bar";
import { LabelledTableHead } from "~/shared/ui/untitled/overrides/table-head";
import { Table, TableCard } from "~/shared/ui/untitled/application/table/table";

/** A Project as a host record needs to draw it. Every field already derived. */
export type ProjectSummaryItem = {
  readonly id: string;
  readonly title: string;
  /**
   * The lifecycle word and its tone — "Active", "Completed", "Archived".
   *
   * A `PillTone`, not the wider `CardTone`: the chip is an Untitled badge, and
   * `HealthTone` is already a strict subset of `PillTone`, so a health state
   * drops in with no mapping and no tone the badge cannot render. This is the
   * same narrowing `ProjectCardStatus` records, for the same reason.
   */
  readonly status: { readonly label: string; readonly tone: PillTone };
  /**
   * The bounded task measure, or `null` for a Project with no tasks.
   *
   * ABSENT rather than zero, for the reason `ProjectCard` gives at length: an
   * empty bar at 0% says "nothing done" when the truth is "nothing planned",
   * and the two are different facts.
   */
  readonly progress: {
    readonly percent: number;
    /** "3 of 8 tasks" — the caller's own arithmetic, never recomputed here. */
    readonly summary: string;
    /** How the measure is GOING, from the caller's evaluator. */
    readonly tone?: "neutral" | "positive" | "caution" | "critical";
  } | null;
  /**
   * The health SIGNAL, where the host has one. `null` on a surface whose
   * projection carries no health (a Goal's contributing Projects), and on a
   * Project the shared visibility rule says has no active health to report.
   */
  readonly signal: {
    readonly label: string;
    readonly tone: PillTone;
    readonly detail: string | null;
  } | null;
  /** The Project's context inside this host — "Goal: Launch the site". */
  readonly context: {
    readonly label: string;
    readonly href?: string;
  } | null;
  /** The Project's own identity, where the host's projection carries it. */
  readonly iconKey?: string | null;
  readonly colourSlot?: string | null;
  readonly colourRank?: number | null;
  /** Quieter treatment for an archived Project. Always stated in words too. */
  readonly muted?: boolean;
};

export type ProjectSummaryListProps = {
  readonly projects: readonly ProjectSummaryItem[];
  /** Names the table for assistive technology. A sentence, not a word. */
  readonly label: string;
  /**
   * Whether the host has health facts at all. When false the Signal column is
   * not drawn — an empty column is worse than an absent one, and a screen
   * reader would announce every cell under a heading that never has a value.
   */
  readonly showSignal?: boolean;
  /** Whether to draw the context column ("Goal: …" / "Directly in this Area"). */
  readonly showContext?: boolean;
  /** The context column's heading. Required when `showContext`. */
  readonly contextLabel?: string;
  /** A footer beneath the table, inside its card — a "Load more", a note. */
  readonly footer?: ReactNode;
  readonly "data-testid"?: string;
};

export function ProjectSummaryList({
  projects,
  label,
  showSignal = false,
  showContext = false,
  contextLabel = "Context",
  footer,
  "data-testid": testId,
}: ProjectSummaryListProps) {
  return (
    // Adapted from the Untitled UI React `application/table` source, in the
    // card-bounded arrangement Untitled's Pro Application UI dashboards use for
    // a collection table. Changes: DalyHub Project columns and row controls.
    <TableCard.Root
      size="sm"
      className="rounded-lg bg-primary shadow-xs ring-1 ring-secondary"
      data-untitled-source="application/table:table-card"
    >
      <Table
        aria-label={label}
        size="sm"
        // See `ProjectsTable`: a fixed layout is what makes the truncation real
        // rather than letting a long name push the trailing columns out.
        className="table-fixed bg-primary max-md:block"
        data-testid={testId}
      >
        <Table.Header className="bg-secondary [&_th]:px-5 max-md:hidden">
          <LabelledTableHead
            id="project"
            label="Project"
            isRowHeader
            className={showSignal && showContext ? "w-[30%]" : "w-[40%]"}
          />
          <LabelledTableHead
            id="status"
            label="Status"
            className="w-[13%] whitespace-nowrap"
          />
          <LabelledTableHead
            id="progress"
            label="Progress"
            className="w-[18%]"
          />
          {showSignal ? (
            <LabelledTableHead id="signal" label="Signal" className="w-[21%]" />
          ) : null}
          {showContext ? (
            <LabelledTableHead
              id="context"
              label={contextLabel}
              className="w-[18%]"
            />
          ) : null}
        </Table.Header>
        <Table.Body>
          {projects.map((project) => (
            <ProjectSummaryRow
              key={project.id}
              project={project}
              showSignal={showSignal}
              showContext={showContext}
            />
          ))}
        </Table.Body>
      </Table>
      {footer ? (
        // Untitled's card FOOTER band — the same divided strip
        // `application/pagination`'s card footer draws beneath a table.
        <div className="flex items-center justify-center border-t border-secondary px-5 py-3">
          {footer}
        </div>
      ) : null}
    </TableCard.Root>
  );
}

function ProjectSummaryRow({
  project,
  showSignal,
  showContext,
}: {
  readonly project: ProjectSummaryItem;
  readonly showSignal: boolean;
  readonly showContext: boolean;
}) {
  return (
    <Table.Row
      id={project.id}
      size="sm"
      // `h-auto` first — see `ProjectsTable`: Untitled's fixed `h-14` is right
      // for a desktop row and wrong for the phone row, which carries a second
      // line of the facts the hidden columns would have.
      className="h-auto min-h-14 bg-primary hover:bg-secondary max-md:grid max-md:grid-cols-1 max-md:gap-x-3 max-md:py-2"
      {...identityAttribute(
        resolveIdentity({
          colourSlot: project.colourSlot ?? null,
          colourRank: project.colourRank ?? null,
        }).slot,
      )}
      data-muted={project.muted ? "true" : undefined}
      data-testid="project-summary-row"
    >
      {/* `max-md:relative`, so the title link can stretch over the cell on a
       * phone. See the note on the link itself. */}
      <Table.Cell className="px-5 py-3 max-md:relative max-md:px-4">
        <span className="flex min-w-0 items-center gap-3">
          <span className="shrink-0" aria-hidden="true">
            <AccentIcon
              entityType="project"
              iconKey={project.iconKey ?? null}
              colourSlot={project.colourSlot ?? null}
              colourRank={project.colourRank ?? null}
              size="sm"
            />
          </span>
          {/*
           * On a PHONE the link stretches over its cell — see `AreasTable` for
           * the measurement. A table row is ~100px tall on a handset and the
           * title text is 20px of it, so without this a finger can only hit two
           * words. Phone only, and over the row-header cell, so no other
           * control in the row is covered.
           */}
          <Link
            className={`truncate text-sm font-semibold text-primary outline-focus-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 max-md:after:absolute max-md:after:inset-0 max-md:after:content-['']`}
            to={`/projects/${encodeURIComponent(project.id)}`}
            // The product-wide accessible name for a record's open link
            // (AGENTS.md §7). The visible text is contained in the name, so
            // WCAG 2.5.3 (Label in Name) holds.
            aria-label={`Open ${project.title}`}
          >
            {project.title}
          </Link>
        </span>
        {/*
         * The phone row carries the facts the hidden columns would have, in one
         * quiet line below the name — the table does not become a horizontally
         * scrolling grid on a handset, and no fact is simply lost.
         */}
        <span className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-tertiary md:hidden">
          <UntitledStatusBadge tone={project.status.tone} dot size="sm">
            {project.status.label}
          </UntitledStatusBadge>
          {project.progress ? <span>{project.progress.summary}</span> : null}
          {project.signal ? <span>{project.signal.label}</span> : null}
          {showContext && project.context ? (
            <span className="min-w-0 truncate">{project.context.label}</span>
          ) : null}
        </span>
      </Table.Cell>
      <Table.Cell className="px-5 py-3 max-md:hidden">
        <UntitledStatusBadge tone={project.status.tone} dot size="sm">
          {project.status.label}
        </UntitledStatusBadge>
      </Table.Cell>
      <Table.Cell className="px-5 py-3 max-md:hidden">
        {project.progress ? (
          <LabelledProgressBar
            label={`${project.title} progress`}
            value={project.progress.percent}
            valueText={`${project.progress.summary} complete`}
            tone={project.progress.tone ?? "neutral"}
            showValue
          />
        ) : (
          <Absent label="No tasks yet" />
        )}
      </Table.Cell>
      {showSignal ? (
        <Table.Cell className="px-5 py-3 text-sm text-tertiary max-md:hidden">
          {project.signal ? (
            <span className="flex min-w-0 flex-col gap-0.5">
              <UntitledStatusBadge tone={project.signal.tone} dot size="sm">
                {project.signal.label}
              </UntitledStatusBadge>
              {project.signal.detail ? (
                <span className="truncate text-xs">
                  {project.signal.detail}
                </span>
              ) : null}
            </span>
          ) : (
            // A Project with nothing to report says nothing. "On track" on a
            // Planned Project would be a judgement the evaluator did not make.
            <Absent label="Nothing to report" />
          )}
        </Table.Cell>
      ) : null}
      {showContext ? (
        <Table.Cell className="truncate px-5 py-3 text-sm text-tertiary max-md:hidden">
          {project.context ? (
            project.context.href ? (
              // A separate link from the row's own open target, so no nested
              // interactivity is created: the row header opens the Project and
              // this opens the Goal it advances.
              <Link
                className="truncate rounded-sm text-tertiary outline-focus-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                to={project.context.href}
              >
                {project.context.label}
              </Link>
            ) : (
              project.context.label
            )
          ) : (
            <Absent />
          )}
        </Table.Cell>
      ) : null}
    </Table.Row>
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
