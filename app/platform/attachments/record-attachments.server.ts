/**
 * V2.11 FILE-01 — the ONE line a record's loader adds to carry its evidence.
 *
 * ```ts
 * attachments: await loadRecordAttachments(scope, obligation.id),
 * ```
 *
 * That is the whole integration cost, and keeping it to one line is what makes
 * "every record type that wants evidence has it" a decision rather than a
 * project. It is a helper rather than a repository method because the
 * SERIALISATION — dropping the storage key, the checksum and the workspace id,
 * and formatting the size and the date once — belongs on the way out to a
 * surface, not in the store.
 *
 * ## Bounded, and never a second read per row
 *
 * One statement per record, on the `(workspace_id, owner_entity_id, created_at,
 * id)` index. A record with no evidence costs one indexed lookup that returns
 * nothing, which is the cost this being on every record page has to justify —
 * and does.
 *
 * ## It fails CALM
 *
 * A storage failure yields an EMPTY list, not a 500. The evidence section is
 * reference material on a record whose primary content loaded fine; a page that
 * refused to render because a file list could not be read would be a worse
 * answer than a section that says there is nothing here. The same rule `/tags`
 * already follows, for the same reason. A failed read is logged server-side.
 */

import {
  attachmentViews,
  type AttachmentRepository,
  type SerializedAttachment,
} from "~/kernel/attachments";

/** The narrow slice of the workspace scope this needs. */
export interface RecordAttachmentScope {
  readonly attachments: AttachmentRepository;
}

/** The evidence on one record, ready to hand to `AttachmentsSection`. */
export async function loadRecordAttachments(
  scope: RecordAttachmentScope,
  ownerEntityId: string,
): Promise<readonly SerializedAttachment[]> {
  try {
    return attachmentViews(await scope.attachments.listForOwner(ownerEntityId));
  } catch (error) {
    console.error(
      "[attachments] record read failed:",
      error instanceof Error ? `${error.name}: ${error.message}` : "unknown",
    );
    return [];
  }
}

/**
 * The evidence on MANY records, for a surface that draws several at once.
 *
 * ONE statement for the whole page, bounded per record. Exported for the
 * surfaces that will need it — a Meeting's items, a Project's tasks — rather
 * than left for each of them to discover that `listForOwner` in a loop is an
 * N+1.
 */
export async function loadRecordAttachmentsFor(
  scope: RecordAttachmentScope,
  ownerEntityIds: readonly string[],
  options: { readonly limitPerOwner?: number } = {},
): Promise<Readonly<Record<string, readonly SerializedAttachment[]>>> {
  try {
    const grouped = await scope.attachments.listForOwners(
      ownerEntityIds,
      options,
    );
    return Object.fromEntries(
      [...grouped.entries()].map(([ownerId, rows]) => [
        ownerId,
        attachmentViews(rows),
      ]),
    );
  } catch (error) {
    console.error(
      "[attachments] page read failed:",
      error instanceof Error ? `${error.name}: ${error.message}` : "unknown",
    );
    return {};
  }
}
