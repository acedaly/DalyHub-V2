# IDENTITY_AND_ACTORS.md — Who did this, and how DalyHub knows

> How an authenticated request becomes a **named actor** on every activity,
> timeline, diary, audit, history and relationship event — the one resolution
> rule, where identity is stored, how to repair production history, and what to do
> when a name cannot be recovered.
>
> Decision & rationale: [ADR-071](../decisions/ARCHITECTURE_DECISIONS.md#adr-071-actor-identity--workspace-membership-read-time-name-resolution-and-one-canonical-rule).
> Related: [`APP_SHELL_AUTH.md`](APP_SHELL_AUTH.md) (how a request is authenticated),
> [`ACTIVITY_TIMELINE.md`](ACTIVITY_TIMELINE.md) (how events are rendered),
> [`PEOPLE_MODULE.md`](PEOPLE_MODULE.md) (the Person record a member links to).

---

## The chain

```
Cloudflare Access token        verified at the request boundary
  → AuthenticatedSession       { subject, email, displayName? }   (in memory, never persisted)
    → workspace_members        subject ↔ workspace + identity facts   (migration 0028)
      → Person record          optional link to entities(type='person')
        → display name         what every surface renders
```

The **stable actor id is the Access `sub`**, and it is what the Activity stream has
always stored in `activities.actor_id`. It is never an email — an email can change,
a subject cannot. Nothing about that changed; what IDENT-01 added is the row that
gives the subject a name.

---

## The one resolution rule

`app/kernel/identity` owns it. Everything — the workspace feed, every record
Timeline, Diary, People, mobile, the compact widgets, the design gallery and the
production repair script — resolves actors through
`resolveActorIdentity(actor, member)`. There is deliberately no second fallback
anywhere.

| # | Source | Renders |
| - | ------ | ------- |
| 1 | linked **Person/profile** display name (`entities.title`) | `Aidan Daly` |
| 2 | workspace member's **curated** display name | `Aidan Daly` |
| 3 | authenticated **provider** display name (the Access `name` claim) | `Aidan Daly` |
| 4 | verified **email** | `aidan@daly.id.au` |
| 5 | genuine automated **system** activity | `System` |
| 5b | the other non-human actor kinds (`ai` / `import` / `integration`) | `Assistant` / `Import` / `Integration` |
| 6 | an identified actor that genuinely cannot be resolved | `Unknown user` |

`Someone` is **not** a fallback and does not exist in the product. A unit test
fails the build if the word reappears in application source.

`System` means *the server did this on its own*, and it is only ever produced by
the system composition boundary (`resolveWorkspaceScope`), never by an
authenticated request falling through.

### Renaming — the documented behaviour

**Names are resolved at read time from the stable actor id.** There is no
event-time name snapshot. So renaming the linked Person (or changing the curated
member name) changes how *all* history reads, immediately and everywhere — one
record, many windows (AGENTS.md §3). If you ever need "the name they had at the
time", that is a new, deliberate decision requiring a new ADR; do not add a
snapshot column casually.

---

## Where identity is stored

`workspace_members` (migration 0028) — additive, forward-only, workspace-scoped:

| Column | Meaning |
| ------ | ------- |
| `workspace_id`, `subject` | the primary key. `subject` **equals** `activities.actor_id`. |
| `email` | last verified email, canonicalised. A display fallback, not an identifier. |
| `display_name` | owner-curated. Wins over provider data, and provisioning never overwrites it. |
| `auth_display_name` | the identity provider's name claim, refreshed on sign-in. |
| `person_entity_id` | optional link to a Person record in the same workspace (composite FK). |
| `created_at` / `updated_at` / `last_seen_at` | `updated_at` moves only when an identity value actually changes. |

It is **not** included in the workspace export: it holds authentication subjects,
and least exposure applies (AGENTS.md §17). Identity re-provisions itself on the
next sign-in.

### Provisioning

The request boundary (`app/platform/request/identity-provisioning.ts`) runs
`ensureMember` exactly **once per authenticated HTTP request** — one idempotent
upsert. It is best-effort: a storage failure is swallowed and the request
proceeds, because identity plumbing must never break a page. The consequence of a
failure is `Unknown user`, which is honest.

### Which code paths this covers

Every mutation in the product resolves its repositories through
`resolveAuthenticatedWorkspaceScope`, which binds the trusted actor once at the
composition boundary. A module method cannot supply or override it. So the actor
is correct by construction on all of these, with nothing per-path to remember:

diary entries · meetings and meeting items · task creation, updates, completion
and reopening · meeting-item-to-task conversion and direct follow-ups · project,
goal, area and task links · People and asset links · relationship creation and
removal · notes · status changes · archive, restore and permanent delete ·
recurring-task occurrences · quick actions · command-palette actions · the mobile
layouts (same routes) · replayed OFFLINE captures (they run through the same
authenticated routes when the device reconnects, so the event is attributed to
the person whose session replays it — the person who queued it).

The `system` actor is used deliberately and only by `resolveWorkspaceScope`, the
non-request composition. Its two current callers (the Goals and Projects search
providers) are read-only. An authenticated request never falls back to it.

---

## Rendering an actor

Server routes resolve the whole page's distinct actors up front and hand the pure
mapper a synchronous resolver — the same batching rule referenced entities already
follow (no N+1). One page of activity is a single query; only actors a membership
row could actually name are looked up, and a set larger than one statement can
bind is split across statements rather than truncated, so no real member is ever
mis-rendered as `Unknown user`:

```ts
import { createActivityActorResolver } from "~/platform/activity";

const resolveActor = await createActivityActorResolver(scope.actors, page.items);
const items = toActivityItems(page.items, { resolveActor, resolveEntity, descriptors });
```

The UI never resolves identity itself. `ActivityEventItem` renders the actor
through the one shared `ActivityActorName` component (initials chip + name), so the
treatment is identical on desktop, mobile and in compact widgets. A system or
unknown actor gets **no** initials chip — a letter badge would read as a person.

The serialised `ActivityItemActor` carries `label`, `initials`, `kind` and
`source` — and deliberately **not** the actor id. The Access subject never crosses
the wire.

---

## Event descriptions

A cross-module surface builds its descriptor map with
`buildWorkspaceActivityDescriptors(registry.listActivityTypes(), moduleOverrides?)`:

```
kernel lifecycle defaults
  → every module manifest's declared activityTypes labels
    → the shared curated cross-module set (entity marker, tone, joined-record sentences)
      → the module's own record-scoped descriptors, where it has them
```

The module manifest stays authoritative for an event type's **label** (FND-06);
the shared set adds only structure. `test/unit/activity-feed/activity-type-coverage.test.ts`
asserts the result covers every registered and every kernel-persistable type, so a
new module event cannot silently reach the generic fallback in production.

An event with no formatter still renders a readable humanised line and is never
hidden. The raw dotted type is a **development-only** diagnostic — production never
shows machine identifiers to the owner.

---

## Checking production identity

Run the repair script in its default **dry-run** mode. It writes nothing and
prints the whole picture: how many subjects the workspace knows, how many events
each authored, which membership rows exist, which People could be linked, and every
actor it cannot attribute.

```bash
CLOUDFLARE_D1_DATABASE_ID=<the real provisioned uuid> \
  node scripts/repair-activity-identity.mjs --workspace <DEFAULT_WORKSPACE_ID>
```

Locally: `pnpm run identity:report:local -- --workspace local-dev-workspace`.

What to confirm from the report:

- exactly **one** authenticated subject for a single-owner workspace (more than one
  means a second Access identity has written to it);
- that subject has a membership row;
- the row carries the expected email, and — if you want the Person's name to win —
  a `person_entity_id`;
- `Unresolved: none`.

---

## Repairing production

Every repair is additive to `workspace_members`, idempotent, and reported by
method. Nothing rewrites, duplicates or deletes an Activity row.

```bash
# 1. Provision membership for the subject the events already carry, and attach the
#    configured owner email (only applied automatically when the workspace has
#    exactly ONE authenticated subject — otherwise it refuses and says so).
CLOUDFLARE_D1_DATABASE_ID=<uuid> node scripts/repair-activity-identity.mjs \
  --workspace <workspace-id> --owner-email <OWNER_EMAIL> --apply

# 2. Give the owner their real name — either directly…
CLOUDFLARE_D1_DATABASE_ID=<uuid> node scripts/repair-activity-identity.mjs \
  --workspace <workspace-id> --subject <access-sub> --display-name "Aidan Daly" --apply

#    …or by linking their own Person record, so the name follows the profile.
CLOUDFLARE_D1_DATABASE_ID=<uuid> node scripts/repair-activity-identity.mjs \
  --workspace <workspace-id> --subject <access-sub> --person <person-entity-id> --apply

#    Naming a subject also resolves the ambiguity in step 1: in a workspace with
#    several recorded subjects, `--subject … --owner-email …` attaches the email
#    to that subject on the same run, and leaves the others unattributed.

# 3. Re-run the dry run. A correct repair is now a no-op.
CLOUDFLARE_D1_DATABASE_ID=<uuid> node scripts/repair-activity-identity.mjs \
  --workspace <workspace-id>
```

A Person whose `person_details.email` matches the member's verified email is linked
automatically (step 1 or a second pass); when several People share that email it
refuses and tells you to pass `--person`.

### Events recorded before authentication existed

Activity rows written by the pre-FND-09 system composition carry
`actor_type='system'` with **no** actor id. There is no evidence in the row about
who caused them, so they are **not** touched by default — they stay `System`, and
the dry run reports how many there are.

If you are certain they were owner actions, `--attribute-legacy-system` will
re-attribute them, and only under conditions that make the attribution safe:

- the workspace has exactly **one** candidate subject (it refuses otherwise);
- only rows with `actor_type='system' AND actor_id IS NULL`;
- only rows that occurred **strictly before** the workspace's first authenticated
  event — genuine later system activity is never touched.

This is the only operation in the repair that writes to `activities`. Take a backup
first (`pnpm run db:production:export -- --output backup.sql`).

---

## What cannot be repaired

An actor id with no email, no provider name and no Person record — for example a
second Access identity that has since been removed — is reported as
`no_identity_evidence` and renders `Unknown user`. That is deliberate: a misleading
name is worse than an honest gap, and this deployment is single-user only *today*,
which is not evidence about any particular past event.

---

## Tests

| Concern | Where |
| ------- | ----- |
| the canonical rule, every branch, and the `Someone` ban | `test/unit/identity/actor-identity.test.ts` |
| the shared actor component + the source-level regression guard | `test/unit/activity-feed/activity-actor.test.tsx` |
| every persisted event type has a renderer | `test/unit/activity-feed/activity-type-coverage.test.ts` |
| membership, batching, workspace isolation, boundary provisioning | `test/kernel/identity-actor-directory.test.ts` |
| the reported bug end to end through the real route loaders | `test/kernel/activity-actor-names-route.test.ts` |
| repair planning rules | `test/unit/identity/identity-repair-plan.test.ts` |
| repair against a real D1, including idempotency | `test/kernel/identity-repair.test.ts` |
| the browser journey, desktop and mobile | `e2e/activity-actor.spec.ts` |


## AI and the actor (AI-01, 2026-08-05)

AI is never an actor. The AI usage ledger stores the authenticated subject — the
same stable value the Activity stream uses as an actor id (IDENT-01), never an
email — so AI usage is attributable without introducing a second identity model.
When an owner accepts an AI proposal, the resulting Activity names **them**,
because they reviewed and approved it.
