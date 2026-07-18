/**
 * FND-06 Module Registry kernel — entity/link/activity/search contribution
 * validation.
 *
 * These are the contribution validators that REUSE the FND-02/04/05 kernel
 * identifier validators (`validateEntityType`, `parseEntityLinkType`,
 * `parseActivityType`). They are deliberately split out from the route/module-id
 * validation core (`module-validation.ts`) so that core stays free of any
 * storage-kernel (`~/kernel/entities` …) value import: the build-time
 * `app/routes.ts` composition imports only the route core, which the React Router
 * bare config loader can bundle without resolving the `~` alias. This file is
 * used only at runtime (module registry assembly), where `~` resolves normally.
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
  EntityLinkTypeContribution,
  EntityTypeContribution,
  SearchProviderContribution,
} from "./module-capabilities";
import {
  RESERVED_ACTIVITY_TYPES,
  validateLabel,
  validateOptionalDescription,
  validateQualifiedId,
} from "./module-validation";

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
