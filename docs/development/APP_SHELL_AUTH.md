# App Shell & Authentication (FND-09)

How DalyHub authenticates requests, composes the authenticated workspace,
derives routing and navigation from the module registry, and applies the theme.
This document is the working reference for FND-09; the decision record is
[ADR-016](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing).

## Request & authentication flow

```text
browser request
    ↓
Cloudflare Access policy (protects the custom hostname)
    ↓  injects Cf-Access-Jwt-Assertion
DalyHub Worker request boundary (workers/app.ts → handleAuthenticatedRequest)
    ↓  cryptographically validates the JWT (jose)
authenticated owner session  { user: { subject, email }, issuedAt, expiresAt }
    ↓  placed in React Router's typed request context (never a client header)
trusted WorkspaceContext  (configured DEFAULT_WORKSPACE_ID, request-free resolver)
    ↓
trusted Activity actor  { type: "user", id: session.user.subject }
    ↓
React Router loaders / actions / module routes
```

No protected loader or action runs before authentication succeeds: the boundary
returns a generic response and never invokes the React Router handler on failure.

## Why Cloudflare Access is still validated in the Worker

Cloudflare Access is the identity-aware proxy and session provider, but a header
or cookie can be spoofed on any origin that Access does not protect (for example
an exposed `workers.dev` route). DalyHub therefore verifies the signed Access
application token itself on every protected request. It never trusts the mere
presence of `Cf-Access-Jwt-Assertion`, an unverified payload, the
`CF_Authorization` cookie, or any client-supplied identity header.

## Required configuration

All values are trusted, server-side configuration — never request input, never
committed with real values.

| Variable | Purpose |
| --- | --- |
| `AUTH_MODE` | `cloudflare-access` (production/default) or `development`. Missing → `cloudflare-access`; unknown → fails closed. |
| `ENVIRONMENT` | `development` / `test` / `preview` / `staging` / `production`. Gates development auth and the `Secure` theme cookie. |
| `ACCESS_TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com`. The token issuer and JWKS base. HTTPS only, no path/credentials. |
| `ACCESS_AUD` | The Access application Audience (AUD) tag the token must carry. |
| `OWNER_EMAIL` | The single owner's email; enforced independently of the Access policy. |
| `DEFAULT_WORKSPACE_ID` | The configured workspace scope (FND-03). |
| `DEV_AUTH_SUBJECT`, `DEV_AUTH_EMAIL` | Fixed development identity (development mode only). |

The only committed auth value is `AUTH_MODE="cloudflare-access"` (a non-secret
default pinning the secure mode), and it **fails closed**: with no team domain /
AUD / owner configured, the Worker rejects every protected request rather than
letting anyone in. Those three values are supplied ONLY at deploy time
(`wrangler secret` / dashboard bindings) and are deliberately **not** declared as
`vars` in `wrangler.jsonc` — a committed (even empty) `var` of the same name
would override the deploy-time secret and clobber it. The auth configuration
reads them as optional, so they need not appear in the generated `Env` type.

### Production environment guarantees

The committed `wrangler.jsonc` top-level config is the LOCAL/development
environment; a named `env.production` environment (selected with
`CLOUDFLARE_ENV=production`, driven by `pnpm run deploy:production`) pins the
production invariants:

- `ENVIRONMENT` is **always** `production` — so the development authenticator can
  never activate (it requires a `development`/`test` `ENVIRONMENT`) and the theme
  cookie is **always** `Secure`;
- `AUTH_MODE` is **always** `cloudflare-access` — production can never enable
  development auth;
- the real remote D1 database id, the provisioned workspace id and the Access
  team domain / AUD / owner email are **never committed** — they are supplied at
  deploy time and the deploy fails before any upload if they are missing or still
  a placeholder.

The full flow (and the credential-free `deploy:dry-run` used by CI) is in
[DEPLOYMENT.md](./DEPLOYMENT.md).

## JWT claim requirements & owner enforcement

The Worker verifies, via `jose` against `<team>/cdn-cgi/access/certs`:

- a valid RS256 signature (algorithm pinned; no algorithm confusion);
- `iss` equals the configured team domain;
- `aud` contains the configured AUD tag;
- `exp` present and in the future, `nbf` (if present) satisfied;
- a non-empty `sub` (the stable actor id);
- a present, well-formed, normalised `email`;
- the token is an **identity** token, not a service token (a `common_name` /
  empty `sub` shape is rejected);
- the normalised email equals `OWNER_EMAIL` (trimmed-lowercase). A valid Access
  JWT for any other identity is rejected, protecting against an accidentally
  broadened Access policy.

The JWKS is fetched through `jose`'s bounded remote cache (created once per
config, reused across warm invocations); the Access identity endpoint is never
called per request. The raw JWT never enters loader data, React context, HTML,
logs, Activity payloads, client bundles or error messages. Failures map to
generic responses (`401` missing credentials, `403` invalid/expired/owner-
mismatch, `503` misconfiguration/infrastructure) with no token or claim detail.

## Session & identity types

```ts
type AuthenticatedUser = { readonly subject: string; readonly email: string };
type AuthenticatedSession = {
  readonly user: AuthenticatedUser;
  readonly issuedAt: Date;
  readonly expiresAt: Date;
};
interface Authenticator { authenticate(request: Request): Promise<AuthenticatedSession>; }
```

The kernel contract (`app/kernel/auth`) is storage- and provider-independent: it
imports no Cloudflare, `jose`, React, React Router, D1, Vite or environment code.
The Cloudflare Access verifier, the development authenticator and configuration
live in `app/platform/auth`.

## Why there is no users / sessions table

Identity is derived from the Access token per request and held only in memory.
Theme remains a device/browser-local cookie. SET-01 adds owner/workspace
application preferences (`owner_app_preferences`) keyed by authenticated subject,
but it still persists **no** JWT or session. A persisted user/profile model is
introduced only when the product needs editable profile state or multiple users.

## Authenticated workspace resolution & Activity actor

Authentication answers *who*; the workspace answers *which trusted scope*. The
session never selects a workspace. `resolveAuthenticatedWorkspaceScope(env,
session)` resolves the configured `DEFAULT_WORKSPACE_ID` through the existing
request-free resolver and binds every workspace-scoped repository (entities,
EntityLinks, spine, read-only Activity) to the same `WorkspaceContext` and the
same Activity actor `{ type: "user", id: session.user.subject }`. Module method
calls cannot supply or override the actor. The `system` actor remains available
for genuinely system-initiated background work.

## Development auth mode and its safeguards

For local development and CI, a separate development authenticator runs behind
the same `Authenticator` contract. It is safe by construction:

- enabled only when `AUTH_MODE=development` **and** `ENVIRONMENT` is explicitly
  `development` or `test`; otherwise it fails closed;
- never activated by a request header, cookie, query parameter or hostname;
- no "accept any JWT" path and no `import.meta.env.DEV` bypass;
- the identity is fixed server-side (`DEV_AUTH_SUBJECT` / `DEV_AUTH_EMAIL`) and
  validated; the request is ignored entirely.

## Local setup

```bash
pnpm install
cp .dev.vars.example .dev.vars   # development auth identity; git-ignored
pnpm run db:migrate:local        # apply migrations 0001–0005 to local D1
pnpm run dev                     # react-router dev reads .dev.vars
```

`pnpm run dev` runs the development authenticator and serves the authenticated
shell as the fixed local identity. Since SET-01, the authenticated shell and `/`
root route read the active workspace preference row, so the configured workspace
must exist in local D1. The e2e setup provisions `local-dev-workspace`
automatically; for manual development use `pnpm run db:migrate:local` and the
workspace insert documented in [`DATA_KERNEL.md`](DATA_KERNEL.md#creating-a-local-workspace).

## Logout

Logout is an ordinary link to Cloudflare's managed endpoint,
`/cdn-cgi/access/logout`, which clears the Access session. DalyHub never
simulates logout by deleting a local cookie and never puts the JWT in the URL.

## Public `/health` boundary

`/health` is the only unauthenticated application route, matched **exactly** (so
`/health-anything` is not exempt). It returns the small JSON liveness payload
with its own cache policy and exposes no private data. Every other path requires
authentication, including React Router data/manifest requests.

## Module route registration & navigation

Modules own their routes. Each module declares route descriptors in
`app/modules/<id>/routes.manifest.ts` (imported by its `module.ts` manifest) and
provides the module-owned route file it references. `app/routes.ts` globs the
manifests and composes the framework route tree; primary navigation is derived
from the same route metadata (`meta.navLabel`, `navOrder`, `navGroup`). Adding a
navigable module route requires only a manifest entry plus the route file —
**never** editing `app/routes.ts`, a central navigation array or any switch.

SET-01 layers owner/workspace navigation visibility over that registry-derived
canonical list. The shell resolves `WorkspaceScope.appPreferences`, normalises
hidden module ids against `getPrimaryNavigation()`, keeps Today and Settings
visible, and renders the same filtered list on desktop and mobile. Hidden modules
remain reachable by direct URL and search; route composition is unchanged.

The authenticated index route (`/`) also reads the same preference record and
redirects to the preferred existing destination. Invalid or unavailable stored
values fall back to `/today`; deep links to every other route bypass this logic.

### MOBILE-01 phone navigation (the registry capability)

MOBILE-01 replaces hamburger-only phone navigation with a persistent bottom bar —
`Today · Tasks · Capture · Diary · More` — WITHOUT introducing a second module
list. The bar is derived from the same registry-driven navigation model the
desktop rail renders.

A route earns a bottom-bar slot by declaring a new, validated `RouteMeta`
capability in its OWN manifest:

```ts
// app/modules/today/routes.manifest.ts
{
  id: "today.index",
  path: "today",
  file: "routes/index.tsx",
  meta: { navLabel: "Today", navOrder: 5, mobilePrimaryOrder: 10 },
}
```

- `mobilePrimaryOrder` is validated like any other ordering hint, so a malformed
  manifest **fails composition (and the build)** rather than silently dropping a
  destination. It additionally requires `navLabel` — a phone primary destination
  must be a navigable route.
- The pure model in
  [`app/shared/shell/mobile-navigation.ts`](../../app/shared/shell/mobile-navigation.ts)
  sorts by `mobilePrimaryOrder`, then `navOrder`, then registry position, and caps
  the result at `MOBILE_PRIMARY_DESTINATION_LIMIT` (3) so the bar can never exceed
  its five-control budget. Capture sits mid-bar; More is always last.
- The shell passes the **already SET-01-filtered** navigation in, so a module the
  owner hid disappears from the bar for free.
- **More opens the SAME complete navigation sheet** (`MobileNav`) the hamburger
  opened, so every module — including any future one — stays one tap away.

Adding, removing or reordering a phone destination is therefore a one-line
manifest edit in the owning module. The shell holds no module list and cannot
drift from the registry. See
[ADR-058](../decisions/ARCHITECTURE_DECISIONS.md#adr-058-registry-driven-phone-navigation-and-quick-capture-as-a-shared-shell-framework).

### MOBILE-01 shell-mounted providers

The AppShell mounts, exactly once each and in addition to the DS-09/DS-10
providers it already carried:

| Provider | Purpose | Cost to the initial bundle |
| --- | --- | --- |
| `CaptureProvider` | The ONE shared Quick Capture surface, opened from anywhere via `useCapture()` | A context and a lazy boundary — the sheet and every panel are `lazy()` |
| `MobileTopBarProvider` | Lets a route publish its phone top-bar title, Back target and contextual actions | State only |
| `useKeyboardInset` | The ONLY Visual Viewport listener in the product; publishes `--dh-keyboard-inset` | One listener, one CSS custom property |

`GET /capture/context` is a shell-owned JSON resource route (alongside `/search`,
`/commands` and `/links`) serving the owner timezone, today's calendar date and
the re-verified default Task capture parent. It is fetched **on demand** when a
capture panel needs it — deliberately not from the app-shell loader, which runs on
every navigation and would add a workspace read just to draw the bar.

### FND-06 route-contract refinement

FND-06 modelled a route's module reference as a lazy `() => import(...)` thunk.
React Router v8 framework mode composes routes from **build-time file
references** and offers no runtime import-thunk seam, so the contract is now a
declarative, module-relative **`file`** string resolved to
`app/modules/<module-id>/<file>` and validated to stay inside the owning module.
It remains fully lazy (React Router code-splits each route module) and fully
registry-driven. See [ADR-016 §5.10](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing)
and [MODULES.md](./MODULES.md).

## Theme preference behaviour

`system` / `light` / `dark`, default `system`. The preference is intentionally
device/browser-local and is stored in a same-site, HttpOnly, bounded cookie
(`Secure` in non-development environments). The root layout reads it server-side,
so `<html data-theme>` is correct on the first byte — no light-to-dark flash, no
client cookie reading, no `localStorage`, no state library. Invalid values fall
back to `system`. Changing the theme is a POST to `/preferences/theme` that sets
the cookie and redirects back (same-origin, validated). Theme changes touch no
database and record no Activity. The `/settings?section=appearance` route reuses
this exact authority; it does not duplicate theme state in D1.

## Security headers

Every response carries baseline headers, applied at the boundary:
`X-Content-Type-Options: nosniff`, `Referrer-Policy:
strict-origin-when-cross-origin`, a restrictive `Permissions-Policy`,
`X-Frame-Options: DENY`, and a minimal CSP (`base-uri 'none'; frame-ancestors
'none'; object-src 'none'` — deliberately no `script-src`, which would break
React Router hydration). Every authenticated response leaves the boundary with
exactly `Cache-Control: private, no-store`: any route-provided cache policy is
**overridden**, never preserved, so private application data can never be cached
by the browser, a shared/CDN cache or an intermediary. The public `/health` route
is served on the unauthenticated path and keeps its own independent public-route
cache policy. Framework stack traces are never emitted outside development.

## workers.dev / custom-domain deployment requirements

Cloudflare Access protects the configured Access hostname. An unprotected
alternate Worker hostname (for example the default `workers.dev` route) must not
become a bypass to private data. The named `env.production` config commits
`workers_dev: false` and `preview_urls: false` so both alternate origins are
disabled, and Access protects the dashboard-managed custom hostname. **In the
verified production deployment (2026-07-18)** the custom hostname
(<https://hub.daly.id.au>) is Access-protected, the JWT is validated in the Worker
(as here) against the exact issuer/AUD/owner, migrations `0001`–`0005` were applied
before deployment, the direct `workers.dev` origin is disabled (404) and Preview
URLs are disabled. See [DEPLOYMENT.md](./DEPLOYMENT.md).

## FND-01 production deployment (verified)

FND-09 shipped with production-equivalent JWT verification proven locally and in
CI. FND-01's **live** Cloudflare deployment has since been completed and verified
(2026-07-18): the production Worker `dalyhub-v2-production` runs on the real team
domain / AUD / owner and provisioned remote D1, with the authenticated owner shell
loading through Cloudflare Access. FND-01 is now `☑ Done`. Real production
identifiers and secrets remain uncommitted. See
[DEPLOYMENT.md](./DEPLOYMENT.md).

## What FND-09 deliberately does not build

The Design System (DS-01) and any product experience: Areas/Goals/Projects/Tasks
functionality, collections, cards, boards, filters, forms, record layouts, the
command palette, global search, settings screens, Today/dashboards, the Activity
Feed/Timeline UI, multi-user permissions, invitations, workspace switching, a
users/sessions/preferences/theme table, or a local password/OAuth stack.

## Related documents

- [ADR-016](../decisions/ARCHITECTURE_DECISIONS.md#adr-016-cloudflare-access-identity-app-shell-and-registry-driven-routing) — the decision record.
- [MODULES.md](./MODULES.md) — the module registry and route contribution contract.
- [DATA_KERNEL.md](./DATA_KERNEL.md) — workspace composition and the Activity actor.
- [DEPLOYMENT.md](./DEPLOYMENT.md) — deployment, secrets and the origin-bypass risk.
- [REFERENCE_PRODUCTS.md](../reference/REFERENCE_PRODUCTS.md) — the `jose` dependency evaluation.
