/**
 * V2.10 LIFE-01 — reading an archive written before obligations were entities.
 *
 * Migration 0050 moved every `asset_obligations` row into an `entities` row
 * plus an `obligation_details` row plus an `obligation.subject` link, and
 * dropped the old table. An export written from now on therefore carries an
 * `obligations` collection and no `assetObligations` one.
 *
 * Every archive an owner ALREADY HAS carries the reverse, and restoring those
 * is not a compatibility nicety: "own the data … export always possible"
 * (AGENTS.md §7) is a promise with an expiry date if changing the shape of a
 * store silently invalidates the backups taken before the change. So a legacy
 * archive is UPGRADED as it is read, by exactly the rule the migration used —
 * the ids are kept, the subject is the Asset, the link id is derived from the
 * obligation's own id, and a blank title becomes the same stated placeholder.
 *
 * It runs BEFORE validation and before anything is staged, so everything
 * downstream — the referential checks, the persistability gate, the staging,
 * the count verification — sees one shape and one only. Pure: it rewrites a
 * parsed object and touches no storage.
 */

import {
  OBLIGATION_ENTITY_TYPE,
  OBLIGATION_SUBJECT_LINK,
  obligationSubjectLinkId,
} from "~/kernel/obligations";

/** The placeholder migration 0050 uses for a title that is only whitespace. */
export const UNTITLED_OBLIGATION = "Untitled obligation";

/** The shape this reader needs, without depending on the whole snapshot type. */
type LegacyRecords = {
  assetObligations?: readonly Record<string, unknown>[];
  obligations?: readonly Record<string, unknown>[];
  entities?: readonly Record<string, unknown>[];
  entityLinks?: readonly Record<string, unknown>[];
};

/** What an upgrade did, so a restore can report it rather than perform it silently. */
export type LegacyObligationUpgrade = {
  readonly upgraded: number;
};

/**
 * Upgrade a legacy archive in place. A no-op when there is nothing to upgrade —
 * including when an archive somehow carries BOTH shapes, where the current one
 * wins and the legacy rows are dropped rather than duplicated, because two rows
 * for one obligation is the one outcome worse than none.
 */
export function upgradeLegacyObligations(
  records: LegacyRecords,
): LegacyObligationUpgrade {
  const legacy = records.assetObligations ?? [];
  if (legacy.length === 0) return { upgraded: 0 };

  if ((records.obligations ?? []).length > 0) {
    // An archive carrying both shapes is not something this product writes.
    // Trust the current one and discard the legacy rows: restoring both would
    // fail on the primary key anyway, and a duplicate is the worse failure.
    records.assetObligations = [];
    return { upgraded: 0 };
  }

  const entities = [...(records.entities ?? [])];
  const links = [...(records.entityLinks ?? [])];
  const obligations: Record<string, unknown>[] = [];

  for (const row of legacy) {
    const id = String(row.id);
    const rawTitle = typeof row.title === "string" ? row.title : "";
    const title = rawTitle.trim() === "" ? UNTITLED_OBLIGATION : rawTitle;
    const assetId = typeof row.assetId === "string" ? row.assetId : null;
    const createdAt = String(row.createdAt);
    const updatedAt = String(row.updatedAt);
    const deletedAt = typeof row.deletedAt === "string" ? row.deletedAt : null;

    entities.push({
      id,
      type: OBLIGATION_ENTITY_TYPE,
      title,
      createdAt,
      updatedAt,
      deletedAt,
    });

    obligations.push({
      entityId: id,
      subjectEntityId: assetId,
      subjectEntityType: assetId === null ? null : "asset",
      category: row.category,
      description: row.description ?? null,
      dueDate: row.dueDate ?? null,
      leadDays: row.leadDays,
      recurrenceKind: row.recurrenceKind,
      recurrenceInterval: row.recurrenceInterval ?? null,
      meterThreshold: row.meterThreshold ?? null,
      meterInterval: row.meterInterval ?? null,
      meterUnit: row.meterUnit ?? null,
      // Money did not exist in the legacy shape. Inventing an amount here would
      // be writing a figure the owner never entered.
      expectedAmountMinor: null,
      completedAmountMinor: null,
      currencyCode: null,
      status: row.status,
      taskId: row.taskId ?? null,
      completedEventId: row.completedEventId ?? null,
      completedAt: row.completedAt ?? null,
      // The legacy shape stored the completion INSTANT only. The day the work
      // was done lives on the Asset's proof event; deriving a calendar day from
      // a UTC timestamp would be fabricating a fact in the owner's timezone.
      completedOn: null,
      nextObligationId: row.nextObligationId ?? null,
      seriesId: row.seriesId,
      sequence: row.sequence,
      createdAt,
      updatedAt,
      archivedAt: row.archivedAt ?? null,
      deletedAt,
    });

    if (assetId !== null) {
      links.push({
        id: obligationSubjectLinkId(id),
        sourceEntityId: id,
        targetEntityId: assetId,
        type: OBLIGATION_SUBJECT_LINK,
        createdAt,
        updatedAt,
        deletedAt,
      });
    }
  }

  records.entities = entities;
  records.entityLinks = links;
  records.obligations = obligations;
  records.assetObligations = [];
  return { upgraded: legacy.length };
}
