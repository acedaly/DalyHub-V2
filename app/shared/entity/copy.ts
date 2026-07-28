/**
 * PX-06 — the shared copy convention, made executable.
 *
 * DalyHub's collections used to drift: "New Area" beside "New project", "No tasks
 * here" beside "No projects yet", "New entry" beside "Quick capture". The fix is
 * not a one-off sweep of string literals — it is deriving the recurring labels
 * from the ONE `ENTITY_IDENTITY` map, so a module cannot drift and a new entity
 * inherits the product's voice for free (DESIGN_SYSTEM.md → Copy convention).
 *
 * **The convention.** Sentence case everywhere, with the product's entity nouns
 * capitalised — they are proper concepts in the model, not generic words
 * (AGENTS.md §7, "speak in the user's nouns"). So: "New Project", "No Projects
 * yet", "Archive Area", "Rename". Never Title Case A Whole Label, and never a
 * bespoke verb ("Quick capture", "New entry") where the shared one fits.
 * Apostrophes are the typographic ' throughout.
 *
 * Pure and React-free.
 */

import { getEntityIdentity, type EntityType } from "./identity";

function label(type: EntityType): string {
  return getEntityIdentity(type)?.label ?? "record";
}

function pluralLabel(type: EntityType): string {
  return getEntityIdentity(type)?.pluralLabel ?? "records";
}

/**
 * The create action's label — "New Project", "New Area". ONE verb across the
 * product; a module never invents "Add…", "Quick capture" or "New entry".
 */
export function newRecordLabel(type: EntityType): string {
  return `New ${label(type)}`;
}

/** The genuinely-empty collection heading — "No Projects yet". */
export function emptyCollectionTitle(type: EntityType): string {
  return `No ${pluralLabel(type)} yet`;
}

/**
 * The filtered-empty heading — "No matching Projects". Distinct from the
 * genuinely-empty case, which teaches the next action instead of offering a
 * recovery (DESIGN_SYSTEM.md → Empty States).
 */
export function filteredEmptyTitle(type: EntityType): string {
  return `No matching ${pluralLabel(type)}`;
}

/**
 * A collection's count subtitle — "1 Project", "4 Projects". Uses the identity
 * map's own plural, so an irregular noun (Person → People) is always correct.
 */
export function countLabel(type: EntityType, count: number): string {
  return `${count} ${count === 1 ? label(type) : pluralLabel(type)}`;
}
