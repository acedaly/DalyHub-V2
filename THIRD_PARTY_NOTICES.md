# Third-Party Notices

DalyHub is proprietary (all rights reserved — see the repository's licensing
posture in [`docs/governance/OPEN_SOURCE_POLICY.md`](docs/governance/OPEN_SOURCE_POLICY.md)).
It incorporates third-party open-source software under the terms below. This
file collects notices that the applicable licences require us to preserve. It
is maintained per [`AGENTS.md §11`](AGENTS.md#11-licensing--provenance-requirements).

All licences recorded here were verified against the installed versions on
**2026-07-17**. Exact resolved versions are pinned in `pnpm-lock.yaml`.

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
| `react-router` | 8.0.0   | MIT     |
| `isbot`        | 5.2.1   | MIT     |
| `jose`         | 6.2.3   | MIT     |

---

## Toolchain (development) dependencies

Build, test, and quality tooling. Not shipped in the runtime bundle, but their
licences are recorded for completeness.

| Package                     | Version         | Licence            |
| --------------------------- | --------------- | ------------------ |
| `@react-router/dev`         | 8.0.0           | MIT                |
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
| `@types/*`                  | (various)       | MIT                |

Apache-2.0 dependencies (`typescript`, `@playwright/test`, and `wrangler` under
its Apache-2.0 option) are used unmodified; none ships a supplemental `NOTICE`
file requiring additional reproduction. No copyleft or no-licence code is
included.

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
