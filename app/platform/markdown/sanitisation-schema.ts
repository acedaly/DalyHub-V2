/**
 * FND-08 Markdown pipeline — the sanitisation allowlist.
 *
 * This is the strict, central, immutable allowlist applied by `rehype-sanitize`
 * as the LAST line of defence (ADR-015 §10). It permits only the semantic
 * elements the supported Markdown profile produces — nothing else survives.
 *
 * Raw HTML never reaches this stage as elements: `remark-rehype` runs with
 * `allowDangerousHtml` off, so raw HTML is dropped during the mdast→hast
 * conversion and cannot become DOM. This schema is therefore defence in depth,
 * not the only defence: even if a future change let an unexpected node through,
 * anything outside this allowlist is stripped here.
 *
 * Deliberately NOT permitted: `script`, `style`, `iframe`, `object`, `embed`,
 * `form`, `button`, `svg`, `math`, `img`, arbitrary `class`/`id`/`style`/`name`,
 * `on*` handlers, `target`, `src`/`srcdoc`, `data-*` and `aria-*` from content.
 * Headings get NO generated `id` (avoids DOM-clobbering, ADR-015 §10).
 */

import { type Options as SanitizeSchema } from "rehype-sanitize";

/** Recursively freeze the schema so it can never be mutated at runtime. */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      deepFreeze(nested);
    }
  }
  return Object.freeze(value);
}

/**
 * The one sanitisation schema for the whole application. Frozen and shared; no
 * module may pass its own schema or weaken this one (there is no option to do
 * so — the renderer hard-wires it).
 */
export const MARKDOWN_SANITISATION_SCHEMA: SanitizeSchema =
  deepFreeze<SanitizeSchema>({
    // Reject comment and doctype nodes outright.
    allowComments: false,
    allowDoctypes: false,

    // The ONLY element tag names allowed in rendered output.
    tagNames: [
      "p",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
      "em",
      "strong",
      "del",
      "blockquote",
      "ul",
      "ol",
      "li",
      "pre",
      "code",
      "a",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "hr",
      "br",
      // Only ever the disabled task-list checkbox produced by GFM (see below).
      "input",
    ],

    // Allowed properties, per tag. Property names are hast (camelCased) names.
    // Every value is either a bare allow, or an allow constrained to exact values.
    attributes: {
      // Links carry only an href; NO target/rel/name/id/on* — the renderer's
      // URL policy has already neutralised unsafe destinations before this stage.
      a: ["href"],
      // Ordered lists keep their starting number; nothing else.
      ol: [["className", "contains-task-list"], "start"],
      // The GFM-owned task-list classes are the only classes allowed anywhere.
      ul: [["className", "contains-task-list"]],
      li: [["className", "task-list-item"]],
      // GFM task-list checkbox: only a disabled checkbox, never an editable/other
      // input. `type` is pinned to `checkbox`; `checked` reflects the source.
      input: [["type", "checkbox"], "disabled", "checked"],
      // GFM table cell alignment, constrained to the three valid values.
      th: [["align", "left", "center", "right"]],
      td: [["align", "left", "center", "right"]],
    },

    // href may only carry these schemes (belt-and-braces with the URL policy).
    protocols: {
      href: ["http", "https", "mailto", "tel"],
    },

    // Elements only survive inside a valid ancestor — a stray `tr`, `td` or task
    // `input` outside its container is removed.
    ancestors: {
      li: ["ol", "ul"],
      thead: ["table"],
      tbody: ["table"],
      tr: ["table"],
      th: ["table"],
      td: ["table"],
      input: ["li"],
    },

    // Remove these (and their subtrees) entirely if ever encountered.
    strip: ["script", "style"],

    // Standard clobbering defence (moot here since id/name are never allowed, but
    // kept explicit and immutable).
    clobber: ["name", "id"],
    clobberPrefix: "user-content",
  });
