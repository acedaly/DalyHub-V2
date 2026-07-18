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
- **A future rich editor** may improve *authoring*, but it must still **save Markdown source** — the editor document model never becomes the source of truth.
- Modules should **lazy-load** the renderer where appropriate so the parser bundle enters only the routes that need it.

## What FND-08 deliberately does not build

Persistence tables/migrations, product routes, a module manifest, an editor/toolbar/preview UI, rendered-output caching, wikilinks/mentions/backlinks, syntax highlighting, remote images/attachments/R2, math/diagrams, and any Notes/Diary/description feature. See [ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline) §25.

---

## Related documents
- [ADR-015](../decisions/ARCHITECTURE_DECISIONS.md#adr-015-markdown-source-and-safe-rendering-pipeline) — the decision this implements; [ADR-006](../decisions/ARCHITECTURE_DECISIONS.md#adr-006-markdown-strategy) — the strategy.
- [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md#markdown-pipeline-evaluation-fnd-08) — the dependency evaluation and licences.
- [`AGENTS.md §17`](../../AGENTS.md#17-security-requirements) — security requirements this satisfies.
- [`docs/README.md`](../README.md) — documentation index.
