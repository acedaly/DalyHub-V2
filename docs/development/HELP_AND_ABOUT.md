# HELP_AND_ABOUT.md — In-app Help and the version authority

> Covers [HELP-01](../roadmap/ROADMAP_V2.md#-help-01--in-app-help) and
> [RELEASE-01](../roadmap/ROADMAP_V2.md#-release-01--about-and-the-single-version-authority).
>
> Before this milestone, Help was a PX-03 "Coming Soon" placeholder and About was
> three rows in Settings, one of which read *"No deployment version is exposed to
> the application yet."* Both are now real.

---

## Help

### Where it lives

```text
app/modules/help/
  module.ts          — the manifest (id "help", navGroup "system", navIcon "help")
  routes.manifest.ts — the declarative /help route
  help-content.ts    — THE CONTENT, as typed data
  routes/index.tsx   — the one route that renders it
app/styles/help.css  — Help + About page chrome (tokens only)
```

### Content is data, not markup

Every topic is a `HelpTopic` — a stable id, a title, a one-sentence lead, and a body
of text/list blocks. The route renders that structure; it holds no copy.

The reasons this is worth the indirection:

- **Adding a topic is one edit**, in one file, with no JSX to get wrong.
- **The content is testable.** `test/unit/help/help-content.test.ts` asserts required
  coverage, unique URL-safe ids, that the five theme names appear, that the
  missing-feature list names the things that are actually missing, and that no
  implementation jargon (`kernel`, `EntityLink`, `ADR-`, `loader`, `D1`, `React`)
  leaks into owner-facing prose. Prose drifts; a test does not.
- **It stays inside the repository.** No external documentation platform, no second
  deployment, no separate content store to keep in sync with the product.

### The rules the content follows

1. **Describe DalyHub as it is.** Nothing aspirational. A help page documenting a
   feature the product does not have is worse than no help page, because it makes the
   owner doubt what they are looking at.
2. **Owner language.** Areas, Goals, Projects, Tasks — the product's nouns. No route
   paths as concepts, no kernel vocabulary, no ADR references.
3. **Plain Australian English.** Short sentences. No enterprise jargon.
4. **Name what is missing.** The `not-yet` topic states plainly that backup and
   restore, import, calendar sync, weather, notifications, AI and custom themes are
   not built, and that this deployment has no support desk and no second copy of the
   owner's data unless they keep an export themselves. An owner deciding how much to
   trust the system deserves that up front.
5. **Move an item OUT of that list the moment it ships, and split it if it was
   compound.** X-04 (2026-08-01) is the worked example: "export and backup" was one
   bullet, and only half of it shipped. Help now has a real **"Getting your data
   out"** topic describing both downloads — and the `not-yet` list keeps a
   **"Backup and restore"** bullet that says, in words, that DalyHub cannot read an
   export back in. Letting the shipped half quietly close the whole bullet would
   have been the exact dishonesty rule 1 exists to prevent. A test asserts both:
   that the export topic exists and says *"an export is not a restore"*, and that
   the missing list still names restore.

### Deep links from empty states

Topic ids are stable and `helpTopicHref(id)` builds `/help?topic=<id>`. An empty
state anywhere in the product can point at the paragraph that explains it, which is
how "no dead ends" ([AGENTS.md §6](../../AGENTS.md#6-ux-philosophy)) gets somewhere to
go.

The `?topic=` value is **validated against the content**, never trusted: a stale or
hand-typed link opens Help normally rather than scrolling nowhere. A resolved topic is
marked with `data-focused` and a visually-hidden suffix on its heading, so the
highlight is never the only signal.

### Layout

One column on a phone; a contents rail plus content from the `lg` breakpoint, with the
rail sticky only where there is vertical room. Ordinary DalyHub chrome and theme
tokens throughout, so Help looks like the product in every theme. There is no
separate mobile design to maintain.

---

## About and the version authority

### The problem it solves

A version string copied into more than one place will eventually disagree with itself,
and then a production question ("which build is this?") has two answers and no way to
choose. `app/lib/version.ts` is the single authority; `/health` and `/about` both read
it, and a test pins them together.

### What is exposed, and what is not

`buildInfo(env)` is an **allow-list**, not a pass-through:

| Field | Source | Rule |
|---|---|---|
| `name` | constant | Always `DalyHub` |
| `version` | constant | Hand-maintained, bumped in the release commit |
| `releaseName` | constant | The name this version ships under |
| `environment` | `ENVIRONMENT` | Only `development`/`preview`/`staging`/`production` are echoed; anything else reads `unknown` |
| `commit` | `BUILD_COMMIT` | Optional. Must match a hex commit hash; truncated to 7 characters. Anything else is dropped, not displayed |

Bindings, secrets, database identifiers, hostnames and account ids never reach it. The
commit is the one near-free-text value, so it is the one that is character-checked —
a test exercises the hostile cases.

### Why the version is a constant, not read from `package.json`

`package.json` is `0.0.0` and private, and the Worker bundle has no reliable way to
read it at runtime. A "read it from package.json" scheme would be a second authority
that silently disagrees with the first. One constant, bumped deliberately in the
release commit, is honest and greppable.

### Why About is its own module

It answers a different question from Settings. Settings is *how do I want this
configured?*; About is *what am I running?* Making it a route also means a deployment
check can link straight to it. Settings keeps a short About section with the name,
version and preferences-schema version, which links to the full screen.

### `BUILD_COMMIT` is optional by design

No environment sets it today, and About says "Not recorded" rather than inventing one.
A deployment that wants it sets it as a production var; see
[`DEPLOYMENT.md`](DEPLOYMENT.md#optional-recording-the-build-identifier). Requiring it
would make every local run and every unconfigured deployment display a lie.

---

## Related documents
- [`DEPLOYMENT.md`](DEPLOYMENT.md) — the release audit and how to record a build identifier.
- [`SETTINGS_MODULE.md`](SETTINGS_MODULE.md) — the Settings About section and the preference authority.
- [`DESIGN_SYSTEM.md`](../design/DESIGN_SYSTEM.md) — the tokens Help and About consume.
- [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) — HELP-01 and RELEASE-01.
