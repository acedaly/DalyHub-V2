/**
 * FND-08 Markdown pipeline — `dalyhub://` RECORD LINKS (NOTES-05 §5).
 *
 * The pipeline half of the record-link contract. The pure wire format — how a
 * `(type, id)` pair becomes `dalyhub://type/id` and back — lives in
 * [`~/shared/markdown/record-link`](../../shared/markdown/record-link.ts), so the
 * editor's record picker (a component, which must not depend on this layer) can
 * share the ONE authority. This module owns only what genuinely belongs to the
 * renderer: the remark transform.
 *
 * NOTES-06's export already EMITTED record links. It was not, until now, a form
 * the product could READ: `dalyhub:` is not in the FND-08 URL allowlist, so a
 * link written by hand — or pasted back from an export — rendered as inert plain
 * text. This module closes that round trip.
 *
 * ## Why this is a rewrite, not a new allowed scheme
 *
 * The obvious move — add `dalyhub` to `SAFE_URL_SCHEMES` — is the wrong one. That
 * allowlist governs what may reach the DOM as a literal `href`, and a
 * `dalyhub://` href is not something a browser can navigate: it would render as a
 * dead link, and it would widen the one security boundary ADR-015 §11 keeps
 * deliberately narrow. Instead this transform rewrites a record link into an
 * ORDINARY RELATIVE PATH before the tree ever reaches `remark-rehype`, exactly as
 * `remarkWikiLinks` already does for `[[…]]`. The URL policy and the sanitisation
 * schema are therefore completely untouched, and the rendered output contains
 * only the relative hrefs both already permit.
 *
 * ## Why it stays stateless
 *
 * Like the wiki-link transform, this performs NO database lookup and mints no id
 * (ADR-015 §4.7). It rewrites `dalyhub://type/id` to the resolver route and
 * stops. Deciding whether that record exists, is in this workspace and is not
 * deleted is the resolver route's job — the one place with a trusted workspace
 * scope. A link to a record that has since been deleted therefore does not fail
 * at render time; it renders normally and lands on an honest "unavailable" page,
 * which is what §23 asks for: a broken link must never crash rendering.
 *
 * A `dalyhub://` URL the parser rejects is deliberately left ALONE. It then fails
 * the existing URL policy and is unwrapped to its label text by the shared
 * safe-content transform — inert, readable, and never a clickable link to
 * something we could not verify.
 */

import { parseRecordLink, recordLinkHref } from "~/shared/markdown/record-link";

export {
  RECORD_LINK_RESOLVE_PATH,
  RECORD_LINK_SCHEME,
  formatRecordLink,
  parseRecordLink,
  recordLinkHref,
  type RecordLinkTarget,
} from "~/shared/markdown/record-link";

/** Minimal mdast shapes this transform needs (no full mdast type dependency). */
interface MdLink {
  readonly type: "link";
  url: unknown;
  children?: MdNode[];
}
interface MdParent {
  readonly type: string;
  children?: MdNode[];
}
type MdNode = MdLink | MdParent;

function isParent(node: MdNode): node is MdParent {
  return "children" in node && Array.isArray((node as MdParent).children);
}

function transform(node: MdNode): void {
  if (node.type === "link") {
    const link = node as MdLink;
    const target = parseRecordLink(link.url);
    if (target) {
      link.url = recordLinkHref(target.type, target.id);
    }
    // An unparseable `dalyhub://` url is deliberately NOT rewritten: it falls
    // through to the URL policy, which unwraps it to plain text. Better an
    // honest non-link than a link to a destination we could not verify.
  }
  if (!isParent(node) || !node.children) return;
  for (const child of node.children) {
    transform(child);
  }
}

/**
 * The remark plugin: rewrite every `dalyhub://type/id` link destination to the
 * internal resolver path.
 *
 * Runs over LINK NODES only, so it cannot touch code (inline or fenced) — a
 * `dalyhub://…` written inside a code fence is sample text and stays verbatim,
 * matching how the wiki-link transform treats `[[…]]` in code.
 */
export function remarkRecordLinks() {
  return (tree: MdParent): void => {
    transform(tree);
  };
}
