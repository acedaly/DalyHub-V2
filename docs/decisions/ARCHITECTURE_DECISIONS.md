# ARCHITECTURE_DECISIONS.md — DalyHub Architecture Decision Records

> The record of **major architectural decisions and their reasoning**. When you need to know *why* the system is built a certain way — before you change it — the answer is here.
>
> These ADRs are load-bearing. The [architecture philosophy in `AGENTS.md §9`](../../AGENTS.md#9-architecture-philosophy) summarises them; this document is the authority on the *why*. The technical *how* is in [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md).

---

## What an ADR is, and how to add one

An **Architecture Decision Record** captures a single significant decision: the context, the choice, and the consequences. ADRs are **append-only** — we don't rewrite history. To change a past decision, add a **new** ADR that supersedes the old one and update the old one's status to `Superseded by ADR-NNN`.

**Add a new ADR whenever** a change: introduces or removes a core concept; changes a kernel contract; picks a foundational technology; or deviates from an existing ADR. Adding the ADR is part of the [Definition of Done](../../AGENTS.md#18-definition-of-done).

**ADR template:**

```markdown
## ADR-NNN: <Title>
- **Status:** Proposed | Accepted | Superseded by ADR-MMM
- **Context.** What forces and constraints are at play?
- **Decision.** What we decided, stated plainly.
- **Consequences.** What this makes easy, what it makes hard, what we accept.
- **Alternatives considered.** What we rejected and why.
```

Statuses below are **Accepted** unless noted. Numbering is stable and permanent.

---

## ADR-001: Area Hierarchy
- **Status:** Accepted.
- **Context.** DalyHub must make a whole life legible. Users need to see how daily action connects to long-term intention. A flat list of tasks cannot express this; an over-deep tree creates bureaucracy.
- **Decision.** Adopt a first-class, kernel-level **Area → Goal → Project → Task** hierarchy with rollup semantics. Areas are permanent domains; Goals are optional outcomes; Projects are finite work; Tasks are atomic actions. This is a kernel concept, not a per-module convention. (See [`AGENTS.md §4`](../../AGENTS.md#4-the-area--goal--project--task-model).)
- **Consequences.** *Easy:* consistent organisation and progress rollup everywhere; the intention↔action view (`AREA-03`) becomes possible. *Hard:* every entity must resolve to an Area; rollup must stay correct and performant. *Accepted:* Goals are optional to avoid forcing structure where it doesn't help.
- **Alternatives considered.** Flat tags-only (rejected: no rollup, no legibility). Deeper hierarchy (rejected: bureaucracy, violates "structure serves clarity"). Per-module hierarchies (rejected: fragmentation).

## ADR-002: EntityLinks
- **Status:** Accepted.
- **Context.** DalyHub's core value is connection — a meeting produces tasks, a note documents a project, a person recurs everywhere. Per-module foreign keys would make each relationship bespoke and invisible to other modules.
- **Decision.** Provide **typed, bidirectional EntityLinks** as a kernel primitive: any entity may link to any other; links are queryable from both ends and rendered through shared UI (the [link picker](../design/DESIGN_SYSTEM.md#forms) and backlinks). (See [`AGENTS.md §9.5`](../../AGENTS.md#95-entitylinks).)
- **Consequences.** *Easy:* cross-module relationships and backlinks with no per-module work; the connectedness the product promises. *Hard:* referential integrity and cascade behaviour on delete must be handled centrally; link types need governance to avoid sprawl. *Accepted:* a general link table over rigid schema-per-relationship.
- **Alternatives considered.** Foreign keys per relationship (rejected: rigid, not cross-module). Freeform tags only (rejected: untyped, not bidirectional).

## ADR-003: Workspace Isolation
- **Status:** Accepted.
- **Context.** A user may keep distinct contexts (personal life, a side venture) that shouldn't bleed together, and data isolation is also a security boundary.
- **Decision.** Make **Workspace** the top-level isolation boundary. Every entity belongs to a workspace; every query is workspace-scoped **server-side**; search, activity, and permissions are all scoped to it. (See [`AGENTS.md §9.4`](../../AGENTS.md#94-workspace-isolation).)
- **Consequences.** *Easy:* clean separation of contexts; isolation doubles as a security control ([security requirements](../../AGENTS.md#17-security-requirements)). *Hard:* every data path must carry workspace scope; cross-workspace features (if ever needed) require explicit design. *Accepted:* scoping overhead on every query in exchange for a hard boundary.
- **Alternatives considered.** Single global space with tags (rejected: no real isolation, weaker security). Per-module isolation (rejected: inconsistent, leaky).

## ADR-004: AI Proposal Architecture
- **Status:** Accepted.
- **Context.** AI must help without eroding user control or trust, and DalyHub holds highly sensitive data. Autonomous AI mutation would violate the product's core promise that the user is always in control.
- **Decision.** AI is a **proposer, never an autonomous actor**. It emits structured, reviewable **proposals** (suggested creates/links/edits) that the user accepts, edits, or rejects — in whole or in part. Nothing is written without approval. The AI operates over the same model as human actions, with **per-action opt-in** for sensitive entities. (See [`AGENTS.md §8`](../../AGENTS.md#8-ai-philosophy) and roadmap `AI-01`/`AI-04`.)
- **Consequences.** *Easy:* trust, auditability, privacy, and reversibility; AI features can be added safely. *Hard:* every AI capability needs a proposal schema and review UI; no "just do it" shortcuts. *Accepted:* extra friction on AI actions as the price of control.
- **Alternatives considered.** Autonomous agents with undo (rejected: violates control/trust, unsafe with sensitive data). AI writing directly to a staging area only (rejected: still bypasses explicit consent).

## ADR-005: Shared Activity Model
- **Status:** Accepted.
- **Context.** Every module needs history (Timeline) and the product needs a cross-cutting Activity Feed and an audit trail. Per-module event logs would fragment this and duplicate work.
- **Decision.** A **single append-only Activity model**: every meaningful mutation appends a uniform event. Record [Timeline](../design/DESIGN_SYSTEM.md#timeline) and cross-scope [Activity Feed](../design/DESIGN_SYSTEM.md#activity-feed) render this one model at different scopes. It also serves as a security-relevant audit trail. (See [`AGENTS.md §9.6`](../../AGENTS.md#96-shared-activity-model).)
- **Consequences.** *Easy:* uniform history everywhere for free; audit trail; one component to build/maintain. *Hard:* mutations must reliably emit events; the stream needs virtualisation and retention strategy at scale. *Accepted:* write-time cost of appending events.
- **Alternatives considered.** Per-module logs (rejected: fragmentation, duplicated UI). Derive history from diffs on read (rejected: costly, lossy).

## ADR-006: Markdown Strategy
- **Status:** Accepted.
- **Context.** Notes, descriptions, and Diary need rich text that stays portable, exportable, and safe. Proprietary rich-text blobs risk lock-in and XSS.
- **Decision.** Author and store long-form text as **Markdown**, rendered through **one shared, sanitising renderer**. This keeps content portable and diff-able and supports [data portability](../roadmap/ROADMAP_V2.md#-x-04--export--data-portability). Raw HTML is not trusted; rendering sanitises. (See [`AGENTS.md §9.7`](../../AGENTS.md#97-markdown-strategy).)
- **Consequences.** *Easy:* portability, export, safety, one renderer to harden. *Hard:* very rich formatting (complex tables, embeds) is constrained to what the pipeline supports. *Accepted:* format constraints in exchange for ownership and safety.
- **Alternatives considered.** Proprietary block/JSON document model (rejected: lock-in, heavier). Raw HTML (rejected: XSS, not portable).

## ADR-007: Module Registry
- **Status:** Accepted.
- **Context.** DalyHub is many modules on a small kernel. Wiring each module through central switch statements would make the shell a bottleneck and every module addition a merge-conflict magnet.
- **Decision.** Modules **self-register** via a **Module Registry**: routes, entity types, commands (for the [Command Palette](../design/DESIGN_SYSTEM.md#command-palette)), search providers, and settings. The shell discovers modules through the registry; adding a module doesn't require editing central code. (See [`AGENTS.md §9.2`](../../AGENTS.md#92-module-registry).)
- **Consequences.** *Easy:* modules are independent and independently implementable (matches [ROADMAP](../roadmap/ROADMAP_V2.md) structure); search/commands/routes compose automatically. *Hard:* the registry contract must be stable and well-specified; a bad module registration can affect the shell. *Accepted:* an indirection layer for decoupling.
- **Alternatives considered.** Central hard-wired module list (rejected: bottleneck, conflicts). Fully independent micro-frontends (rejected: over-engineered for one product, breaks shared kernel benefits).

---

## Superseded / historical decisions

*(none yet)*

---

## Related documents
- [`AGENTS.md §9`](../../AGENTS.md#9-architecture-philosophy) — the architecture philosophy these ADRs justify.
- [`ARCHITECTURE_OVERVIEW.md`](../architecture/ARCHITECTURE_OVERVIEW.md) — how these decisions are realised technically.
- [`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) — the foundation items (`FND-*`) that implement these ADRs.
- [`docs/README.md`](../README.md) — documentation index.
