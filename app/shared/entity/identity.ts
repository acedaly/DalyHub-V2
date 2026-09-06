/**
 * PX-02 — the Entity Identity system.
 *
 * DESIGN_SYSTEM.md → Foundations requires that "each entity type has a consistent
 * icon and accent so it's recognisable at a glance anywhere it appears", and
 * PRODUCT_EXPERIENCE #3 makes it a pre-TODAY-01 requirement. This module is that
 * single source of truth: ONE icon and ONE accent per entity type, consumed by the
 * sidebar, Cards, Record Headers, Pane Headers, empty states, and (later) Search
 * results and the Command Palette.
 *
 * It maps a plain entity-type slug — the same lowercase strings the kernel uses for
 * `entities.type` (`area`, `goal`, …) — to presentation only. It imports no kernel
 * branded types, D1, workspaces or module code, so it stays a pure Design-System
 * concern that any layer can consume. The accent is referenced as a CSS custom
 * property (`--app-entity-<type>-accent`, defined in tokens.css with light + dark
 * values); accents are used at IDENTITY sites only (icon, card edge, chip) — never
 * as text colour (PRODUCT_EXPERIENCE Part III §5).
 */

import type { ComponentType } from "react";

import type { IconProps } from "~/shared/icons";
import {
  AreaIcon,
  AssetIcon,
  DiaryIcon,
  GoalIcon,
  HabitIcon,
  MeetingIcon,
  NoteIcon,
  ObligationIcon,
  PersonIcon,
  ProjectIcon,
  ReviewIcon,
  TaskIcon,
} from "~/shared/icons";

/** The entity types with a defined visual identity (kernel `entities.type` slugs). */
export const ENTITY_TYPES = [
  "area",
  "goal",
  "habit",
  "project",
  "task",
  "note",
  "meeting",
  "person",
  "asset",
  "obligation",
  "diary",
  "review",
] as const;

/** A visually-identified entity type. */
export type EntityType = (typeof ENTITY_TYPES)[number];

/** The identity of one entity type: its label, icon and accent token. */
export interface EntityIdentity {
  /** The entity type slug. */
  readonly type: EntityType;
  /** Singular display label (the user's noun, e.g. "Project"). */
  readonly label: string;
  /** Plural display label (e.g. "Projects"). */
  readonly pluralLabel: string;
  /** The entity's outline icon component (from the shared icon set). */
  readonly Icon: ComponentType<IconProps>;
  /** The CSS custom property carrying this type's accent, in both appearances. */
  readonly accentVar: string;
}

/** Build the public DalyHub entity-colour property name for a type.
 *
 * Generated scheme machinery remains private beneath this alias. Product code
 * names the stable meaning it needs and is therefore independent of the colour
 * generator that supplies the value. */
export function entityAccentVar(type: EntityType): string {
  return `--dh-color-entity-${type}`;
}

/** A CSS `var()` reference to the entity accent, for inline style consumption. */
export function entityAccent(type: EntityType): string {
  return `var(${entityAccentVar(type)})`;
}

function identity(
  type: EntityType,
  label: string,
  pluralLabel: string,
  Icon: ComponentType<IconProps>,
): EntityIdentity {
  return { type, label, pluralLabel, Icon, accentVar: entityAccentVar(type) };
}

/** The one entity-identity map. One icon + one accent per entity type, forever. */
export const ENTITY_IDENTITY: Readonly<Record<EntityType, EntityIdentity>> =
  Object.freeze({
    area: identity("area", "Area", "Areas", AreaIcon),
    goal: identity("goal", "Goal", "Goals", GoalIcon),
    /*
     * HABITS-01 — a Habit is a first-class record with its own identity, and
     * that is the point. It sits ADJACENT to the spine (Area → Goal → Project →
     * Task) rather than inside it: it may support a Goal and belong in an Area,
     * but it is never a Project or a Task underneath one, and it never carries a
     * Task's accent.
     */
    habit: identity("habit", "Habit", "Habits", HabitIcon),
    project: identity("project", "Project", "Projects", ProjectIcon),
    task: identity("task", "Task", "Tasks", TaskIcon),
    note: identity("note", "Note", "Notes", NoteIcon),
    meeting: identity("meeting", "Meeting", "Meetings", MeetingIcon),
    person: identity("person", "Person", "People", PersonIcon),
    asset: identity("asset", "Asset", "Assets", AssetIcon),
    /*
     * V2.10 LIFE-02 — an obligation is a record in its own right, so it needs an
     * identity of its own. It sits beside the Asset in the rail and must not be
     * mistaken for one: the Asset is a THING you own, an obligation is
     * something you have COMMITTED to, and most obligations are about no asset
     * at all. Bronze, because it is the one accent family nothing else holds —
     * and pointedly not a warm red, which would read as "this is late" and
     * break the rule that identity is never status.
     */
    obligation: identity(
      "obligation",
      "Obligation",
      "Obligations",
      ObligationIcon,
    ),
    diary: identity("diary", "Diary", "Diary", DiaryIcon),
    review: identity("review", "Review", "Reviews", ReviewIcon),
  });

/** True when `value` is a known, visually-identified entity type. */
export function isEntityType(value: unknown): value is EntityType {
  return (
    typeof value === "string" &&
    (ENTITY_TYPES as readonly string[]).includes(value)
  );
}

/** Look up an entity type's identity, or `null` for an unknown type. */
export function getEntityIdentity(type: string): EntityIdentity | null {
  return isEntityType(type) ? ENTITY_IDENTITY[type] : null;
}
