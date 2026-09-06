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
  FinanceAccountIcon,
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
  "finance_account",
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
    /*
     * V2.12 FIN-00 — Finance's ONE identity, for the account.
     *
     * Orange, and the colour was MEASURED rather than chosen: of sixteen hues
     * probed against every existing accent in both appearances at the design
     * system's ΔE 10 floor, three passed — this orange, a dark green and a rust
     * — and orange is the only one of the three a money surface may use, because
     * a green identity beside a balance reads as "you are fine" and a rust one
     * reads as "you are not". Identity is never status (DESIGN_SYSTEM.md), and
     * orange means nothing in this scheme.
     *
     * A TRANSACTION has none of its own, and that is a decision rather than an
     * omission — see `identityTypeFor` below.
     */
    finance_account: identity(
      "finance_account",
      "Account",
      "Accounts",
      FinanceAccountIcon,
    ),
    diary: identity("diary", "Diary", "Diary", DiaryIcon),
    review: identity("review", "Review", "Reviews", ReviewIcon),
  });

/**
 * Types that BORROW another type's visual identity, having none of their own.
 *
 * ## Why this exists, and why it is one entry rather than a policy
 *
 * `finance_transaction` is a LIGHT entity (ADR-120 decision 2): no record page,
 * no Activity, no record chrome. Giving it an accent would be the fourteenth in
 * a set the design system's own floor says is full — probed empirically while
 * adding it, every second Finance hue tried landed inside ΔE 10 of an existing
 * accent in the dark scheme, and the one pair that passed put a third purple
 * beside the Goal and the Diary.
 *
 * So rather than force a hue nobody can tell from another, a transaction wears
 * the identity of the thing it is always read inside: its ACCOUNT. That is
 * truthful — a transaction with no account is not a thing the model has — and it
 * is what "light" already meant.
 *
 * Adding an entry here is a real decision and should be rare. It is not a
 * fallback for a type somebody forgot to give an identity: an unknown type still
 * resolves to `null`, and a surface still degrades to plain text.
 */
const BORROWED_IDENTITY: Readonly<Record<string, EntityType>> = {
  finance_transaction: "finance_account",
};

/**
 * The identity a type should be DRAWN with — its own, or the one it borrows.
 *
 * Every surface that shows an entity glyph asks this rather than
 * `isEntityType`, so a light entity is drawn rather than silently skipped.
 * Returns `null` for a type with no identity and nothing to borrow, which is
 * still the honest answer.
 */
export function identityTypeFor(type: string): EntityType | null {
  if (isEntityType(type)) return type;
  return BORROWED_IDENTITY[type] ?? null;
}

/** True when `value` is a known, visually-identified entity type. */
export function isEntityType(value: unknown): value is EntityType {
  return (
    typeof value === "string" &&
    (ENTITY_TYPES as readonly string[]).includes(value)
  );
}

/**
 * Look up an entity type's identity, following a BORROW where there is one, or
 * `null` for a type with no identity and nothing to borrow.
 *
 * The borrow is followed here rather than at each call site so a surface cannot
 * accidentally get one answer for the glyph and another for the label.
 */
export function getEntityIdentity(type: string): EntityIdentity | null {
  const resolved = identityTypeFor(type);
  return resolved === null ? null : ENTITY_IDENTITY[resolved];
}
