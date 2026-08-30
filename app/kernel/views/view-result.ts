/**
 * X-02 — the shared CROSS-MODULE result representation.
 *
 * A cross-module view renders a Task next to a Project next to a Review, so it
 * needs one outer collection shape. It does NOT need — and must not have — one
 * flattened schema that pretends every record is the same kind of thing: a Task's
 * priority and a Review's period are not the same field wearing different labels,
 * and squashing them loses the meaning the owner came for.
 *
 * So the shape is a shared HEADER plus a typed per-scope DETAIL:
 *
 *   - the header carries what every result needs to be listed and opened: entity
 *     type, id, title, timestamps, its spine anchors and its archive state;
 *   - the detail is a discriminated union, one member per scope, carrying that
 *     module's own vocabulary in its own types.
 *
 * Navigation is NOT part of this shape. Where a record opens is resolved by the ONE
 * shared `entityDestination` helper from the entity type and id, so a saved view
 * can never invent a second detail surface for a record that already has one.
 */

import type { GoalAlignmentState } from "~/kernel/alignment";
import type { MeetingStatus } from "~/kernel/meetings";
import type { ProjectHealthState } from "~/kernel/project-health";
import type { ReviewStatus, ReviewType } from "~/kernel/reviews";
import type { TaskPriority, TaskStatus, TimeSector } from "~/kernel/tasks";

import type { ViewScope } from "./view-scopes";

/** A resolved spine anchor: enough to name it and link to it. */
export interface ViewAnchor {
  readonly id: string;
  readonly title: string;
}

/** What every cross-module result carries, whatever module it came from. */
export interface CrossViewResultHeader {
  readonly scope: ViewScope;
  /** The `entities.type`, which is also the shared entity-identity/icon key. */
  readonly entityType: ViewScope;
  readonly id: string;
  readonly title: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  /** The record's Area, where the relationship exists. */
  readonly area: ViewAnchor | null;
  /** The record's Project, where the relationship exists. */
  readonly project: ViewAnchor | null;
  /** The record's Goal, where the relationship exists. */
  readonly goal: ViewAnchor | null;
  /** True when the record is in its module's archived state. */
  readonly archived: boolean;
  /**
   * The date this result is sorted and banded by when the view sorts by `due`.
   * `null` for scopes and records with no due-shaped date — never a fabricated one.
   */
  readonly dueDate: string | null;
}

export interface TaskResultDetail {
  readonly kind: "task";
  readonly status: TaskStatus;
  readonly priority: TaskPriority | null;
  readonly timeSector: TimeSector | null;
  readonly completed: boolean;
  readonly waiting: boolean;
  readonly delegatedTo: string | null;
  readonly someday: boolean;
}

export interface ProjectResultDetail {
  readonly kind: "project";
  readonly workflowStatus: "planned" | "active" | "on_hold";
  readonly completed: boolean;
  /** PROJ-02 health, derived live for the bounded result page. */
  readonly health: ProjectHealthState | null;
  /**
   * REVIEW-03: how this Project's health compares with the last completed
   * Review's insight snapshot. `null` when there is no snapshot to compare with —
   * stated, never invented.
   */
  readonly healthSinceLastReview: ProjectHealthState | null;
}

export interface GoalResultDetail {
  readonly kind: "goal";
  readonly completed: boolean;
  /** AREA-03 alignment, derived live for the bounded result page. */
  readonly alignment: GoalAlignmentState | null;
  readonly targetDate: string | null;
}

export interface NoteResultDetail {
  readonly kind: "note";
  readonly tags: readonly string[];
}

export interface MeetingResultDetail {
  readonly kind: "meeting";
  readonly status: MeetingStatus;
  readonly startsAt: Date;
  readonly openActions: number;
}

export interface ReviewResultDetail {
  readonly kind: "review";
  readonly reviewType: ReviewType;
  readonly status: ReviewStatus;
  readonly periodStart: string;
  readonly periodEnd: string;
}

export type CrossViewResultDetail =
  | TaskResultDetail
  | ProjectResultDetail
  | GoalResultDetail
  | NoteResultDetail
  | MeetingResultDetail
  | ReviewResultDetail;

/** One row of a cross-module view. */
export interface CrossViewResult extends CrossViewResultHeader {
  readonly detail: CrossViewResultDetail;
}

/** Why a scope the owner selected contributed nothing. */
export type ViewScopeUnavailableReason =
  /** The owner has hidden this scope's module. */
  | "module_hidden"
  /** A filter in this view names a dimension this scope cannot answer. */
  | "unsupported_dimension";

export interface UnavailableViewScope {
  readonly scope: ViewScope;
  readonly reason: ViewScopeUnavailableReason;
  /** The shared dimension responsible, when the reason is a dimension. */
  readonly dimension?: string;
}

/** The bounded outcome of running a cross-module view. */
export interface CrossViewPage {
  readonly results: readonly CrossViewResult[];
  /**
   * True when the page is a bounded answer rather than a complete one: at least
   * one scope reached its candidate cap, OR more candidates matched than the
   * page holds (`readCount > results.length`). Stated plainly by the surface;
   * a bounded measure is never presented as exact (REVIEW-03's rule, reused).
   * RECALL-00-B widened this from scope saturation alone — a merged set of
   * 61–119 candidates used to be cut to the page silently.
   */
  readonly bounded: boolean;
  /**
   * How many matching candidates were READ (after every filter, before the page
   * slice) — the denominator of the surface's honest "first N of the M read"
   * sentence. Itself bounded when a scope saturated, which `saturatedScopes`
   * states; never a workspace total.
   */
  readonly readCount: number;
  /**
   * The scopes whose candidate read hit `CROSS_VIEW_SCOPE_CANDIDATE_LIMIT`, so
   * even the read was bounded for them — surfaced per scope, not folded into
   * one flag (RECALL-00-B).
   */
  readonly saturatedScopes: readonly ViewScope[];
  /** Scopes the owner selected that contributed nothing, and why. */
  readonly unavailable: readonly UnavailableViewScope[];
  /**
   * The REVIEW-03 boundary a `changedSince: "last_review"` filter resolved to, or
   * null when there is no completed Review with a snapshot yet.
   */
  readonly changeBoundary: {
    readonly periodEnd: string;
    readonly reviewId: string;
  } | null;
}
