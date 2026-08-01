/**
 * NOTES-02 — the shared REFERENCES model (pure, React-free, storage-free).
 *
 * "Linked Items" (REL-01) answers *what is this related to?* as one flat,
 * editable list. A knowledge record needs a different question answered:
 * **who points at me, and who do I point at** — with the direction, the kind of
 * relationship, and enough context to know why, without opening the other
 * record.
 *
 * This is that model. It is deliberately a NEW, ISOLATED shared contract rather
 * than an extension of `linked-items-model.ts`: Linked Items owns creating and
 * removing relationships, References owns *reading* them directionally. Both
 * read the same FND-04 EntityLink graph — there is no second relationship store
 * and no second timeline representation (§15).
 *
 * The wire types live here (in the shared layer) and the platform helper imports
 * them from here, matching the direction `linked-items-model.ts` already
 * established (`platform → shared/…/model`, never the reverse).
 */

/** Which way a reference points, relative to the record being viewed. */
export type ReferenceDirection =
  /** Another record points AT this one — a backlink. */
  | "incoming"
  /** This record points at another — an outgoing link. */
  | "outgoing";

/** The counterpart record of a reference. Always active and in-workspace. */
export interface ReferenceRecord {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  /**
   * True when the counterpart is archived (put away but kept). Only known for
   * types that HAVE an archive state and were resolved with it; `false`
   * otherwise — it is never a guess.
   */
  readonly archived: boolean;
}

/** One reference into or out of a record. */
export interface RecordReference {
  /** The EntityLink id — stable across unlink/restore, so a safe React key. */
  readonly linkId: string;
  readonly direction: ReferenceDirection;
  readonly record: ReferenceRecord;
  /** The raw FND-04 link type (e.g. `note.references`, `link.related`). */
  readonly linkType: string;
  /** The user-facing relationship name, resolved from the shared vocabulary. */
  readonly relationshipLabel: string;
  /**
   * A bounded, syntax-free excerpt showing WHERE the reference sits in the
   * other record, or `null` when no context is available for that source type.
   */
  readonly context: string | null;
  /** ISO-8601 — when the relationship was last created or restored. */
  readonly linkedAt: string;
}

/** One bounded page of references. */
export interface ReferencePage {
  readonly items: readonly RecordReference[];
  readonly nextCursor: string | null;
}

/**
 * The user-facing name for a relationship type. Central so no surface invents
 * its own wording, and an unknown (module-owned) type degrades to a readable
 * label rather than a raw dotted slug.
 */
const RELATIONSHIP_LABELS: Readonly<Record<string, string>> = {
  "link.related": "Related",
  "note.references": "Mentioned in note",
  "task.relates_to": "Task reference",
  "project.relates_to": "Project reference",
  "meeting.attendee": "Meeting attendee",
};

export function relationshipLabel(linkType: string): string {
  const known = RELATIONSHIP_LABELS[linkType];
  if (known) return known;
  // `some.module_owned_type` → "Module owned type" — readable, never a slug.
  const tail = linkType.includes(".")
    ? linkType.slice(linkType.indexOf(".") + 1)
    : linkType;
  const words = tail.replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A group of references sharing one entity type, for a grouped presentation. */
export interface ReferenceGroup {
  readonly type: string;
  readonly items: readonly RecordReference[];
}

/**
 * Group references by the counterpart's entity type, in FIRST-SEEN order — the
 * same rule global Search uses for its result groups, so the most relevant group
 * leads without a hard-coded entity ordering. Order within a group is preserved
 * exactly as supplied (the server's deterministic order).
 */
export function groupReferencesByType(
  references: readonly RecordReference[],
): readonly ReferenceGroup[] {
  const groups = new Map<string, RecordReference[]>();
  for (const reference of references) {
    const bucket = groups.get(reference.record.type);
    if (bucket) bucket.push(reference);
    else groups.set(reference.record.type, [reference]);
  }
  return [...groups.entries()].map(([type, items]) => ({ type, items }));
}

/** The references whose counterpart is of a given type (e.g. linked Projects). */
export function referencesOfType(
  references: readonly RecordReference[],
  type: string,
): readonly RecordReference[] {
  return references.filter((reference) => reference.record.type === type);
}

/* -------------------------------------------------------------------------- */
/* Module families (NOTES-05 §6)                                              */
/* -------------------------------------------------------------------------- */

/**
 * Backlinks grouped by MODULE FAMILY rather than by raw entity type.
 *
 * A record with fifty backlinks spread over eight entity types produces eight
 * one-or-two-row groups — which is a table of contents, not an aid. Families are
 * the grouping §6 asks for because they match how the owner actually thinks
 * about where knowledge came from: planning work (Projects and Areas and Goals),
 * people and the conversations with them, the things they have to do, and the
 * dated record of what happened.
 *
 * `note` deliberately stands alone: a backlink from another note is the
 * knowledge-graph edge the Backlinks surface exists for, and burying it among
 * project links would hide the thing the user came to see.
 *
 * The order below IS the display order — fixed, not first-seen, because a stable
 * shape is what lets someone learn where to look. Empty families are never
 * rendered (§6).
 */
export const REFERENCE_FAMILIES = [
  { id: "notes", label: "Notes", types: ["note"] },
  {
    id: "planning",
    label: "Projects, Areas and Goals",
    types: ["project", "area", "goal"],
  },
  { id: "people", label: "People and Meetings", types: ["person", "meeting"] },
  { id: "work", label: "Tasks and Reviews", types: ["task", "review"] },
  { id: "diary", label: "Diary", types: ["diary"] },
  { id: "assets", label: "Assets", types: ["asset"] },
] as const satisfies readonly {
  readonly id: string;
  readonly label: string;
  readonly types: readonly string[];
}[];

/** A module family a backlink can belong to. */
export type ReferenceFamilyId = (typeof REFERENCE_FAMILIES)[number]["id"];

/** Where anything not covered above lands, so no reference is ever dropped. */
export const OTHER_REFERENCE_FAMILY = {
  id: "other",
  label: "Other records",
} as const;

const TYPE_TO_FAMILY: ReadonlyMap<string, string> = new Map(
  REFERENCE_FAMILIES.flatMap((family) =>
    family.types.map((type) => [type, family.id] as const),
  ),
);

/** The family id for an entity type; `other` for anything unrecognised. */
export function referenceFamilyOf(type: string): string {
  return TYPE_TO_FAMILY.get(type) ?? OTHER_REFERENCE_FAMILY.id;
}

/** One family's references, for a grouped presentation. */
export interface ReferenceFamilyGroup {
  readonly id: string;
  readonly label: string;
  readonly items: readonly RecordReference[];
}

/**
 * Group references into module families, in the fixed {@link REFERENCE_FAMILIES}
 * order with "Other records" last. Families with no references are omitted
 * entirely, and order WITHIN a family is preserved exactly as supplied (the
 * server's deterministic order), so the presentation adds no ordering of its own.
 */
export function groupReferencesByFamily(
  references: readonly RecordReference[],
): readonly ReferenceFamilyGroup[] {
  const buckets = new Map<string, RecordReference[]>();
  for (const reference of references) {
    const id = referenceFamilyOf(reference.record.type);
    const bucket = buckets.get(id);
    if (bucket) bucket.push(reference);
    else buckets.set(id, [reference]);
  }
  const out: ReferenceFamilyGroup[] = [];
  for (const family of REFERENCE_FAMILIES) {
    const items = buckets.get(family.id);
    if (items && items.length > 0) {
      out.push({ id: family.id, label: family.label, items });
    }
  }
  const other = buckets.get(OTHER_REFERENCE_FAMILY.id);
  if (other && other.length > 0) {
    out.push({ ...OTHER_REFERENCE_FAMILY, items: other });
  }
  return out;
}

/**
 * The families actually present in a set of references, in display order — the
 * options a module filter should offer. Offering a family with nothing behind it
 * would be a filter that can only ever empty the list (§6: no empty groups).
 */
export function availableReferenceFamilies(
  references: readonly RecordReference[],
): readonly {
  readonly id: string;
  readonly label: string;
  readonly count: number;
}[] {
  return groupReferencesByFamily(references).map((group) => ({
    id: group.id,
    label: group.label,
    count: group.items.length,
  }));
}
