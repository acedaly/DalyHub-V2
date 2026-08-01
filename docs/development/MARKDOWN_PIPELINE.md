# MARKDOWN_PIPELINE.md — The shared Markdown pipeline

> How DalyHub turns untrusted user Markdown into safe, displayable output. This is the shared foundation ([FND-08](../roadmap/ROADMAP_V2.md#-fnd-08--markdown-pipeline)) that **all** long-form text — future Notes, Diary entries and entity descriptions — must consume. It concretely implements [ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy) via [ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline).

---

## The one rule

**Markdown source is the durable, user-owned representation. Rendered HTML is derived, disposable output — never persisted.**

```
untrusted Markdown  →  validate (no rewriting)  →  parse  →  safe document tree
                    →  strict sanitisation  →  trusted HTML  →  one React boundary
```

Everything below follows from that rule.

---

## Source of truth & storage

- Long-form content is stored as **plain Markdown source**. A future domain repository (Notes, Diary, descriptions) persists exactly the validated source string.
- The pipeline **never** silently trims, reflows, rewrites headings, changes list markers, strips unsupported syntax from storage, converts Markdown to proprietary JSON, persists generated HTML, or makes an editor document the source of truth.
- The original validated Markdown remains **exportable** verbatim — this is what makes DalyHub content portable ([X-04](../roadmap/ROADMAP_V2.md#-x-04--export--data-portability)).
- Raw HTML may remain **present in the stored source**; it simply never becomes executable DOM when rendered.
- **FND-08 adds no persistence:** no migration, no table, no rendered-HTML column, no cache, no trigger. "Storage pipeline" here means *defining Markdown as the durable representation future repositories will use* — not creating those repositories.

## Source validation & size limit

`parseMarkdownSource(value: unknown): MarkdownSource` (`app/kernel/markdown`) is the boundary:

- accepts **strings only**; allows the **empty string**;
- **preserves the exact source** — it does not trim or normalise whitespace/line endings;
- rejects **NUL** and other disallowed control characters (C0 controls except tab, LF, CR; and DEL);
- enforces one documented maximum: **1 MiB of UTF-8 source** (`MARKDOWN_SOURCE_MAX_BYTES`), measured in **UTF-8 bytes**, not UTF-16 code units;
- throws a typed `MarkdownValidationError` or `MarkdownSourceTooLargeError` whose message never echoes the source.

`MarkdownSource` is a **branded string**: a value only becomes one by passing validation, so the renderer structurally cannot receive unbounded or control-character-laden input.

## Supported Markdown profile

CommonMark plus the useful GFM subset:

paragraphs · headings · emphasis · strong · strikethrough · ordered/unordered/**nested** lists · blockquotes · inline code · fenced code · thematic breaks · hard & soft line breaks · links · autolinks · tables · task lists · Unicode/emoji.

### Deliberately unsupported (FND-08)

raw executable HTML · custom HTML attributes · inline styles · `script`/`style`/`iframe`/`object`/`embed`/`form`/`button`/user inputs · SVG · MathML · Mermaid/diagrams · directives · custom JS plugins · wikilinks · mentions · record-linking syntax · math · **syntax highlighting** · embedded media · **footnotes**.

> Footnotes are stripped: GFM includes them, but rendering them safely needs pipeline-generated element `id`s — the DOM-clobbering surface FND-08 avoids (it also generates **no heading ids**). Wikilinks/mentions/entity-aware links belong to later Notes/EntityLink work; syntax highlighting is later UI work layered onto safe code output.

## Raw HTML policy

**Raw HTML blocks and inline HTML are ignored in rendered output.** `remark-rehype` runs with `allowDangerousHtml: false`, so raw HTML nodes are dropped during the mdast→hast conversion — they never become DOM. The strict sanitiser then runs as defence in depth. The raw HTML source is untouched for storage/export. No "safe-looking" user HTML is selectively allowed.

## Sanitisation allowlist

One central, **frozen** schema (`app/platform/markdown/sanitisation-schema.ts`) permits only:

```
p  h1 h2 h3 h4 h5 h6  em strong del  blockquote  ul ol li  pre code  a
table thead tbody tr th td  hr  br   input(task-list checkbox only)
```

Attributes are tightly constrained: `a` → `href` only; `th`/`td` → `align` (left/center/right); `ul`/`ol`/`li` → only the GFM-owned `contains-task-list`/`task-list-item` classes; `input` → `type="checkbox"` + `disabled` + `checked` only; `ol` → `start`. **No** user-controlled `id`, `style`, `class`, `name`, `target`, `src`, `srcdoc`, `on*`, `data-*` or `aria-*`. Elements only survive inside a valid ancestor (a stray `tr`/`td`/task `input` is removed).

## URL scheme policy

One allowlist (`markdown-url-policy.ts`), used for every link (and for an image's destination before transformation):

- **allowed:** relative application paths, fragment links, `http:`, `https:`, `mailto:`, `tel:`;
- **rejected:** `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, `filesystem:`, `about:`, `chrome:`, `resource:`, protocol-relative `//host`, and everything else.

It mirrors how a browser resolves an `href` so obfuscation cannot smuggle a scheme: it strips tab/newline/CR anywhere, trims leading/trailing whitespace (including unusual Unicode spaces), rejects any remaining control character, and only then checks the scheme. HTML-entity and numeric-reference obfuscation is already decoded by the parser before the policy sees the value; percent-encoded colons stay inert (a harmless relative URL that never executes). Unsafe links are **unwrapped to plain text**. `target` is never accepted; external links are not auto-opened in a new tab (a later Design System decision may add an affordance).

### `dalyhub://` is NOT in this allowlist — deliberately

DalyHub's own internal record links look like `[Label](dalyhub://project/<id>)`, and `dalyhub:` is **not** an allowed scheme. That is not an oversight, it is the design:

- a `dalyhub://` href is not something a browser can navigate, so allowing it would render a dead link;
- widening this allowlist is the last thing that should be done casually — it is the one boundary standing between user Markdown and the DOM.

Instead, [`record-links.ts`](../../app/platform/markdown/record-links.ts) rewrites a record link into an **ordinary relative path** (the internal resolver route) before the tree ever reaches `remark-rehype` — exactly as `remarkWikiLinks` already does for `[[…]]`. **The URL policy and the sanitisation schema are therefore completely untouched**, and the rendered output contains only relative hrefs both already permit.

A `dalyhub://` URL the parser rejects (extra path segments, a query, a fragment, a malformed id) is deliberately left alone. It then fails this policy and is unwrapped to plain text — an honest, inert non-link rather than a clickable link to a destination that could not be verified. Resolution itself is not the renderer's job: the pipeline stays stateless (ADR-015 §4.7) and the workspace-scoped lookup happens in the resolver route. See [ADR-064](../decisions/ARCHITECTURE_DECISIONS.md#adr-064-the-dalyhub-record-link-and-a-reconciliation-contract-for-autosave).

## Remote-image policy

Markdown image syntax **never** produces an `<img>` and never causes a fetch. An image node is transformed **before** sanitisation into safe non-embedded content:

- safe destination → a labelled link, e.g. `[Image: alt text](safe-url)`;
- unsafe destination → plain alt text (`Image: alt text`).

This prevents tracking pixels, third-party request leakage, IP/metadata disclosure, surprise bandwidth, malicious image formats and mixed content. The pipeline does not fetch, inspect or proxy images and creates no attachment storage. Trusted DalyHub attachments will be designed later with **Assets/R2**.

## Code & task-list behaviour

- **Code** renders semantically as `<code>` / `<pre><code>`, always **escaped**, never executed and never syntax-highlighted. No language class is emitted.
- **Task lists** render as **disabled, non-interactive** checkboxes. They do not submit forms, mutate state, or act as editable controls. Markdown task-list items are **text formatting** and are completely separate from DalyHub's first-class **Task** records.

## Public API

From `~/kernel/markdown` (the contract — no parser types leak here):

```ts
type MarkdownSource;                              // branded, validated source
type SanitizedMarkdownHtml;                       // branded, safe output
interface MarkdownRenderResult { readonly html: SanitizedMarkdownHtml }
interface MarkdownRenderer { render(source: MarkdownSource): MarkdownRenderResult }

function parseMarkdownSource(value: unknown): MarkdownSource;
const MARKDOWN_SOURCE_MAX_BYTES: number;          // 1 MiB
// typed errors: MarkdownError, MarkdownValidationError,
//               MarkdownSourceTooLargeError, MarkdownRenderError
```

From `~/platform/markdown` (the implementation):

```ts
function renderMarkdown(source: MarkdownSource): MarkdownRenderResult;
function renderMarkdownSource(value: unknown): MarkdownRenderResult; // validate + render
const markdownRenderer: MarkdownRenderer;
```

There is **no** option to disable sanitisation, no `allowDangerousHtml`/"trusted mode", no caller-provided plugin array, and no generic arbitrary-HTML sanitiser. Rendering is deterministic and stateless.

## React rendering boundary

```tsx
import { MarkdownContent } from "~/shared/markdown";
<MarkdownContent html={renderMarkdown(source).html} />
```

`MarkdownContent` is the **one** supported component for displaying rendered Markdown and the **one** place in `app/` that uses `dangerouslySetInnerHTML`. It accepts only `SanitizedMarkdownHtml` (a plain string is a type error), so only sanitised output can reach the DOM. It is a tiny presentational sink — no editor, toolbar, preview pane or typography styling — with a single neutral `markdown-content` class hook (visual styling is DS-01 later). It takes pre-rendered HTML (not raw source) on purpose, so importing it never pulls the parser bundle into a route; callers render with `renderMarkdown` (which they can lazy-load) and pass the result.

### Why only one HTML sink

A repository test (`test/unit/markdown-boundary.test.ts`) scans all of `app/` and fails if `dangerouslySetInnerHTML` appears anywhere except `MarkdownContent.tsx`. One reviewed sink, fed only by the sanitising pipeline, is the whole XSS defence in one place.

## Workers compatibility

The renderer runs in the **Cloudflare Workers runtime**: no Node filesystem, no `window`/`document`, no JSDOM, no native modules, no dynamic code generation, no network, no environment bindings, ESM-only dependencies. It is proven by a real Workers-runtime integration test (`test/kernel/markdown-render.test.ts`, `markdown-security.test.ts`) that imports the production pipeline and renders representative and hostile input, plus the production build and Wrangler dry-run.

## Security guarantees & limitations

**Guarantees:** raw HTML never becomes DOM; scripts/event handlers never survive; unsafe URL schemes are removed/neutralised; Markdown images never emit `<img>` or fetch; code stays inert escaped text; source size is bounded; output is deterministic; exactly one HTML sink exists.

**Limitations (by design):** no rich embeds, media, math, diagrams or syntax highlighting; no anchor/heading ids; no attachment rendering. These arrive with later, explicitly-designed roadmap items.

## How later modules must consume it

- **Notes, Diary, descriptions** store the validated `MarkdownSource`, render with the shared `renderMarkdown`, and display via `MarkdownContent`. They must **not** add another parser, sanitiser, URL/raw-HTML policy, or a second `dangerouslySetInnerHTML`.
- **The writing-first live editor** ([NOTES-05](../roadmap/ROADMAP_V2.md#-notes-05--writing-first-markdown-editor), `~/shared/markdown-editor`) improves *authoring* — its document IS the Markdown source, and it uses CodeMirror's Lezer grammar only to STYLE that source in place (headings grow, task items become checkboxes, tables render, …). It emits **no HTML**, adds **no second parser/sanitiser/sink**, and never becomes the source of truth: its live styling is CSS classes on source ranges plus a few hand-built-DOM widgets (`createElement`/`textContent`, never an HTML-string sink), and its Read mode renders through this exact pipeline. See [ADR-044](../decisions/ARCHITECTURE_DECISIONS.md#adr-044-the-writing-first-live-markdown-editor--adopting-codemirror-6-as-an-authoring-surface-over-the-unchanged-fnd-08-source-and-render-pipeline).
- Modules should **lazy-load** the renderer where appropriate so the parser bundle enters only the routes that need it.

## What FND-08 deliberately does not build

Persistence tables/migrations, product routes, a module manifest, an editor/toolbar/preview UI, rendered-output caching, wikilinks/mentions/backlinks, syntax highlighting, remote images/attachments/R2, math/diagrams, and any Notes/Diary/description feature. See [ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline) §25.

---

## Related documents
- [ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline) — the decision this implements; [ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy) — the strategy.
- [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md#markdown-pipeline-evaluation-fnd-08) — the dependency evaluation and licences.
- [`AGENTS.md §17`](../../AGENTS.md#17-security-requirements) — security requirements this satisfies.
- [`docs/README.md`](../README.md) — documentation index.

---

## The document analyser (NOTES-02/03/06)

FND-08 owns Markdown **validation** (`parseMarkdownSource`) and **rendering**
(`renderMarkdown`). Everything else the knowledge features need to know about a
Note's source lives in exactly one more place:
[`app/platform/markdown/note-document.ts`](../../app/platform/markdown/note-document.ts).

It is PURE and DETERMINISTIC — same source in, same result out — performs no
database lookup (resolution is always supplied by the caller as a
`(title) => target | null` function), and walks the SAME `remark-parse` +
`remark-gfm` tree the renderer uses, so its idea of "a code block" is the
renderer's idea of a code block.

| Capability | Used by |
| --- | --- |
| `extractReferences` / `distinctReferenceTitles` | reconciling `[[…]]` into EntityLinks |
| `extractHeadings` / `headingAtOffset` / `offsetIsInHeading` | search match sources |
| `markdownToPlainText` | `.txt` export, excerpt cleaning |
| `excerptAtOffset` / `excerptAroundMatch` | search excerpts, backlink context, card excerpts |
| `transformReferencesForExport` | `.md` and `.txt` export |
| `extractRecordLinks` / `distinctRecordLinkIds` | `dalyhub://` relationship reconciliation |

**The rules it exists to enforce.**

- **ONE wiki-link regular expression in the codebase.** `matchWikiLinks` in
  [`wikilinks.ts`](../../app/platform/markdown/wikilinks.ts) is the only
  tokeniser; the remark transform, the reference extractor and the export
  transformer all go through it. No route, repository or component may declare a
  Markdown pattern of its own.
- **ONE record-link format, in the SHARED layer.** `formatRecordLink` /
  `parseRecordLink` in
  [`~/shared/markdown/record-link.ts`](../../app/shared/markdown/record-link.ts)
  are the only producer and the only parser of the `dalyhub://type/id` form. It
  lives in `shared` rather than here because its three consumers sit in three
  layers — the remark transform, the export transformer, and the editor's record
  picker (a component, which must not depend on platform). One authority is what
  stops the written form and the accepted form from drifting apart.
- **Record links are extracted from LINK NODES, not by pattern.** A
  `dalyhub://…` written inside a fenced or inline code span is not a link node at
  all, so it is never extracted — there is no range-exclusion pass to get wrong.
- **Link-like text inside code is never a relationship.** Reference extraction
  excludes the source ranges of `code`, `inlineCode`, `link`, `linkReference`,
  `definition`, `image` and `html` nodes, so a `[[…]]` in a sample never becomes
  a link — and a reference is never nested inside an existing one.
- **Malformed input yields nothing, never an error.** `[[]]`, `[[   ]]` and an
  unterminated `[[` simply produce no reference.
- **Every excerpt is bounded, block-scoped and syntax-free.** It never spans past
  a blank-line boundary (so unrelated content is not exposed), it is re-parsed to
  plain text (so no half-open construct is rendered), and it truncates
  deterministically with an explicit ellipsis.
- **Export transformation is byte-exact everywhere else.** Only the `[[…]]`
  ranges are rewritten; the rest of the source — including line endings and the
  contents of code fences — is returned unchanged.
