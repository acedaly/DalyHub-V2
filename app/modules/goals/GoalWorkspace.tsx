/**
 * REDESIGN-04 §2.2 — the Goals workspace: its two-pane frame, its list and its
 * tab rail.
 *
 * `mockup3.png` draws Goals as a master–detail. The list is the master; the
 * pane beside it is the selected Goal's Overview (`GoalWorkspacePane`).
 *
 * ── The list row, and what it replaced ──────────────────────────────────────
 * Each row is the shared `ProgressRow`: a tinted mark, the Goal's name, its
 * Area beneath, a thin bar and the Goal's OWN honest value at the line's end —
 * `60.0 / 70 kg`, `12 / 24`, `75% complete`. It replaces a gallery card that
 * carried the same facts plus a sparkline, an alignment line and a
 * contribution count, nine times over.
 *
 * **The sparkline did not survive, and that is a decision rather than an
 * omission** (§6.2 asks for one, made once). Its job was "which way is this
 * going?" in a card ~260px wide. On a row the bar and the value answer "how far
 * along?" in the same glance, and a 100px sketch of twelve readings squeezed
 * between them would be a third measure of the same Goal at a size that can
 * carry no scale. The trend is not lost: selecting the row draws the FULL chart
 * beside it, at a size where the shape genuinely reads — which is the whole
 * point of a master–detail.
 *
 * **STEER-01 removed the series READ as well** (DEBT-207). REDESIGN-04 left
 * `listMeasurementSeries` in the collection's loader on the reasoning that
 * "nothing else about that read changed" — but nothing on this surface
 * consumed it, so every page and every revalidation transferred a run of
 * readings per Goal to draw a component that had been deleted. The record and
 * the pane still plot the full history from their own read.
 *
 * **Alignment survives as a quiet state.** ADR-040's signal — whether recent
 * Task activity has contributed to a Goal — is not a measure and must not be
 * drawn as one, so it is not a second bar and not a loud badge. It is the
 * `AlignmentIndicator` on the selected Goal's pane, and the row's own
 * accessible name carries it in words.
 */

import { useId } from "react";
import type { ReactNode } from "react";

import { ProgressRow, ProgressRowList } from "~/shared/card";
import { DrawerTrigger } from "~/shared/drawer";
import { AccentIcon } from "~/shared/entity";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { LoadMore } from "~/shared/load-more";
import { PlusIcon } from "~/shared/icons";
import { ViewTabs } from "~/shared/view-switcher";
import {
  GoalMovementLine,
  alignmentAccessibleSummary,
  goalMovementStatement,
  type GoalAlignment,
} from "~/shared/alignment";
import {
  goalProgressMeterStatus,
  goalProgressStatusLabel,
  goalProgressSummaryText,
  goalRowValue,
} from "~/shared/goal-progress";

import { goalIdentitySource, resolveGoalIdentity } from "./goal-view";
import type { SerializedGoalWithAlignment } from "./GoalsCollection";

/**
 * The frame. Two panes at desktop widths, two SCREENS on a phone.
 *
 * Both children are always rendered and the swap is pure CSS (see
 * `goals.css`), so the first server byte is correct at every width and there is
 * no viewport sniffing — the same technique the collection layout already uses
 * for its desktop-filters/phone-sheet swap. On a phone the pane is shown only
 * when a Goal was genuinely ASKED FOR, and the list otherwise — which is §7's
 * "list → detail as two screens" without a second route or a second loader.
 *
 * The distinction between an asked-for and a defaulted selection matters only
 * here. On a desktop both panes are on screen, so opening the workspace on its
 * first Goal is exactly what the reference draws; on a phone the same default
 * would mean `/goals` never shows the Goals.
 */
export function GoalWorkspaceLayout({
  list,
  detail,
  selectionExplicit = false,
}: {
  readonly list: ReactNode;
  readonly detail: ReactNode;
  /**
   * §7 — true when the URL genuinely named a Goal. On a phone the pane is the
   * whole screen, so a DEFAULTED selection must not replace the list: `/goals`
   * has to open on the Goals, not on a record nobody asked for.
   */
  readonly selectionExplicit?: boolean;
}) {
  return (
    <div
      className="dh-goalspace"
      data-selection={selectionExplicit ? "explicit" : undefined}
      data-testid="goals-workspace"
    >
      <div className="dh-goalspace__list">{list}</div>
      <div className="dh-goalspace__detail">{detail}</div>
    </div>
  );
}

export function GoalWorkspaceList({
  goals,
  selectedId,
  hasMore,
  loading,
  loadFailed,
  onLoadMore,
  failed,
}: {
  readonly goals: readonly SerializedGoalWithAlignment[];
  readonly selectedId: string | null;
  readonly hasMore: boolean;
  readonly loading: boolean;
  readonly loadFailed: boolean;
  readonly onLoadMore: () => void;
  readonly failed: boolean;
}) {
  const headingId = useId();
  return (
    <div className="dh-goalspace__panel">
      {/*
       * A real heading, not an `aria-label`.
       *
       * Each row's title is an `h3` (so a row nests correctly under the pane's
       * own headings), and an `h3` with no `h2` above it is a broken heading
       * order — a genuine axe failure, caught by the E2E sweep. It is visually
       * hidden because the collection's own `h1` two lines above already says
       * "Goals" to a sighted reader; a screen-reader user gets the outline.
       *
       * ── DHDS-13 — a `div`, and it was a NAMED `<section>` ──────────────────
       * A `<section>` with an accessible name is a `region` LANDMARK, so
       * pointing this one at the heading below gave `/goals` two landmarks both
       * called "Goals" — the collection's own region and this one. axe reported
       * it (`landmark-unique`, the single automated violation left anywhere in
       * the product) and it is a real defect: landmark navigation is a menu of
       * destinations, and two identical entries make it useless. The heading
       * stays, so the outline a screen-reader user walks is unchanged; only the
       * duplicate landmark goes.
       */}
      <h2 id={headingId} className="dh-visually-hidden">
        Goals
      </h2>
      <ProgressRowList label="Goals" data-testid="goals-list">
        {goals.map((goal) => (
          <ProgressRow
            key={goal.id}
            data-testid="goal-row"
            icon={
              /*
               * STEER-01 (DEBT-208) — the ONE Goal identity projection.
               *
               * The rule (the Goal's own choice first, its Area's otherwise,
               * colour and glyph walked independently) is stated once in
               * `goalIdentitySource` and consumed here, on the pane and on the
               * record — so the row and the pane beside it cannot resolve two
               * different marks for the same Goal.
               */
              <AccentIcon
                entityType="goal"
                {...goalIdentitySource({
                  own: { iconKey: goal.iconKey, colourSlot: goal.colourSlot },
                  area: goal.area,
                })}
                size="sm"
              />
            }
            title={goal.title}
            headingLevel={3}
            /*
             * FOLLOW-02 — the context line is unchanged for a MEASURED Goal.
             *
             * For an unmeasured one, `goalProgressStatusLabel` reads "Not
             * measured", which is a true and useful thing to say beside the
             * Area — and it is now followed by a sentence that says whether the
             * Goal moved, which is what an unmeasured Goal previously had no
             * way of saying anywhere.
             */
            context={`${goal.area.title} · ${goalProgressStatusLabel(goal.progress.status)}`}
            signal={
              goal.movement ? (
                <GoalMovementLine movement={goal.movement} />
              ) : null
            }
            accent={goal.area.colourRank}
            colourSlot={
              resolveGoalIdentity({
                own: { iconKey: goal.iconKey, colourSlot: goal.colourSlot },
                area: goal.area,
              }).slot
            }
            selected={goal.id === selectedId}
            progress={
              goal.progress.progressPercent === null
                ? undefined
                : {
                    percent: goal.progress.progressPercent,
                    valueText: goalProgressSummaryText(goal.progress),
                    // POLISH-01 — the bar states how the Goal is GOING. It used
                    // to take the Goal's identity hue, so "60.0 / 70 kg ·
                    // Ahead" could be drawn in red.
                    status: goalProgressMeterStatus(goal.progress.status),
                  }
            }
            value={goalRowValue(goal.progress)}
            /*
             * The workspace's own URL. Selecting a Goal is a change of
             * selection, not a change of page, so it stays on `/goals` and the
             * pane beside the list updates — which is what makes Back leave the
             * workspace rather than walk every Goal the owner glanced at.
             */
            href={`/goals?goal=${encodeURIComponent(goal.id)}`}
            // The row's accessible name carries what the row's DRAWING
            // deliberately does not: ADR-040's alignment state, in words.
            /*
             * The row's accessible name carries BOTH derived answers the
             * drawing keeps quiet: ADR-040's alignment state, and FOLLOW-02's
             * movement — which are different questions and are allowed to
             * disagree, so the name states each rather than reconciling them.
             */
            openAriaLabel={`${goal.title} — ${goalRowAlignmentText(goal.alignment)}${
              goal.movement
                ? ` ${goalMovementStatement(goal.movement).headline}`
                : ""
            }`}
          />
        ))}
      </ProgressRowList>

      {!failed && hasMore ? (
        <LoadMore
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={onLoadMore}
          label="Load more Goals"
        />
      ) : null}

      {/*
       * §5.1 — `+ Add goal` closes the list, exactly as the reference draws it.
       *
       * The mockup wins on the entry point; the architecture wins on the shape.
       * A Goal has no existence outside an Area (AREA-02 / ADR-040 lineage), so
       * this leads to the ONE creation flow, which requires choosing an Area
       * and posts through the same trusted endpoint the Area record's own
       * "New Goal" uses. One more door into the same room — not a second
       * creation system.
       */}
      <DrawerTrigger
        drawerKey="new-goal"
        className="dh-goalspace__add"
        data-testid="goal-add"
      >
        <PlusIcon aria-hidden="true" />
        Add goal
      </DrawerTrigger>
    </div>
  );
}

/** The alignment state in words, for a row's accessible name. */
function goalRowAlignmentText(alignment: GoalAlignment): string {
  return alignmentAccessibleSummary(alignment);
}

/**
 * The pane's tab rail — composed from what a Goal REALLY has (§5.2).
 *
 * Overview is the pane itself and stays on the workspace URL. The three deeper
 * tabs are the canonical record's, so they navigate to it: the workspace is a
 * place to read and to record a measurement, and the record is where a Goal's
 * full Projects list, linked records and audit history live. Sending those tabs
 * to the record rather than re-rendering them here is what keeps ONE
 * implementation of each.
 *
 * See `GoalWorkspacePane` for why there is no Habits tab and no Tasks tab.
 */
export function GoalWorkspaceTabs({ goalId }: { readonly goalId: string }) {
  const record = `/goals/${encodeURIComponent(goalId)}`;
  return (
    <ViewTabs
      className="dh-goalpane__rail"
      data-testid="goal-workspace-tabs"
      param="pane"
      value="overview"
      label="Goal sections"
      options={[
        {
          value: "overview",
          label: "Overview",
          to: `/goals?goal=${encodeURIComponent(goalId)}`,
        },
        { value: "projects", label: "Projects", to: `${record}?tab=projects` },
        { value: "links", label: "Links", to: `${record}?tab=linked` },
        { value: "history", label: "History", to: `${record}?tab=activity` },
      ]}
    />
  );
}

/** The workspace with no Goals at all — one sentence and one way forward. */
export function GoalWorkspaceEmpty() {
  return (
    <EmptyState
      icon={<EntityIcon type="goal" />}
      title="No Goals yet"
      description="Goals are the aspirational outcomes you pursue under an Area. Every Goal lives in one, so creating a Goal starts by choosing its Area."
      primaryAction={
        <DrawerTrigger drawerKey="new-goal" className="dh-btn dh-btn--primary">
          Add goal
        </DrawerTrigger>
      }
    />
  );
}
