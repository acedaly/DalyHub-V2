# Third-Party Notices

DalyHub is proprietary (all rights reserved — see the repository's licensing
posture in [`docs/governance/OPEN_SOURCE_POLICY.md`](docs/governance/OPEN_SOURCE_POLICY.md)).
It incorporates third-party open-source software under the terms below. This
file collects notices that the applicable licences require us to preserve. It
is maintained per [`AGENTS.md §11`](AGENTS.md#11-licensing--provenance-requirements).

All licences recorded here were verified against the installed versions on
**2026-07-17**. Exact resolved versions are pinned in `pnpm-lock.yaml`.

**Re-verified 2026-08-05 (AUDIT-FIX-04).** `react-router` and `@react-router/dev`
moved `8.0.0` → `8.3.0` to clear advisory `GHSA-qwww-vcr4-c8h2`. Both were
re-checked at the new exact versions against their installed `package.json`
`license` fields and remain **MIT**, under the same copyright holders reproduced
below; no licence text changed between the two releases. No other dependency
moved, so every other entry's 2026-07-17 verification still describes the
version actually installed.

---

## Project scaffold

The application skeleton and toolchain configuration were bootstrapped from the
official **Cloudflare `create-cloudflare` (C3) React Router template**, generated
with `npm create cloudflare@latest -- --framework=react-router` on 2026-07-17.
Files adapted from that template carry inline provenance comments (see
`app/entry.server.tsx`, `app/root.tsx`, `workers/app.ts`). The template and the
React Router project it derives from are licensed under the MIT License.

```
MIT License

Copyright (c) React Training LLC 2015-2019
Copyright (c) Remix Software Inc. 2020-2021
Copyright (c) Shopify Inc. 2022-2023

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

## Bundled runtime dependencies

These packages ship in the deployed Worker bundle. All are permissively
licensed (allowed by default per the Open Source Policy).

| Package        | Version | Licence |
| -------------- | ------- | ------- |
| `react`        | 19.2.7  | MIT     |
| `react-dom`    | 19.2.7  | MIT     |
| `react-router` | 8.3.0   | MIT     |
| `isbot`        | 5.2.1   | MIT     |
| `jose`         | 6.2.3   | MIT     |

### Live Markdown editor (NOTES-05) — CodeMirror 6

The writing-first Note editor (`~/shared/markdown-editor`, [ADR-044](docs/decisions/ARCHITECTURE_DECISIONS.md#adr-044-the-writing-first-live-markdown-editor--adopting-codemirror-6-as-an-authoring-surface-over-the-unchanged-fnd-08-source-and-render-pipeline))
is built on **CodeMirror 6** as an authoring surface only — it always saves plain
Markdown source through the unchanged FND-08 pipeline (no second parser,
sanitiser or HTML sink). These packages are code-split and lazy-loaded onto the
note-editor route. The direct dependencies and their entire transitive
`@codemirror/*` / `@lezer/*` tree are **MIT**, verified against the exact
installed versions on **2026-07-25** and pinned in `pnpm-lock.yaml`.

| Package                      | Version | Licence |
| ---------------------------- | ------- | ------- |
| `@codemirror/state`          | 6.7.1   | MIT     |
| `@codemirror/view`           | 6.43.6  | MIT     |
| `@codemirror/commands`       | 6.10.4  | MIT     |
| `@codemirror/language`       | 6.12.4  | MIT     |
| `@codemirror/lang-markdown`  | 6.5.1   | MIT     |
| `@lezer/markdown`            | 1.7.2   | MIT     |
| `@lezer/highlight`           | 1.2.3   | MIT     |
| `@lezer/common`              | 1.5.2   | MIT     |

Transitive packages pulled in by the above, also **MIT**:
`@codemirror/autocomplete` 6.20.3, `@codemirror/lang-html` 6.4.11,
`@codemirror/lang-css` 6.3.1, `@codemirror/lang-javascript` 6.2.5,
`@lezer/lr` 1.4.10, `@lezer/html` 1.3.13, `@lezer/css` 1.3.4,
`@lezer/javascript` 1.5.4, `crelt` 1.0.7, `style-mod` 4.1.3,
`w3c-keyname` 2.2.8.

```
MIT License

Copyright (C) 2018-2021 by Marijn Haverbeke <marijn@haverbeke.berlin> and others

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
IN THE SOFTWARE.
```

---

## Toolchain (development) dependencies

Build, test, and quality tooling. Not shipped in the runtime bundle, but their
licences are recorded for completeness.

| Package                     | Version         | Licence            |
| --------------------------- | --------------- | ------------------ |
| `@react-router/dev`         | 8.3.0           | MIT                |
| `@cloudflare/vite-plugin`   | 1.45.1          | MIT                |
| `@cloudflare/vitest-pool-workers` | 0.18.6    | MIT                |
| `wrangler`                  | 4.112.0         | MIT OR Apache-2.0  |
| `vite`                      | 8.1.5           | MIT                |
| `typescript`                | 5.9.3           | Apache-2.0         |
| `typescript-eslint`         | 8.64.0          | MIT                |
| `eslint`                    | 10.7.0          | MIT                |
| `@eslint/js`                | 10.0.1          | MIT                |
| `eslint-plugin-react-hooks` | 7.1.1           | MIT                |
| `eslint-plugin-jsx-a11y`    | 6.10.2          | MIT                |
| `eslint-config-prettier`    | 10.1.8          | MIT                |
| `prettier`                  | 3.9.5           | MIT                |
| `vitest`                    | 4.1.10          | MIT                |
| `@vitejs/plugin-react`      | 6.0.3           | MIT                |
| `@testing-library/react`    | 16.3.2          | MIT                |
| `@testing-library/jest-dom` | 6.9.1           | MIT                |
| `happy-dom`                 | 20.10.6         | MIT                |
| `@playwright/test`          | 1.61.1          | Apache-2.0         |
| `globals`                   | 17.7.0          | MIT                |
| `@material/material-color-utilities` | 0.4.0  | Apache-2.0         |
| `@types/*`                  | (various)       | MIT                |

Apache-2.0 dependencies (`typescript`, `@playwright/test`, `wrangler` under its
Apache-2.0 option, and `@material/material-color-utilities`) are used unmodified;
none ships a supplemental `NOTICE` file requiring additional reproduction. No
copyleft or no-licence code is included.

### The Material Design 3 colour generator (M3-01)

`@material/material-color-utilities` is Google's own reference implementation of
the M3 tonal-palette algorithm. Licence verified against the installed version on
**2026-08-06**: Apache-2.0, which is on `AGENTS.md §11`'s default-allowed list, so
no recorded decision is required.

It is a **development dependency only**. `scripts/generate-m3-scheme.mjs` runs it
to produce `app/styles/tokens.css`'s colour blocks and `app/shared/tokens/scheme.ts`
— both **committed** — so nothing it computes happens at runtime, in the browser or
in the deployed Worker, and it is absent from every shipped bundle. It is used
unmodified; DalyHub's four documented deviations (ADR-074 decision 3) are choices
about *which* of the library's own APIs to call, not changes to its code.

### External calendar parsing (CAL-01) — recorded MPL-2.0 decision

**`ical.js`** (mozilla-comm), a **runtime** dependency, is licensed **MPL-2.0**
(Mozilla Public License 2.0). `AGENTS.md` §11 places MPL-2.0 in *"requires an
explicit, documented decision"*; this is that decision.

| Package | Version | License | Source |
|---|---|---|---|
| `ical.js` | 2.2.1 | MPL-2.0 | https://github.com/mozilla-comm/ical.js |

**Why it is used.** RFC 5545 is not a format that can be parsed by splitting
strings: a conforming calendar feed folds long lines at 75 octets, escapes
commas/semicolons/newlines inside TEXT values, carries `VTIMEZONE` components that
define their own DST rules, expresses recurrence as `RRULE` + `RDATE` − `EXDATE`,
and expresses exceptions to a recurring series as separate `VEVENT`s bound by
`RECURRENCE-ID`. `ical.js` is the reference JavaScript implementation, maintained
by the Mozilla calendar project and used by Thunderbird's calendar.

**How the copyleft obligation is met.** MPL-2.0 is *file-level* weak copyleft: its
obligations attach to modified MPL files, and it explicitly permits combination
into a Larger Work under other terms (MPL-2.0 §3.3). `ical.js` is consumed as an
**unmodified npm dependency** — never vendored into this repository, never patched,
and never forked — so no MPL-covered file is modified and no MPL-covered source
needs to be redistributed beyond this notice and the upstream link above.

**How it is isolated.** It is imported from exactly ONE module,
`app/platform/calendar/ics-parser.server.ts`, whose public surface is a single
function returning plain domain objects; `ical.js` types never appear in that
signature. The kernel domain (`app/kernel/calendar`) does not depend on it at all.
It is server-only and verified absent from `build/client/`.

**Where this is recorded.** The full evaluation — Workers compatibility, bundle
impact, licence, focus, health, and the alternatives rejected — is in
[`docs/product/CAL_01_UNIFIED_EXTERNAL_SCHEDULE_2026_08.md` §7](docs/product/CAL_01_UNIFIED_EXTERNAL_SCHEDULE_2026_08.md#7-ics-parsing--the-dependency-decision)
and in ADR-091.

---

### Accessibility test tooling (DS-11) — recorded MPL-2.0 decision

The DS-11 automated accessibility gate uses **axe-core** via
**`@axe-core/playwright`**. Both are licensed **MPL-2.0** (Mozilla Public License
2.0), which the [Open Source Policy](docs/governance/OPEN_SOURCE_POLICY.md#licensing-rules)
classifies as *"allowed with recorded decision"* — permitted when the copyleft
files stay isolated and unmodified, justified in the PR, and noted here. Licences
verified against the exact installed versions on **2026-07-20**.

| Package                 | Version | Licence  |
| ----------------------- | ------- | -------- |
| `@axe-core/playwright`  | 4.12.1  | MPL-2.0  |
| `axe-core`              | 4.12.1  | MPL-2.0  |

**Recorded decision.** These are **development/test-only** dependencies: they run
inside Playwright during `pnpm test:e2e` and in CI, and are **never imported by
application code nor shipped in the deployed Worker bundle** (they are not runtime
or client dependencies). They are used **unmodified** — the MPL-2.0 files are
consumed as an off-the-shelf library with no changes — so the file-level copyleft
imposes no obligation on DalyHub's own source. `@axe-core/playwright`'s only
runtime dependency is `axe-core`; its sole peer, `playwright-core`, is already
present via `@playwright/test` (Apache-2.0). No new copyleft or no-licence code
enters the transitive tree. axe-core is the de-facto standard, actively-maintained
accessibility engine (the same engine behind many audit tools); the open-source
assessment is recorded in [`REFERENCE_PRODUCTS.md`](docs/reference/REFERENCE_PRODUCTS.md).

---

## Markdown pipeline dependencies (FND-08)

The shared Markdown pipeline ([FND-08](docs/roadmap/ROADMAP_V2.md) /
[ADR-015](docs/decisions/ARCHITECTURE_DECISIONS.md)) depends on the `unified`
(`remark`/`rehype`) ecosystem. These are runtime dependencies: they enter the
bundle when a module renders Markdown (until then they are tree-shaken out).
Licences verified against the exact installed versions on **2026-07-18**.

| Package            | Version | Licence |
| ------------------ | ------- | ------- |
| `unified`          | 11.0.5  | MIT     |
| `remark-parse`     | 11.0.0  | MIT     |
| `remark-gfm`       | 4.0.1   | MIT     |
| `remark-rehype`    | 11.1.2  | MIT     |
| `rehype-sanitize`  | 6.0.0   | MIT     |
| `rehype-stringify` | 10.0.1  | MIT     |
| `@types/hast` (dev)| 3.0.5   | MIT     |

Their transitive closure — the `micromark`, `mdast-util-*`, `hast-util-*`,
`unist-util-*` and `vfile` single-purpose packages — is **MIT** throughout,
with the sole exception of `@ungap/structured-clone` (**ISC**). Both MIT and ISC
are permissive and allowed by default; no copyleft, no-licence, telemetry or
network-calling package is present. Exact resolved versions are pinned in
`pnpm-lock.yaml`. All are used unmodified; the MIT text reproduced above applies
(each package carries its own copyright holders in its own `LICENSE`).

---

## Authentication dependencies (FND-09)

Cloudflare Access JWT validation ([FND-09](docs/roadmap/ROADMAP_V2.md) /
[ADR-016](docs/decisions/ARCHITECTURE_DECISIONS.md)) uses `jose` for JWKS-backed
verification. It is a server-only runtime dependency: it is imported solely by
the Worker request boundary and never reaches the client bundle (enforced by an
architecture test). Licence verified against the exact installed version on
**2026-07-18**.

| Package | Version | Licence |
| ------- | ------- | ------- |
| `jose`  | 6.2.3   | MIT     |

`jose` has **zero runtime dependencies**, ships tree-shakeable ESM, targets the
WebCrypto and Fetch APIs (Cloudflare Workers–compatible with no Node-only
assumption), and declares no telemetry. The exact resolved version is pinned in
`pnpm-lock.yaml`. It is used unmodified; the MIT text above applies. The
Cloudflare Access verifier's `createRemoteJWKSet` + `jwtVerify` shape is adapted
(not copied verbatim) from Cloudflare's official "Validate JWTs in Workers"
example, with provenance recorded in the source file
(`app/platform/auth/cloudflare-access-authenticator.ts`).

---

## Web fonts (M3-01)

One self-hosted variable typeface, shipped as a subset `woff2` binary in
`public/fonts/` and served same-origin. Licence verified against the exact file
on **2026-08-06**.

| Font | Version | Upstream | Repackaged via | Licence |
| ---- | ------- | -------- | -------------- | ------- |
| Roboto Flex | 3.200 (Google Fonts `v30`) | <https://github.com/googlefonts/roboto-flex> | `@fontsource-variable/roboto-flex@5.3.0` | SIL Open Font License 1.1 |

M3-01 replaced the DS-14 pair (Inter 4.1 and Source Serif 4.005, both OFL-1.1,
63,492 B combined) with this single family at 23,160 B. Material Design 3's
reference typeface is Roboto, and DalyHub no longer has a prose family distinct
from its chrome family (ADR-074 decision 6). The recorded decision below is
unchanged in substance from the one DS-14 made — the same licence, the same
isolation argument — and is restated here against the file actually shipped.

**The explicit decision AGENTS.md §11 requires.** OFL-1.1 is not on the
default-allowed list (MIT, ISC, BSD-2/3-Clause, Apache-2.0). It is a permissive,
file-level licence whose only reciprocal obligations are that the font software
is not sold on its own, that this notice travels with it, and that a *Modified
Version* carrying a Reserved Font Name must be renamed. It is adopted here
because:

- **Roboto Flex declares no Reserved Font Name.** Its copyright line is
  "Copyright 2017 The Roboto Flex Project Authors
  (https://github.com/googlefonts/roboto-flex)" — no "with Reserved Font Name"
  clause — so the subset may keep the original family name.
- **The obligation is isolated to the binary.** The font is data, not code.
  Nothing links it into the application, no OFL term reaches DalyHub's own
  source, and removing it is deleting one file and one stylesheet.
- **The file is shipped verbatim as a subset**, not derived into a new
  typeface. `public/fonts/README.md` records the exact `fonttools` commands that
  reproduce it from the packaged upstream, so the provenance chain is
  re-runnable rather than asserted.

The file was produced with `fonttools varLib.instancer` (pinning twelve of the
thirteen variable axes to their defaults and clipping `wght` to 400–700)
followed by `pyftsubset` (Latin range, `woff2` flavour). No glyph outline was
altered.

The full licence text, which this notice preserves as OFL-1.1 requires:

```
SIL OPEN FONT LICENSE Version 1.1 - 26 February 2007
-----------------------------------------------------------

PREAMBLE
The goals of the Open Font License (OFL) are to stimulate worldwide
development of collaborative font projects, to support the font creation
efforts of academic and linguistic communities, and to provide a free and
open framework in which fonts may be shared and improved in partnership
with others.

The OFL allows the licensed fonts to be used, studied, modified and
redistributed freely as long as they are not sold by themselves. The
fonts, including any derivative works, can be bundled, embedded,
redistributed and/or sold with any software provided that any reserved
names are not used by derivative works. The fonts and derivatives,
however, cannot be released under any other type of license. The
requirement for fonts to remain under this license does not apply
to any document created using the fonts or their derivatives.

DEFINITIONS
"Font Software" refers to the set of files released by the Copyright
Holder(s) under this license and clearly marked as such. This may
include source files, build scripts and documentation.

"Reserved Font Name" refers to any names specified as such after the
copyright statement(s).

"Original Version" refers to the collection of Font Software components as
distributed by the Copyright Holder(s).

"Modified Version" refers to any derivative made by adding to, deleting,
or substituting -- in part or in whole -- any of the components of the
Original Version, by changing formats or by porting the Font Software to a
new environment.

"Author" refers to any designer, engineer, programmer, technical
writer or other person who contributed to the Font Software.

PERMISSION AND CONDITIONS
Permission is hereby granted, free of charge, to any person obtaining
a copy of the Font Software, to use, study, copy, merge, embed, modify,
redistribute, and sell modified and unmodified copies of the Font
Software, subject to the following conditions:

1) Neither the Font Software nor any of its individual components,
in Original or Modified Versions, may be sold by itself.

2) Original or Modified Versions of the Font Software may be bundled,
redistributed and/or sold with any software, provided that each copy
contains the above copyright notice and this license. These can be
included either as stand-alone text files, human-readable headers or
in the appropriate machine-readable metadata fields within text or
binary files as long as those fields can be easily viewed by the user.

3) No Modified Version of the Font Software may use the Reserved Font
Name(s) unless explicit written permission is granted by the corresponding
Copyright Holder. This restriction only applies to the primary font name as
presented to the users.

4) The name(s) of the Copyright Holder(s) or the Author(s) of the Font
Software shall not be used to promote, endorse or advertise any
Modified Version, except to acknowledge the contribution(s) of the
Copyright Holder(s) and the Author(s) or with their explicit written
permission.

5) The Font Software, modified or unmodified, in part or in whole,
must be distributed entirely under this license, and must not be
distributed under any other license. The requirement for fonts to
remain under this license does not apply to any document created
using the Font Software.

TERMINATION
This license becomes null and void if any of the above conditions are
not met.

DISCLAIMER
THE FONT SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO ANY WARRANTIES OF
MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT
OF COPYRIGHT, PATENT, TRADEMARK, OR OTHER RIGHT. IN NO EVENT SHALL THE
COPYRIGHT HOLDER BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
INCLUDING ANY GENERAL, SPECIAL, INDIRECT, INCIDENTAL, OR CONSEQUENTIAL
DAMAGES, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF THE USE OR INABILITY TO USE THE FONT SOFTWARE OR FROM
OTHER DEALINGS IN THE FONT SOFTWARE.
```
