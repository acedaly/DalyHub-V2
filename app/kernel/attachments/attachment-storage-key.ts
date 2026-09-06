/**
 * V2.11 FILE-00 — the object key, and why traversal is impossible rather than
 * prevented.
 *
 * ```
 *   workspaces/<workspace-id>/attachments/<attachment-id>
 *   └─ prefix ┘└─ isolation ┘└─  kind  ─┘└─  identity  ─┘
 * ```
 *
 * The key carries TWO application-generated identifiers and nothing else. No
 * filename, no record title, no media type, no extension, no owner-supplied
 * string of any kind. A file called `../../secret.pdf` and a file called
 * `photo.png` produce keys that differ only in a UUID, because the name never
 * reaches this function at all.
 *
 * That is the difference between traversal being *prevented* and being
 * *impossible*: there is no sanitiser here to get wrong, because there is no
 * hostile input. Both identifiers are validated anyway — {@link isSafeKeySegment}
 * — because "this value is trusted" is exactly the assumption that stops being
 * true when someone adds a caller.
 *
 * ## What the shape buys
 *
 * - **A workspace purge is one prefix listing.** `list({ prefix:
 *   "workspaces/<id>/attachments/" })` is every byte a workspace owns, so
 *   deleting a workspace and auditing one are both a bounded loop rather than a
 *   scan and a join.
 * - **A key discloses nothing.** An object listing says which workspace and how
 *   many; it never says what. `Divorce settlement.pdf` is not a key, and a
 *   listing that leaked it would be a leak.
 * - **It is deterministic.** The same attachment has the same key in every
 *   environment, which is what lets a restore write objects to their FINAL keys
 *   before the metadata that names them becomes visible.
 *
 * The key is also STORED on the row rather than only derived, so a future change
 * to this rule cannot strand the objects written under the old one.
 */

import { AttachmentValidationError } from "./attachment-errors";

/** The prefix under which every workspace's evidence lives. */
export const ATTACHMENT_KEY_ROOT = "workspaces";

/** The segment naming what kind of object this is, inside a workspace. */
export const ATTACHMENT_KEY_KIND = "attachments";

/**
 * A key segment is a conservative identifier: ASCII letters, digits, `-`, `_`.
 *
 * Deliberately narrower than "what R2 accepts". Every id DalyHub generates is a
 * UUID and every workspace id is a configured identifier, so nothing legitimate
 * is excluded — and a `.`, a `/` or a `%` in a segment is a bug somewhere else
 * that this refuses to build a key from.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

/** True when `value` can be a key segment. Total and side-effect free. */
export function isSafeKeySegment(value: string): boolean {
  return SAFE_SEGMENT.test(value);
}

/**
 * Build the object key for one attachment. PURE.
 *
 * Throws rather than returning a doubtful key: a byte stored under an
 * unpredictable name is a byte that cannot be found again, and refusing is the
 * only safe answer.
 */
export function attachmentStorageKey(options: {
  readonly workspaceId: string;
  readonly attachmentId: string;
}): string {
  const { workspaceId, attachmentId } = options;
  if (!isSafeKeySegment(workspaceId)) {
    throw new AttachmentValidationError(
      "workspace",
      "This workspace cannot store files. Its identifier is not one DalyHub can build a storage key from.",
    );
  }
  if (!isSafeKeySegment(attachmentId)) {
    throw new AttachmentValidationError(
      "attachment",
      "That attachment identifier is not one DalyHub can build a storage key from.",
    );
  }
  return `${ATTACHMENT_KEY_ROOT}/${workspaceId}/${ATTACHMENT_KEY_KIND}/${attachmentId}`;
}

/** The prefix covering every attachment object one workspace owns. */
export function attachmentWorkspacePrefix(workspaceId: string): string {
  if (!isSafeKeySegment(workspaceId)) {
    throw new AttachmentValidationError(
      "workspace",
      "This workspace cannot store files. Its identifier is not one DalyHub can build a storage key from.",
    );
  }
  return `${ATTACHMENT_KEY_ROOT}/${workspaceId}/${ATTACHMENT_KEY_KIND}/`;
}

/**
 * True when `key` belongs to `workspaceId`.
 *
 * The predicate a delete and a sweep apply before touching an object, so a
 * ledger row that somehow named another workspace's key could not be acted on.
 * Belt and braces over a key that is already derived server-side — and the brace
 * that would hold if the belt were ever replaced.
 */
export function keyBelongsToWorkspace(
  key: string,
  workspaceId: string,
): boolean {
  if (!isSafeKeySegment(workspaceId)) return false;
  return key.startsWith(attachmentWorkspacePrefix(workspaceId));
}
