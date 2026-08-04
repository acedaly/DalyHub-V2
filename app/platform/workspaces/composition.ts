/**
 * FND-03 Workspace platform — the server-side composition boundary.
 *
 * A small, explicit function that demonstrates and implements the intended
 * dependency flow (ADR-010):
 *
 *     environment
 *       → workspace resolver        (trusted, request-free)
 *       → WorkspaceContext          (validated + confirmed to exist)
 *       → workspace-scoped EntityRepository
 *
 * Future loaders, actions and modules obtain their scoped repository through
 * this seam rather than constructing workspace scope themselves. There is no
 * service container or dependency-injection framework — dependencies are passed
 * explicitly (ADR-010: no global mutable state, no AsyncLocalStorage).
 */

import {
  createSystemActorContext,
  type ActivityActorContext,
  type ActivityRepository,
} from "~/kernel/activity";
import type { AlignmentRepository } from "~/kernel/alignment";
import type { AppPreferencesRepository } from "~/kernel/preferences";
import {
  type AssetHistoryRepository,
  type AssetRepository,
  type ObligationTaskGateway,
} from "~/kernel/assets";
import type { AreaRepository } from "~/kernel/areas";
import type { AreaSettingsRepository } from "~/kernel/area-settings";
import type { DiaryRepository } from "~/kernel/diary";
import type { EntityRepository } from "~/kernel/entities";
import type { EntityLinkRepository } from "~/kernel/entity-links";
import type {
  ActorDirectory,
  WorkspaceMemberRepository,
} from "~/kernel/identity";
import type { WorkspaceSnapshotRepository } from "~/kernel/export";
import type { GoalDetailsRepository, GoalRepository } from "~/kernel/goals";
import type {
  NoteDetailsRepository,
  NoteQueryRepository,
} from "~/kernel/notes";
import type { PersonRepository } from "~/kernel/people";
import type { MeetingRepository } from "~/kernel/meetings";
import type { ProjectHealthRepository } from "~/kernel/project-health";
import type { ProjectRepository } from "~/kernel/projects";
import type { RelationshipRepository } from "~/kernel/relationships";
import type { ProjectSettingsRepository } from "~/kernel/project-settings";
import type { ReviewRepository } from "~/kernel/reviews";
import type { SpineRepository } from "~/kernel/spine";
import type { TaskRepository } from "~/kernel/tasks";
import { ownerCalendarIso } from "~/shared/datetime";
import type { TaskViewRepository } from "~/kernel/task-views";
import type {
  WorkspaceContext,
  WorkspaceContextResolver,
} from "~/kernel/workspaces";
import {
  createActivityRepository,
  createAlignmentRepository,
  createAppPreferencesRepository,
  createAreaRepository,
  createAssetHistoryRepository,
  createAssetRepository,
  createAreaSettingsRepository,
  createDiaryRepository,
  createEntityLinkRepository,
  createEntityRepository,
  createGoalDetailsRepository,
  createGoalRepository,
  createNoteDetailsRepository,
  createNoteRepository,
  createPersonRepository,
  createMeetingRepository,
  createProjectHealthRepository,
  createProjectRepository,
  createProjectSettingsRepository,
  createRelationshipRepository,
  createReviewRepository,
  createSpineRepository,
  createTaskRepository,
  createTaskViewRepository,
  createWorkspaceMemberRepository,
  createWorkspaceRepository,
  createWorkspaceSnapshotRepository,
} from "~/platform/storage/d1";

import { createConfiguredWorkspaceContextResolver } from "./configured-context-resolver";

/**
 * The minimal server environment this boundary reads. `DEFAULT_WORKSPACE_ID` is
 * trusted server-side configuration (a Worker `var`), never a request value.
 */
export interface WorkspaceScopeEnv {
  readonly DB: D1Database;
  readonly DEFAULT_WORKSPACE_ID?: string;
}

/**
 * A resolved workspace scope: the context plus every workspace-scoped repository,
 * all bound to the SAME `WorkspaceContext`. The entity, EntityLink, spine and
 * Activity repositories are exposed here so module code obtains them through this
 * single seam rather than constructing scope itself. The `spine` repository is the
 * authoritative Area → Goal → Project → Task domain repository (FND-07 / ADR-014),
 * sharing the same trusted actor. The `activity` repository is READ-ONLY (FND-05 /
 * ADR-012): events are appended only as the atomic side effect of a mutation,
 * using the trusted actor established below.
 */
export interface WorkspaceScope {
  readonly context: WorkspaceContext;
  readonly entities: EntityRepository;
  readonly entityLinks: EntityLinkRepository;
  readonly spine: SpineRepository;
  /**
   * The TODAY-02 task-detail repository (FND-07 spine + additive fields, ADR-028).
   * It composes the spine — completion stays `spine.complete`/`reopen` — and owns
   * the editable task-detail slice the Task Drawer reads and writes.
   */
  readonly tasks: TaskRepository;
  /**
   * The PROJ-01 project read projection (ADR-034): a READ-ONLY view that resolves a
   * project's Area/Goal context and active direct-task counts in bounded, N+1-free
   * queries. Project mutations stay `spine.*`; the authoritative rollup stays
   * `spine.getRollup`.
   */
  readonly projects: ProjectRepository;
  /**
   * The AREA-01 area read projection: a READ-ONLY view over the spine that resolves
   * Area collection/record hierarchy facts in bounded, N+1-free queries. Area
   * mutations stay `spine.*`; rollups stay derived from the spine.
   */
  readonly areas: AreaRepository;
  /**
   * The AREA-05 Areas-owned archival slice: turns the reversible archived state on
   * and off (`area_details.archived_at`) atomically with its Activity event,
   * mirroring `projectSettings`. Area identity/title/soft-delete stay `spine.*`;
   * permanent (hard) Area deletion stays `spine.permanentlyDeleteArea`.
   */
  readonly areaSettings: AreaSettingsRepository;
  /**
   * The AREA-02 Goal read projection: a READ-ONLY view over the spine that
   * resolves the Goal record's Area context and exact Project-contribution
   * facts in bounded, N+1-free queries. Goal mutations (create/rename/
   * complete/reopen) stay `spine.*`; Goal-owned detail fields stay
   * `goalDetails.*`.
   */
  readonly goals: GoalRepository;
  /**
   * The AREA-02 Goal-owned detail slice (target date, definition of done) — the
   * spine deliberately does not model either field. Composes atomically with
   * its own trusted actor, mirroring `projectSettings`.
   */
  readonly goalDetails: GoalDetailsRepository;
  /**
   * The NOTES-01A Note-owned Markdown content slice — the entities table
   * deliberately does not model a Note's body. Notes are NOT part of the
   * spine (identity/title/lifecycle stay `entities.*`); this composes
   * atomically with its own trusted actor, mirroring `goalDetails`.
   */
  readonly noteDetails: NoteDetailsRepository;
  /**
   * The NOTES-03 Notes READ projection: a READ-ONLY view that answers the
   * collection's filtered/ordered page and global Search's full-content query in
   * ONE bounded, workspace-scoped statement each — never by listing Notes and
   * sifting them in application code. Note mutations stay `entities.*` /
   * `noteDetails.*`; nothing here is cached.
   */
  readonly notes: NoteQueryRepository;
  /**
   * The DIARY-01A authoritative Diary Entry repository (ADR-041): the
   * Interstitial Journal's capture surface AND Timeline read model. It creates
   * `diary` entities with their chronological detail slice atomically (the
   * generic `entities` repository refuses to create one), owns entry-detail
   * edits, and lists the Timeline. Entry title/lifecycle stay `entities.*`;
   * relationships stay `entityLinks`; the audit trail stays `activity`. Composes
   * with the same trusted actor as the other mutation repositories.
   */
  readonly diary: DiaryRepository;
  /**
   * The PEOPLE-01 authoritative Person repository: the People collection/record
   * read model AND capture surface. It creates `person` entities with their
   * structured relationship detail slice atomically (the generic `entities`
   * repository refuses to create one), owns detail edits and the archive
   * lifecycle, and lists the workspace's People. A Person's title/soft-delete/
   * restore stay `entities.*`; relationships stay `entityLinks`; the audit trail
   * stays `activity`. Composes with the same trusted actor as the other mutation
   * repositories.
   */
  readonly people: PersonRepository;
  readonly meetings: MeetingRepository;
  /**
   * The ASSET-01 authoritative Asset repository: the Assets collection/record read
   * model AND capture surface. It creates `asset` entities with their structured
   * detail slice atomically (the generic `entities` repository refuses to create
   * one), owns detail edits, the real-world status and the archive lifecycle, and
   * guards permanent deletion behind active relationships. Title/soft-delete/
   * restore stay `entities.*`; relationships stay `entityLinks`; the audit trail
   * stays `activity`. Composes with the same trusted actor as the other mutation
   * repositories.
   */
  readonly assets: AssetRepository;
  /**
   * The ASSET-02 authoritative Asset history + obligations repository: an Asset's
   * recorded events (what happened) and its future maintenance/renewal obligations
   * (what is due). It advances the Asset's canonical facts forward-only, creates at
   * most ONE recurrence successor per completion, aggregates recorded costs in SQL,
   * and serves the bounded Today attention read. Task WRITES route through the
   * canonical `tasks` repository via an injected gateway, so Task completion
   * authority is never duplicated.
   */
  readonly assetHistory: AssetHistoryRepository;
  readonly reviews: ReviewRepository;
  readonly projectSettings: ProjectSettingsRepository;
  /**
   * The PROJ-02 project-health facts projection (ADR-035): a READ-ONLY, non-persisted
   * view that gathers the raw facts (rollup, waiting, overdue/slipped/upcoming, latest
   * meaningful activity) a project's DERIVED health is evaluated from, for a whole
   * bounded page in a fixed number of grouped queries (no N+1). The rules stay the
   * pure `evaluateProjectHealth`; nothing here is cached.
   */
  readonly projectHealth: ProjectHealthRepository;
  /**
   * The PEOPLE-03 relationship-facts projection: a READ-ONLY, non-persisted view
   * over a Person's FND-04 EntityLinks and the FND-05 Activity stream those linked
   * records write to, resolving the shared-record inventory and the interaction
   * history a relationship summary and stay-in-touch signal are DERIVED from — for
   * a whole bounded page of People in a fixed number of grouped queries (no N+1).
   * The rules stay the pure `evaluatePersonRelationship`; nothing here is cached.
   */
  readonly relationships: RelationshipRepository;
  readonly activity: ActivityRepository;
  /**
   * The IDENT-01 workspace-membership repository: the durable link between an
   * authenticated subject (the value the Activity stream already stores as the
   * actor id) and this workspace, optionally linked to a Person record. It is the
   * ONLY writer of `workspace_members` and records no Activity.
   */
  readonly members: WorkspaceMemberRepository;
  /**
   * The IDENT-01 READ-ONLY actor directory: resolves a batch of Activity actor
   * references to display identities in one bounded query. EVERY surface that
   * renders activity or history names its actors through this, so there is one
   * actor-resolution rule for the whole application.
   */
  readonly actors: ActorDirectory;
  /**
   * The AREA-03 Alignment activity-facts projection (ADR-040): a READ-ONLY,
   * non-persisted view over structural `entity_links` and the Activity stream
   * resolving how recently Task activity has contributed to each Goal, for a
   * whole bounded page in a fixed number of grouped queries (no N+1). The
   * rules stay the pure `evaluateGoalAlignment`; nothing here is cached, and
   * Goal completion / Project contribution stay `goals`' authority.
   */
  readonly alignment: AlignmentRepository;
  readonly appPreferences: AppPreferencesRepository;
  /**
   * The TASKS-03 saved Tasks views: workspace- AND owner-scoped named
   * configurations. It stores a validated declarative config only — never records,
   * never a query and never SQL — so a saved view re-runs the ordinary bounded
   * `tasks` query and can neither drift from the data nor escape the workspace.
   */
  readonly taskViews: TaskViewRepository;
  /**
   * The X-04 workspace-snapshot source: a READ-ONLY, bounded, deterministic
   * projection over every persisted table in the workspace, from which BOTH the
   * structured export and the Obsidian vault are derived. It has no mutating
   * method, so an export structurally cannot write data or append Activity.
   */
  readonly snapshot: WorkspaceSnapshotRepository;
}

/**
 * Build the configured workspace context resolver for an environment. Exposed so
 * callers that only need the resolver (or want to resolve once and reuse the
 * context) can, without duplicating the wiring.
 */
export function createWorkspaceContextResolver(
  env: WorkspaceScopeEnv,
): WorkspaceContextResolver {
  return createConfiguredWorkspaceContextResolver({
    configuredWorkspaceId: env.DEFAULT_WORKSPACE_ID,
    repository: createWorkspaceRepository(env.DB),
  });
}

/**
 * Resolve the active workspace scope for a request/environment: derive the
 * `WorkspaceContext` from trusted configuration and return it together with the
 * entity, EntityLink and (read-only) Activity repositories, all bound to that SAME
 * context. The intended dependency flow (ADR-012) is realised here:
 *
 *     environment
 *       → WorkspaceContext
 *       → trusted Activity actor context   (a `system` actor today; FND-09 swaps
 *                                            in an authenticated `user` actor)
 *       → EntityRepository                 (records Activity with that actor)
 *       → EntityLinkRepository             (records Activity with that actor)
 *       → ActivityRepository               (reads)
 *
 * The actor context is constructed ONCE, server-side, and threaded into both
 * mutation repositories — module calls cannot spoof it through a parameter. Fails
 * closed (throws a typed workspace error) if the workspace cannot be resolved.
 */
export async function resolveWorkspaceScope(
  env: WorkspaceScopeEnv,
): Promise<WorkspaceScope> {
  const context = await createWorkspaceContextResolver(env).resolve();
  return bindWorkspaceRepositories(env, context, createSystemActorContext());
}

/**
 * Bind every workspace-scoped repository to the SAME trusted `WorkspaceContext`
 * and the SAME trusted Activity actor context. This is the single place the actor
 * is threaded into the mutation repositories, so module code can never supply or
 * override it (ADR-012, ADR-016 §5.6). FND-09's authenticated composition reuses
 * this with a `user` actor; the default request composition uses the `system`
 * actor.
 */
export function bindWorkspaceRepositories(
  env: WorkspaceScopeEnv,
  context: WorkspaceContext,
  actorContext: ActivityActorContext,
): WorkspaceScope {
  const entities = createEntityRepository(env.DB, context, { actorContext });
  const entityLinks = createEntityLinkRepository(env.DB, context, {
    actorContext,
  });
  const spine = createSpineRepository(env.DB, context, { actorContext });
  const tasks = createTaskRepository(env.DB, context, { actorContext });
  // Read-only projections: no actor (they never mutate or record Activity).
  const projects = createProjectRepository(env.DB, context);
  const areas = createAreaRepository(env.DB, context);
  const goals = createGoalRepository(env.DB, context);
  const goalDetails = createGoalDetailsRepository(env.DB, context, {
    actorContext,
  });
  const noteDetails = createNoteDetailsRepository(env.DB, context, {
    actorContext,
  });
  const notes = createNoteRepository(env.DB, context);
  const diary = createDiaryRepository(env.DB, context, { actorContext });
  const people = createPersonRepository(env.DB, context, { actorContext });
  const meetings = createMeetingRepository(env.DB, context, { actorContext });
  const assets = createAssetRepository(env.DB, context, { actorContext });
  // The narrow Task write port an Asset obligation uses. Completion and
  // rescheduling stay the TaskRepository's — this only names them (§22).
  const obligationTasks: ObligationTaskGateway = {
    async completeTask(taskId) {
      try {
        const result = await tasks.completeTask(taskId, {
          ownerTodayIso: ownerCalendarIso(new Date()),
        });
        return result.changed ? "completed" : "already_closed";
      } catch {
        // A missing/deleted/cross-workspace Task is not an error here: the
        // obligation simply has nothing left to reconcile against.
        return "missing";
      }
    },
    async rescheduleTask(taskId, dueDate) {
      try {
        await tasks.updateTask(taskId, { dueDate });
        return true;
      } catch {
        return false;
      }
    },
  };
  const assetHistory = createAssetHistoryRepository(env.DB, context, {
    actorContext,
    taskGateway: obligationTasks,
  });
  const reviews = createReviewRepository(env.DB, context, { actorContext });
  const projectHealth = createProjectHealthRepository(env.DB, context);
  const relationships = createRelationshipRepository(env.DB, context);
  const projectSettings = createProjectSettingsRepository(env.DB, context, {
    actorContext,
  });
  const areaSettings = createAreaSettingsRepository(env.DB, context, {
    actorContext,
  });
  const activity = createActivityRepository(env.DB, context);
  // Membership and the actor directory are the SAME workspace-bound adapter: both
  // read one joined table, and one instance keeps a single actor-resolution rule.
  const members = createWorkspaceMemberRepository(env.DB, context);
  const alignment = createAlignmentRepository(env.DB, context);
  const appPreferences = createAppPreferencesRepository(env.DB, context);
  const taskViews = createTaskViewRepository(env.DB, context);
  // Read-only: no actor, because it never mutates or records Activity.
  const snapshot = createWorkspaceSnapshotRepository(env.DB, context);
  return {
    context,
    entities,
    entityLinks,
    spine,
    tasks,
    projects,
    areas,
    areaSettings,
    goals,
    goalDetails,
    noteDetails,
    notes,
    diary,
    people,
    meetings,
    assets,
    assetHistory,
    reviews,
    projectHealth,
    relationships,
    projectSettings,
    activity,
    members,
    actors: members,
    alignment,
    appPreferences,
    taskViews,
    snapshot,
  };
}
