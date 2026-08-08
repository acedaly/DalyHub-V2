/**
 * X-02 — the cross-module view SCOPES: which entity types a shared view can span.
 *
 * A scope is NOT "every entity type DalyHub has". It is the closed set of entity
 * types whose existing repositories can already answer a workspace-scoped, bounded,
 * relationship-aware query without a rewrite (ROADMAP X-02 §16). People, Assets and
 * Diary are deliberately absent: their collections are real, but their filtering
 * contracts do not yet express the shared dimensions below, and forcing them in
 * would mean a poor abstraction rather than universal support.
 *
 * Every scope names the module that owns it, so a view can be checked against the
 * owner's module-visibility preference (`NavigationPreferences.hiddenModuleIds`)
 * before a single row is read.
 */

/** The entity types a cross-module view can include. A closed, versioned set. */
export const VIEW_SCOPES = [
  "task",
  "project",
  "goal",
  "note",
  "meeting",
  "review",
] as const;
export type ViewScope = (typeof VIEW_SCOPES)[number];

/** What a scope is, in the product's own nouns. */
export interface ViewScopeDefinition {
  readonly scope: ViewScope;
  /** The `entities.type` value — also the shared entity-identity/icon key. */
  readonly entityType: ViewScope;
  /** The module that owns this scope, for the enable/disable check. */
  readonly moduleId: string;
  readonly singular: string;
  readonly plural: string;
}

export const VIEW_SCOPE_DEFINITIONS: readonly ViewScopeDefinition[] = [
  {
    scope: "task",
    entityType: "task",
    moduleId: "tasks",
    singular: "Task",
    plural: "Tasks",
  },
  {
    scope: "project",
    entityType: "project",
    moduleId: "projects",
    singular: "Project",
    plural: "Projects",
  },
  {
    scope: "goal",
    entityType: "goal",
    moduleId: "goals",
    singular: "Goal",
    plural: "Goals",
  },
  {
    scope: "note",
    entityType: "note",
    moduleId: "notes",
    singular: "Note",
    plural: "Notes",
  },
  {
    scope: "meeting",
    entityType: "meeting",
    moduleId: "meetings",
    singular: "Meeting",
    plural: "Meetings",
  },
  {
    scope: "review",
    entityType: "review",
    moduleId: "reviews",
    singular: "Review",
    plural: "Reviews",
  },
];

const BY_SCOPE = new Map<ViewScope, ViewScopeDefinition>(
  VIEW_SCOPE_DEFINITIONS.map((definition) => [definition.scope, definition]),
);

/** The definition for a scope. Total over the closed set. */
export function viewScopeDefinition(scope: ViewScope): ViewScopeDefinition {
  const definition = BY_SCOPE.get(scope);
  /* v8 ignore next 3 -- unreachable over the closed set; a guard, not a branch. */
  if (!definition) {
    throw new Error(`Unknown view scope: ${scope}`);
  }
  return definition;
}

/** Narrow an untrusted string to a scope. */
export function isViewScope(value: unknown): value is ViewScope {
  return (
    typeof value === "string" &&
    (VIEW_SCOPES as readonly string[]).includes(value)
  );
}

/**
 * The scopes an owner can currently see, given the modules they have hidden.
 *
 * A hidden module's records are never read — the check happens BEFORE the query,
 * not after it — so a saved view referencing a module the owner later disabled
 * cannot leak that module's data (ROADMAP X-02 §26). The saved view itself is
 * untouched: what is unavailable is reported, not deleted.
 */
export function availableViewScopes(
  hiddenModuleIds: readonly string[],
): readonly ViewScope[] {
  const hidden = new Set(hiddenModuleIds);
  return VIEW_SCOPE_DEFINITIONS.filter(
    (definition) => !hidden.has(definition.moduleId),
  ).map((definition) => definition.scope);
}
