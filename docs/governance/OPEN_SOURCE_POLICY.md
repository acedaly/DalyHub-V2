# OPEN_SOURCE_POLICY.md — Reuse, Licensing & Provenance

> How DalyHub reuses open-source code: **when to reuse, how to vet, how to license, and how to record provenance.** DalyHub stands on the shoulders of the open-source community — deliberately and lawfully.
>
> This document is the authority on reuse. It expands [`AGENTS.md §10–11`](../../AGENTS.md#10-open-source-reuse-policy) and works hand-in-hand with [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) (what we study) and [`IMPLEMENTATION_WORKFLOW.md`](../product/IMPLEMENTATION_WORKFLOW.md) (where reuse fits in a feature's lifecycle).

---

## Principles

1. **Reuse solved problems; build the differentiators.** DalyHub's value is its coherent model and design language — not a hand-rolled date library or command-palette widget. Reuse the commodity; invest effort where it makes DalyHub *DalyHub*.
2. **Study first, so we don't re-research.** Before evaluating libraries, check [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) — we may already have notes on the best option and its licence.
3. **Lawful and traceable, always.** Every dependency and every adapted snippet is licence-checked and provenance-recorded. No exceptions. (See [Licensing](#licensing-rules) and [Provenance](#provenance-requirements).)
4. **Fewer, healthier dependencies.** Each dependency is a maintenance and security liability. Prefer a small number of well-maintained libraries over many marginal ones.
5. **Adapt thoughtfully, don't dump.** Reused code is adapted to DalyHub's conventions and Design System — never pasted verbatim and left foreign.

---

## Reference projects

DalyHub learns from two kinds of open source:

- **Study-only inspirations** — products (often strong-copyleft or closed) we learn *ideas and interaction patterns* from but never copy code from. E.g. an AGPL Notion-alternative teaches us block-editing UX; we implement our own.
- **Reusable building blocks** — permissively-licensed libraries/components we may depend on or adapt (command palette, editor, drag-and-drop, date utilities, icons, primitives).

Both are catalogued, with rationale and licence, in [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md). **Always start there** so research isn't repeated.

---

## Licensing rules

DalyHub is a proprietary product. Licence compatibility gates every reuse.

| Category | Licences | Rule |
|---|---|---|
| **Allowed by default** | MIT, ISC, BSD-2/3-Clause, Apache-2.0, Unlicense, 0BSD | Reuse freely; record provenance. Apache-2.0: preserve NOTICE. |
| **Allowed with recorded decision** | MPL-2.0, EPL, other weak/file-level copyleft | Permitted if the copyleft files stay isolated and unmodified where required; **must** be justified in the PR and noted in `THIRD_PARTY_NOTICES`. |
| **Study-only (no code reuse)** | GPL-2.0/3.0, AGPL-3.0, SSPL, other strong copyleft | **Never copy code or link into the app.** Learn ideas/patterns only. Flagged as such in [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md). |
| **Prohibited** | No licence / "all rights reserved", non-commercial-only, "source-available" with use restrictions | **Do not use.** No licence means no rights. |

Additional rules:
- **Verify the licence at reuse time.** Licences change between versions. Don't trust this doc's or `REFERENCE_PRODUCTS.md`'s recorded licence as current fact — confirm against the dependency's actual version before merging.
- **Dual-licensed** code may be used under its permissive option if one exists; record which option you rely on.
- **Transitive dependencies count.** A permissive package that pulls in a copyleft dependency is a problem — check the whole tree (see [dependency evaluation](#dependency-evaluation)).
- **When unsure, treat as prohibited** and raise it in the PR rather than guessing.

---

## Provenance requirements

Every piece of external code entering the repo must be traceable. (Full rules in [`AGENTS.md §11`](../../AGENTS.md#11-licensing--provenance-requirements).)

- **Dependencies:** pinned version in the lockfile; licence captured; entry added to `THIRD_PARTY_NOTICES` when the licence requires attribution.
- **Adapted snippets:** a comment at the adaptation site, in this exact shape:
  ```ts
  // Adapted from <project> (<url>) @ <commit-or-version>, <license>, retrieved <date>.
  // Changes: <what changed and why>.
  ```
- **Attribution file:** `THIRD_PARTY_NOTICES` at the repo root collects required notices; create it the first time it's needed and keep it current.
- **No laundering.** Never strip attribution, never obscure a source, never paste code you can't licence-verify.

---

## Approved reuse workflow

This is the required path from "I could reuse something" to "it's merged." It slots into the [Reuse assessment step](../product/IMPLEMENTATION_WORKFLOW.md) of the feature lifecycle.

1. **Check the catalogue.** Look in [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) for existing notes on this problem.
2. **Decide build-vs-reuse.** Is this a commodity (reuse) or a differentiator (build)? See [principles](#principles).
3. **Investigate candidates on GitHub** (see [GitHub investigation expectations](#github-investigation-expectations)).
4. **Run the [reusable evaluation checklist](#reusable-evaluation-checklist)** on the leading candidate.
5. **Choose:** depend on it, adapt a snippet from it, or reject it and build.
6. **Record provenance** per the rules above (lockfile, notices, adaptation comments).
7. **Adapt to DalyHub conventions** — Design System, naming, accessibility, security.
8. **Declare it in the PR** — the [PR standards](../../AGENTS.md#13-pull-request-standards) require listing new deps/adapted code with licence + link.
9. **Update the catalogue** — add or update the entry in [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) so the next agent benefits.

---

## GitHub investigation expectations

Before adopting a dependency or adapting a snippet, investigate the source so we don't inherit a liability:

- **Licence** — read the actual `LICENSE` file for the version you'll use (not just the repo badge).
- **Health** — recent commits, releases, and responsiveness to issues; is it maintained or abandoned?
- **Adoption** — meaningful usage (stars are weak signal; real dependents and downloads are stronger).
- **Issues & security** — open critical bugs, known CVEs, security policy, advisory history.
- **Maintainer & governance** — single-maintainer risk, funding, ownership changes.
- **Footprint** — bundle size, transitive dependency tree, native/build requirements.
- **Fit** — does it match our stack, our accessibility bar, and our Design System, or fight them?

Record what you find in the [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) entry so it isn't re-investigated.

---

## Dependency evaluation

For a **new runtime dependency**, additionally:

- Prefer libraries that are **tree-shakeable, typed, accessible, and framework-fitting**.
- **Audit the transitive tree** for licence and security issues, not just the top-level package.
- Weigh **cost of dependency vs. cost of owning the code**: a tiny utility may be cheaper to write (and vendor with attribution) than to depend on.
- Confirm **no telemetry/phone-home** that would violate [privacy/security requirements](../../AGENTS.md#17-security-requirements).
- Pin the version; plan for updates (security patches are not optional).

For **dev-only dependencies**, the bar is lower on footprint but the same on licence and security.

---

## Code adaptation expectations

When you adapt (not just depend on) external code:

- **Understand it before you use it.** No cargo-culting; you own the behaviour once it's in our tree.
- **Conform it to DalyHub** — naming, structure, error handling, [Design System](../design/DESIGN_SYSTEM.md), accessibility, and security conventions.
- **Add provenance** at the adaptation site (comment format above).
- **Cover it with tests** as if you'd written it — because now you maintain it (see [testing philosophy](../../AGENTS.md#14-testing-philosophy)).
- **Note the divergence** from upstream so future updates are possible.

---

## Reusable evaluation checklist

Copy this into the PR when introducing a dependency or adapted code. All boxes must be satisfiable to proceed.

```markdown
### Reuse evaluation — <library/snippet name>
- [ ] Problem is a commodity worth reusing (not a DalyHub differentiator we should own)
- [ ] Checked REFERENCE_PRODUCTS.md for existing notes
- [ ] Licence read for the exact version: __________  → category: Allowed / With-decision / Study-only / Prohibited
- [ ] Licence is Allowed (or a recorded decision is included below for With-decision)
- [ ] Transitive dependency tree licence-checked — no copyleft/prohibited pulled in
- [ ] Maintenance health acceptable (recent activity, releases, responsive)
- [ ] No known unresolved critical security issues / CVEs
- [ ] Footprint acceptable (bundle size, deps, build requirements)
- [ ] Fits our stack, accessibility bar, and Design System
- [ ] No privacy-violating telemetry / phone-home
- [ ] Provenance recorded (lockfile pin / THIRD_PARTY_NOTICES / adaptation comment)
- [ ] Adapted to DalyHub conventions and covered by tests (if adapting code)
- [ ] REFERENCE_PRODUCTS.md updated with findings

Decision: Depend / Adapt / Reject-and-build — because __________
```

---

## Related documents
- [`REFERENCE_PRODUCTS.md`](../reference/REFERENCE_PRODUCTS.md) — the catalogue of studied products and candidate libraries (with licences).
- [`IMPLEMENTATION_WORKFLOW.md`](../product/IMPLEMENTATION_WORKFLOW.md) — where reuse sits in a feature's lifecycle.
- [`AGENTS.md §10–11`](../../AGENTS.md#10-open-source-reuse-policy) — the constitutional summary and hard rules.
- [`docs/README.md`](../README.md) — documentation index.
