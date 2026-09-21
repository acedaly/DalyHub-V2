# DalyHub Chief of Staff MCP

> Production runbook for the remote MCP bridge at
> `https://mcp.daly.id.au/mcp`. The Worker code is complete in this repository;
> the Cloudflare Access application, production secrets, custom domain and
> Claude connection are owner-controlled activation steps.

## Architecture and data flow

```text
Claude
  │ HTTPS + Cloudflare Access Managed OAuth
  ▼
mcp.daly.id.au/mcp
  │ stateless Streamable HTTP (createMcpHandler)
  ▼
dalyhub-mcp Worker — authentication, Zod validation, tool descriptions
  │ private Cloudflare Service Binding / Worker RPC
  ▼
dalyhub-v2-production::ChiefOfStaffEntrypoint
  │ workspace-scoped Chief-of-Staff service and existing repositories
  ▼
D1 (dalyhub-v2)
```

The MCP Worker has no D1, R2, secret-store or outbound-proxy binding. It can
only call the named `ChiefOfStaffEntrypoint` on the application Worker. That
entrypoint accepts a closed discriminated request union; it is not a generic
HTTP endpoint and is not routable from the public application hostname.

The application service owns aggregation and mutations. Claude receives compact
domain-shaped JSON, never database rows. DalyHub supplies deterministic facts;
there is no model call inside DalyHub.

## Security model

Production uses a Cloudflare Access **MCP server application** with **Managed
OAuth**. Access performs the interactive OAuth flow and forwards a signed
`Cf-Access-Jwt-Assertion` to the MCP Worker. The Worker still verifies that JWT:

- signature against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`;
- issuer equal to the configured Access team domain;
- audience equal to the MCP Access application's AUD tag;
- `RS256` only and a non-empty stable `sub`.

The Access policy, not application code, restricts login to the authorised owner
identity. No email address is committed. Missing or invalid production auth
configuration fails closed. Tokens, cookies and assertion bodies are never
logged or stored.

The handler accepts only `/mcp`, validates Host/Origin through the current MCP
handler, and uses Streamable HTTP. There is no `/sse` route. Local development
has a separate, explicit bearer-token mode which activates only when both
`AUTH_MODE=development` and `ENVIRONMENT=development`; that token must be at
least 32 characters and is never a production fallback.

Claude cannot execute SQL, access D1 credentials, delete records, merge or bulk
mutate them, modify auth or settings, administer Workers/Cloudflare, read
secrets, export the database, execute files, proxy arbitrary HTTP, or make
arbitrary network calls. The only "put it away" operation it has is ARCHIVING a
single Project, Note, Person or Area, which is reversible through the same tool
and leaves every relationship, child record and Activity row intact.

**People are reachable; Diary is not.** AGENTS.md §8 and §17 keep People and
Diary out of external model context "unless the user explicitly opts in for a
specific action". Connecting this owner-only connector and calling a People
tool is that opt-in — the Access policy admits one identity, every call is
attributable to it, and nothing is sent anywhere DalyHub was not already asked
to send it. Diary has no tool here at all, and `get_person` returns the shape
of a shared history (counts, first and last interaction) rather than the diary
entries behind it.

## Tools

Thirty-four bounded tools. Read tools never write; write tools never delete.

| Tool | Mode | Purpose |
|---|---|---|
| `get_chief_of_staff_context` | read | Bounded daily briefing: today/overdue/upcoming work, projects and next actions, stale projects, waiting, open decisions, captures, completions, deadlines and goals |
| `get_weekly_review_context` | read | Seven-day creates/completions, open commitments, overdue/waiting/decisions, project health, carry-over and the next 14 days |
| `get_today` | read | Today's tasks, overdue work and waiting follow-ups due in the owner timezone |
| `search_dalyhub` | read | Bounded text search across tasks, projects, goals, areas, people, notes and decisions |
| `get_projects` | read | Active projects with concise progress, health and canonical next action |
| `get_project` | read | One project's context, tasks, waiting, decisions, linked notes, deadlines and recent activity |
| `get_areas` | read | The owner's Areas with goal/project/task roll-ups |
| `get_area` | read | One Area's goals, projects, open tasks, waiting, people, notes and decisions |
| `get_goals` | read | Goals with their Area, target date, condition and completion state |
| `get_goal` | read | One Goal's target, definition of done, exact project contribution, people and notes |
| `get_people` | read | People, filtered by text, lifecycle status, or the Project/Area they relate to |
| `get_person` | read | One Person, their details, related records, open tasks, waiting items and shared history |
| `get_notes` | read | Notes with bounded excerpts, filtered by text, tag, Project or Area |
| `get_note` | read | One Note in full: title, bounded Markdown body, tags and archive state |
| `get_decisions` | read | Recorded and open Decisions, narrowed by status or related Project/Area |
| `get_waiting_for` | read | What the owner is waiting on, narrowed by follow-up state or Person/Project/Area |
| `capture_item` | write | Quick intake of a task, reminder, note, idea, open decision or waiting item |
| `create_task` | write | Create one actionable Task, optionally under a Project/Area and related to a Person |
| `update_task` | write | Non-destructive task edits, parent movement and Person relationship |
| `complete_task` | write | Idempotently complete a task |
| `reopen_task` | write | Idempotently reopen a completed task |
| `create_project` | write | Create a finite outcome under an Area or a Goal |
| `update_project` | write | Rename, restatus, move, relate people, complete/reopen or archive/restore one Project |
| `create_area` | write | Create a long-running area of responsibility |
| `update_area` | write | Rename, or archive/restore, one Area |
| `create_goal` | write | Create a desired outcome under an Area, with a target date and contributing Projects |
| `update_goal` | write | Rename, move, retarget, set aside/resume, or complete/reopen one Goal |
| `create_person` | write | Create a person/contact, with their details and relationships |
| `update_person` | write | Patch a Person's details, tags, relationships, or archive/restore them |
| `create_note` | write | Create a Note filed under a Project, Area, Goal and/or Person |
| `update_note` | write | Retitle, replace body/tags, file further, or archive/restore one Note |
| `record_decision` | write | Record a decided outcome, rationale and optional review/relationship |
| `create_waiting_for` | write | Create a task in DalyHub's canonical waiting/delegation state |
| `resolve_waiting_for` | write | Idempotently clear waiting state without deleting history |

Every field named `*Id` or `*Ids` takes either an exact DalyHub id **or** a
human-readable name (see [Entity reference
resolution](#entity-reference-resolution)). The write tools never create a
parent record implicitly: `create_task` and `create_note` will not invent a
Project, and `create_project` will not invent an Area or Goal.

There is deliberately no delete, merge, bulk-mutation, SQL, database-export,
auth-modification, filesystem or arbitrary-HTTP tool. Archiving a Project,
Note, Area or Person is the reversible "put it away" operation and is the
closest this interface comes to removal.

### Names the first release published

`get_chief_of_staff_context`, `get_weekly_review_context`, `get_today`,
`get_projects`, `get_project`, `get_note`, `search_dalyhub`, `capture_item`,
`create_task`, `update_task`, `complete_task`, `create_project`,
`update_project`, `create_note`, `update_note`, `record_decision`,
`create_waiting_for` and `resolve_waiting_for` all keep their names, their
existing fields and their existing behaviour. Nothing was renamed for
consistency, and `test/unit/chief-of-staff-mcp.test.ts` asserts that.

The additions to existing tools are all optional: `personId` on `create_task`,
`update_task`, `create_note`, `update_note` and `create_waiting_for`;
`personIds` and `allowDuplicate` on `create_project`; and a name being
acceptable everywhere an id already was.

## What each domain means

The Chief of Staff must not turn every input into a Task. DalyHub's own model
decides which record an input becomes:

| Input | Record | Tool |
|---|---|---|
| An ongoing responsibility with no end state | **Area** | `create_area` |
| A desired outcome work contributes toward | **Goal** | `create_goal` |
| A finite outcome needing several actions | **Project** | `create_project` |
| An action someone must do | **Task** | `create_task` |
| A human the owner wants to remember | **Person** | `create_person` |
| Context or reference worth keeping | **Note** | `create_note` |
| A choice and why it was made | **Decision** | `record_decision` |
| A dependency on another person or event | **Waiting** | `create_waiting_for` |
| Unclassified quick input | **Capture** | `capture_item` |

The Area/Project line is the one that matters most, and it has a test: *if the
thing can be completed, it is not an Area.* "Wedding" is an Area if it is a
standing part of the owner's life this year and a Project if it is a thing that
finishes. The tool descriptions say so, because the description is what Claude
actually reads when it chooses.

"Create a person called Sarah" is `create_person`, not `capture_item` — and
the same goes for an explicitly named Area, Project, Goal, Task or Note.
`capture_item` is for input that genuinely has no typed destination yet.

The structural hierarchy is DalyHub's existing FND-07 spine — Area → Goal →
Project → Task. People, Notes and Decisions hang off it rather than sitting
inside it:

```text
Area
 └─ Goal
     └─ Project
         ├─ Tasks          (structural spine children)
         ├─ Notes          (link.related, many-to-many)
         ├─ People         (link.related, many-to-many)
         ├─ Decisions      (decision_details.related_entity_id)
         └─ Waiting        (Tasks in the canonical waiting state)
```

### Projects

`create_project` and `update_project` reuse DalyHub's existing authorities and
add no schema: creation, rename, move and completion are `SpineRepository`'s
(the single parentage and completion authority), and status/archive are
`ProjectSettingsRepository`'s. There is no second Project model and no Project
SQL in the MCP Worker.

A Project needs exactly ONE parent, supplied as an exact existing `areaId` **or**
`goalId`. Status is DalyHub's own vocabulary — `planned`, `active`, `on_hold`.
`completed` and `archived` are booleans, and both directions are available, so
neither is a one-way door.

A DalyHub Project carries no `outcome` or `description` column, so the tool does
not pretend otherwise: the outcome statement belongs in a Note filed under the
Project. For the worked example in this document that is:

```text
Project : DalyHub Chief of Staff          (create_project)
Status  : Active                          (status: "active")
Outcome : Claude can securely review and maintain DalyHub through MCP.
          → create_note(title: "Outcome", projectId: <exact id>)
```

### Notes

A Note is retained CONTEXT — project background, meeting context, an
observation, a rationale, reference material — that does not itself require
action. `create_note`/`update_note` reuse the generic `EntityRepository` for the
Note's identity and `NoteDetailsRepository` for its Markdown body, tags and
archive state, exactly as the Notes module does.

Filing a Note reuses **PROJ-03 Project Knowledge**: each supplied `projectId`,
`areaId` or `goalId` becomes one `link.related` EntityLink with the record as
the source — the SAME relationship the shared Linked Items surface shows on both
records, not a private MCP-only association. Each id must be an exact, active
record of the type it is named as, so a Project id passed as `areaId` is a
validation failure rather than a silently mis-filed Note. Linking is idempotent
by the kernel's `(workspace, source, target, type)` identity.

`note.references` — the DERIVED relationship a `[[Wiki Link]]` creates — is
deliberately not used for filing, because it is reconciled against the note's
body on every save and would be removed the next time the owner edited the note
in the app. Any `[[Wiki Links]]` Claude does write into a body are still
reconciled into real `note.references` links, so an MCP-written Note behaves
like one written in DalyHub.

`update_note` REPLACES the body and the tag set rather than appending, so Claude
is told to read the Note with `get_note` first when it means to extend it.

### Areas

An Area is the top of DalyHub's hierarchy and has no parent. `create_area` and
`update_area` reuse `SpineRepository` for identity and rename and
`AreaSettingsRepository` for the reversible archive, exactly as the Areas module
does; they add no model and no schema.

**A DalyHub Area carries no description, purpose, status, review cadence or
parent category.** The kernel models a title, an identity icon/colour and a
nullable `archived_at`, and nothing else — so the tool exposes a title and an
archive flag, and says in its own description where the purpose statement
belongs instead (a Note filed under the Area). Inventing a `description`
parameter the domain cannot store would be a worse failure than not having
one: Claude would report success and the text would be gone.

There is no Area deletion here. DalyHub can hard-delete an empty Area
(`spine.permanentlyDeleteArea`, guarded by a typed-title confirmation in the
app); that capability is deliberately absent from this interface.

### Goals

`create_goal` and `update_goal` compose `SpineRepository` (create, rename,
move, complete, reopen) with `GoalDetailsRepository` (target date, definition
of done, condition) — the same two authorities the Goals module uses.

A Goal belongs to exactly one Area. A Project *contributes to* a Goal by
being under it, which is the spine's own `project.advances_goal` parentage, so
`create_goal(projectIds: [...])` and `update_project(goalId: …)` are the same
relationship approached from either end; there is no second association.

`condition` is STEER-02's owner-set intent, and the interface uses its two
honest values: `pursuing` (DalyHub's stored `null` — the default) and
`set_aside`. It is not a verdict on progress, which DalyHub derives with
evidence, and it is not archiving.

A Goal's measurement configuration (GOAL-02: baseline, target value, unit,
milestones) is **not** exposed. It is a configuration surface with its own
vocabulary and its own readings, and a text interface that half-set it would
produce a Goal that measures the wrong thing.

### People

People are first-class in DalyHub (AGENTS.md §5) and, for the first time, they
are reachable by Claude. That is a deliberate change to the boundary, recorded
in [ADR-127](decisions/ARCHITECTURE_DECISIONS.md#adr-127-claude-chief-of-staff-is-a-small-authenticated-mcp-capability-boundary-over-private-worker-rpc):
AGENTS.md §8/§17 exclude People and Diary from external model context "unless
the user explicitly opts in for a specific action", and connecting this
owner-only, Access-protected connector and calling a People tool **is** that
opt-in, per action and per conversation. **Diary stays out entirely** — there
is no Diary tool, and there is not going to be one.

`create_person` and `update_person` use the PEOPLE-01 `PersonRepository` for
the detail slice and the archive lifecycle, and the generic `EntityRepository`
for the display name — the split the kernel already enforces. Relationships to
Areas, Projects and Goals are `link.related` EntityLinks, the same
relationship the shared Linked Items surface draws on both records and the same
one PEOPLE-03's relationship facts already count.

`get_person` returns the Person, their related Areas/Goals/Projects/Notes/
Meetings, their open tasks, what the owner is waiting on them for, and the
SHAPE of the shared history (counts and first/last interaction) — not the
history itself. Every list is bounded.

A waiting item names its Person as a real entity subject when `personId` is
given (`task.waiting_on`), so it appears on their record and survives a rename;
free text stays available for a party with no DalyHub record.

## Entity reference resolution

Every `*Id`/`*Ids` field accepts an exact DalyHub id **or** a human-readable
name. Resolution happens in the application layer
(`app/platform/chief-of-staff/reference-resolution.ts`), never in the MCP
Worker, and the rules are in order:

1. an **exact id** of the named kind always wins;
2. an **exact normalised name** resolves, when exactly one active record of
   that kind has it. Normalising folds case, accents, punctuation and spacing,
   so `Career Development`, `career  development` and `Career-Development` are
   one name — and `Career` is still not `Career Development`;
3. a **single partial match** resolves, because there is nothing to confuse it
   with;
4. **several plausible matches** resolve to nothing and return an
   `ambiguous_reference` result;
5. a **missing record is never created implicitly**. Only a `create_*` tool
   creates.

Each lookup is a bounded, deterministic, workspace-scoped identity projection
over the canonical entity/detail tables, and it is type-scoped: asking for an
Area can only return Areas, so a Project id supplied as `areaId` is still a
failure rather than a mis-filed record. Candidate retrieval and final comparison
use the same normalised key, so punctuation, spacing, case and accents work
end-to-end rather than only after a raw search happened to find the row. Only a
record's title/name and explicit aliases (currently a Person's preferred name
and email) participate. Description/body/checklist text, tags, organisation,
role and other full-text fields remain searchable through `search_dalyhub` but
can never become an entity reference. The identity projection is hard-capped at
1,000 rows per entity kind and returns at most ten candidates. Archived Areas,
Projects and Notes are excluded, as they are from the application's own pickers;
archived People are NOT, because archiving is the only put-away this interface
has and "restore Kate" has to work.

### Ambiguity

An ambiguous reference comes back as an ordinary tool RESULT, not an error,
because Claude's next move is to ask the owner and it needs the candidates:

```json
{
  "status": "ambiguous_reference",
  "field": "personId",
  "expected": "person",
  "reference": "John",
  "matches": [
    { "type": "person", "id": "…", "title": "John Smith", "subtitle": "Finance", "matchedOn": "name" },
    { "type": "person", "id": "…", "title": "John Smith", "subtitle": "Orana",   "matchedOn": "name" }
  ],
  "message": "… Nothing was changed."
}
```

**Nothing is written while the question is outstanding.** A reference that
names nothing is an error instead, because there is nothing to choose between.

## Duplicate protection

`create_person`, `create_area`, `create_project` and `create_goal` check for a
record that is effectively what they were about to create, and return a result
rather than a second copy:

```json
{
  "status": "possible_duplicate",
  "entityType": "area",
  "title": "Career Development",
  "matches": [{ "type": "area", "id": "…", "title": "Career Development" }],
  "message": "… Nothing was created."
}
```

The check is deliberately narrow — an **exact normalised name**, or, for a
Person, a shared email address. A merely similar name creates normally, because
refusing "Career Development 2027" because "Career Development" exists would
make the tool useless. It is a pause, not a uniqueness constraint: two people
genuinely can share a name, and `allowDuplicate: true` is how the owner says so
after being asked. A refusal writes nothing and audits nothing.

## Patch semantics

Every `update_*` tool is a PATCH. An omitted field means *leave it exactly as
it is*; it never means *set it to null*. Clearing a nullable field is done by
sending an explicit `null`.

Two fields are deliberately wholesale rather than additive, and say so in their
descriptions: a Note's `content` REPLACES the body (read it with `get_note`
first when extending it), and `tags` REPLACES the whole tag set.

Relationship lists (`personIds`, `areaIds`, `projectIds`, `goalIds`) ADD
relationships. This interface has no unlink capability at all, so a list that
omits an existing relationship never removes it.

## Archive, never delete

There is no hard delete on this interface for any entity. Projects, Notes,
People and Areas each have a reversible `archived` flag, reachable in both
directions through the same tool, that preserves every relationship, child
record and Activity row. Tasks are completed and reopened, never deleted;
waiting state is resolved, never deleted. DalyHub's own irreversible operations
— permanent Area deletion, task deletion, workspace purge — stay in the
application, behind the owner's own typed confirmations.

## What this interface deliberately cannot do

Not every gap is an oversight, so the ones that are decisions are written down:

- **There is no separate relationship tool.** People are related to Areas,
  Projects and Goals through `create_person`/`update_person` (and
  `create_project`/`update_project` from the other end), because the domain
  already models it as one `link.related` EntityLink and a `link_person` tool
  would be a second way to write the same row. There is also no UNLINK: this
  interface adds relationships and never removes one.
- **Captures have no inbox state to process.** DalyHub has no capture entity —
  `capture_item` creates a real Task, Note or Decision immediately, which is
  why there is nothing to "mark processed". Recent MCP captures are surfaced in
  `get_chief_of_staff_context.recentCaptures`, and the records themselves are
  read through the ordinary task/note/decision tools.
- **An Area carries no description, purpose, status or review cadence**, and a
  Goal's GOAL-02 measurement configuration is not exposed. Both are stated
  above; neither is worth a migration to satisfy a tool parameter.
- **`get_notes` answers one lifecycle bucket at a time** (`active` or
  `archived`), because that is what the Notes collection answers. There is no
  "all", rather than an "all" that quietly means "active".
- **An archived Area or Project cannot be named.** Area and Project search
  excludes archived records, so restoring one needs its exact id (People are
  the exception — see above — because the name has to survive the archive).
- **`peopleWaitingOnMe` is still empty.** The kernel models outbound waiting
  and delegation, not inbound assignment; an empty answer is more truthful than
  reversing the relationship.
- **Diary is absent entirely**, by decision rather than by omission.

## Chief-of-Staff semantics

- All reads are workspace-scoped and hard-capped (50 items per major task list,
  25 decisions/goals, 20 combined search results, 20 recent project events).
- “Today,” overdue and upcoming dates use the persisted owner timezone, falling
  back to `Australia/Sydney`; UTC server midnight is never treated as local
  midnight.
- Project next actions reuse DalyHub's canonical next-action query.
- Project staleness reuses the existing project-health rule: an open project is
  stale after 14 calendar days without qualifying project/task activity. It is
  not inferred when the required facts are absent.
- “Waiting for” reuses the existing Task waiting/delegation/follow-up model and
  retains resolution history. The current data model has no inbound assignee
  field, so `peopleWaitingOnMe` is deliberately empty instead of reversing an
  outbound waiting relationship.
- Decisions are first-class entities with a typed detail slice. `open` means a
  decision remains to be made; `decided` means the outcome was recorded.

## Audit logging

Every successful MCP mutation uses Activity actor type `mcp` and the verified
Access subject. It also appends an `mcp.mutation` event with:

- `source: "claude_mcp"`;
- action/tool name;
- affected entity type and entity ID (as the Activity subject);
- a bounded summary;
- a bounded request/correlation ID.

This covers every write: Task create/update/complete/reopen, Project
create/update, Area create/update, Goal create/update, Person create/update,
Note create/update, decision recording, waiting creation and resolution, and
capture. The domain repositories underneath append their own canonical events
too (`entity.created`, `project.status_changed`, `note.content_updated`, …), so
an MCP write is legible on the record's own Timeline as well as in the MCP audit
trail.

Idempotent no-ops do not append duplicate MCP audit events: an `update_project`,
`update_note`, `update_person`, `update_area` or `update_goal` that changes
nothing returns `changed: false` and writes no `mcp.mutation` row, matching
`complete_task` and `resolve_waiting_for`. Neither does a refusal — an
ambiguous reference and a possible duplicate both write nothing, so they audit
nothing.

The payload is identification, not content: the action, the entity type, the
entity id (as the Activity subject), a bounded title-level summary and the
request id. A Person's contact details, a Note's body and a Decision's
rationale are never copied into it. Access tokens,
cookies and JWTs are not event payloads. The existing Activity/Timeline system
can surface these events in a later UI pass without a second audit store.

## Database change

Migration `0057_chief_of_staff_decisions.sql` is the ONLY schema change in this
work. It adds the STRICT `decision_details` table and three bounded-read
indexes; it is additive, creates no column on an existing table and rewrites no
existing row. Its `status != 'decided' OR decision_date IS NOT NULL` constraint
states in the database the same rule `validateCreateDecision` and
`validateWorkspaceSnapshot` enforce in the domain and in import/restore.
Decisions are included in workspace export, restore and purge classification.

Nothing else needs a table, and the People/Areas/Goals expansion adds no
migration of its own. Waiting items reuse canonical Tasks; MCP audit events
reuse Activity; Projects reuse `spine_records` + `project_details`; Areas reuse
`spine_records` + `area_details`; Goals reuse `spine_records` + `goal_details`;
People reuse `entities` + `person_details`; Notes reuse `entities` +
`note_details`; and every relationship — a Note to a Project, a Person to an
Area — reuses `entity_links` with the existing `link.related` type.

## Local development

1. Install and migrate as usual:

   ```sh
   pnpm install
   pnpm run db:migrate:local
   ```

2. Copy `workers/dalyhub-mcp/.dev.vars.example` to
   `workers/dalyhub-mcp/.dev.vars` and replace `DEV_MCP_TOKEN` with a random
   local value of at least 32 characters. `.dev.vars` is ignored; never reuse
   this token in production.
3. In one terminal run the app Worker through its normal Vite development
   process:

   ```sh
   pnpm dev
   ```

4. In a second terminal run the MCP Worker:

   ```sh
   pnpm mcp:dev
   ```

   Wrangler's local service registry connects the `DALYHUB` service binding to
   the locally running `dalyhub-v2` Worker. The MCP Worker remains the only
   public local MCP listener and still requires its development bearer token.

5. Test with the MCP Inspector (using the port printed by Wrangler):

   ```sh
   pnpm dlx @modelcontextprotocol/inspector
   ```

   Select Streamable HTTP, enter `http://localhost:<port>/mcp`, and add
   `Authorization: Bearer <DEV_MCP_TOKEN>`. Do not change production auth to do
   local testing.

Useful verification commands:

```sh
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
pnpm run mcp:deploy:dry-run
```

## Deployment

### Automatically handled in the repository

- `workers/dalyhub-mcp/wrangler.jsonc` defines the production Worker
  `dalyhub-mcp`, disables `workers.dev` and preview URLs, and binds `DALYHUB` to
  `dalyhub-v2-production::ChiefOfStaffEntrypoint`.
- `workers/app.ts` exports that named RPC entrypoint.
- generated Worker bindings live beside the MCP Worker and can be refreshed
  with `pnpm mcp:typegen`.
- authentication/JWT validation, tool validation, response shaping, domain
  services, migration, audit events and automated tests are in the repository.

### Manual Cloudflare setup required

These steps require the owner's Cloudflare account and must not be automated
with guessed identifiers.

1. Back up and migrate the production D1 database using the existing guarded
   flow:

   ```sh
   pnpm run db:production:backup
   pnpm run db:production:apply
   ```

2. Deploy the DalyHub application Worker first, using the existing production
   deployment workflow, so `ChiefOfStaffEntrypoint` exists on
   `dalyhub-v2-production`.
3. Store the MCP Worker secrets (values are not committed):

   ```sh
   pnpm exec wrangler secret put TEAM_DOMAIN --config workers/dalyhub-mcp/wrangler.jsonc --env production
   pnpm exec wrangler secret put POLICY_AUD --config workers/dalyhub-mcp/wrangler.jsonc --env production
   ```

   `TEAM_DOMAIN` is the full issuer, for example
   `https://<team>.cloudflareaccess.com`. `POLICY_AUD` is the AUD tag of the
   MCP Access application—not the web application's AUD unless both hostnames
   deliberately share one Access application.
4. Deploy the MCP Worker:

   ```sh
   pnpm run mcp:deploy:production
   ```

5. Cloudflare dashboard → **Workers & Pages** → **dalyhub-mcp** → **Settings** →
   **Domains & Routes** → **Add** → **Custom domain** → enter
   `mcp.daly.id.au`. Cloudflare creates the proxied DNS record; do not expose a
   separate origin. Confirm `workers.dev` and preview URLs remain disabled.
6. Cloudflare Zero Trust → **Access controls** → **Applications** → **Add an
   application** → **MCP server**. Protect `mcp.daly.id.au` (the whole hostname,
   including `/mcp` and OAuth discovery paths). Add an **Allow** policy whose
   Include rule is the owner's authorised email/identity; do not add an
   Everyone rule.
7. In that application's **Advanced settings**, enable **Managed OAuth** and
   dynamic client registration. Under **Allowed redirect URIs**, allow Claude's
   exact callback. Claude web currently uses
   `https://claude.ai/api/mcp/auth_callback`; prefer that exact URI over a broad
   wildcard. A local/loopback redirect is not required for the production
   Claude connector. Keep a short Access-token lifetime and a longer grant
   session duration.
8. Copy the application's **AUD tag** into the `POLICY_AUD` secret above. If it
   changed, update the secret and redeploy.

No OAuth client secret is required in Claude when Access Managed OAuth dynamic
client registration is enabled. Do not create or commit one merely to fill the
optional Claude advanced fields.

## Connect Claude

For an individual Claude plan: **Customize → Connectors → + → Add custom
connector**. For Team/Enterprise an Owner first uses **Organization settings →
Connectors → Add → Custom → Web**, after which the user connects it under
**Customize → Connectors**.

Use:

- Name: `DalyHub Chief of Staff`
- URL: `https://mcp.daly.id.au/mcp`
- OAuth client ID/secret: leave blank for Access Managed OAuth dynamic
  registration

Select **Add**, then **Connect**. Claude should open the Cloudflare Access login;
authenticate as the identity permitted by the Access policy. Connection is not
complete until this OAuth flow succeeds. Enable the connector for a conversation
from **+ → Connectors**.

Example prompts:

- “Check DalyHub and brief me. Use the Chief of Staff context first.”
- “What actually matters today, and what is overdue?”
- “What projects are stale, and what is the next action for each?”
- “Capture this as an idea, not a task: …”
- “Search for the OpO project, then add this task to the exact matching project.”
- “John replied; resolve the matching waiting item but do not complete the task.”
- “Record this decision and rationale: …”
- “Run my weekly review from DalyHub facts.”
- “Make this a new project under the Work area, then note the outcome on it.”
- “Save this as a note under the OpO project — it is context, not a task.”
- “What context have I already captured about Control 2? Read the note.”
- “That project is finished; mark it complete and archive it.”
- “Add Vaughn as a person. He's relevant to the OpO3 finance sessions.”
- “Create John Smith, District Manager at Orana.”
- “Create an area called Career Development, then a project under it called
  Capability 10/11 Application Preparation, then a task to update my resume.”
- “Create a goal to secure a Capability 10/11 role, targeting March next year.”
- “Waiting on Andrew to confirm the OpO3 finance presenter.”
- “Add a note to John's record that we discussed OpO3 finance delivery.”
- “What am I waiting on John for?”
- “What's going on in the Wedding area?”
- “I marked that done too early — reopen it.”

## Troubleshooting

- **Claude gets a 302 or never sees OAuth:** Managed OAuth is off or the hostname
  is protected as an ordinary self-hosted app without Managed OAuth. Enable it
  on the MCP Access application.
- **OAuth rejects the redirect URI:** add Claude's exact callback under Managed
  OAuth → Allowed redirect URIs. Avoid `*` host wildcards.
- **401 after successful login:** verify `TEAM_DOMAIN` includes `https://` and
  the correct `.cloudflareaccess.com` team domain; verify `POLICY_AUD` is this
  application's AUD tag; redeploy after secret changes.
- **RPC/service-binding failure:** deploy `dalyhub-v2-production` before
  `dalyhub-mcp`; confirm the production `DALYHUB` binding targets that exact
  service and named entrypoint.
- **Database error for decisions:** apply migration `0057` to `dalyhub-v2` after
  taking the required backup.
- **Inspector receives 401 locally:** use the development token from the MCP
  Worker's own `.dev.vars`, not the application's development auth token.
- **A title cannot be linked:** the name matched nothing. Search first and pass
  the exact returned ID; writes intentionally reject unknown parents and never
  invent one.
- **A tool answers `ambiguous_reference` instead of writing:** the name matched
  several records. That is the design — answer with the exact id from
  `matches`, and nothing was changed in the meantime.
- **A creation answers `possible_duplicate`:** DalyHub already holds a record
  with effectively that name (or, for a Person, that email). Use the existing
  record, or resend with `allowDuplicate: true` once the owner confirms.
- **An `update_*` cleared a field nobody mentioned:** it should not, and a
  regression test covers it. Omitted means unchanged; only an explicit `null`
  clears. The exceptions are documented: a Note's `content` and any `tags` set
  are replaced wholesale.

## Current official references

- [Cloudflare remote MCP server guide](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/)
- [Cloudflare MCP transports](https://developers.cloudflare.com/agents/model-context-protocol/protocol/transport/)
- [Cloudflare Access Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)
- [Validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Service Binding RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)
- [Local multi-Worker development](https://developers.cloudflare.com/workers/local-development/multi-workers/)
- [Claude custom remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
