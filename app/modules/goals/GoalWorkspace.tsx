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
 * the pane still plot the full history from their own `listMeasurements` read,
 * which is a different method — so the removal costs this surface nothing, and
 * leaves `listMeasurementSeries` with no caller ([DEBT-212]).
 *
 * **Alignment survives as a quiet state.** ADR-040's signal — whether recent
 * Task activity has contributed to a Goal — is not a measure and must not be
 * drawn as one, so it is not a second bar and not a loud badge. It is the
 * `AlignmentIndicator` on the selected Goal's pane, and the row's own
 * accessible name carries it in words.
 */

import { useId } from "react";
import type { ReactNode } from "react";

import { ProgressRowList } from "~/shared/card";
import { DrawerTrigger } from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { LoadMore } from "~/shared/load-more";
import { PlusIcon } from "~/shared/icons";
import { ViewTabs } from "~/shared/view-switcher";
import { GoalStoryRow } from "~/shared/goal-progress";

import { goalIdentitySource, goalListStory } from "./goal-view";
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
          /*
           * STEER-03 — the ONE Goal-story row, shared with the Area record.
           *
           * This list used to build its own `ProgressRow` from the same values.
           * That was fine while `/goals` was the only surface telling a Goal's
           * whole story; the moment the Area record and the guided Review told
           * it too, "the same values assembled three times" is precisely how
           * three surfaces come to disagree (DEBT-206 is what that looks like).
           * So the assembly moved to `~/shared/goal-progress`, and this list
           * renders it.
           *
           * Nothing about what the row DRAWS changed: the mark is
           * `goalIdentitySource`'s (DEBT-208), the context is the Area then the
           * derived status, the signal is FOLLOW-02's movement line, the bar is
           * GOAL-02's measurement with POLISH-01's status ramp, and the
           * accessible name still carries alignment and movement in words.
           * `showAlignment` stays FALSE here because REDESIGN-04 §6.2 put the
           * indicator on the pane beside this list.
           */
          <GoalStoryRow
            key={goal.id}
            data-testid="goal-row"
            story={goalListStory(goal)}
            identity={goalIdentitySource({
              own: { iconKey: goal.iconKey, colourSlot: goal.colourSlot },
              area: goal.area,
            })}
            href={`/goals?goal=${encodeURIComponent(goal.id)}`}
            contextLead={goal.area.title}
            selected={goal.id === selectedId}
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
