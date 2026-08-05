/**
 * AUDIT-FIX-03 — the shared presentation rule for a PERMANENT-DELETION tombstone.
 *
 * A purge tombstone is the one event class that can never have a subject: the
 * `entities` row it describes was removed by the very batch that appended it, so
 * an `activity_subjects` pointer would dangle (ADR-012 keeps `activities` rows
 * append-only, but a subject must always reference a live entity). Every other
 * descriptor resolves its record through `context.primarySubject` and renders a
 * Drawer link; a tombstone has nothing to resolve and would otherwise degrade to
 * an anonymous "permanently deleted this review".
 *
 * So the tombstone renders its record's name from the IMMUTABLE PAYLOAD the purge
 * captured before deleting — the only surviving statement of what was destroyed.
 * The title is emphasised text, never an entity link: linking would invite a click
 * that can only 404. A payload missing or carrying a non-string title falls back
 * to a calm generic phrase, so `describe` stays pure and total as its contract
 * requires (it must never throw on an unfamiliar payload).
 *
 * Shared rather than duplicated because this formatter genuinely owns both the
 * Asset and the Review deletion event; it deliberately does NOT touch any other
 * event path.
 */

import type {
  ActivityBaseItem,
  ActivityTone,
  ActivityTypeDescriptor,
} from "./types";

/** Read a non-empty string field from a payload, or `null`. Never throws. */
function payloadString(item: ActivityBaseItem, key: string): string | null {
  const value = item.payload[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface PurgeTombstoneOptions {
  /** The human, non-technical label for the event type. */
  readonly label: string;
  /** The past-tense verb phrase, e.g. `"permanently deleted"`. */
  readonly verb: string;
  /** The payload key holding the destroyed record's title. */
  readonly titleKey: string;
  /** What to say when the payload carries no usable title. */
  readonly fallbackText: string;
  /** The identity icon/accent for the event marker. */
  readonly entityType: string;
  readonly tone?: ActivityTone;
}

/**
 * Build the descriptor for a subject-less purge tombstone: "<actor> permanently
 * deleted <title>", with the title read from the event's own payload.
 */
export function purgeTombstoneDescriptor({
  label,
  verb,
  titleKey,
  fallbackText,
  entityType,
  tone = "danger",
}: PurgeTombstoneOptions): ActivityTypeDescriptor {
  return {
    label,
    tone,
    entityType,
    describe: (base) => {
      const title = payloadString(base, titleKey);
      return {
        segments: [
          { kind: "actor" },
          { kind: "text", text: ` ${verb} ` },
          title
            ? { kind: "emphasis", text: title }
            : { kind: "emphasis", text: fallbackText },
        ],
        entityType,
        tone,
      };
    },
  };
}
