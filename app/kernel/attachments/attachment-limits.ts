/**
 * V2.11 FILE-00 — the bounds, in one place, with the reason each was chosen.
 *
 * Every number here is stated in `ROADMAP_V2_11.md` and enforced somewhere it
 * cannot be skipped: before the request body is read, in the kernel validator,
 * and again as a database CHECK. Three layers is not belt-and-braces — each one
 * catches a different caller (a hostile request, a wrong call site, a restore
 * carrying a row nobody validated).
 */

/**
 * The largest single file DalyHub accepts: **10 MiB**.
 *
 * A scanned multi-page PDF, a phone photo and a bank statement all fit
 * comfortably; a video does not, and V2.11 is deliberately not a media library.
 * It is also far enough below the Worker's own request-body ceiling that the
 * isolate is never the thing that fails — the refusal is DalyHub's sentence,
 * not a truncated connection.
 *
 * Enforced against `Content-Length` and against `File.size` BEFORE
 * `arrayBuffer()` is called, so an oversized upload never allocates.
 */
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/**
 * The smallest file DalyHub accepts: one byte.
 *
 * An empty file is not evidence, and accepting one would make "the bytes came
 * back" unfalsifiable — every empty file has the same digest, so a restore could
 * not tell a recovered empty file from a lost one.
 */
export const MIN_ATTACHMENT_BYTES = 1;

/**
 * The longest filename: **200 characters**.
 *
 * Long enough for any real document name; short enough that the Obsidian vault's
 * own `MAX_STEM_BYTES = 160` truncation is the only place a name is ever
 * shortened, so there is one shortening rule rather than two that can disagree.
 */
export const MAX_ATTACHMENT_FILENAME_LENGTH = 200;

/**
 * The most attachments one record may carry: **50**.
 *
 * A bound, not a budget — no real record approaches it. It exists so one record
 * cannot turn its own loader into an unbounded read, and it is checked on write
 * with an honest message rather than discovered as a slow page.
 */
export const MAX_ATTACHMENTS_PER_RECORD = 50;

/**
 * The most attachments one export archive may carry: **500**.
 *
 * The restore reader's entry cap is this plus the archive's own document files.
 * A workspace above it makes the export FAIL and say so; it is never silently
 * truncated, because a backup missing a file is not a backup.
 */
export const MAX_ATTACHMENTS_PER_ARCHIVE = 500;

/**
 * The default page size for "the evidence on this record".
 *
 * Equal to the per-record bound on purpose: a record's evidence list is complete
 * or the record is at its limit, and a paginated evidence section would be a
 * control for a case that cannot arise.
 */
export const DEFAULT_ATTACHMENTS_PER_OWNER = MAX_ATTACHMENTS_PER_RECORD;

/**
 * The per-owner bound when many records are read at once (a collection page).
 *
 * Deliberately small, on the EntityLink precedent: a row shows that evidence
 * exists, and the record surface shows what it is.
 */
export const DEFAULT_ATTACHMENTS_PER_OWNER_IN_LIST = 5;

/** The most purge-ledger rows one sweep drains. Bounded so the cron stays cheap. */
export const ATTACHMENT_PURGE_SWEEP_LIMIT = 25;

/** Human-readable byte size: `948 bytes`, `12.4 KB`, `1.2 MB`. */
export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1000) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  const kb = bytes / 1024;
  if (kb < 1000) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}
