# X-04 — Data-model audit before implementation (2026-08-01)

> The audit [X-04](../roadmap/ROADMAP_V2.md#-x-04--export--data-portability)
> required before any export code was written. It records **what was read**, and
> **what was found**, so the export was built against the real persisted model
> rather than against assumptions.
>
> Implementation: [`EXPORT_AND_PORTABILITY.md`](../development/EXPORT_AND_PORTABILITY.md) ·
> Decision: [ADR-065](../decisions/ARCHITECTURE_DECISIONS.md#adr-065-the-canonical-workspace-snapshot-and-two-serialisers-derived-from-it).

---

## 0. Documents and code read first

**Governing documents.** [`AGENTS.md`](../../AGENTS.md) (the constitution — §4 the
spine, §9 architecture, §10–11 reuse and licensing, §14 testing, §15
accessibility, §17 security, §18 Definition of Done),
[`ROADMAP_V2.md`](../roadmap/ROADMAP_V2.md) (X-04, and its relationship to X-03,
SET-02 and NOTES-06), [`PRODUCT_PRINCIPLES.md`](PRODUCT_PRINCIPLES.md),
[`PRODUCT_DEBT.md`](PRODUCT_DEBT.md),
[`SETTINGS_MODULE.md`](../development/SETTINGS_MODULE.md),
[`NOTES_MODULE.md`](../development/NOTES_MODULE.md),
[`NOTES_PERSISTENCE.md`](../development/NOTES_PERSISTENCE.md),
[`MARKDOWN_PIPELINE.md`](../development/MARKDOWN_PIPELINE.md),
[`RELATIONSHIPS.md`](../development/RELATIONSHIPS.md),
[`DEPLOYMENT.md`](../development/DEPLOYMENT.md),
[`ARCHITECTURE_DECISIONS.md`](../decisions/ARCHITECTURE_DECISIONS.md).

**Schema.** Every committed migration, `0001` → `0025`, in full — including the
table rebuilds (`0002`, `0012`, `0015`, `0021`) and the additive `ALTER`s
(`0007`, `0019`, `0020`, `0021`, `0022`, `0023`, `0024`, `0025`), so the audit
describes the *effective* schema rather than the first version of each table.

**Existing single-record export.** [`note-export.ts`](../../app/platform/notes/note-export.ts)
and [`notes/routes/export.tsx`](../../app/modules/notes/routes/export.tsx)
(NOTES-06), plus `transformReferencesForExport` in
[`note-document.ts`](../../app/platform/markdown/note-document.ts) and the
copy/print path in `NoteOverview.tsx` (NOTES-07).

**Composition and repositories.** [`composition.ts`](../../app/platform/workspaces/composition.ts)
(the authoritative list of workspace-scoped repositories), every `app/kernel/*`
contract and its `app/platform/storage/d1/*` adapter, and
[`version.ts`](../../app/lib/version.ts) (the one version authority).

---

## 1. Every persisted table, and who owns it

| Table | Migration | Authoritative repository | Notes |
| --- | --- | --- | --- |
| `workspaces` | 0002 | `WorkspaceRepository` | Identity only. |
| `entities` | 0001, rebuilt 0002 | `EntityRepository` (+ `SpineRepository` for the four spine types) | The uniform record: id, type, title, timestamps, `deleted_at`. |
| `entity_links` | 0003 | `EntityLinkRepository` | Directed, typed, soft-deletable ("unlinked"). |
| `activities` / `activity_subjects` | 0004 | `ActivityRepository` (read) | Append-only; multi-subject. |
| `spine_records` | 0005 | `SpineRepository` | Kind + `completed_at`. Areas never complete. |
| `task_details` | 0006, rebuilt 0012 | `TaskRepository` | Status, priority, dates, sector, commitment, delegation, waiting, description. |
| `task_recurrence_rules` | 0024 | `TaskRepository` | Rule + `series_id`/`sequence`. |
| `project_details` | 0008 | `ProjectSettingsRepository` | Status + `archived_at`. |
| `goal_details` | 0009 | `GoalDetailsRepository` | Target date + definition of done. |
| `area_details` | 0013 | `AreaSettingsRepository` | `archived_at`. |
| `note_details` | 0010, extended 0019 | `NoteDetailsRepository` | Canonical Markdown, tags, `archived_at`. |
| `diary_entry_details` | 0011 | `DiaryRepository` | Type, body, `occurred_at`, timezone, source. |
| `person_details` | 0013 | `PersonRepository` | 24 contact/relationship columns + `archived_at`. |
| `meeting_details` | 0014, extended 0020 | `MeetingRepository` | Times, status, agenda/notes Markdown, `held_at`, `archived_at`. |
| `meeting_items` | 0014, widened 0015/0021 | `MeetingRepository` | `agenda` / `decision` / `outcome` / `action`. |
| `meeting_item_tasks` | 0015 | `MeetingRepository` | Which meeting/item produced a Task. |
| `asset_details` | 0016, extended 0025 | `AssetRepository` | 30+ columns incl. meter, value, warranty, `archived_at`. |
| `asset_events` | 0025 | `AssetHistoryRepository` | History; own `archived_at` **and** `deleted_at`. |
| `asset_obligations` | 0025 | `AssetHistoryRepository` | Future commitments; recurrence + meter; own `archived_at`/`deleted_at`. |
| `review_details` | 0018 | `ReviewRepository` | Period, template, status, `completed_at`, `archived_at`. |
| `review_sections` | 0018 | `ReviewRepository` | One row per prompt; closed section-id set. |
| `owner_app_preferences` | 0017, extended 0021/0022/0023/0024 | `AppPreferencesRepository` | Owner-scoped behavioural preferences + theme. |
| `task_saved_views` | 0022 | `TaskViewRepository` | Owner-scoped declarative view configuration. |

**Finding.** Every persisted table is reachable through a workspace-scoped
repository, and **no table is orphaned**. `project_settings`, `area_settings`,
`project_health`, `alignment` and `relationships` are *derived* projections with
no storage of their own — nothing to export.

**Finding.** Areas and Projects have **no description column**. The export says
nothing about a project description because DalyHub stores none.

---

## 2. Lifecycle states

There is no single lifecycle column; the states live in different places, and the
export had to be built around that rather than inventing a uniform one.

| State | Where it lives |
| --- | --- |
| soft-deleted | `entities.deleted_at` (every first-class record) — plus `asset_events.deleted_at` and `asset_obligations.deleted_at` for those child records |
| archived | `area_details` · `project_details` · `note_details` · `person_details` · `meeting_details` · `asset_details` · `review_details` `.archived_at` |
| completed | `spine_records.completed_at` (Goal/Project/Task) and `review_details.completed_at` |
| workflow status | `task_details.status` (`todo`/`in_progress`/`on_hold`/`cancelled`) · `project_details.status` (`planned`/`active`/`on_hold`) · `meeting_details.status` (`planned`/`completed`/`cancelled`) · `asset_details.status` (6 values) · `review_details.status` |
| dismissed / on-hold | `asset_obligations.status` (`open`/`completed`/`dismissed`/`on_hold`) |
| waiting | `task_details.waiting_since` (derived display state, not a status value) |
| someday | `task_details.commitment_state` |

**Decision taken.** One shared precedence — **deleted > archived > completed >
active** — encoded once as `snapshotLifecycleState` and used by the manifest
counts, the vault frontmatter and the vault banners, so those three can never
disagree.

---

## 3. The spine, and structural relationships

Structural parentage is **not** a column: it is five reserved directed
child → parent EntityLink types (`goal.belongs_to_area`,
`project.belongs_to_area`, `project.advances_goal`, `task.belongs_to_area`,
`task.belongs_to_project`), with a partial unique index enforcing exactly one
active parent per active non-Area record.

**Finding worth stating.** A soft-deleted record **keeps** its structural link, so
a restore is faithful. The vault's child lists therefore filter on the child
entity's own `deleted_at`, not on the link — otherwise a deleted task would
reappear in its project's task list.

---

## 4. EntityLinks and direction

One row per relationship, direction preserved (`source` → `target`), typed by a
dotted slug. Unlinking is **soft** (`deleted_at`), and re-linking restores the
same id. Endpoint soft-delete hides but preserves a link.

Types found in the shipped product: the five structural spine types,
`link.related` (the universal user-created relationship), `note.references`
(wiki links *and* `dalyhub://` record links reconcile to this one type),
`meeting.attendee`, `task.relates_to`, and the People-owned link types.

**Decision taken.** The snapshot exports **all** links, including unlinked ones,
with their state — a restore needs "explicitly unlinked" to stay unlinked. The
vault shows only **active, non-structural** links as "Related records" (the
hierarchy is already rendered as parents and children), matching
`loadLinkedItems`.

---

## 5. Activity and subjects

`activities` carries a validated type, a server-derived actor, one UTC instant and
a bounded JSON payload. `activity_subjects` relates one event to one **or many**
entities with a role — which is how an `entity_link.created` event appears on both
endpoints' timelines, and how MEET-03's `meeting.held` names each attendee as a
subject in their own right (ADR-055).

**Finding.** A payload is structural metadata only, by contract. The export
therefore carries it parsed; a payload that is not valid JSON (only reachable
through corrupt storage) exports as `null` and is named in `limitations` rather
than silently dropped.

---

## 6. Module-specific child records

Confirmed present and exported: `meeting_items` (all four kinds),
`meeting_item_tasks`, `asset_events`, `asset_obligations`, `review_sections`, and
`task_recurrence_rules`.

**Finding.** Asset events and obligations have their **own** soft-delete and
archive columns, independent of the Asset entity's. Both are exported with their
own state.

---

## 7. Owner and workspace preferences

`owner_app_preferences` is keyed `(workspace_id, owner_id)`. `task_saved_views` is
keyed `(workspace_id, id)` with an `owner_id` column.

**Decision taken.** Preferences and saved views **are** the owner's data and are
exported. `owner_id` — the Cloudflare Access subject — is an authentication
artefact and is **not**; it is used only as a query predicate. A restore re-binds
preferences to whoever is authenticated.

---

## 8. Markdown-bearing fields (exact)

Validated through `parseMarkdownSource` or documented as Markdown:
`note_details.content`, `task_details.description`, `diary_entry_details.body`,
`meeting_details.agenda_markdown`, `meeting_details.notes_markdown`,
`meeting_items.body_markdown`, `review_sections.body_markdown`.

**Plain text, despite reading like prose:** `goal_details.definition_of_done`,
`person_details.notes`, `asset_details.description` / `maintenance_notes` /
`document_notes` / `disposal_notes`, `asset_events.description`,
`asset_obligations.description`.

**Decision taken.** Markdown fields are exported byte-for-byte and never
rendered; plain-text fields are exported as plain text. The export adds no second
parser and no second renderer (ADR-015 stands).

---

## 9. Existing export, copy and print behaviour

NOTES-06 ships a single-Note `GET /notes/:id/export?format=md|txt`: front matter,
an H1, then the canonical source with `[[…]]` rewritten to `dalyhub://type/id`;
authenticated, workspace-scoped, `attachment` + `no-store`, with a stable
id suffix when a title is ambiguous. NOTES-07 adds Copy and Print through the
one sanctioned render sink.

**What X-04 reused.** The security shape of the route (fail closed, trusted
workspace, `attachment`, `no-store`, `nosniff`), the *rule* that an export serves
what is stored, and the shared `note-document` analyser.

**What X-04 deliberately did NOT reuse.** `safeFilenameStem` — it slugs to
`[a-z0-9-]`, which is right for a single download and wrong for a vault (it
destroys Unicode titles and collides aggressively). The vault has its own
generator; the single-Note export is untouched.

**What X-04 extended.** One new pure function in the analyser,
`extractRecordLinkOccurrences`, which returns record links **with their source
ranges** so the vault can rewrite a destination without string-searching a code
fence. `extractRecordLinks` keeps its exact previous shape.

---

## 10. What must never be exported

Cloudflare Access JWTs / `Cf-Access-Jwt-Assertion` / cookies / session state ·
the authenticated owner's subject · `ACCESS_AUD`, `ACCESS_TEAM_DOMAIN`,
`OWNER_EMAIL`, `DEFAULT_WORKSPACE_ID` and every other binding or environment
variable · Cloudflare account/database identifiers · `wrangler.jsonc` and
`.dev.vars` · raw SQL and migrations · application logs · test fixtures ·
rendered HTML.

**How it is enforced.** Structurally: the snapshot contract has no such field and
the D1 adapter selects **named columns**, so a column added by a future migration
cannot be exported by accident. Then defensively: `FORBIDDEN_EXPORT_KEY_PATTERN`
over the serialised snapshot, plus an e2e assertion over the real downloaded
archive.

---

## 11. Conclusions that shaped the design

1. **Export is a serialisation problem, not a modelling one.** Every record is a
   workspace-scoped row with a stable id; EntityLinks and Activity are already
   uniform. Nothing needed a migration, and none was added.
2. **A dedicated read-only repository is the right seam.** Serialising module
   read-projections would have exported *view models* — the thing X-04 explicitly
   forbids — and would have missed archived, deleted and unlinked rows, which
   those projections correctly hide from the product.
3. **The two exports must share a snapshot, not a "shared helper".** Two
   serialisers over one in-memory value cannot drift; two builders sharing
   utilities can.
4. **Honesty is a feature.** Deleted records, archived records, unlinked
   relationships, unresolved links, an unparseable payload and the real
   consistency guarantee are all *stated* in the output. Each was a place where
   silence would have been easier and wrong.
