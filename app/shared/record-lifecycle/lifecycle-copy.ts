/**
 * PX-04 — the ONE lifecycle vocabulary.
 *
 * Every module used to write its own wording for the same four acts (archive,
 * restore, delete reversibly, delete permanently), so "Archive area…",
 * "Archive this project" and "Delete note" all meant the same thing in different
 * words. This module derives all of it from ONE input — the entity type — through
 * the PX-02 `ENTITY_IDENTITY` map, so a new entity inherits the product's voice
 * for free and no call site invents a label (DESIGN_SYSTEM.md → Record lifecycle).
 *
 * It is pure and React-free: labels and sentences only. What an action *does*
 * (and its server rule) stays in the adopting module.
 */

import { getEntityIdentity, type EntityType } from "~/shared/entity";

/** The four canonical lifecycle acts, in the order they always appear. */
export type LifecycleAction =
  "archive" | "restore" | "delete" | "delete-permanently";

/** The user-facing singular noun for an entity type (e.g. "Project"). */
export function entityLabel(type: EntityType): string {
  return getEntityIdentity(type)?.label ?? "record";
}

/** The user-facing plural noun for an entity type (e.g. "Projects"). */
export function entityPluralLabel(type: EntityType): string {
  return getEntityIdentity(type)?.pluralLabel ?? "records";
}

/** The menu-item label for a lifecycle action — identical on every entity. */
export function lifecycleActionLabel(
  action: LifecycleAction,
  type: EntityType,
): string {
  const noun = entityLabel(type);
  switch (action) {
    case "archive":
      return `Archive ${noun}`;
    case "restore":
      return `Restore ${noun}`;
    case "delete":
      return `Delete ${noun}`;
    case "delete-permanently":
      return `Delete ${noun} permanently`;
  }
}

/** The confirmation dialog's title for a lifecycle action. */
export function lifecycleConfirmTitle(
  action: LifecycleAction,
  type: EntityType,
): string {
  const noun = entityLabel(type);
  switch (action) {
    case "archive":
      return `Archive this ${noun}?`;
    case "restore":
      return `Restore this ${noun}?`;
    case "delete":
      return `Delete this ${noun}?`;
    case "delete-permanently":
      return `Delete this ${noun} permanently?`;
  }
}

/** The confirm button's label — the verb, never a bare "OK". */
export function lifecycleConfirmLabel(
  action: LifecycleAction,
  type: EntityType,
): string {
  return lifecycleActionLabel(action, type);
}

/** The confirm button's in-flight label. */
export function lifecycleBusyLabel(action: LifecycleAction): string {
  switch (action) {
    case "archive":
      return "Archiving…";
    case "restore":
      return "Restoring…";
    case "delete":
    case "delete-permanently":
      return "Deleting…";
  }
}

/** The calm success message raised through the DS-10 Feedback platform. */
export function lifecycleSuccessMessage(
  action: LifecycleAction,
  type: EntityType,
): string {
  const noun = entityLabel(type);
  switch (action) {
    case "archive":
      return `${noun} archived`;
    case "restore":
      return `${noun} restored`;
    case "delete":
    case "delete-permanently":
      return `${noun} deleted`;
  }
}

/**
 * The one-sentence consequence shown in the confirmation body. Archiving and
 * restoring are reversible and say so; permanent deletion says plainly that it
 * cannot be undone (AGENTS.md §7 — friction scales with reversibility).
 */
export function lifecycleConsequence(
  action: LifecycleAction,
  type: EntityType,
): string {
  const noun = entityLabel(type).toLowerCase();
  const plural = entityPluralLabel(type).toLowerCase();
  switch (action) {
    case "archive":
      return `Archiving moves this ${noun} out of your active ${plural}. Everything inside it is kept, and you can restore it at any time.`;
    case "restore":
      return `This brings the ${noun} back into your active ${plural}. Nothing inside it changed.`;
    case "delete":
      return `This removes the ${noun} from your active ${plural}. You can undo it straight away, or restore it later.`;
    case "delete-permanently":
      return `This permanently deletes the ${noun}. It cannot be undone.`;
  }
}

/**
 * The calm refusal shown when a permanent delete is BLOCKED by active links
 * (AUDIT-FIX-03). Permanent deletion never silently severs a live relationship —
 * it stops and tells the owner what to do first, in the product's own nouns.
 *
 * It states the count when one is known, because "still linked to 3 records" tells
 * the owner how much work unlinking is; an unknown count degrades to the plain
 * sentence rather than a guess. It never mentions a table, a foreign key or any
 * other storage detail (§17) — the reader is told the situation and the remedy.
 */
export function lifecycleBlockedByLinks(
  type: EntityType,
  linkCount?: number,
): string {
  const noun = entityLabel(type).toLowerCase();
  if (linkCount === undefined || linkCount <= 0) {
    return `Unlink this ${noun}’s related records before deleting it permanently.`;
  }
  const records = linkCount === 1 ? "1 record" : `${linkCount} records`;
  const them = linkCount === 1 ? "it" : "them";
  return `This ${noun} is still linked to ${records}. Unlink ${them} before deleting it permanently.`;
}
