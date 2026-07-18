/**
 * FND-06 Module Registry kernel — boundary validation.
 *
 * Pure, storage-independent validation of every module manifest and its
 * capability descriptors. The registry validates BEFORE it exposes anything, so
 * an incompletely or ambiguously composed application never serves requests
 * (ADR-013 §16). Validators return a NORMALISED, freshly-constructed descriptor
 * (a defensive copy built from primitive reads of the source) or throw a typed
 * `ModuleRegistryError`. Building new objects here means a later mutation of the
 * source manifest cannot reach into the registry (ADR-013 §4.4).
 *
 * Identifier validation is REUSED, not duplicated: entity types go through the
 * FND-02 `validateEntityType`, link types through the FND-04 `parseEntityLinkType`,
 * and Activity types through the FND-05 `parseActivityType`. This module adds only
 * the module-specific rules: the module-id slug, module-namespaced capability ids,
 * safe route paths, setting-default type-matching, and kernel-reserved Activity
 * types.
 */

import { validateEntityType } from "~/kernel/entities";
import { parseEntityLinkType } from "~/kernel/entity-links";
import { parseActivityType } from "~/kernel/activity";

import {
  ModuleDefinitionError,
  ReservedActivityTypeError,
} from "./module-errors";
import type {
  ActivityTypeContribution,
  CommandContribution,
  CommandShortcut,
  EntityLinkTypeContribution,
  EntityTypeContribution,
  RouteContribution,
  SearchProviderContribution,
  SettingContribution,
  SettingEnumOption,
} from "./module-capabilities";
import type { ModuleId } from "./module-definition";

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
 * within the documented length. Returns the trimmed value.
 */
function validateLabel(
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
function validateOptionalDescription(
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

/** Wrap a reused kernel identifier validator's failure as a registry error. */
function runIdentifierValidator<T>(
  validate: () => T,
  field: string,
  moduleId: string,
): T {
  try {
    return validate();
  } catch (error) {
    const message = error instanceof Error ? error.message : "is invalid";
    throw new ModuleDefinitionError(field, message, moduleId);
  }
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

  if (typeof contribution.lazy !== "function") {
    throw new ModuleDefinitionError(
      `${field}.lazy`,
      "must be a function returning the route module (a lazy import)",
      moduleId,
    );
  }

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
    lazy: contribution.lazy,
    ...(meta === undefined ? {} : { meta }),
  };
}

/* -------------------------------------------------------------------------- */
/* Entity-type contribution                                                   */
/* -------------------------------------------------------------------------- */

/** Validate one entity-type contribution, returning a normalised defensive copy. */
export function validateEntityTypeContribution(
  contribution: EntityTypeContribution,
  moduleId: string,
  index: number,
): EntityTypeContribution {
  const field = `entityTypes[${index}]`;
  const type = runIdentifierValidator(
    () => validateEntityType(contribution.type),
    `${field}.type`,
    moduleId,
  );
  const singular = validateLabel(
    contribution.singular,
    `${field}.singular`,
    moduleId,
  );
  const plural =
    contribution.plural === undefined
      ? undefined
      : validateLabel(contribution.plural, `${field}.plural`, moduleId);
  return {
    type,
    singular,
    ...(plural === undefined ? {} : { plural }),
  };
}

/* -------------------------------------------------------------------------- */
/* EntityLink-type contribution                                               */
/* -------------------------------------------------------------------------- */

/** Validate one link-type contribution, returning a normalised defensive copy. */
export function validateEntityLinkTypeContribution(
  contribution: EntityLinkTypeContribution,
  moduleId: string,
  index: number,
): EntityLinkTypeContribution {
  const field = `entityLinkTypes[${index}]`;
  const type = runIdentifierValidator(
    () => parseEntityLinkType(contribution.type),
    `${field}.type`,
    moduleId,
  );
  const sourceLabel = validateLabel(
    contribution.sourceLabel,
    `${field}.sourceLabel`,
    moduleId,
  );
  const targetLabel =
    contribution.targetLabel === undefined
      ? undefined
      : validateLabel(
          contribution.targetLabel,
          `${field}.targetLabel`,
          moduleId,
        );
  const sourceEntityType =
    contribution.sourceEntityType === undefined
      ? undefined
      : runIdentifierValidator(
          () => validateEntityType(contribution.sourceEntityType),
          `${field}.sourceEntityType`,
          moduleId,
        );
  const targetEntityType =
    contribution.targetEntityType === undefined
      ? undefined
      : runIdentifierValidator(
          () => validateEntityType(contribution.targetEntityType),
          `${field}.targetEntityType`,
          moduleId,
        );
  return {
    type,
    sourceLabel,
    ...(targetLabel === undefined ? {} : { targetLabel }),
    ...(sourceEntityType === undefined ? {} : { sourceEntityType }),
    ...(targetEntityType === undefined ? {} : { targetEntityType }),
  };
}

/* -------------------------------------------------------------------------- */
/* Activity-type contribution                                                 */
/* -------------------------------------------------------------------------- */

/** Validate one Activity-type contribution, returning a normalised defensive copy. */
export function validateActivityTypeContribution(
  contribution: ActivityTypeContribution,
  moduleId: string,
  index: number,
): ActivityTypeContribution {
  const field = `activityTypes[${index}]`;
  const type = runIdentifierValidator(
    () => parseActivityType(contribution.type),
    `${field}.type`,
    moduleId,
  );
  if (RESERVED_ACTIVITY_TYPES.has(type)) {
    throw new ReservedActivityTypeError(moduleId, type);
  }
  const label = validateLabel(contribution.label, `${field}.label`, moduleId);
  const description = validateOptionalDescription(
    contribution.description,
    `${field}.description`,
    moduleId,
  );
  return {
    type,
    label,
    ...(description === undefined ? {} : { description }),
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
  return {
    key: shortcut.key,
    ...(modifiers === undefined ? {} : { modifiers }),
  };
}

/** Validate one command contribution, returning a normalised defensive copy. */
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
  if (typeof contribution.run !== "function") {
    throw new ModuleDefinitionError(
      `${field}.run`,
      "must be a function (the command handler)",
      moduleId,
    );
  }
  return {
    id,
    title,
    ...(subtitle === undefined ? {} : { subtitle }),
    ...(keywords === undefined ? {} : { keywords }),
    ...(shortcut === undefined ? {} : { shortcut }),
    run: contribution.run,
  };
}

/* -------------------------------------------------------------------------- */
/* Search-provider contribution                                               */
/* -------------------------------------------------------------------------- */

/** Validate one search-provider contribution, returning a normalised defensive copy. */
export function validateSearchProviderContribution(
  contribution: SearchProviderContribution,
  moduleId: string,
  index: number,
): SearchProviderContribution {
  const field = `searchProviders[${index}]`;
  const id = validateQualifiedId(contribution.id, moduleId, `${field}.id`);
  const label = validateLabel(contribution.label, `${field}.label`, moduleId);
  let entityTypes: readonly string[] | undefined;
  if (contribution.entityTypes !== undefined) {
    if (!Array.isArray(contribution.entityTypes)) {
      throw new ModuleDefinitionError(
        `${field}.entityTypes`,
        "must be an array",
        moduleId,
      );
    }
    entityTypes = contribution.entityTypes.map((entityType, i) =>
      runIdentifierValidator(
        () => validateEntityType(entityType),
        `${field}.entityTypes[${i}]`,
        moduleId,
      ),
    );
  }
  if (typeof contribution.search !== "function") {
    throw new ModuleDefinitionError(
      `${field}.search`,
      "must be a function (the search executor)",
      moduleId,
    );
  }
  return {
    id,
    label,
    ...(entityTypes === undefined ? {} : { entityTypes }),
    search: contribution.search,
  };
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
