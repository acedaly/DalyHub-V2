/**
 * FND-08 Markdown pipeline — shared React boundary public surface.
 *
 * The single supported component for displaying rendered Markdown. Product
 * modules import it from here (ADR-015 §15).
 */

export { MarkdownContent, type MarkdownContentProps } from "./MarkdownContent";

/**
 * NOTES-05 §5 — the `dalyhub://` record-link wire format. Pure and React-free,
 * so the FND-08 remark transform (platform), the export transformer (platform)
 * and the editor's record picker (a component) all share ONE authority for how a
 * record reference is written and read.
 */
export {
  RECORD_LINK_RESOLVE_PATH,
  RECORD_LINK_SCHEME,
  formatRecordLink,
  parseRecordLink,
  recordLinkHref,
  type RecordLinkTarget,
} from "./record-link";
