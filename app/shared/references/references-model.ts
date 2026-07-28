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
