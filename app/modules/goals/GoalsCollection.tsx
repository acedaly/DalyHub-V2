/**
 * AREA-03 / PX-04 — the Goals collection view: the Alignment view (ADR-040).
 *
 * Replaces the placeholder `/goals` surface with the shared PX-02 Collection
 * Layout and DS-04 Card. Every open Goal across every Area is shown with its
 * derived alignment state (`AlignmentIndicator`) so the owner can see, at a
 * glance, which Goals have had recent Task action and which have not. The
 * component contains no server imports; the loader hands it JSON-safe Goal +
 * alignment summaries. Goal CREATION stays owned by the Area record (AREA-02)
 * — this collection is a read-only alignment surface, not a second creation
 * entry point.
 *
 * PX-04 adds the `?state=active|deleted` lifecycle filter, identical in shape and
 * wording to the Notes collection's (ADR-042): `deleted` lists ONLY soft-deleted
 * Goals and offers a one-click Restore, so removing a Goal is reversible for good
 * and never a dead end — the durable path back when an Undo toast is missed.
 *
 * ── What this surface is, since REDESIGN-04 and STEER-01 ────────────────────
 * The ACTIVE view is the master–detail WORKSPACE (`GoalWorkspaceLayout`): a
 * `ProgressRow` list on the left and the selected Goal's Overview beside it.
 * DS-16's `EntityCard`/`EntityCardGrid` foundation is now true only of the
 * **Deleted** view, whose cards carry identity, a deletion date and one Restore
 * action — no open target, because a soft-deleted record's canonical route
 * 404s. (This comment described the card grid as the active view's foundation
 * until STEER-01 corrected it — [DEBT-211] item 2.)
 *
 * ── STEER-01: the order, the lenses and the counts are the SERVER's ─────────
 * `/goals` is the outcomes workspace. Its order is the workspace-wide outcome
 * ranking established in SQL before pagination, the active lens is applied in
 * that same read, and every count beside a lens is the workspace figure the
 * loader read. This component therefore **never re-sorts and never re-filters**
 * — either would turn a workspace answer back into a page-local one — and it
 * shows a lens no number at all when the workspace figure is unavailable, which
 * is [DEBT-121]'s rule.
 */

import { useCallback, useMemo } from "react";
import { useNavigate, useRevalidator } from "react-router";

import { EntityCard, EntityCardGrid } from "~/shared/card";
import {
  CollectionLayout,
  collectionCountLabel,
  useCollectionLoading,
} from "~/shared/collection-layout";
import {
  DrawerProvider,
  DrawerTrigger,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import type { SelectOption } from "~/shared/forms/types";
import { NewGoalForm } from "~/shared/goal-creation/NewGoalForm";
import { AccentIcon, EntityIcon, emptyCollectionTitle } from "~/shared/entity";
import { HistoryIcon } from "~/shared/icons";
import { LoadMore, useKeysetPagination } from "~/shared/load-more";
import type { InlineSaveOutcome } from "~/shared/inline-edit";
import { useCollectionRestore } from "~/shared/record-lifecycle";
import { ViewTabs, type ViewTabOption } from "~/shared/view-switcher";
import { formatCalendarDate } from "~/shared/task-record/task-view";
import type { GoalAlignment, GoalMovement } from "~/shared/alignment";
import {
  GOAL_COLLECTION_VIEWS,
  GOAL_COLLECTION_VIEW_LABELS,
  type GoalCollectionView,
  type GoalProgressEvaluation,
} from "~/shared/goal-progress";
import type { GoalCondition, GoalOutcomeLensCounts } from "~/kernel/goals";

import { goalIdentitySource } from "./goal-view";
import {
  GoalWorkspaceLayout,
  GoalWorkspaceList,
  GoalWorkspaceTabs,
} from "./GoalWorkspace";
import { GoalWorkspacePane } from "./GoalWorkspacePane";
import type { GoalWorkspaceDetail } from "./goal-workspace-load";
import type {
  SerializedGoalListItem,
  SerializedGoalProjectContribution,
} from "./goal-view";
import type { GoalMutationResult } from "./routes/mutate";

export type SerializedGoalWithAlignment = SerializedGoalListItem & {
  readonly alignment: GoalAlignment;
  /**
   * M3X-02 — how many of the Projects advancing this Goal are complete.
   *
   * The Goal's measure when it has no measurement of its own, which was every
   * Goal until GOAL-02 and is still every Goal that has not opted in. The
   * collection loader has ALWAYS read it (it is an input to the alignment
   * evaluation); until M3X-02 it was computed, used once, and thrown away before
   * the card that most needed it.
   */
  readonly contribution: SerializedGoalProjectContribution;
  /**
   * GOAL-02 — the Goal's OWN measure, when it has one.
   *
   * M3X-02 reasoned that "a DalyHub Goal carries no numeric target and no unit,
   * so the mockups' weight readings have nothing behind them". That was true of
   * the product it was written against. A Goal can now carry a baseline, a
   * target and a unit, so when it does, this is the better answer to the same
   * question and the card leads with it. When it does not, `measured` is false
   * and the card is exactly the M3X-02 card, unchanged.
   */
  readonly progress: GoalProgressEvaluation;
  /**
   * STEER-02 — the OWNER's condition (`null` = pursuing).
   *
   * Stated BESIDE the derived answers, never merged into them and never an
   * input to any of them (ADR-111 decisions 1–3). The row and the pane render
   * it from this one value, so the two surfaces cannot describe the owner's
   * judgement differently.
   */
  readonly condition?: GoalCondition | null;
  /**
   * FOLLOW-02 — whether this Goal moved inside the named window.
   *
   * The SAME `GoalMovement` value Today's tile and the Goal record render, from
   * one derivation ([ADR-110] decision 6), so the three surfaces cannot describe
   * the same Goal's week differently. Optional only so a fixture that predates
   * FOLLOW-02 still type-checks; the loader always supplies it.
   */
  readonly movement?: GoalMovement | null;
};

/** A soft-deleted Goal, as the honest "Deleted" view shows it: identity only. */
export type SerializedDeletedGoalItem = {
  readonly id: string;
  readonly title: string;
  readonly updatedAt: string;
};

/** The two lifecycle views of the Goals collection (`?state=`). */
export type GoalCollectionState = "active" | "deleted";

/**
 * CONVERGE-01 §9 — ONE filter surface, and it is the tab rail.
 *
 * Goals carried two. `Active | Deleted` sat in the header's view slot beside the
 * title, and `All | On track | Needs attention | Completed` sat in the filter
 * band beneath it. DS-05 had already made them different SHAPES so a reader
 * could tell a mode from a filter — which was right, and did not answer the
 * audit's actual complaint: two rows of controls above the first Goal, on the
 * calmest band of the page, for one question ("which Goals am I looking at?").
 *
 * ── Why this rail, and not an overflow item or a "Show deleted" toggle ──────
 * Projects already solved this exact shape and is the convention to follow
 * rather than a third one to invent: its lifecycle scopes — `Active · All ·
 * Completed · Archived` — are ONE `ViewTabs` rail in the filter band, and the
 * header's view slot is left free (`ProjectsCollection`). "Archived" sits there
 * as a peer of "Completed" and nothing about that reads oddly, because both
 * answer "which set?".
 *
 * That is also what settles the audit's own objection. "Deleted" is not a peer
 * of "Active" — one is a scope and the other was standing in for "everything
 * else" — but it IS a peer of "Completed": both name a set of Goals the owner
 * is deliberately looking at instead of the live ones. In this rail it is
 * exactly that, and it is LAST, where a rail's least-frequent destination
 * belongs.
 *
 * `to` rather than a param value, because Deleted is a different SCOPE with a
 * different server-side read: it writes `?state=deleted` while its four
 * neighbours write `?view=`. `ViewTabs` has carried per-tab paths since CAL-02
 * for precisely this case, so one rail can hold both without either param
 * learning about the other.
 */
const GOAL_DELETED_TAB_VALUE = "__deleted";

/**
 * The one rail, built once so the two scopes cannot draw different versions of
 * it.
 *
 * ── STEER-01 — what a number beside a lens now means (DEBT-121) ─────────────
 * `counts` is the WORKSPACE-TRUE figure the loader read
 * (`countGoalsByOutcomeLens`), from the same status and lens expressions the
 * collection read is filtered by. It used to be a tally of the loaded page
 * standing beside a label that reads as the workspace — the trust cost
 * DEBT-121 names. It is `undefined` on the Deleted scope and whenever the
 * workspace read failed, and then no lens carries a number at all: DEBT-121's
 * rule is that a count is workspace-true or absent, never page-local.
 */
function goalViewTabs(
  counts?: GoalOutcomeLensCounts,
): readonly ViewTabOption[] {
  return [
    ...GOAL_COLLECTION_VIEWS.map((option) => ({
      value: option,
      label:
        option === "all" || counts === undefined
          ? GOAL_COLLECTION_VIEW_LABELS[option]
          : `${GOAL_COLLECTION_VIEW_LABELS[option]} ${counts[option]}`,
      // From the Deleted scope every status tab has to drop `?state=deleted`
      // as well as set its own param, which a param-derived target cannot do.
      ...(counts === undefined
        ? { to: option === "all" ? "/goals" : `/goals?view=${option}` }
        : {}),
    })),
    {
      value: GOAL_DELETED_TAB_VALUE,
      label: "Deleted",
      to: "/goals?state=deleted",
    },
  ];
}

export interface GoalsCollectionViewProps {
  readonly goals: readonly SerializedGoalWithAlignment[];
  readonly deletedGoals?: readonly SerializedDeletedGoalItem[];
  readonly nextCursor: string | null;
  /**
   * REDESIGN-04 — the selected Goal's detail, for the workspace's right pane.
   * `null` when nothing is selected, when the workspace is empty, or when the
   * one detail read failed — the list stays perfectly usable in all three.
   */
  readonly selected?: GoalWorkspaceDetail | null;
  /** FOLLOW-02 — the selected Goal's movement, the same value its row carries. */
  readonly selectedMovement?: GoalMovement | null;
  /** The RESOLVED selection, so a row is highlighted only if its pane loaded. */
  readonly selectedId?: string | null;
  /**
   * §7 — true when the URL genuinely named a Goal, false when the workspace
   * merely opened on its first. The phone shows the LIST unless a Goal was
   * asked for; see `goals.css`.
   */
  readonly selectionExplicit?: boolean;
  /** §5.1 — the Areas the `+ Add goal` flow chooses from. */
  readonly areaOptions?: readonly SelectOption[];
  readonly areaOptionsFailed?: boolean;
  readonly todayIso?: string | null;
  readonly timeZone?: string | null;
  /**
   * STEER-01 — the WORKSPACE-TRUE lens counts (DEBT-121). `null` on the Deleted
   * scope and whenever the workspace read failed, and then no lens shows a
   * number: a count is true of the set its label names, or it is not shown.
   */
  readonly lensCounts?: GoalOutcomeLensCounts | null;
  readonly state?: GoalCollectionState;
  /**
   * STEER-01 — the lens (`?view=`). It narrows the WORKSPACE in the collection
   * read; this prop only says which lens is active, so the rail can mark it.
   */
  readonly view?: GoalCollectionView;
  readonly failed: boolean;
}

type GoalsPageData = {
  readonly goals: readonly SerializedGoalWithAlignment[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
};

type DeletedGoalsPageData = {
  readonly deletedGoals: readonly SerializedDeletedGoalItem[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
};

export function GoalsCollectionView({
  goals,
  deletedGoals = [],
  nextCursor,
  selected = null,
  selectedMovement = null,
  selectedId = null,
  selectionExplicit = false,
  areaOptions = [],
  areaOptionsFailed = false,
  todayIso = null,
  lensCounts = null,
  state = "active",
  view = "all",
  failed,
}: GoalsCollectionViewProps) {
  /*
   * REDESIGN-04 §5.1 — the creation flow the reference's `+ Add goal` opens.
   *
   * A Drawer over the workspace, hosting the SAME `NewGoalForm` the Area record
   * uses, posting the SAME body to the SAME trusted `/goals/new` endpoint. The
   * only difference is that this door makes the Area a required field instead
   * of already knowing it, because a Goal without an Area home is not a thing
   * the model has. No second creation system, and no kernel change.
   */
  const renderDrawer = useMemo(() => {
    return function render(entry: DrawerEntry): DrawerRenderResult | null {
      if (entry.key !== NEW_GOAL_KEY) return null;
      return {
        title: "New Goal",
        description: "Create a Goal in one of your Areas.",
        children: (
          <NewGoalFormHost
            areaOptions={areaOptions}
            areaOptionsFailed={areaOptionsFailed}
          />
        ),
      };
    };
  }, [areaOptions, areaOptionsFailed]);

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <GoalsCollection
        goals={goals}
        deletedGoals={deletedGoals}
        nextCursor={nextCursor}
        selected={selected}
        selectedMovement={selectedMovement}
        selectedId={selectedId}
        selectionExplicit={selectionExplicit}
        todayIso={todayIso}
        lensCounts={lensCounts}
        state={state}
        view={view}
        failed={failed}
      />
    </DrawerProvider>
  );
}

/** The drawer key hosting the create form. */
const NEW_GOAL_KEY = "new-goal";

/** The create-form host: closes the Drawer and opens the new Goal's pane. */
function NewGoalFormHost({
  areaOptions,
  areaOptionsFailed,
}: {
  readonly areaOptions: readonly SelectOption[];
  readonly areaOptionsFailed: boolean;
}) {
  const navigate = useNavigate();
  const { closeDrawer } = useDrawer();

  if (areaOptionsFailed) {
    return (
      <EmptyState
        title="We couldn’t load your Areas"
        description="A Goal lives in an Area, so creating one needs the list. Please try again."
      />
    );
  }
  if (areaOptions.length === 0) {
    /*
     * The one state where creation genuinely cannot proceed, said plainly and
     * with the way forward — never a form whose required field has no options.
     */
    return (
      <EmptyState
        title="Create an Area first"
        description="Every Goal lives in an Area of your life, and this workspace has none yet."
        primaryAction={
          <a className="dh-btn dh-btn--primary" href="/areas">
            Go to Areas
          </a>
        }
      />
    );
  }
  return (
    <NewGoalForm
      areaOptions={areaOptions}
      onCreated={(goalId) => {
        closeDrawer();
        // Straight to the new Goal's pane in the workspace the owner is
        // already looking at — not to a record they then have to come back
        // from.
        navigate(`/goals?goal=${encodeURIComponent(goalId)}`);
      }}
      onCancel={closeDrawer}
    />
  );
}

/**
 * A DELETED Goal's Card: no open target (its canonical route 404s — soft-deleted
 * records read as "not found" everywhere in the kernel), just identity and a
 * "Restore" quick action. The SAME shape the Deleted Notes view uses.
 */
function DeletedGoalCard({
  goal,
  onRestore,
  pending,
}: {
  readonly goal: SerializedDeletedGoalItem;
  readonly onRestore: (id: string, title: string) => void;
  readonly pending: boolean;
}) {
  const deletedOn = formatCalendarDate(goal.updatedAt.slice(0, 10));
  return (
    <EntityCard
      data-testid="deleted-goal-card"
      icon={<AccentIcon entityType="goal" iconKey={null} />}
      title={goal.title}
      headingLevel={2}
      meta={
        deletedOn ? (
          <span className="dh-ecard__fact">
            <HistoryIcon className="dh-ecard__fact-icon" aria-hidden="true" />
            {`Deleted ${deletedOn}`}
          </span>
        ) : undefined
      }
      // Quieter than an active Goal, and the muting is never the only signal —
      // the footer says "Deleted" in words.
      muted
      footer={
        <button
          type="button"
          className="dh-btn dh-btn--outlined dh-btn--sm"
          disabled={pending}
          onClick={() => onRestore(goal.id, goal.title)}
        >
          {pending ? "Restoring…" : "Restore"}
        </button>
      }
    />
  );
}

/**
 * Accumulate pages of DELETED Goals behind "Load more".
 *
 * It cannot share a scope with the active paginator: that one loads `/goals?cursor=`
 * — the ACTIVE alignment scope — so a deleted-scope cursor replayed through it would
 * fetch the wrong records. The cursor is bound to its scope, so the Deleted view
 * carries `state=deleted` through every page. Without this, a workspace with more
 * deleted Goals than one page could never reach — or restore — anything past the
 * first (a dead end of exactly the kind PX-04 exists to remove).
 *
 * UX-01 — the mechanics are now the ONE shared `useKeysetPagination` (DEBT-45). The
 * request-scoped guard this hook pioneered (a page is consumed only if it was asked
 * for since the current scope began) lives in the shared hook, so every collection
 * gets it rather than only this one.
 */
function useDeletedGoalPagination(
  firstPage: readonly SerializedDeletedGoalItem[],
  initialCursor: string | null,
) {
  return useKeysetPagination<SerializedDeletedGoalItem, DeletedGoalsPageData>({
    firstPage,
    initialCursor,
    path: "/goals?state=deleted",
    select: selectDeletedGoalsPage,
    getId: goalId,
  });
}

/** Stable module-level selectors, so the shared hook's memo identity is stable. */
function selectDeletedGoalsPage(data: DeletedGoalsPageData) {
  return {
    items: data.deletedGoals,
    nextCursor: data.nextCursor,
    failed: data.failed,
  };
}

function selectGoalsPage(data: GoalsPageData) {
  return {
    items: data.goals,
    nextCursor: data.nextCursor,
    failed: data.failed,
  };
}

function goalId(goal: { readonly id: string }): string {
  return goal.id;
}

/** Restore a Goal from the Deleted view — one click, through the shared hook. */
function useRestoreGoal() {
  const post = useCallback(async (goalId: string) => {
    const body = new FormData();
    body.set("intent", "restore");
    const response = await fetch(
      `/goals/${encodeURIComponent(goalId)}/mutate`,
      { method: "POST", body },
    );
    const result = (await response.json()) as GoalMutationResult;
    return result.kind === "restore" && result.ok;
  }, []);

  return useCollectionRestore({ post });
}

/*
 * REDESIGN-04 — `GoalEntityCard`, `goalCardFacts`, `alignmentPillTone` and the
 * shared `GoalCard` they rendered are GONE.
 *
 * `mockup3.png` replaced the Goals gallery with a master–detail, and the card
 * had no second caller: every rule it held now lives somewhere that is still on
 * screen, and none of them was dropped.
 *
 *   - the READING, the journey and the bar → the workspace row's value and bar
 *     (`ProgressRow`), and the pane's stat trio;
 *   - "no bar, and no zero, for a Goal nothing advances" → `goalRowValue`
 *     returns `null` and the row draws no track;
 *   - the alignment state a MEASURED Goal deliberately did not show → still not
 *     shown as a measure; it is the pane's quiet indicator and the row's
 *     accessible name;
 *   - the sparkline → the pane's full chart (see `GoalWorkspace`).
 *
 * Removing it here rather than leaving it unreferenced is §13: a card family
 * with no caller is sediment, and the next reader cannot tell a dead component
 * from a dormant one.
 */

/**
 * STEER-02 — set or clear a Goal's CONDITION, through the canonical focused
 * intent.
 *
 * The SAME `set_condition` intent, endpoint and shared control the record
 * posts, so the workspace and the record cannot write the owner's judgement
 * differently. A refusal leaves the previous value on screen with the server's
 * own message; an accepted change revalidates, because the condition can move
 * the Goal in and out of the "Set aside" lens and change the workspace-true
 * counts beside it.
 */
async function setGoalCondition(
  goalId: string,
  condition: GoalCondition | null,
  onSaved: () => void,
): Promise<InlineSaveOutcome> {
  const body = new FormData();
  body.set("intent", "set_condition");
  body.set("condition", condition ?? "");
  try {
    const response = await fetch(
      `/goals/${encodeURIComponent(goalId)}/mutate`,
      { method: "POST", body, headers: { accept: "application/json" } },
    );
    const result = (await response.json()) as {
      readonly ok: boolean;
      readonly fieldErrors?: Readonly<Record<string, string>>;
      readonly formError?: string;
    };
    if (result.ok) {
      onSaved();
      return { ok: true };
    }
    return {
      ok: false,
      message:
        result.fieldErrors?.condition ??
        result.formError ??
        "That couldn’t be saved. Please try again.",
    };
  } catch {
    return { ok: false, message: "That couldn’t be saved. Please try again." };
  }
}

/**
 * DHDS-10 — set or clear a Goal's target date, through the canonical focused
 * intent.
 *
 * `POST /goals/:goalId/mutate` with `intent=set_target_date` is the SAME route
 * and the SAME intent the canonical record's own inline date field posts, so
 * the workspace and the record cannot come to write a target date differently.
 * Nothing here validates: `GoalDetailsValidationError` comes back as the
 * field's own message, and a refusal leaves the previous date on screen.
 */
async function setGoalTargetDate(
  goalId: string,
  targetDate: string | null,
  onSaved: () => void,
): Promise<InlineSaveOutcome> {
  const body = new FormData();
  body.set("intent", "set_target_date");
  body.set("targetDate", targetDate ?? "");
  try {
    const response = await fetch(
      `/goals/${encodeURIComponent(goalId)}/mutate`,
      { method: "POST", body, headers: { accept: "application/json" } },
    );
    const result = (await response.json()) as {
      readonly ok: boolean;
      readonly fieldErrors?: Readonly<Record<string, string>>;
      readonly formError?: string;
    };
    if (result.ok) {
      onSaved();
      return { ok: true };
    }
    return {
      ok: false,
      message:
        result.fieldErrors?.targetDate ??
        result.formError ??
        "That couldn’t be saved. Please try again.",
    };
  } catch {
    return { ok: false, message: "That couldn’t be saved. Please try again." };
  }
}

/** UX-01 — the ONE shared keyset paginator (DEBT-45). */
function useGoalPagination(
  firstPage: readonly SerializedGoalWithAlignment[],
  initialCursor: string | null,
) {
  return useKeysetPagination<SerializedGoalWithAlignment, GoalsPageData>({
    firstPage,
    initialCursor,
    path: "/goals",
    select: selectGoalsPage,
    getId: goalId,
  });
}

/**
 * A calm, honest one-line recap of the loaded page — plain counts, never a
 * percentage or a score (PRODUCT_PRINCIPLES' anti-fabricated-precision
 * mandate). Reflects only the Goals loaded so far (ADR-040 §40.9's disclosed
 * per-page limitation), not a workspace-wide total.
 */
function alignmentSummary(
  goals: readonly SerializedGoalWithAlignment[],
): string | null {
  const open = goals.filter((goal) => goal.alignment.state !== "completed");
  if (open.length === 0) {
    return null;
  }
  // Base the claim ONLY on `active` vs. the open total — never infer "every
  // Goal has had recent action" from "no Goal is neglected", since
  // `no_structure`/`unreachable` Goals are also not `active` and have NOT
  // had recent action either; they are just not classified `neglected`.
  const active = open.filter(
    (goal) => goal.alignment.state === "active",
  ).length;
  const goalNoun = open.length === 1 ? "Goal" : "Goals";
  if (active === open.length) {
    return open.length === 1
      ? "This Goal has had recent action."
      : "Every open Goal has had recent action.";
  }
  if (active === 0) {
    return open.length === 1
      ? "This Goal has not had recent action yet."
      : "No open Goals have had recent action yet.";
  }
  return `${active} of ${open.length} open ${goalNoun} ${open.length === 1 ? "has" : "have"} had recent action.`;
}

/*
 * STEER-01 — `goalViewCounts` is GONE, and its absence is the fix.
 *
 * It tallied the LOADED page through the shared predicate, which made every
 * tab's number consistent with the rows beneath it and quietly wrong for the
 * question the label asks ("On track 3" reads as a workspace fact). The
 * workspace-true figures now come from the loader
 * (`GoalRepository.countGoalsByOutcomeLens`), computed from the same SQL
 * status and lens expressions the collection read is filtered by — so the
 * count and the result set still cannot disagree, and the number is now true
 * of the set its label names. DEBT-121's rule, satisfied by construction: no
 * page-derived count survives on this surface.
 */

function GoalsCollection({
  goals,
  deletedGoals,
  nextCursor,
  selected,
  selectedMovement,
  selectedId,
  selectionExplicit,
  todayIso,
  lensCounts,
  state,
  view,
  failed,
}: {
  readonly goals: readonly SerializedGoalWithAlignment[];
  readonly deletedGoals: readonly SerializedDeletedGoalItem[];
  readonly nextCursor: string | null;
  readonly selected: GoalWorkspaceDetail | null;
  readonly selectedMovement: GoalMovement | null;
  readonly selectedId: string | null;
  readonly selectionExplicit: boolean;
  readonly todayIso: string | null;
  readonly lensCounts: GoalOutcomeLensCounts | null;
  readonly state: GoalCollectionState;
  readonly view: GoalCollectionView;
  readonly failed: boolean;
}) {
  const { items, hasMore, loading, loadFailed, loadMore } = useGoalPagination(
    goals,
    nextCursor,
  );
  /*
   * DHDS-10 — an accepted target-date change re-reads the workspace.
   *
   * The date is not only a field on the pane: the list beside it and the
   * measurement chart's pace band are both derived from it, so painting it
   * locally would leave the row and the chart disagreeing with the value the
   * owner just chose. The server decides; the surface re-reads.
   */
  const revalidator = useRevalidator();
  // PX-06: the ONE shared collection loading signal — a same-route navigation
  // (a filter, a view, a page) shows the shared skeleton instead of leaving the
  // previous list on screen with no feedback.
  const isReloading = useCollectionLoading();
  const { restore, pendingIds, restoredIds } = useRestoreGoal();
  const deletedPages = useDeletedGoalPagination(
    deletedGoals,
    state === "deleted" ? nextCursor : null,
  );
  const deleted = deletedPages.items.filter(
    (goal) => !restoredIds.has(goal.id),
  );

  if (state === "deleted") {
    return (
      <CollectionLayout
        isLoading={isReloading}
        title="Goals"
        subtitle={
          failed
            ? "We couldn’t load your deleted Goals."
            : deletedPages.hasMore
              ? `${deleted.length} deleted Goals loaded`
              : deleted.length === 1
                ? "1 deleted Goal"
                : `${deleted.length} deleted Goals`
        }
        presentation="grid"
        /*
         * The SAME one rail the active collection draws, so the two scopes are
         * one control the owner learns once — and so the way back out of Deleted
         * is where the way in was.
         */
        filterBar={
          <ViewTabs
            className="dh-goals-views"
            data-testid="goals-views"
            param="view"
            options={goalViewTabs()}
            value={GOAL_DELETED_TAB_VALUE}
            label="Goal views"
            defaultValue="all"
          />
        }
        error={
          failed ? (
            <EmptyState
              title="We couldn’t load your deleted Goals"
              description="Something went wrong. Please try again."
            />
          ) : undefined
        }
        isFilteredEmpty={
          !failed && deleted.length === 0 && !deletedPages.hasMore
        }
        filteredEmptySlot={
          <EmptyState
            icon={<EntityIcon type="goal" />}
            title="No deleted Goals"
            description="Goals you delete appear here, and can be restored at any time."
          />
        }
      >
        <EntityCardGrid label="Deleted Goals">
          {deleted.map((goal) => (
            <DeletedGoalCard
              key={goal.id}
              goal={goal}
              onRestore={restore}
              pending={pendingIds.has(goal.id)}
            />
          ))}
        </EntityCardGrid>
        {!failed && deletedPages.hasMore ? (
          <LoadMore
            loading={deletedPages.loading}
            loadFailed={deletedPages.loadFailed}
            onLoadMore={deletedPages.loadMore}
            label="Load more deleted Goals"
          />
        ) : null}
      </CollectionLayout>
    );
  }

  /*
   * STEER-01: the OUTCOME order is established WORKSPACE-WIDE by the repository
   * (`listGoalsByOutcome`) BEFORE pagination, and the active lens is applied in
   * that same read — so accumulated pages are already globally ordered by
   * `GOAL_OUTCOME_DISPLAY_RANK` then `(createdAt, id)`, and already contain only
   * the Goals this lens admits, across the whole workspace rather than the page.
   * The client renders that authoritative order and set directly: it never
   * re-sorts and never re-filters, because either would turn a workspace answer
   * back into a page-local one.
   */
  const count = items.length;
  const subtitle = failed
    ? "We couldn’t load your Goals."
    : collectionCountLabel(count, "Goal", "Goals", { hasMore });
  const summary = failed ? null : alignmentSummary(items);
  // DEBT-121 — workspace-true or absent. `lensCounts` is the loader's
  // workspace figure; when it is missing (the Deleted scope, or a failed read)
  // the tabs carry no numbers at all rather than falling back to a page tally.
  const counts = failed ? undefined : (lensCounts ?? undefined);
  const visible = items;

  return (
    <CollectionLayout
      isLoading={isReloading}
      title="Goals"
      subtitle={subtitle}
      presentation="grid"
      /*
       * CONVERGE-01 §9 — the header's view slot is EMPTY, deliberately.
       *
       * UIQ-013 put Active/Deleted here on the reasoning that the two are
       * different collections rather than a narrowing of one, which is true and
       * is not the whole rule: Projects' four lifecycle scopes are the same kind
       * of thing and live in the filter band, leaving this slot free. Goals now
       * matches it, so the title row carries the title and the create action and
       * nothing else. See `goalViewTabs`.
       */
      /*
       * UIX-06 — the status rail is a FILTER, so it lives in the filter band.
       *
       * It used to render into the CONTENT slot, which put a second, differently
       * drawn control rail loose between the header and the gallery: the
       * lifecycle segments in the header's view slot, and four bordered status
       * chips floating below the divider with nothing containing them. Two rails
       * in two presentations on one screen was the single clearest convergence
       * failure the UIX-06 audit found.
       *
       * The header contract settles which slot it belongs in: a view "cannot be
       * unset" and changes the principal mode (Active/Deleted); a filter narrows
       * which records are included and composes with its siblings. "On track",
       * "Needs attention" and "Completed" narrow — "All" is the unset state —
       * so they are filters, and the filter band is where Notes' search, People's
       * circles and Assets' tags already are.
       */
      /*
       * DS-05 — the status rail is the shared TAB RAIL, not a second capsule.
       *
       * UIX-06 settled which SLOT it belongs in (above), and it was right. What
       * it did not settle is the drawing, and the whole-app baseline is where
       * that showed: Active/Deleted rendered as a sunken segmented track in the
       * header's view slot, and All/On track/Needs attention/Completed rendered
       * as a second sunken segmented track directly beneath it — two controls of
       * the same shape, stacked, on the calmest band of the page. Tasks and
       * Projects draw exactly this control as quiet text with a 2px indicator,
       * which is what both concepts draw, and which is the whole point of having
       * two presentations: the MODE is a capsule, the FILTER is a rail, and a
       * reader can tell them apart.
       *
       * `ViewTabs` writes the same `?view=` parameter to the same values, so the
       * URL contract and every count are untouched.
       */
      /*
       * The rail is drawn even on an EMPTY workspace now, because it is no
       * longer only a filter: it carries the way into Deleted, and hiding it
       * when nothing is loaded made restoring a deleted Goal from an emptied
       * workspace unreachable — the exact state an owner reaches it from.
       */
      filterBar={
        <ViewTabs
          className="dh-goals-views"
          data-testid="goals-views"
          param="view"
          options={goalViewTabs(counts)}
          value={view}
          label="Goal views"
          defaultValue="all"
        />
      }
      error={
        failed ? (
          <EmptyState
            title="We couldn’t load your Goals"
            description="Something went wrong. Please try again."
          />
        ) : undefined
      }
      /*
       * STEER-01 — two different emptinesses, now genuinely distinguishable.
       *
       * The lens filters the WORKSPACE, so "nothing here" can mean either "this
       * workspace has no Goals" or "no Goal in the workspace is on track". The
       * workspace-true counts tell the two apart: `lensCounts.total` is every
       * Goal in the active collection regardless of lens. Before STEER-01 the
       * filter ran over the loaded page, so the honest answer to the second
       * case was only ever "nothing LOADED matches" — which is what its copy
       * had to say.
       */
      isEmpty={!failed && count === 0 && (lensCounts?.total ?? 0) === 0}
      emptySlot={
        /*
         * REDESIGN-04 §5.1 — the empty state now CREATES rather than
         * redirecting. It used to send the owner to Areas to find the creation
         * control, which is a dead end dressed as a suggestion; the same flow
         * that runs from `+ Add goal` runs from here, and it still requires
         * choosing an Area, so nothing about the model changed.
         */
        <EmptyState
          icon={<EntityIcon type="goal" />}
          title={emptyCollectionTitle("goal")}
          description="Goals are the aspirational outcomes you pursue under an Area. Every Goal lives in one, so creating a Goal starts by choosing its Area."
          primaryAction={
            <DrawerTrigger
              drawerKey={NEW_GOAL_KEY}
              className="dh-btn dh-btn--primary"
            >
              Add goal
            </DrawerTrigger>
          }
        />
      }
    >
      {/*
       * UIX-03 — the status views, and the collection's one quiet note.
       *
       * The M3X expressive banner that stood here was a ring, two counts and a
       * headline, all describing ALIGNMENT — whether recent Task activity had
       * touched each Goal. Every figure on it was true, and none of them was
       * about an outcome: it answered "is work happening?" on the one screen
       * whose subject is "am I getting there?", and at 390px it was the whole
       * first screen before a single Goal appeared.
       *
       * What replaces it is smaller and does more: four views over statuses the
       * evaluator already produces, so a workspace with fifteen Goals can ask
       * "which need me?" without reading fifteen cards. The alignment sentence
       * survives as the quiet note beneath — same words, same live region, a
       * twentieth of the space.
       */}
      {summary ? (
        <p className="dh-goals-alignment-summary" role="status">
          {summary}
        </p>
      ) : null}
      {/*
       * A view that matches nothing is a designed state, not an empty page: the
       * Goals ARE there, this lens just excludes them, so the copy says which
       * lens and offers the way back rather than inviting the owner to create a
       * Goal they already have (AGENTS.md §6 — no dead ends).
       */}
      {count === 0 && (lensCounts?.total ?? 0) > 0 ? (
        <EmptyState
          icon={<EntityIcon type="goal" />}
          title={`No Goals are ${GOAL_COLLECTION_VIEW_LABELS[view].toLowerCase()}`}
          description={`This workspace has ${lensCounts!.total === 1 ? "1 Goal" : `${lensCounts!.total} Goals`}, and none of them is in this view.`}
          primaryAction={
            <a className="dh-btn dh-btn--outlined" href="/goals">
              Show all Goals
            </a>
          }
        />
      ) : (
        /*
         * REDESIGN-04 §2.2 — the master–detail workspace.
         *
         * The gallery of Goal cards is gone, and what replaced it carries more
         * rather than less: the same identity, the same progress bar and the
         * same honest value now sit on a ROW, and the space the cards were
         * spending on nine copies of the same anatomy pays for the selected
         * Goal's whole Overview beside them. Alignment survives as the quiet
         * state on the row and on the pane (§6.2); the sparkline does not —
         * see the note on `GoalWorkspaceList`.
         */
        <GoalWorkspaceLayout
          selectionExplicit={selectionExplicit}
          list={
            <GoalWorkspaceList
              goals={visible}
              selectedId={selectedId}
              hasMore={hasMore}
              loading={loading}
              loadFailed={loadFailed}
              onLoadMore={loadMore}
              failed={failed}
            />
          }
          detail={
            selected && todayIso ? (
              <GoalWorkspacePane
                detail={selected}
                todayIso={todayIso}
                movement={
                  visible.find((goal) => goal.id === selectedId)?.movement ??
                  selectedMovement
                }
                alignment={
                  visible.find((goal) => goal.id === selectedId)?.alignment ??
                  selected.alignment
                }
                /*
                 * STEER-01 (DEBT-208) — the pane's mark is resolved by the ONE
                 * Goal identity projection, from the selected Goal's OWN
                 * identity and its Area's, so the row and the pane cannot show
                 * two different marks for one record.
                 */
                identity={goalIdentitySource({
                  own: {
                    iconKey: selected.details.iconKey,
                    colourSlot: selected.details.colourSlot,
                  },
                  area: selected.overview.area,
                })}
                tabs={<GoalWorkspaceTabs goalId={selected.overview.id} />}
                onSetTargetDate={(next) =>
                  setGoalTargetDate(selected.overview.id, next, () =>
                    revalidator.revalidate(),
                  )
                }
                onSetCondition={(next) =>
                  setGoalCondition(selected.overview.id, next, () =>
                    revalidator.revalidate(),
                  )
                }
              />
            ) : (
              /*
               * A pane with nothing selected is a designed state, not a hole:
               * it happens when a `?goal=` names a record that is gone, and
               * when the one detail read failed. Either way the list beside it
               * still works, and the sentence says what to do.
               */
              <EmptyState
                icon={<EntityIcon type="goal" />}
                title="Select a Goal"
                description="Choose a Goal from the list to see its progress, its measurements and the Projects advancing it."
              />
            )
          }
        />
      )}
    </CollectionLayout>
  );
}
