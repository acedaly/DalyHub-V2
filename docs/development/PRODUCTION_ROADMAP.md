# Production roadmap project

DalyHub can create an operational copy of the outstanding `ROADMAP_V2.md` work in the configured production workspace without bypassing the Area → Goal → Project → Task contracts.

## Commands

```bash
pnpm run roadmap:production -- --dry-run
pnpm run roadmap:production -- --apply --confirm "CREATE DALYHUB ROADMAP"
```

The caller must first load the existing local production environment file. The command requires `CLOUDFLARE_D1_DATABASE_ID` and `PRODUCTION_DEFAULT_WORKSPACE_ID` and refuses to run when production has pending D1 migrations.

## Safety model

- The CLI parses the current `docs/roadmap/ROADMAP_V2.md`; outstanding items are not maintained as a second hard-coded list.
- A temporary, owner-only Wrangler configuration runs a one-off Worker locally with only its D1 binding marked `remote: true`. No Worker route is created and no code is deployed.
- The Worker resolves the configured workspace through `resolveWorkspaceScope` and writes only through the workspace-bound Spine, Goal Details, Project Settings and Task repositories.
- Dry-run performs reads only. Apply requires the exact confirmation phrase.
- Existing records are matched by exact normalised title. Duplicate matches, hierarchy conflicts, an archived roadmap Project, a different Goal definition, a workspace mismatch or pending migrations fail closed.
- Each repository mutation is atomic with its Activity event. A stopped run is safe to retry; already-created records are reused and no-op mutations append no new Activity.
- The command never runs migrations, creates a workspace, deploys code, edits Access settings, deletes data, assigns due dates or invents historical timestamps.

## Records

The operation creates or reuses:

- Area: `Personal Systems & Development`
- Goal: `Complete DalyHub V2`
- Project: `DalyHub V2 Development Roadmap`, set to `Active`
- one open Project Task for every current `☐` or `◐` roadmap item
- a small completed milestone Task for each fully completed phase: Foundation, shared design system, Today, Projects, and Areas/Goals/Alignment

Task descriptions carry the roadmap phase, priority, dependencies, purpose, expected outcome and an operational horizon. They do not set due dates or priorities to simulate unsupported roadmap columns.

## Visualisation available now

The Project record provides authoritative completion roll-up, open/completed task filters, workflow status, Area/Goal context and the shared Activity Timeline. The Goal shows Project contribution and Alignment; the Area shows roll-ups and momentum. Open tasks can appear through Today when they meet Today’s actual planning rules.

DalyHub does not yet provide a dedicated Project board, milestone entity or Gantt-style roadmap timeline. The Activity Timeline is historical event activity, not a Gantt chart.
