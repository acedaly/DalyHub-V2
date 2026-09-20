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
single Project or Note, which is reversible through the same tool and leaves
every relationship and every Activity row intact.

## Tools

| Tool | Mode | Purpose |
|---|---|---|
| `get_chief_of_staff_context` | read | Bounded daily briefing: today/overdue/upcoming work, projects and next actions, stale projects, waiting, open decisions, captures, completions, deadlines and goals |
| `get_weekly_review_context` | read | Seven-day creates/completions, open commitments, overdue/waiting/decisions, project health, carry-over and the next 14 days |
| `get_today` | read | Today's tasks, overdue work and waiting follow-ups due in the owner timezone |
| `get_projects` | read | Active projects with concise progress, health and canonical next action |
| `get_project` | read | One project's context, tasks, waiting, decisions, linked notes, deadlines and recent activity |
| `get_note` | read | One Note in full: title, bounded Markdown body, tags and archive state |
| `search_dalyhub` | read | Bounded text search across tasks, projects, goals, areas, notes and decisions |
| `capture_item` | write | Quick intake of a task, reminder, note, idea, open decision or waiting item |
| `create_task` | write | Create a normal task under an exact existing Project or Area when supplied |
| `update_task` | write | Non-destructive task edits and parent movement |
| `complete_task` | write | Idempotently complete a task |
| `create_project` | write | Create a Project for a multi-step outcome under an exact existing Area or Goal |
| `update_project` | write | Rename, restatus, move, complete/reopen or archive/restore one Project |
| `create_note` | write | Create a Note holding retained context, filed under exact existing records |
| `update_note` | write | Retitle, replace body/tags, file further, or archive/restore one Note |
| `record_decision` | write | Record a decided outcome, rationale and optional review/relationship |
| `create_waiting_for` | write | Create a task in DalyHub's canonical waiting/delegation state |
| `resolve_waiting_for` | write | Idempotently clear waiting state without deleting history |

IDs are opaque DalyHub entity IDs. Claude should call a read/search tool before
linking a write and must not infer an ID from a title. The write tools never
create a parent record implicitly: `create_task` and `create_note` will not
invent a Project, and `create_project` will not invent an Area or Goal.

There is deliberately no delete, merge, bulk-mutation, SQL, database-export,
auth-modification, filesystem or arbitrary-HTTP tool. Archiving a Project or a
Note is the reversible "put it away" operation and is the closest this interface
comes to removal.

## What each domain means

The Chief of Staff must not turn every input into a Task. DalyHub's own model
decides which record an input becomes:

| Input | Record | Tool |
|---|---|---|
| An action someone must do | **Task** | `create_task` |
| An outcome needing several actions | **Project** | `create_project` |
| Context or reference worth keeping | **Note** | `create_note` |
| A choice and why it was made | **Decision** | `record_decision` |
| A dependency on another person or event | **Waiting** | `create_waiting_for` |
| Unclassified quick input | **Capture** | `capture_item` |

The structural hierarchy is DalyHub's existing FND-07 spine — Area → Goal →
Project → Task. Notes and Decisions hang off it rather than sitting inside it:

```text
Area
 └─ Goal
     └─ Project
         ├─ Tasks          (structural spine children)
         ├─ Notes          (link.related, many-to-many)
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

This covers every write: Task create/update/complete, Project create/update,
Note create/update, decision recording, waiting creation and resolution, and
capture. The domain repositories underneath append their own canonical events
too (`entity.created`, `project.status_changed`, `note.content_updated`, …), so
an MCP write is legible on the record's own Timeline as well as in the MCP audit
trail.

Idempotent no-ops do not append duplicate MCP audit events: an `update_project`
or `update_note` that changes nothing returns `changed: false` and writes no
`mcp.mutation` row, matching `complete_task` and `resolve_waiting_for`. Access tokens,
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

Nothing else needs a table. Waiting items reuse canonical Tasks; MCP audit
events reuse Activity; Projects reuse `spine_records` + `project_details`; Notes
reuse `entities` + `note_details`; and a Note's relationship to a Project, Area
or Goal reuses `entity_links` with the existing `link.related` type.

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
- **A title cannot be linked:** search first and pass the exact returned ID;
  writes intentionally reject fuzzy/unknown parents.

## Current official references

- [Cloudflare remote MCP server guide](https://developers.cloudflare.com/agents/model-context-protocol/guides/remote-mcp-server/)
- [Cloudflare MCP transports](https://developers.cloudflare.com/agents/model-context-protocol/protocol/transport/)
- [Cloudflare Access Managed OAuth](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/)
- [Validate Access JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)
- [Service Binding RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)
- [Local multi-Worker development](https://developers.cloudflare.com/workers/local-development/multi-workers/)
- [Claude custom remote connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp)
