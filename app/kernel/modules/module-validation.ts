/**
 * FND-06 Module Registry kernel — module-id, route, command and setting
 * validation (the storage-kernel-free core).
 *
 * Pure, storage-independent validation of module identity and the capability
 * descriptors that need NO storage-kernel validator: the module-id slug,
 * module-namespaced capability ids, safe route paths and file references, command
 * descriptors, and setting-default type-matching. The registry validates BEFORE
 * it exposes anything, so an incompletely or ambiguously composed application
 * never serves requests (ADR-013 §16). Validators return a NORMALISED,
 * freshly-constructed descriptor (a defensive copy built from primitive reads of
 * the source) or throw a typed `ModuleRegistryError`. Building new objects here
 * means a later mutation of the source manifest cannot reach into the registry
 * (ADR-013 §4.4).
 *
 * This file deliberately imports NO storage kernel (`~/kernel/entities` …). The
 * entity/link/activity/search validators that REUSE those kernel identifier
 * validators live in `entity-contribution-validation.ts`, so this route/id core
 * can be bundled by the React Router bare config loader (which cannot resolve the
 * `~` alias) when the real `app/routes.ts` composes routes at build time.
 */

import { ModuleDefinitionError } from "./module-errors";
import type {
  CommandContribution,
  CommandShortcut,
  ExecutableCommandContribution,
  NavigationCommandContribution,
  RouteContribution,
  SettingContribution,
  SettingEnumOption,
} from "./module-capabilities";
import type { ModuleId } from "./module-definition";
import { validateNavigationTarget } from "./navigation-target";

/** Maximum length of a module id, in characters. */
export const MODULE_ID_MAX_LENGTH = 64;

/**
 * Allowed shape of a module id: a lowercase slug that starts with a letter and
 * uses only lowercase letters and digits, with single hyphens as separators
 * (e.g. `projects`, `notes`, `day-diary`). This deliberately rejects uppercase,
 * whitespace, dots, slashes, underscores, leading/trailing/double hyphens and any
 * path-traversal sequence, so a module id is always a safe, stable directory and
 * namespace key.
 */
export const MODULE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;

/** Maximum length of a namespaced capability id (route/command/search/setting). */
export const QUALIFIED_ID_MAX_LENGTH = 128;

/**
 * The local part of a namespaced capability id, after the `"<moduleId>."` prefix:
 * one or more lowercase dotted segments (each starting with a letter, then
 * lowercase letters/digits/underscores). The same identifier shape the entity,
 * link and Activity kernels use for the part after the module namespace.
 */
export const QUALIFIED_ID_LOCAL_PATTERN =
  /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)*$/;

/** Maximum length of a route path, in characters. */
export const ROUTE_PATH_MAX_LENGTH = 256;

/** Maximum length of a module-relative route module file reference, in characters. */
export const ROUTE_FILE_MAX_LENGTH = 256;

/** Route module file extensions the toolchain can compile (ADR-016 §5.10). */
export const ROUTE_FILE_EXTENSIONS: readonly string[] = [
  ".tsx",
  ".ts",
  ".jsx",
  ".js",
];

/**
 * A single segment of a module-relative route file path: a safe filename token
 * (letters, digits, `_`, `-`, `.`). `.` and `..` segments are rejected
 * separately by the file validator so a reference can never traverse out of its
 * owning module directory.
 */
const ROUTE_FILE_SEGMENT_PATTERN = /^[A-Za-z0-9._-]+$/;

/** Maximum length of a display label (name, label, singular/plural, option label). */
export const LABEL_MAX_LENGTH = 200;

/** Maximum length of a free-text description. */
export const DESCRIPTION_MAX_LENGTH = 1000;

/** Maximum number of search keywords a command may declare. */
export const MAX_COMMAND_KEYWORDS = 32;

/** Maximum number of options an enum setting may declare. */
export const MAX_ENUM_OPTIONS = 64;

/**
 * Activity event types the KERNEL reserves for its own lifecycle events. Modules
 * may not claim any of these (ADR-013 §11); they are owned by the entity and
 * entity-link kernels, not by any userland module. Kept in sync with the string
 * constants the D1 entity and entity-link repositories emit.
 */
export const RESERVED_ACTIVITY_TYPES: ReadonlySet<string> = new Set([
  "entity.created",
  "entity.updated",
  "entity.deleted",
  "entity.restored",
  "entity_link.created",
  "entity_link.unlinked",
  "entity_link.restored",
]);

/** Accepted keyboard modifiers for a command shortcut. */
const SHORTCUT_MODIFIERS: ReadonlySet<string> = new Set([
  "mod",
  "shift",
  "alt",
  "ctrl",
  "meta",
]);

/**
 * Global keyboard shortcuts reserved by the app shell that a module command may
 * NOT claim (DS-09, ADR-024): `Mod+K` opens the Command Palette and a bare `/`
 * focuses Search. A command that declares one is a hard registry-construction
 * error, so a module can never silently reassign the product's reserved keyboard
 * vocabulary. Each reserved shortcut is expressed in the canonical comparison
 * form: a lowercased key plus a sorted list of modifiers.
 */
const RESERVED_COMMAND_SHORTCUTS: readonly {
  readonly key: string;
  readonly modifiers: readonly string[];
}[] = [
  { key: "k", modifiers: ["mod"] },
  { key: "/", modifiers: [] },
];

/** The concrete modifier requirement a shortcut resolves to on one platform. */
type ModifierState = {
  readonly meta: boolean;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
};

/**
 * Resolve a shortcut's modifiers to the concrete key-event they require on one
 * platform. `mod` becomes Meta on macOS and Control elsewhere — exactly how the
 * runtime dispatcher matches — so two shortcuts that fire on the same key event are
 * recognised as equal even when written differently (`Mod+K` vs `Meta+K`).
 */
function resolveModifiers(
  modifiers: readonly string[],
  modIsMeta: boolean,
): ModifierState {
  const has = (modifier: string) => modifiers.includes(modifier);
  const wantMod = has("mod");
  return {
    meta: has("meta") || (wantMod && modIsMeta),
    ctrl: has("ctrl") || (wantMod && !modIsMeta),
    alt: has("alt"),
    shift: has("shift"),
  };
}

function sameModifiers(a: ModifierState, b: ModifierState): boolean {
  return (
    a.meta === b.meta &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.shift === b.shift
  );
}

/**
 * True when a validated shortcut is (an alias of) a reserved global shortcut. The
 * comparison resolves `mod` per platform and reports a collision on EITHER platform,
 * so a module cannot slip past reserved `Mod+K` by declaring its runtime alias
 * `Meta+K` (macOS) or `Ctrl+K` (elsewhere) — which the global dispatcher, installing
 * the reserved binding first, would otherwise shadow while still advertising it.
 */
function isReservedShortcut(shortcut: CommandShortcut): boolean {
  const key = shortcut.key.toLowerCase();
  const modifiers = shortcut.modifiers ?? [];
  return RESERVED_COMMAND_SHORTCUTS.some((reserved) => {
    if (reserved.key !== key) {
      return false;
    }
    return [true, false].some((modIsMeta) =>
      sameModifiers(
        resolveModifiers(modifiers, modIsMeta),
        resolveModifiers(reserved.modifiers, modIsMeta),
      ),
    );
  });
}

/**
 * A single path segment: a splat (`*`), a named param (`:name`) or a static
 * segment of an intentionally-restricted safe charset. `.` and `..` segments are
 * rejected separately by the path validator.
 */
const ROUTE_PATH_SEGMENT_PATTERN =
  /^(?:\*|:[a-zA-Z][a-zA-Z0-9_]*|[a-zA-Z0-9_~.-]+)$/;

/**
 * Validate a value as a `ModuleId`: required, non-empty, bounded and matching the
 * documented slug. The ONLY sanctioned way to turn a raw string into a `ModuleId`.
 */
export function parseModuleId(value: unknown): ModuleId {
  if (typeof value !== "string") {
    throw new ModuleDefinitionError("id", "must be a string");
  }
  if (value.length === 0) {
    throw new ModuleDefinitionError("id", "must not be empty");
  }
  if (value.length > MODULE_ID_MAX_LENGTH) {
    throw new ModuleDefinitionError(
      "id",
      `must be at most ${MODULE_ID_MAX_LENGTH} characters`,
    );
  }
  if (!MODULE_ID_PATTERN.test(value)) {
    throw new ModuleDefinitionError(
      "id",
      'must be a lowercase hyphenated slug (e.g. "projects" or "day-diary")',
    );
  }
  return value as ModuleId;
}

/** True when `value` is a structurally valid module id. */
export function isModuleId(value: unknown): value is ModuleId {
  try {
    parseModuleId(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Validate and normalise a required display label: non-empty after trimming and
 * within the documented length. Returns the trimmed value. Exported so the
 * entity/link/activity contribution validators (split into their own module to
 * keep this route/id core free of storage-kernel imports) can reuse it.
 */
export function validateLabel(
  value: unknown,
  field: string,
  moduleId: string,
): string {
  if (typeof value !== "string") {
    throw new ModuleDefinitionError(field, "must be a string", moduleId);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ModuleDefinitionError(field, "must not be empty", moduleId);
  }
  if (trimmed.length > LABEL_MAX_LENGTH) {
    throw new ModuleDefinitionError(
      field,
      `must be at most ${LABEL_MAX_LENGTH} characters`,
      moduleId,
    );
  }
  return trimmed;
}

/** Validate an optional description, returning undefined when absent. */
export function validateOptionalDescription(
  value: unknown,
  field: string,
  moduleId: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    throw new ModuleDefinitionError(field, "must be a string", moduleId);
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ModuleDefinitionError(
      field,
      "must not be empty when provided",
      moduleId,
    );
  }
  if (trimmed.length > DESCRIPTION_MAX_LENGTH) {
    throw new ModuleDefinitionError(
      field,
      `must be at most ${DESCRIPTION_MAX_LENGTH} characters`,
      moduleId,
    );
  }
  return trimmed;
}

/** Validate an optional finite-number ordering hint. */
export function validateOptionalOrder(
  value: unknown,
  field: string,
  moduleId: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ModuleDefinitionError(field, "must be a finite number", moduleId);
  }
  return value;
}

/**
 * Validate a module-namespaced capability id (route/command/search/setting):
 * required, bounded, prefixed with `"<moduleId>."`, and whose local part is a
 * lowercase dotted identifier. Enforcing the prefix is how the registry checks
 * that a namespaced contribution belongs to the declaring module (ADR-013 §12).
 */
export function validateQualifiedId(
  value: unknown,
  moduleId: string,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new ModuleDefinitionError(field, "must be a string", moduleId);
  }
  if (value.length === 0) {
    throw new ModuleDefinitionError(field, "must not be empty", moduleId);
  }
  if (value.length > QUALIFIED_ID_MAX_LENGTH) {
    throw new ModuleDefinitionError(
      field,
      `must be at most ${QUALIFIED_ID_MAX_LENGTH} characters`,
      moduleId,
    );
  }
  const prefix = `${moduleId}.`;
  if (!value.startsWith(prefix)) {
    throw new ModuleDefinitionError(
      field,
      `must be namespaced under the module (start with "${prefix}")`,
      moduleId,
    );
  }
  const local = value.slice(prefix.length);
  if (!QUALIFIED_ID_LOCAL_PATTERN.test(local)) {
    throw new ModuleDefinitionError(
      field,
      `must be a namespaced lowercase dotted identifier (e.g. "${moduleId}.example")`,
      moduleId,
    );
  }
  return value;
}

/**
 * Validate a route path: non-empty, bounded, free of whitespace, query strings,
 * hashes, backslashes, leading/trailing slashes, empty segments and any `.`/`..`
 * traversal segment, with each remaining segment a splat, a named param or a
 * safe static token (ADR-013 §8).
 */
export function validateRoutePath(
  value: unknown,
  moduleId: string,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new ModuleDefinitionError(field, "must be a string", moduleId);
  }
  if (value.length === 0) {
    throw new ModuleDefinitionError(field, "must not be empty", moduleId);
  }
  if (value.length > ROUTE_PATH_MAX_LENGTH) {
    throw new ModuleDefinitionError(
      field,
      `must be at most ${ROUTE_PATH_MAX_LENGTH} characters`,
      moduleId,
    );
  }
  if (/\s/.test(value)) {
    throw new ModuleDefinitionError(
      field,
      "must not contain whitespace",
      moduleId,
    );
  }
  if (value.includes("?") || value.includes("#")) {
    throw new ModuleDefinitionError(
      field,
      "must not contain a query string or hash",
      moduleId,
    );
  }
  if (value.includes("\\")) {
    throw new ModuleDefinitionError(
      field,
      "must not contain a backslash",
      moduleId,
    );
  }
  if (value.startsWith("/")) {
    throw new ModuleDefinitionError(
      field,
      "must be relative (no leading slash)",
      moduleId,
    );
  }
  if (value.endsWith("/")) {
    throw new ModuleDefinitionError(
      field,
      "must not end with a slash",
      moduleId,
    );
  }
  for (const segment of value.split("/")) {
    if (segment.length === 0) {
      throw new ModuleDefinitionError(
        field,
        "must not contain an empty path segment",
        moduleId,
      );
    }
    if (segment === "." || segment === "..") {
      throw new ModuleDefinitionError(
        field,
        "must not contain a path traversal segment",
        moduleId,
      );
    }
    if (!ROUTE_PATH_SEGMENT_PATTERN.test(segment)) {
      throw new ModuleDefinitionError(
        field,
        `has an invalid path segment "${segment}"`,
        moduleId,
      );
    }
  }
  return value;
}

/**
 * Validate a module-relative route module file reference (ADR-016 §5.10): a
 * string, non-empty, bounded, relative (no leading slash, no drive letter, no
 * backslash), free of whitespace/query/hash, with no empty or `.`/`..` traversal
 * segment and a compilable route-module extension. Because the platform adapter
 * resolves it against `app/modules/<module-id>/`, these rules guarantee the
 * reference stays INSIDE the owning module directory — it can never point at an
 * absolute filesystem path, another module's file, or anything outside the app.
 */
export function validateRouteFile(
  value: unknown,
  moduleId: string,
  field: string,
): string {
  if (typeof value !== "string") {
    throw new ModuleDefinitionError(field, "must be a string", moduleId);
  }
  if (value.length === 0) {
    throw new ModuleDefinitionError(field, "must not be empty", moduleId);
  }
  if (value.length > ROUTE_FILE_MAX_LENGTH) {
    throw new ModuleDefinitionError(
      field,
      `must be at most ${ROUTE_FILE_MAX_LENGTH} characters`,
      moduleId,
    );
  }
  if (/\s/.test(value)) {
    throw new ModuleDefinitionError(
      field,
      "must not contain whitespace",
      moduleId,
    );
  }
  if (value.includes("?") || value.includes("#")) {
    throw new ModuleDefinitionError(
      field,
      "must not contain a query string or hash",
      moduleId,
    );
  }
  if (value.includes("\\")) {
    throw new ModuleDefinitionError(
      field,
      "must not contain a backslash",
      moduleId,
    );
  }
  if (value.startsWith("/")) {
    throw new ModuleDefinitionError(
      field,
      "must be module-relative (no absolute path)",
      moduleId,
    );
  }
  // Reject a Windows drive-letter absolute path (e.g. `C:/…`) explicitly; the
  // `:` also fails the segment charset below, but the message is clearer here.
  if (/^[A-Za-z]:/.test(value)) {
    throw new ModuleDefinitionError(
      field,
      "must be module-relative (no absolute path)",
      moduleId,
    );
  }
  if (value.endsWith("/")) {
    throw new ModuleDefinitionError(
      field,
      "must reference a file (no trailing slash)",
      moduleId,
    );
  }
  for (const segment of value.split("/")) {
    if (segment.length === 0) {
      throw new ModuleDefinitionError(
        field,
        "must not contain an empty path segment",
        moduleId,
      );
    }
    if (segment === "." || segment === "..") {
      throw new ModuleDefinitionError(
        field,
        "must not contain a path traversal segment",
        moduleId,
      );
    }
    if (!ROUTE_FILE_SEGMENT_PATTERN.test(segment)) {
      throw new ModuleDefinitionError(
        field,
        `has an invalid file path segment "${segment}"`,
        moduleId,
      );
    }
  }
  if (!ROUTE_FILE_EXTENSIONS.some((extension) => value.endsWith(extension))) {
    throw new ModuleDefinitionError(
      field,
      `must reference a ${ROUTE_FILE_EXTENSIONS.join("/")} route module`,
      moduleId,
    );
  }
  return value;
}

/* -------------------------------------------------------------------------- */
/* Route contribution                                                         */
/* -------------------------------------------------------------------------- */

/** Validate one route contribution, returning a normalised defensive copy. */
export function validateRouteContribution(
  contribution: RouteContribution,
  moduleId: string,
  index: number,
): RouteContribution {
  const field = `routes[${index}]`;
  const id = validateQualifiedId(contribution.id, moduleId, `${field}.id`);
  const isIndex = contribution.index === true;
  if (
    contribution.index !== undefined &&
    typeof contribution.index !== "boolean"
  ) {
    throw new ModuleDefinitionError(
      `${field}.index`,
      "must be a boolean",
      moduleId,
    );
  }

  let path: string | undefined;
  if (isIndex) {
    if (contribution.path !== undefined) {
      throw new ModuleDefinitionError(
        `${field}.path`,
        "an index route must not declare a path",
        moduleId,
      );
    }
  } else {
    if (contribution.path === undefined) {
      throw new ModuleDefinitionError(
        `${field}.path`,
        "a non-index route must declare a path",
        moduleId,
      );
    }
    path = validateRoutePath(contribution.path, moduleId, `${field}.path`);
  }

  let parentId: string | undefined;
  if (contribution.parentId !== undefined) {
    parentId = validateQualifiedId(
      contribution.parentId,
      // A parent id is only required to be a well-formed qualified id here;
      // whether it resolves (and to whose module) is checked when the whole
      // registry is assembled. It is validated against this module's namespace
      // because same-module ownership is the default (ADR-013 §8).
      moduleId,
      `${field}.parentId`,
    );
  }

  const file = validateRouteFile(contribution.file, moduleId, `${field}.file`);

  let meta: RouteContribution["meta"];
  if (contribution.meta !== undefined) {
    const rawMeta = contribution.meta;
    if (typeof rawMeta !== "object" || rawMeta === null) {
      throw new ModuleDefinitionError(
        `${field}.meta`,
        "must be an object",
        moduleId,
      );
    }
    const navLabel =
      rawMeta.navLabel === undefined
        ? undefined
        : validateLabel(rawMeta.navLabel, `${field}.meta.navLabel`, moduleId);
    const navGroup =
      rawMeta.navGroup === undefined
        ? undefined
        : validateLabel(rawMeta.navGroup, `${field}.meta.navGroup`, moduleId);
    const navOrder = validateOptionalOrder(
      rawMeta.navOrder,
      `${field}.meta.navOrder`,
      moduleId,
    );
    meta = { navLabel, navGroup, navOrder };
  }

  return {
    id,
    ...(isIndex ? { index: true as const } : { path: path as string }),
    ...(parentId === undefined ? {} : { parentId }),
    file,
    ...(meta === undefined ? {} : { meta }),
  };
}

/* -------------------------------------------------------------------------- */
/* Command contribution                                                       */
/* -------------------------------------------------------------------------- */

function validateOptionalKeywords(
  value: unknown,
  field: string,
  moduleId: string,
): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new ModuleDefinitionError(
      field,
      "must be an array of strings",
      moduleId,
    );
  }
  if (value.length > MAX_COMMAND_KEYWORDS) {
    throw new ModuleDefinitionError(
      field,
      `must have at most ${MAX_COMMAND_KEYWORDS} keywords`,
      moduleId,
    );
  }
  return value.map((keyword, i) =>
    validateLabel(keyword, `${field}[${i}]`, moduleId),
  );
}

function validateOptionalShortcut(
  value: unknown,
  field: string,
  moduleId: string,
): CommandShortcut | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "object" || value === null) {
    throw new ModuleDefinitionError(field, "must be an object", moduleId);
  }
  const shortcut = value as CommandShortcut;
  if (typeof shortcut.key !== "string" || shortcut.key.length === 0) {
    throw new ModuleDefinitionError(
      `${field}.key`,
      "must be a non-empty string",
      moduleId,
    );
  }
  let modifiers: CommandShortcut["modifiers"];
  if (shortcut.modifiers !== undefined) {
    if (!Array.isArray(shortcut.modifiers)) {
      throw new ModuleDefinitionError(
        `${field}.modifiers`,
        "must be an array",
        moduleId,
      );
    }
    for (const modifier of shortcut.modifiers) {
      if (typeof modifier !== "string" || !SHORTCUT_MODIFIERS.has(modifier)) {
        throw new ModuleDefinitionError(
          `${field}.modifiers`,
          'must contain only "mod", "shift", "alt", "ctrl" or "meta"',
          moduleId,
        );
      }
    }
    modifiers = [...shortcut.modifiers];
  }
  const normalised: CommandShortcut = {
    key: shortcut.key,
    ...(modifiers === undefined ? {} : { modifiers }),
  };
  if (isReservedShortcut(normalised)) {
    throw new ModuleDefinitionError(
      field,
      "reassigns a reserved global shortcut (Mod+K opens the Command Palette, / focuses Search); a module may add shortcuts but never reassign a reserved one",
      moduleId,
    );
  }
  return normalised;
}

/**
 * Validate one command contribution, returning a normalised defensive copy.
 *
 * A command is a discriminated union (DS-09, ADR-024): a `navigate` command
 * carries a validated {@link SearchResultTarget} and no handler; an `execute`
 * command carries a handler and no target. A command that is BOTH (declares a
 * target on an executable, or a handler on a navigation) or NEITHER (an
 * unrecognised `kind`) is a hard error, so the browser can never receive an
 * ambiguous command and the registry never stores one.
 */
export function validateCommandContribution(
  contribution: CommandContribution,
  moduleId: string,
  index: number,
): CommandContribution {
  const field = `commands[${index}]`;
  const id = validateQualifiedId(contribution.id, moduleId, `${field}.id`);
  const title = validateLabel(contribution.title, `${field}.title`, moduleId);
  const subtitle =
    contribution.subtitle === undefined
      ? undefined
      : validateLabel(contribution.subtitle, `${field}.subtitle`, moduleId);
  const keywords = validateOptionalKeywords(
    contribution.keywords,
    `${field}.keywords`,
    moduleId,
  );
  const shortcut = validateOptionalShortcut(
    contribution.shortcut,
    `${field}.shortcut`,
    moduleId,
  );
  const base = {
    id,
    title,
    ...(subtitle === undefined ? {} : { subtitle }),
    ...(keywords === undefined ? {} : { keywords }),
    ...(shortcut === undefined ? {} : { shortcut }),
  };

  const kind = (contribution as { readonly kind?: unknown }).kind;
  const hasRun = (contribution as { readonly run?: unknown }).run !== undefined;
  const hasTarget =
    (contribution as { readonly target?: unknown }).target !== undefined;

  if (kind === "navigate") {
    if (hasRun) {
      throw new ModuleDefinitionError(
        field,
        "a navigation command must not declare a `run` handler",
        moduleId,
      );
    }
    const target = validateNavigationTarget(
      (contribution as NavigationCommandContribution).target,
    );
    if (target === null) {
      throw new ModuleDefinitionError(
        `${field}.target`,
        "must be a valid navigation target — a drawer key or an app-relative route (never an external URL or unsafe scheme)",
        moduleId,
      );
    }
    return { ...base, kind: "navigate", target };
  }

  if (kind === "execute") {
    if (hasTarget) {
      throw new ModuleDefinitionError(
        field,
        "an executable command must not declare a navigation `target`",
        moduleId,
      );
    }
    if (
      typeof (contribution as ExecutableCommandContribution).run !== "function"
    ) {
      throw new ModuleDefinitionError(
        `${field}.run`,
        "must be a function (the command handler)",
        moduleId,
      );
    }
    return {
      ...base,
      kind: "execute",
      run: (contribution as ExecutableCommandContribution).run,
    };
  }

  throw new ModuleDefinitionError(
    `${field}.kind`,
    'must be "navigate" (a declarative target) or "execute" (a server handler)',
    moduleId,
  );
}

/* -------------------------------------------------------------------------- */
/* Setting contribution                                                       */
/* -------------------------------------------------------------------------- */

function validateEnumOptions(
  value: unknown,
  field: string,
  moduleId: string,
): readonly SettingEnumOption[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ModuleDefinitionError(
      field,
      "must be a non-empty array of options",
      moduleId,
    );
  }
  if (value.length > MAX_ENUM_OPTIONS) {
    throw new ModuleDefinitionError(
      field,
      `must have at most ${MAX_ENUM_OPTIONS} options`,
      moduleId,
    );
  }
  const seen = new Set<string>();
  return value.map((option, i) => {
    if (typeof option !== "object" || option === null) {
      throw new ModuleDefinitionError(
        `${field}[${i}]`,
        "must be an object",
        moduleId,
      );
    }
    const candidate = option as SettingEnumOption;
    if (typeof candidate.value !== "string" || candidate.value.length === 0) {
      throw new ModuleDefinitionError(
        `${field}[${i}].value`,
        "must be a non-empty string",
        moduleId,
      );
    }
    if (seen.has(candidate.value)) {
      throw new ModuleDefinitionError(
        `${field}[${i}].value`,
        `duplicate option value "${candidate.value}"`,
        moduleId,
      );
    }
    seen.add(candidate.value);
    const label = validateLabel(
      candidate.label,
      `${field}[${i}].label`,
      moduleId,
    );
    return { value: candidate.value, label };
  });
}

/** Validate one setting contribution and confirm its default matches its type. */
export function validateSettingContribution(
  contribution: SettingContribution,
  moduleId: string,
  index: number,
): SettingContribution {
  const field = `settings[${index}]`;
  const key = validateQualifiedId(contribution.key, moduleId, `${field}.key`);
  const label = validateLabel(contribution.label, `${field}.label`, moduleId);
  const description = validateOptionalDescription(
    contribution.description,
    `${field}.description`,
    moduleId,
  );
  const base = {
    key,
    label,
    ...(description === undefined ? {} : { description }),
  };

  switch (contribution.type) {
    case "boolean": {
      if (typeof contribution.default !== "boolean") {
        throw new ModuleDefinitionError(
          `${field}.default`,
          "must be a boolean to match the boolean setting type",
          moduleId,
        );
      }
      return { ...base, type: "boolean", default: contribution.default };
    }
    case "string": {
      if (typeof contribution.default !== "string") {
        throw new ModuleDefinitionError(
          `${field}.default`,
          "must be a string to match the string setting type",
          moduleId,
        );
      }
      let maxLength: number | undefined;
      if (contribution.maxLength !== undefined) {
        if (
          typeof contribution.maxLength !== "number" ||
          !Number.isInteger(contribution.maxLength) ||
          contribution.maxLength < 1
        ) {
          throw new ModuleDefinitionError(
            `${field}.maxLength`,
            "must be a positive integer",
            moduleId,
          );
        }
        maxLength = contribution.maxLength;
        if (contribution.default.length > maxLength) {
          throw new ModuleDefinitionError(
            `${field}.default`,
            `must be at most ${maxLength} characters to satisfy maxLength`,
            moduleId,
          );
        }
      }
      return {
        ...base,
        type: "string",
        default: contribution.default,
        ...(maxLength === undefined ? {} : { maxLength }),
      };
    }
    case "number": {
      if (
        typeof contribution.default !== "number" ||
        !Number.isFinite(contribution.default)
      ) {
        throw new ModuleDefinitionError(
          `${field}.default`,
          "must be a finite number to match the number setting type",
          moduleId,
        );
      }
      const min = validateOptionalOrder(
        contribution.min,
        `${field}.min`,
        moduleId,
      );
      const max = validateOptionalOrder(
        contribution.max,
        `${field}.max`,
        moduleId,
      );
      if (min !== undefined && max !== undefined && min > max) {
        throw new ModuleDefinitionError(
          `${field}.min`,
          "must not be greater than max",
          moduleId,
        );
      }
      if (min !== undefined && contribution.default < min) {
        throw new ModuleDefinitionError(
          `${field}.default`,
          `must be at least ${min}`,
          moduleId,
        );
      }
      if (max !== undefined && contribution.default > max) {
        throw new ModuleDefinitionError(
          `${field}.default`,
          `must be at most ${max}`,
          moduleId,
        );
      }
      return {
        ...base,
        type: "number",
        default: contribution.default,
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
      };
    }
    case "enum": {
      const options = validateEnumOptions(
        contribution.options,
        `${field}.options`,
        moduleId,
      );
      if (typeof contribution.default !== "string") {
        throw new ModuleDefinitionError(
          `${field}.default`,
          "must be a string naming one of the enum options",
          moduleId,
        );
      }
      if (!options.some((option) => option.value === contribution.default)) {
        throw new ModuleDefinitionError(
          `${field}.default`,
          `must be one of the declared option values`,
          moduleId,
        );
      }
      return {
        ...base,
        type: "enum",
        options,
        default: contribution.default,
      };
    }
    default: {
      throw new ModuleDefinitionError(
        `${field}.type`,
        'must be "boolean", "string", "number" or "enum"',
        moduleId,
      );
    }
  }
}
