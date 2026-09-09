/**
 * V2.16 CONSOL-02 — the TOTAL classification of every persistent store.
 *
 * ## The gap this closes
 *
 * Before this file, an archive's completeness was a property of inspection
 * rather than of construction. `EXPORT_EXCLUSIONS`
 * (`app/platform/export/manifest.ts`) named the archive's omissions in PROSE,
 * for a human, and nothing in the repository checked that the prose covered the
 * schema. The archive was complete on 2026-09-08; the next migration could add a
 * table holding owner data and no test would notice that it could not leave the
 * product.
 *
 * So every table in the D1 schema is classified HERE, exactly once, and
 * `test/kernel/workspace-data-map.test.ts` reads the REAL migrated schema out of
 * `sqlite_master` and asserts the two agree in both directions. A migration that
 * adds a table now fails the build until somebody decides what the table IS.
 *
 * > **There is no persistent owner-data table outside an explicit export
 * > policy.**
 *
 * ## The four classes
 *
 * | Class | Means | Rule |
 * |---|---|---|
 * | `exported` | The owner's own data | MUST round-trip; names its snapshot collection |
 * | `operational` | Workspace data DalyHub keeps to RUN the product — a ledger, a credential, a counter | Deliberately excluded; the reason must say what it holds and why restoring it would be wrong |
 * | `ephemeral` | Staging for one in-flight operation | Must be empty when no operation is in flight; must never masquerade as owner data |
 * | `infrastructure` | Not workspace data at all | — |
 *
 * ## The other thing this file is for
 *
 * Every table below carries its foreign-key parents, so a total, ordered PURGE
 * PLAN — children strictly before parents — is DERIVED rather than hand-kept.
 * That plan is what `docs/development/WORKSPACE_DELETION.md` documents, what
 * `pnpm run workspace:purge:plan` emits as reviewable SQL, and what the kernel
 * test executes against an isolated synthetic workspace to prove the documented
 * procedure actually empties the database (V2.16 CONSOL-01, ADR-124).
 *
 * There were three hand-kept delete orders in the repository before this file —
 * the restore's `STAGED_COLLECTIONS` reversed, `resetTables` in the kernel test
 * support, and the prose in `BACKUP_AND_RESTORE.md`. The first two cover only
 * the tables they know about, which is exactly the failure this file exists to
 * make impossible.
 *
 * ## Deliberately import-free
 *
 * Nothing is imported, not even a type, so `scripts/workspace-purge-plan.mjs`
 * can load this module directly under Node's type stripping without a bundler
 * or a path alias. The collection names are plain strings; the kernel test is
 * what proves each one is a member of `SNAPSHOT_COLLECTION_ORDER`.
 */

/** What a persistent table IS, for recovery purposes. */
export type WorkspaceDataClass =
  "exported" | "operational" | "ephemeral" | "infrastructure";

/** How a table is scoped, which decides how a purge addresses it. */
export type WorkspaceTableScope =
  /** Carries `workspace_id`. Every table in DalyHub except `workspaces` does. */
  | "workspace"
  /** Carries `workspace_id` AND `owner_id`; the restore addresses both. */
  | "workspace-and-owner"
  /** The workspace row itself — the root of every foreign key. */
  | "root";

/** One persistent table, classified. */
export type WorkspaceTable = {
  /** The D1 table name, exactly as `sqlite_master` reports it. */
  readonly table: string;
  readonly scope: WorkspaceTableScope;
  readonly dataClass: WorkspaceDataClass;
  /**
   * For an `exported` table: where its rows live in the archive. Either a
   * `SnapshotCollection` name, or one of the three archive locations that are
   * not paginated collections (`workspace`, `owner.preferences`,
   * `owner.taskSavedViews`). Absent for every other class.
   */
  readonly collection?: string;
  /**
   * Why this table is classified the way it is. REQUIRED for every class, and
   * the thing a reader actually needs: an exclusion without a reason is a
   * silence with a list around it.
   */
  readonly reason: string;
  /** The tables this one's foreign keys point at. The purge order's edges. */
  readonly references: readonly string[];
};

/**
 * Every persistent table in the D1 schema, classified.
 *
 * Order here is DECLARATION order and carries no meaning — the purge order is
 * derived (see {@link workspacePurgeOrder}). Grouped by class so the file reads
 * as an answer to "what is in this database, and what happens to it".
 */
export const WORKSPACE_TABLES: readonly WorkspaceTable[] = [
  /* ------------------------------------------------------------------------ */
  /* EXPORTED — the owner's own data. Every row round-trips.                    */
  /* ------------------------------------------------------------------------ */

  {
    table: "workspaces",
    scope: "root",
    dataClass: "exported",
    collection: "workspace",
    reason:
      "The workspace itself: its id, name and timestamps. The archive carries it as `workspace`, for provenance; a restore keeps the TARGET's id and adopts nothing from the file.",
    references: [],
  },
  {
    table: "entities",
    scope: "workspace",
    dataClass: "exported",
    collection: "entities",
    reason:
      "The uniform kernel record every first-class DalyHub record is (FND-02).",
    references: ["workspaces"],
  },
  {
    table: "workspace_tags",
    scope: "workspace",
    dataClass: "exported",
    collection: "workspaceTags",
    reason: "The workspace's one tag vocabulary (FIND-02).",
    references: ["workspaces"],
  },
  {
    table: "entity_tags",
    scope: "workspace",
    dataClass: "exported",
    collection: "entityTags",
    reason:
      "Which record wears which tag, under the one canonical folded key (FIND-02).",
    references: ["entities", "workspace_tags"],
  },
  {
    table: "spine_records",
    scope: "workspace",
    dataClass: "exported",
    collection: "spineRecords",
    reason: "The Area/Goal/Project/Task spine and its completion authority.",
    references: ["entities"],
  },
  {
    table: "area_details",
    scope: "workspace",
    dataClass: "exported",
    collection: "areaDetails",
    reason:
      "An Area's module-owned slice — the permanent domains of a life, and few of them.",
    references: ["entities"],
  },
  {
    table: "goal_details",
    scope: "workspace",
    dataClass: "exported",
    collection: "goalDetails",
    reason:
      "A Goal's module-owned slice: its target, its condition and the owner's stated intent.",
    references: ["entities"],
  },
  {
    table: "goal_measurements",
    scope: "workspace",
    dataClass: "exported",
    collection: "goalMeasurements",
    reason: "A Goal's measurement series — the owner's own numbers.",
    references: ["entities"],
  },
  {
    table: "goal_milestones",
    scope: "workspace",
    dataClass: "exported",
    collection: "goalMilestones",
    reason:
      "A Goal's milestones — the intermediate marks the owner set for it, which are their judgement rather than a derived figure.",
    references: ["entities"],
  },
  {
    table: "habit_details",
    scope: "workspace",
    dataClass: "exported",
    collection: "habitDetails",
    reason:
      "A Habit's module-owned slice: a behaviour, not a recurring Task (ADR-102).",
    references: ["entities"],
  },
  {
    table: "habit_schedules",
    scope: "workspace",
    dataClass: "exported",
    collection: "habitSchedules",
    reason: "A Habit's effective-dated schedule chain.",
    references: ["habit_details", "workspaces"],
  },
  {
    table: "habit_completions",
    scope: "workspace",
    dataClass: "exported",
    collection: "habitCompletions",
    reason: "A Habit's owner-local check-ins.",
    references: ["habit_details", "workspaces"],
  },
  {
    table: "project_details",
    scope: "workspace",
    dataClass: "exported",
    collection: "projectDetails",
    reason:
      "A Project's module-owned slice: its workflow status, its parent and its dates.",
    references: ["entities"],
  },
  {
    table: "task_details",
    scope: "workspace",
    dataClass: "exported",
    collection: "taskDetails",
    reason:
      "A Task's module-owned slice — the only thing in the spine the owner actually does.",
    references: ["entities"],
  },
  {
    table: "task_recurrence_rules",
    scope: "workspace",
    dataClass: "exported",
    collection: "taskRecurrenceRules",
    reason:
      "A Task's recurrence rule, in the one closed vocabulary the product recognises.",
    references: ["entities"],
  },
  {
    table: "task_checklist_items",
    scope: "workspace",
    dataClass: "exported",
    collection: "taskChecklistItems",
    reason: "One Task's ordered checklist steps (TASKS-13).",
    references: ["entities", "workspaces"],
  },
  {
    table: "project_template_details",
    scope: "workspace",
    dataClass: "exported",
    collection: "projectTemplateDetails",
    reason:
      "A Project template's slice (PROJECT-02) — an entity that is deliberately not a spine record.",
    references: ["entities"],
  },
  {
    table: "project_template_tasks",
    scope: "workspace",
    dataClass: "exported",
    collection: "projectTemplateTasks",
    reason:
      "A template's tasks — the shape the owner authored once and instantiates many times.",
    references: ["entities", "workspaces"],
  },
  {
    table: "project_template_checklist_items",
    scope: "workspace",
    dataClass: "exported",
    collection: "projectTemplateChecklistItems",
    reason: "A template task's checklist steps.",
    references: ["project_template_tasks", "workspaces"],
  },
  {
    table: "note_details",
    scope: "workspace",
    dataClass: "exported",
    collection: "noteDetails",
    reason: "A Note's Markdown body and its slice.",
    references: ["entities"],
  },
  {
    table: "diary_entry_details",
    scope: "workspace",
    dataClass: "exported",
    collection: "diaryEntryDetails",
    reason:
      "A Diary entry — the most private text in the product, and carried by the archive for exactly that reason.",
    references: ["entities"],
  },
  {
    table: "person_details",
    scope: "workspace",
    dataClass: "exported",
    collection: "personDetails",
    reason:
      "A Person's module-owned slice — the relationship history that is the point of a Person record.",
    references: ["entities"],
  },
  {
    table: "meeting_details",
    scope: "workspace",
    dataClass: "exported",
    collection: "meetingDetails",
    reason:
      "A Meeting's module-owned slice: when it was, where, and who was there.",
    references: ["entities"],
  },
  {
    table: "meeting_items",
    scope: "workspace",
    dataClass: "exported",
    collection: "meetingItems",
    reason:
      "A Meeting's agenda and notes items, in the order the owner arranged them.",
    references: ["meeting_details"],
  },
  {
    table: "meeting_item_tasks",
    scope: "workspace",
    dataClass: "exported",
    collection: "meetingItemTasks",
    reason: "The Tasks a Meeting item produced.",
    references: ["meeting_details"],
  },
  {
    table: "asset_details",
    scope: "workspace",
    dataClass: "exported",
    collection: "assetDetails",
    reason: "An Asset's slice, including its latest valuation.",
    references: ["entities"],
  },
  {
    table: "asset_events",
    scope: "workspace",
    dataClass: "exported",
    collection: "assetEvents",
    reason:
      "An Asset's service and event history — the accumulated record of what was done to it.",
    references: ["entities"],
  },
  {
    table: "obligation_details",
    scope: "workspace",
    dataClass: "exported",
    collection: "obligations",
    reason:
      "The one Obligation model (V2.10 LIFE-01), whether or not it has an Asset subject.",
    references: ["entities"],
  },
  {
    table: "finance_account_details",
    scope: "workspace",
    dataClass: "exported",
    collection: "financeAccounts",
    reason:
      "A Finance account and its opening balance. Balances are DERIVED, so there is no balance column to restore.",
    references: ["entities"],
  },
  {
    table: "finance_categories",
    scope: "workspace",
    dataClass: "exported",
    collection: "financeCategories",
    reason:
      "The owner's own spending categories — a private vocabulary, not a supplied taxonomy.",
    references: ["workspaces"],
  },
  {
    table: "finance_imports",
    scope: "workspace",
    dataClass: "exported",
    collection: "financeImports",
    reason:
      "One audited CSV import — the immutable unit a transaction belongs to.",
    references: ["finance_account_details"],
  },
  {
    table: "finance_transaction_details",
    scope: "workspace",
    dataClass: "exported",
    collection: "financeTransactions",
    reason:
      "Every transaction. The first collection with thousands of rows a year, and the first paged in the archive.",
    references: [
      "entities",
      "finance_account_details",
      "finance_categories",
      "finance_imports",
    ],
  },
  {
    table: "finance_budgets",
    scope: "workspace",
    dataClass: "exported",
    collection: "financeBudgets",
    reason:
      "A category's monthly budget, which is what makes a variance sentence answerable.",
    references: ["finance_categories"],
  },
  {
    table: "attachments",
    scope: "workspace",
    dataClass: "exported",
    collection: "attachments",
    reason:
      "Attachment METADATA. The BYTES live in R2 and are carried in the same archive, verified per row by content hash (V2.11 FILE-02).",
    references: ["entities", "workspaces"],
  },
  {
    table: "review_details",
    scope: "workspace",
    dataClass: "exported",
    collection: "reviewDetails",
    reason:
      "A Review's module-owned slice — its period, its state and when it was completed.",
    references: ["entities"],
  },
  {
    table: "review_sections",
    scope: "workspace",
    dataClass: "exported",
    collection: "reviewSections",
    reason: "A Review's reflections — the owner's own writing.",
    references: ["review_details"],
  },
  {
    table: "review_workflow_state",
    scope: "workspace",
    dataClass: "exported",
    collection: "reviewWorkflowState",
    reason:
      "Where the owner is in a guided Review, so an interrupted Review resumes rather than restarts.",
    references: ["review_details"],
  },
  {
    table: "review_step_acknowledgements",
    scope: "workspace",
    dataClass: "exported",
    collection: "reviewStepAcknowledgements",
    reason: "Which guided-Review steps the owner acknowledged.",
    references: ["review_details"],
  },
  {
    table: "review_insight_snapshots",
    scope: "workspace",
    dataClass: "exported",
    collection: "reviewInsightSnapshots",
    reason:
      "The insight snapshot a Review persisted — history that cannot be recomputed once the underlying records move (ADR-079).",
    references: ["review_details"],
  },
  {
    table: "entity_links",
    scope: "workspace",
    dataClass: "exported",
    collection: "entityLinks",
    reason:
      "The kernel link primitive. DalyHub's value is in the links (AGENTS.md section 2), so an archive without them restores a pile of records rather than a workspace.",
    references: ["entities", "workspaces"],
  },
  {
    table: "activities",
    scope: "workspace",
    dataClass: "exported",
    collection: "activities",
    reason:
      "The one Activity stream — the audit trail and the source every derived history series reads.",
    references: ["workspaces"],
  },
  {
    table: "activity_subjects",
    scope: "workspace",
    dataClass: "exported",
    collection: "activitySubjects",
    reason:
      "Which records an Activity event was about — the multi-anchor half of the stream.",
    references: ["activities", "entities"],
  },
  {
    table: "workspace_members",
    scope: "workspace",
    dataClass: "exported",
    collection: "workspaceMembers",
    reason:
      "Membership: a subject identifier and display names only. No email address and no sign-in telemetry, which is what makes it safe to carry.",
    references: ["entities", "workspaces"],
  },

  /* ------------------------------------------------------------------------ */
  /* EXPORTED, owner-scoped — carried outside the paginated collections.       */
  /* ------------------------------------------------------------------------ */

  {
    table: "owner_app_preferences",
    scope: "workspace-and-owner",
    dataClass: "exported",
    collection: "owner.preferences",
    reason:
      "The owner's behavioural preferences — timezone, week start, appearance, colour scheme, landing destination, navigation visibility. Carried because a restore that silently reset them would be an unfaithful reconstruction of configuration the snapshot already claims to hold.",
    references: ["workspaces"],
  },
  {
    table: "task_saved_views",
    scope: "workspace-and-owner",
    dataClass: "exported",
    collection: "owner.taskSavedViews",
    reason:
      "Every saved view of all three kinds — `tasks`, `cross` and `report`. A saved REPORT definition is a row here, which is why Reports needed no store of its own (ADR-121).",
    references: ["workspaces"],
  },

  /* ------------------------------------------------------------------------ */
  /* OPERATIONAL — kept to RUN the product, deliberately excluded.             */
  /* ------------------------------------------------------------------------ */

  {
    table: "notification_settings",
    scope: "workspace-and-owner",
    dataClass: "operational",
    reason:
      "Holds Pushover credentials alongside the digest time, its zone and the per-source toggles. The row is omitted WHOLE because a credential shares it; a restored workspace starts with notifications off and the defaults. Carrying the non-secret half by COLUMN is DEBT-176, and it is a decision rather than an oversight.",
    references: ["workspaces"],
  },
  {
    table: "notifications",
    scope: "workspace",
    dataClass: "operational",
    reason:
      "The notification ledger: what the system decided to send. A record of how the product was OPERATED, not anything the owner authored — the same rule the AI usage ledger follows.",
    references: ["workspaces"],
  },
  {
    table: "notification_deliveries",
    scope: "workspace",
    dataClass: "operational",
    reason:
      "Per-channel delivery state for the ledger above. Same rule, same reason.",
    references: ["notifications", "workspaces"],
  },
  {
    table: "calendar_sources",
    scope: "workspace",
    dataClass: "operational",
    reason:
      "A subscribed feed's URL is a sealed CREDENTIAL. A restored workspace subscribes to nothing until the owner adds the feeds again.",
    references: ["workspaces"],
  },
  {
    table: "external_calendar_events",
    scope: "workspace",
    dataClass: "operational",
    reason:
      "Events read from someone else's calendar. They belong to the calendar that publishes them and are re-read on the next refresh; DalyHub is a read-only projection of them (ADR-091).",
    references: ["calendar_sources", "workspaces"],
  },
  {
    table: "external_calendar_meeting_links",
    scope: "workspace",
    dataClass: "operational",
    reason:
      "Which external event a Meeting was matched to. Meaningless once the events above are gone, and re-derived when they come back.",
    references: ["workspaces"],
  },
  {
    table: "workspace_ai_preferences",
    scope: "workspace-and-owner",
    dataClass: "operational",
    reason:
      "The AI spending budget, the allowed features and categories, and the privacy CONSENT. A restore that quietly re-enabled all three would spend the owner's money and re-grant a consent they may have withdrawn. An archive that loses a setting is recoverable in a minute; one that silently restores a consent is not (DEBT-94's decision).",
    references: ["workspaces"],
  },
  {
    table: "ai_usage_requests",
    scope: "workspace",
    dataClass: "operational",
    reason:
      "The AI metadata ledger: feature, model, token counts, cost, disposition and the ids of the records a request was grounded in. Metadata ONLY — no prompt, no response, no record content (ADR-122) — and an operational record rather than owner data.",
    references: ["workspaces"],
  },
  {
    table: "capture_tokens",
    scope: "workspace",
    dataClass: "operational",
    reason:
      "Universal-capture CREDENTIALS. A capture token can bring thoughts in; exporting one would put a working credential in a file the owner emails to themselves.",
    references: ["workspaces"],
  },
  {
    table: "capture_rate_windows",
    scope: "workspace",
    dataClass: "operational",
    reason:
      "Rate-limit counters for the credentials above. Infrastructure arithmetic with a workspace column.",
    references: ["workspaces"],
  },
  {
    table: "attachment_object_purges",
    scope: "workspace",
    dataClass: "operational",
    reason:
      "The R2 cleanup ledger: object keys queued for deletion, and the audit that they were. It describes the STORE rather than the owner's evidence, and a restore must not resurrect a deletion that already happened.",
    references: ["workspaces"],
  },
  {
    table: "offline_capture_receipts",
    scope: "workspace",
    dataClass: "operational",
    reason:
      "PWA capture idempotency receipts — what a replayed offline capture already created, so a second replay is a no-op rather than a duplicate. It arbitrates a REPLAY; it holds no fact the owner authored. (They accumulate with no prune: DEBT-69.)",
    references: ["workspaces"],
  },
  {
    table: "offline_mutation_receipts",
    scope: "workspace",
    dataClass: "operational",
    reason:
      "The same rule for offline MUTATIONS, and the table the assisted-AI apply path reuses for its own replay safety (ADR-123) rather than adding a second one.",
    references: ["workspaces"],
  },

  /* ------------------------------------------------------------------------ */
  /* EPHEMERAL — staging for one in-flight operation.                          */
  /* ------------------------------------------------------------------------ */

  {
    table: "workspace_restore_operations",
    scope: "workspace-and-owner",
    dataClass: "ephemeral",
    reason:
      "One restore operation: its mode, its status, its safety-backup acknowledgement and its single-use apply token. It is created by `prepareRestore` and reaches a terminal status at the cutover; the terminal row SURVIVES as the record that a restore happened, and its token is spent. What does not survive is `workspace_restore_staged_rows` — see there. MEASURED by the rehearsal after a completed round trip: exactly one row, status `completed`.",
    references: ["workspaces"],
  },
  {
    table: "workspace_restore_staged_rows",
    scope: "workspace",
    dataClass: "ephemeral",
    reason:
      "The archive's rows, STAGED, before the cutover writes them into the real tables. This is the one table that could most easily masquerade as owner data — it holds a copy of all of it — and it is exactly the wrong copy: an interrupted restore leaves rows here that were never accepted.",
    references: ["workspaces"],
  },
] as const;

/** Every classified table name. */
export const WORKSPACE_TABLE_NAMES: readonly string[] = WORKSPACE_TABLES.map(
  (entry) => entry.table,
);

const BY_TABLE = new Map<string, WorkspaceTable>(
  WORKSPACE_TABLES.map((entry) => [entry.table, entry]),
);

/** The classification for one table, or undefined if it is not classified. */
export function workspaceTable(table: string): WorkspaceTable | undefined {
  return BY_TABLE.get(table);
}

/** Every table of one class, in declaration order. */
export function workspaceTablesOfClass(
  dataClass: WorkspaceDataClass,
): readonly WorkspaceTable[] {
  return WORKSPACE_TABLES.filter((entry) => entry.dataClass === dataClass);
}

/**
 * The ordered purge plan: every table, children strictly before parents.
 *
 * DERIVED from the `references` edges above by a depth-first topological sort,
 * so it cannot drift from the schema the way a hand-kept list does. Ties break
 * on declaration order, which makes the plan deterministic and therefore
 * reviewable as a diff.
 *
 * A cycle would make "children before parents" meaningless and is thrown on
 * rather than silently ordered — SQLite permits a cyclic foreign-key graph, and
 * a purge over one cannot be correct without deferring constraint checks, which
 * is a decision rather than an accident.
 *
 * `workspaces` is last, always: it is the root every other table points at,
 * directly or through one hop.
 */
export function workspacePurgeOrder(): readonly WorkspaceTable[] {
  const ordered: WorkspaceTable[] = [];
  const state = new Map<string, "visiting" | "done">();

  /** Emit `table` after everything that DEPENDS on it. */
  const visit = (entry: WorkspaceTable, trail: readonly string[]): void => {
    const seen = state.get(entry.table);
    if (seen === "done") return;
    if (seen === "visiting") {
      throw new Error(
        `workspace purge order: foreign-key cycle through ${[...trail, entry.table].join(" -> ")}`,
      );
    }
    state.set(entry.table, "visiting");
    // Everything that references THIS table must be deleted first.
    for (const dependent of WORKSPACE_TABLES) {
      if (dependent.references.includes(entry.table)) {
        visit(dependent, [...trail, entry.table]);
      }
    }
    state.set(entry.table, "done");
    ordered.push(entry);
  };

  for (const entry of WORKSPACE_TABLES) {
    visit(entry, []);
  }
  return ordered;
}

/**
 * The purge plan as SQL, one statement per table, in order.
 *
 * `:workspace_id` is a named placeholder rather than an interpolated value:
 * this function builds a plan for a HUMAN to review and then run through
 * `wrangler d1 execute`, and a generator that pastes an id into a string is one
 * typo away from a statement that means something else.
 */
export function workspacePurgeStatements(): readonly string[] {
  return workspacePurgeOrder().map((entry) =>
    entry.scope === "root"
      ? `DELETE FROM ${entry.table} WHERE id = :workspace_id;`
      : `DELETE FROM ${entry.table} WHERE workspace_id = :workspace_id;`,
  );
}
