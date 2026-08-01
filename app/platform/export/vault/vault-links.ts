/**
 * X-04 — turning DalyHub's internal links into portable vault links.
 *
 * A DalyHub Markdown body can carry two internal-link syntaxes, and neither
 * means anything outside DalyHub:
 *
 *   - `[[Wiki Link]]` — resolved by TITLE (NOTES-02);
 *   - `[Label](dalyhub://type/id)` — resolved by stable ID (NOTES-05/07).
 *
 * In the exported vault both become ordinary **relative Markdown links** to the
 * file the target was written to. That is the whole portability claim: the vault
 * opens in Obsidian, in VS Code, in `less`, and every internal reference still
 * goes somewhere.
 *
 * ## Three rules this module exists to keep
 *
 * 1. **Everything else is byte-exact.** Only the source ranges of genuine
 *    internal links are rewritten. Line endings, trailing whitespace, code-fence
 *    contents and the author's own prose are returned unchanged — the same
 *    guarantee `transformReferencesForExport` already makes for the single-Note
 *    export.
 * 2. **A link inside code is not a link.** Both extractors work from the shared
 *    NOTES-02 analyser's real mdast, so a `[[…]]` or `dalyhub://…` in a fenced
 *    sample is left exactly as written.
 * 3. **A broken target never fails the export.** An unresolvable reference keeps
 *    its readable label, is marked as unresolved in place, and is reported in
 *    `_DalyHub/Unresolved Links.md`. Silence would be the dishonest option and a
 *    thrown error would be the useless one.
 */

import {
  extractRecordLinkOccurrences,
  extractReferences,
} from "~/platform/markdown";

import { markdownLink, relativeVaultPath } from "./vault-filenames";

/**
 * The most internal links one body will have rewritten.
 *
 * Well above any real document, and present only so a pathological or hostile
 * body cannot make one file's export unbounded. Reaching it is recorded as an
 * unresolved-link report entry rather than silently dropping the remainder.
 */
export const MAX_VAULT_LINK_REWRITES = 1000;

/** Why an internal link could not be turned into a vault link. */
export type UnresolvedLinkReason =
  /** No record in the workspace has that title. */
  | "no_matching_title"
  /** The id names a record that is not in this export (deleted, or not exported). */
  | "target_not_exported"
  /** The rewrite budget for one document was exhausted. */
  | "rewrite_limit_reached";

/** One internal link the vault could not resolve, for the report. */
export interface UnresolvedLink {
  /** The vault path of the file the link was written in. */
  readonly sourcePath: string;
  /** The source record's title, for a readable report. */
  readonly sourceTitle: string;
  /** The link's visible label — the author's own words. */
  readonly label: string;
  /** The reference as written: a title, or a `dalyhub://type/id` URL. */
  readonly reference: string;
  readonly reason: UnresolvedLinkReason;
}

/** How a body's internal links are resolved to vault files. */
export interface VaultLinkResolver {
  /** Resolve a `[[Wiki Link]]` title to a vault path, or `null`. */
  readonly byTitle: (title: string) => string | null;
  /** Resolve a `dalyhub://type/id` id to a vault path, or `null`. */
  readonly byId: (id: string) => string | null;
}

/** The rewritten body plus everything that could not be resolved. */
export interface RewrittenBody {
  readonly markdown: string;
  readonly unresolved: readonly UnresolvedLink[];
}

interface Occurrence {
  readonly start: number;
  readonly end: number;
  readonly label: string;
  readonly reference: string;
  readonly targetPath: string | null;
}

/**
 * The in-place marker for a link whose target is not in the vault.
 *
 * A plain label would be indistinguishable from ordinary prose, and a dangling
 * `[[…]]` would be broken DalyHub syntax in a file that has no DalyHub. The
 * marker keeps the author's words and says, in the document, that something is
 * missing — with the full list one file away.
 */
function unresolvedMarker(label: string): string {
  return `${label} *(unresolved DalyHub link)*`;
}

/**
 * Rewrite every internal link in a Markdown body for the exported vault.
 *
 * `fromPath` is the vault path of the file being written, so relative paths are
 * computed from where the link actually lives.
 */
export function rewriteBodyForVault(
  source: string,
  context: {
    readonly fromPath: string;
    readonly sourceTitle: string;
    readonly resolver: VaultLinkResolver;
  },
): RewrittenBody {
  if (source === "") return { markdown: "", unresolved: [] };

  const unresolved: UnresolvedLink[] = [];
  const occurrences: Occurrence[] = [];

  for (const reference of extractReferences(source)) {
    occurrences.push({
      start: reference.start,
      end: reference.end,
      label: reference.label,
      reference: reference.title,
      targetPath: context.resolver.byTitle(reference.title),
    });
  }
  for (const link of extractRecordLinkOccurrences(
    source,
    MAX_VAULT_LINK_REWRITES,
  )) {
    occurrences.push({
      start: link.start,
      end: link.end,
      label: link.label,
      reference: `dalyhub://${link.type}/${link.id}`,
      targetPath: context.resolver.byId(link.id),
    });
  }

  if (occurrences.length === 0) return { markdown: source, unresolved: [] };

  // Wiki-link and record-link ranges cannot overlap: the NOTES-02 analyser
  // excludes a `[[…]]` that sits inside an existing link node. Sorting is still
  // required because the two extractors each return their own source order.
  occurrences.sort((a, b) => a.start - b.start);

  let out = "";
  let cursor = 0;
  let rewrites = 0;
  for (const occurrence of occurrences) {
    // A later occurrence that starts before the cursor would mean overlapping
    // ranges; skipping it is the safe outcome (the source text is preserved).
    if (occurrence.start < cursor) continue;
    out += source.slice(cursor, occurrence.start);

    if (rewrites >= MAX_VAULT_LINK_REWRITES) {
      unresolved.push({
        sourcePath: context.fromPath,
        sourceTitle: context.sourceTitle,
        label: occurrence.label,
        reference: occurrence.reference,
        reason: "rewrite_limit_reached",
      });
      out += unresolvedMarker(occurrence.label);
    } else if (occurrence.targetPath === null) {
      unresolved.push({
        sourcePath: context.fromPath,
        sourceTitle: context.sourceTitle,
        label: occurrence.label,
        reference: occurrence.reference,
        reason: occurrence.reference.startsWith("dalyhub://")
          ? "target_not_exported"
          : "no_matching_title",
      });
      out += unresolvedMarker(occurrence.label);
    } else {
      out += markdownLink(
        occurrence.label,
        relativeVaultPath(context.fromPath, occurrence.targetPath),
      );
    }

    rewrites += 1;
    cursor = occurrence.end;
  }
  return { markdown: out + source.slice(cursor), unresolved };
}
