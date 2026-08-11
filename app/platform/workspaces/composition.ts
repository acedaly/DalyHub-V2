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
  type WorkspaceEventRecorder,
} from "~/kernel/activity";
import type { AiPreferencesRepository, AiUsageRepository } from "~/kernel/ai";
import type { AlignmentRepository } from "~/kernel/alignment";
import type {
  CaptureRateLimiter,
  CaptureTokenRepository,
} from "~/kernel/capture";
import type { ReviewInsightRepository } from "~/kernel/review-insights";
import {
  DEFAULT_OWNER_TIME_ZONE,
  type AppPreferencesRepository,
} from "~/kernel/preferences";
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
import type { WorkspaceRestoreRepository } from "~/kernel/restore";
import type {
  GoalDetailsRepository,
  GoalMeasurementRepository,
  GoalRepository,
} from "~/kernel/goals";
import type {
  NoteDetailsRepository,
  NoteQueryRepository,
} from "~/kernel/notes";
import type { PersonRepository } from "~/kernel/people";
import type {
  MeetingRepository,
  MeetingTaskConversionRepository,
} from "~/kernel/meetings";
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
  CrossViewConfig,
  CrossViewQueryRepository,
  SavedViewRepository,
} from "~/kernel/views";
import type {
  WorkspaceContext,
  WorkspaceContextResolver,
} from "~/kernel/workspaces";
import {
  createActivityRepository,
  createWorkspaceEventRecorder,
  createAiPreferencesRepository,
  createAiUsageRepository,
  createAlignmentRepository,
  createCaptureRateLimiter,
  createCaptureTokenRepository,
  createReviewInsightRepository,
  createAppPreferencesRepository,
  createAreaRepository,
  createAssetHistoryRepository,
  createAssetRepository,
  createAreaSettingsRepository,
  createDiaryRepository,
  createEntityLinkRepository,
  createEntityRepository,
  createGoalDetailsRepository,
  createGoalMeasurementRepository,
  createGoalRepository,
  createNoteDetailsRepository,
  createNoteRepository,
  createPersonRepository,
  createMeetingRepository,
  createMeetingTaskConversionRepository,
  createProjectHealthRepository,
  createProjectRepository,
  createProjectSettingsRepository,
  createRelationshipRepository,
  createReviewRepository,
  createSpineRepository,
  createTaskRepository,
  createTaskViewRepository,
  createCrossViewRepository,
  createCrossViewQueryRepository,
  createWorkspaceMemberRepository,
  createWorkspaceRepository,
  createWorkspaceRestoreRepository,
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
   * GOAL-02 — the Goal's measurement history and milestone stages. Separate from
   * `goalDetails` because the CONFIGURATION ("how is this measured") is Goal-owned
   * detail state while the READINGS are their own records with their own
   * lifecycle; one repository writing both would make "correct a measurement" and
   * "change the target" the same operation.
   */
  readonly goalMeasurements: GoalMeasurementRepository;
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
   * AUDIT-13 — the ONE way to turn a Meeting's work into a Task. It exists as its
   * own scope member, rather than as more methods on `meetings`, because it is not
   * a Meeting operation: it writes a Task, a mapping, a relationship and three
   * Activity events in one transaction, and no module should be able to assemble
   * that sequence itself.
   */
  readonly meetingTaskConversions: MeetingTaskConversionRepository;
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
   * SET-03 — the WRITE seam for workspace-scoped Activity events: the small set
   * of security-relevant things the owner does to the workspace itself rather
   * than to a record in it (signing out, clearing this device's local data).
   * Appends to the same one Activity stream `activity` reads, with the same
   * trusted actor; it is deliberately not part of the read repository, which
   * stays read-only (FND-05 / ADR-012).
   */
  readonly workspaceEvents: WorkspaceEventRecorder;
  /**
   * The IDENT-01 workspace-membership repository: the durable link between an
   * authenticated subject (the value the Activity stream already stores as the
   * actor id) and this workspace, optionally linked to a Person record. It is the
   * ONLY writer of `workspace_members` and records no Activity.
   */
  readonly members: WorkspaceMemberRepository;
  /**
   * CAPTURE-01 — the capture credentials that authorise EXTERNAL capture (an
   * Apple Shortcut, Siri, the Share Sheet, inbound email) and the counter that
   * bounds them. Both are bound to this workspace, which is what makes a capture
   * credential permanently workspace-bound: neither has a method that takes a
   * workspace, so no request can select one (ADR-010, ADR-088).
   */
  readonly captureTokens: CaptureTokenRepository;
  readonly captureRateLimit: CaptureRateLimiter;
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
  /**
   * REVIEW-03 — the Review insight projection (ADR-079). Bounded aggregate reads
   * over the append-only Activity stream and the spine (what completed in a
   * period, where it landed, what is carrying over), plus the ONE persisted
   * Review-period snapshot that makes "since your last Review" answerable at all.
   * Everything derivable stays derived: Project health remains `projectHealth`'s
   * and Goal alignment remains `alignment`'s, and neither is ever cached here.
   */
  readonly reviewInsights: ReviewInsightRepository;
  readonly appPreferences: AppPreferencesRepository;
  /**
   * AI-01 — the owner's NON-SECRET AI policy (enabled, provider, budgets, allowed
   * features, privacy allowances). No provider credential is stored here or
   * anywhere the application can read: keys are Worker secrets only.
   */
  readonly aiPreferences: AiPreferencesRepository;
  /**
   * AI-01 — the AI usage ledger: operational metadata about AI requests, bound to
   * this workspace AND the authenticated owner. It records NO Activity (ADR-012),
   * no prompt, no response and no record content — only bounded source ids and a
   * digest. It is the ONLY writer of budget reservations.
   */
  readonly aiUsage: AiUsageRepository;
  /**
   * The TASKS-03 saved Tasks views: workspace- AND owner-scoped named
   * configurations. It stores a validated declarative config only — never records,
   * never a query and never SQL — so a saved view re-runs the ordinary bounded
   * `tasks` query and can neither drift from the data nor escape the workspace.
   */
  readonly taskViews: TaskViewRepository;
  /**
   * X-02 — the CROSS-MODULE saved views: the same workspace- and owner-scoped
   * table and repository as `taskViews`, holding a `cross` configuration instead
   * of a Tasks one. DalyHub has one saved-view system, not one per module.
   */
  readonly crossViews: SavedViewRepository<CrossViewConfig>;
  /**
   * X-02 — the bounded, workspace-scoped read projection a cross-module saved
   * view executes through. It stores nothing and mutates nothing: a saved view
   * describes a query, and re-opening it re-runs that query.
   */
  readonly crossViewQuery: CrossViewQueryRepository;
  /**
   * The X-04 workspace-snapshot source: a READ-ONLY, bounded, deterministic
   * projection over every persisted table in the workspace, from which BOTH the
   * structured export and the Obsidian vault are derived. It has no mutating
   * method, so an export structurally cannot write data or append Activity.
   */
  readonly snapshot: WorkspaceSnapshotRepository;
  /**
   * The SET-02 workspace-restore write port: validate-then-stage, an atomic
   * cutover, and post-restore verification. It is the ONLY repository that
   * replaces a workspace's records wholesale, which is exactly why it is
   * constructed here, bound to the same trusted `WorkspaceContext` as everything
   * else — a restore cannot be pointed at another workspace because there is no
   * parameter with which to point it.
   */
  readonly restore: WorkspaceRestoreRepository;
  /**
   * AUDIT-14 — the ONE authority for "which calendar day is it for the owner?".
   *
   * DalyHub had two answers: Task paths resolved the stored preference while
   * Asset history, obligations and the obligation→task gateway hard-coded
   * `Australia/Sydney`, so for any owner outside Sydney one instant could be
   * two different dates in two modules. Every date-sensitive path — due today,
   * overdue, obligation due state, a recurrence anchor created from today,
   * date-based task generation — now derives from here.
   *
   * It reads the owner's persisted timezone ONCE per resolved scope and memoises
   * the promise, so one request has exactly one "today" no matter how many
   * modules ask, and a preferences read failure degrades to
   * `DEFAULT_OWNER_TIME_ZONE` rather than failing the page.
   *
   * This is deliberately NOT a clock: it answers what zone the owner lives in.
   * Instants stay UTC everywhere; only their calendar reading is zoned.
   */
  readonly ownerTimeZone: OwnerTimeZoneResolver;
  /**
   * The owner's calendar date for an instant (default: now), resolved through
   * {@link WorkspaceScope.ownerTimeZone}. The convenience form of the question
   * almost every caller is actually asking.
   */
  readonly ownerTodayIso: (now?: Date) => Promise<string>;
}

/** Resolve the owner's IANA timezone for this scope. Memoised per scope. */
export type OwnerTimeZoneResolver = () => Promise<string>;

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
  /*
   * AUDIT-14 — resolve the owner's timezone ONCE, here, before anything that
   * needs a calendar date is constructed.
   *
   * The preferences read is deferred and memoised rather than awaited: this
   * function is synchronous by design (every repository is bound to the same
   * context with no I/O), and most requests never ask what day it is. The first
   * caller that does pays for one row read; every later caller in the same
   * request gets the SAME answer, which is what makes "the owner's today"
   * singular within a request instead of merely consistent by convention.
   *
   * The owner is the trusted actor established above — never a request value —
   * so this cannot be pointed at another owner's preferences. A read failure or
   * an absent row degrades to `DEFAULT_OWNER_TIME_ZONE`: a page must not 500
   * because a preference row is missing.
   */
  const appPreferences = createAppPreferencesRepository(env.DB, context);
  const preferencesOwnerId = actorContext.actor.id ?? "system";
  let ownerTimeZonePromise: Promise<string> | null = null;
  const ownerTimeZone: OwnerTimeZoneResolver = () => {
    ownerTimeZonePromise ??= appPreferences
      .get(preferencesOwnerId)
      .then((preferences) => preferences.timezone)
      .catch(() => DEFAULT_OWNER_TIME_ZONE);
    return ownerTimeZonePromise;
  };
  const ownerTodayIso = async (now: Date = new Date()): Promise<string> =>
    ownerCalendarIso(now, await ownerTimeZone());

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
  // GOAL-02 — measurement history and milestone stages, written atomically with
  // their own trusted actor, mirroring `goalDetails`.
  const goalMeasurements = createGoalMeasurementRepository(env.DB, context, {
    actorContext,
  });
  const noteDetails = createNoteDetailsRepository(env.DB, context, {
    actorContext,
  });
  const notes = createNoteRepository(env.DB, context);
  const diary = createDiaryRepository(env.DB, context, { actorContext });
  const people = createPersonRepository(env.DB, context, { actorContext });
  const meetings = createMeetingRepository(env.DB, context, { actorContext });
  const meetingTaskConversions = createMeetingTaskConversionRepository(env.DB, {
    tasks,
    meetings,
    entityLinks,
  });
  const assets = createAssetRepository(env.DB, context, {
    actorContext,
    ownerTimeZone,
  });
  // The narrow Task write port an Asset obligation uses. Rescheduling stays the
  // TaskRepository's — this only names it (§22).
  //
  // AUDIT-13 — `completeTask` is deliberately NOT here any more. Obligation
  // completion no longer closes the Task in a transaction of its own; the Task
  // repository PLANS the completion and the obligation's own batch runs it, so
  // both commit or neither does. `tasks` is the concrete D1 adapter, which is
  // where that planning seam lives.
  const obligationTasks: ObligationTaskGateway = {
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
    taskCompletionPlanner: tasks,
    ownerTimeZone,
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
  // SET-03 — the write half for workspace-scoped events, carrying the SAME
  // trusted actor as every mutation repository above.
  const workspaceEvents = createWorkspaceEventRecorder(env.DB, context, {
    actorContext,
  });
  // Membership and the actor directory are the SAME workspace-bound adapter: both
  // read one joined table, and one instance keeps a single actor-resolution rule.
  const members = createWorkspaceMemberRepository(env.DB, context);
  // CAPTURE-01 — the capture credential store and its rate-limit counter. Neither
  // records Activity: a credential is configuration, and a counter is operational
  // state. The `capture.received` event a successful capture appends goes through
  // `workspaceEvents` above, into the one Activity stream (ADR-012).
  const captureTokens = createCaptureTokenRepository(env.DB, context);
  const captureRateLimit = createCaptureRateLimiter(env.DB, context);
  const alignment = createAlignmentRepository(env.DB, context);
  const reviewInsights = createReviewInsightRepository(env.DB, context);
  // NOTE: `appPreferences` is bound at the TOP of this function, not here — the
  // AUDIT-14 owner-timezone resolver needs it before any repository that asks
  // what day it is for the owner is constructed.
  // The AI ledger is owner-scoped as well as workspace-scoped. The owner comes
  // from the trusted actor context established here, never from a request.
  const aiPreferences = createAiPreferencesRepository(env.DB, context);
  const aiUsage = createAiUsageRepository(
    env.DB,
    context,
    actorContext.actor.id ?? "system",
  );
  const taskViews = createTaskViewRepository(env.DB, context);
  // X-02 — the cross-module saved views and the bounded query they run through.
  // The SAME table and the SAME repository class as `taskViews`, bound to the
  // cross-module codec; the query repository is handed the PROJ-02 / AREA-03
  // facts repositories so derived dimensions reuse those evaluators rather than
  // acquiring a second implementation.
  const crossViews = createCrossViewRepository(env.DB, context);
  const crossViewQuery = createCrossViewQueryRepository(env.DB, context, {
    health: projectHealth,
    goals,
    alignment,
  });
  // Read-only: no actor, because it never mutates or records Activity.
  const snapshot = createWorkspaceSnapshotRepository(env.DB, context);
  // Writes, but records no Activity: a restore reconstructs history rather than
  // making it (see docs/development/BACKUP_AND_RESTORE.md).
  const restore = createWorkspaceRestoreRepository(env.DB, context);
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
    goalMeasurements,
    noteDetails,
    notes,
    diary,
    people,
    meetings,
    meetingTaskConversions,
    assets,
    assetHistory,
    reviews,
    projectHealth,
    relationships,
    projectSettings,
    activity,
    workspaceEvents,
    members,
    actors: members,
    captureTokens,
    captureRateLimit,
    alignment,
    reviewInsights,
    appPreferences,
    aiPreferences,
    aiUsage,
    taskViews,
    crossViews,
    crossViewQuery,
    snapshot,
    restore,
    ownerTimeZone,
    ownerTodayIso,
  };
}
