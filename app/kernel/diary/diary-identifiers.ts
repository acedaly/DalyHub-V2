/**
 * DIARY-01A Diary kernel — the shared, stable Diary identifiers.
 *
 * The Diary is DalyHub's chronological history of a life: the Interstitial
 * Journal (AGENTS.md §4 lists Diary as a first-class supporting entity type).
 * A Diary Entry is an ordinary DalyHub `entities` record of the dedicated
 * `diary` type, whose chronology-bearing detail slice (entry type, optional
 * Markdown body, occurred-at instant, capture timezone and source) is owned
 * atomically by the authoritative {@link DiaryRepository}. This module defines
 * the identifiers reused everywhere — domain validation, the D1 adapter, the
 * generic-repository reservation check, the module manifest, the tests and the
 * documentation — so the Diary never drifts apart on those constants.
 *
 * Intentionally dependency-light: plain string constants and precise unions,
 * importing no D1, Cloudflare, React or storage types. Nothing here is a
 * database enum — the identifiers stay ordinary validated strings, so the open
 * Entity / EntityLink / Activity contracts (ADR-009/011/012) are unchanged. The
 * Diary simply RESERVES the single `diary` entity type for its own repository,
 * exactly as the spine reserves its four types (ADR-014 §4.7).
 */

/**
 * The Diary Entry entity type. A dedicated, RESERVED `entities.type` value: the
 * generic `EntityRepository` refuses to CREATE one (a bare `diary` row would
 * bypass the chronological detail slice every entry must carry), while its
 * ordinary header lifecycle — rename, soft-delete, restore — stays the generic
 * repository's, exactly like a Note. Only creation is reserved, because only
 * creation establishes the entry-type + occurred-at invariants.
 */
export const DIARY_ENTITY_TYPE = "diary";

/**
 * The entity types RESERVED so the generic Entity repository refuses to CREATE
 * them directly. Kept as a set for symmetry with the spine's reservation and to
 * leave room for future Diary-family types without touching call sites.
 */
export const RESERVED_DIARY_ENTITY_TYPES: ReadonlySet<string> = new Set([
  DIARY_ENTITY_TYPE,
]);

/** True when `type` is a Diary-family type reserved for the DiaryRepository. */
export function isReservedDiaryEntityType(type: string): boolean {
  return RESERVED_DIARY_ENTITY_TYPES.has(type);
}

/* -------------------------------------------------------------------------- */
/* Activity event types                                                       */
/* -------------------------------------------------------------------------- */

/**
 * Activity event appended when a Diary Entry is captured. This is the AUDIT
 * record of the capture action — distinct from the Entry itself, which is the
 * lived moment (see ADR-041 on the Activity-vs-Diary boundary). Its payload
 * carries only structural metadata (entry type, occurred-at), NEVER the entry's
 * body content, which is private (AGENTS.md §17).
 */
export const DIARY_ENTRY_CREATED = "diary_entry.created";

/**
 * Activity event appended when a Diary Entry's detail slice genuinely changes
 * (entry type, body, occurred-at, timezone or source). Payload carries only
 * structural metadata, never body content.
 */
export const DIARY_ENTRY_UPDATED = "diary_entry.updated";

/** The Diary Activity event types this module owns, in a stable order. */
export const DIARY_ACTIVITY_TYPES = [
  DIARY_ENTRY_CREATED,
  DIARY_ENTRY_UPDATED,
] as const;
