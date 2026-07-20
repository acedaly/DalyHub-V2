# COMMAND_PALETTE.md — The Command Palette & Quick Actions system (DS-09)

> How the keyboard shell works in DalyHub: an entity-agnostic Command Palette
> (`⌘K` / `Ctrl+K`) that merges contextual actions, registry-discovered commands
> and DS-08 record Search into one list, plus a shared action model that makes ONE
> action appear as a palette command, a Card action, a Record Header action and a
> keyboard action. Decision record:
> [ADR-024](../decisions/ARCHITECTURE_DECISIONS.md#adr-024-command-palette--quick-actions--command-kinds-trusted-catalogue-authenticated-execution-and-one-shared-action).

---

## What it is

The palette is the shell of the OS: anything you can do by clicking, you can do by
typing. It is **entity-agnostic** — [`app/shared/commands`](../../app/shared/commands)
contains no Task/Project/Today rule, no D1, no workspace selection, no
product-repository import and no Drawer-key parsing. Modules contribute **commands**
through the [module registry](MODULES.md); the current surface contributes transient
**contextual actions**; DS-08 contributes record results. The palette merges all
three without confusing them.

## The layers

| Layer | Location | Imports | Responsibility |
|---|---|---|---|
| Command contract | [`app/kernel/modules`](../../app/kernel/modules) | kernel only | The discriminated `navigate`/`execute` `CommandContribution`, `CommandRuntimeContext`, `CommandExecutionOutcome`, the navigation-target validator, reserved-shortcut refusal. React-free, storage-free. |
| Model | [`~/shared/commands/model`](../../app/shared/commands/model.ts) | kernel + DS-08 model (types) | Catalogue validation/decode, ranking, grouping, merge with Search, the shortcut model, the presentation context, the execution state machine, bounds. **No React** (import-guard tested). |
| Server boundary | [`app/platform/commands`](../../app/platform/commands) | kernel, registry, model | Build the serialisable catalogue (handlers omitted); run a command by id under a deadline. |
| Resource routes | [`app/routes/commands.ts`](../../app/routes/commands.ts), [`app/routes/command-execute.ts`](../../app/routes/command-execute.ts) | platform | `GET /commands` (catalogue) and `POST /commands/:commandId` (authenticated execution). |
| React runtime | [`app/shared/commands`](../../app/shared/commands) | model + React + DS-08 UI | The provider, hooks, the lazy-loaded `CommandPalette`, the shortcut dispatcher, the Card/Header adapters, the transports. |
| Shell wiring | [`app/shared/shell/AppShell.tsx`](../../app/shared/shell/AppShell.tsx) | commands runtime | Owns open state, `Mod+K`/`/`, mutual exclusion, focus restoration. |

## The command contract (FND-06, refined by DS-09)

A module declares commands in its manifest. A command is a discriminated union — a
declarative navigation OR a server-executed action, never both, never neither:

```ts
export default defineModule({
  id: "today",
  name: "Today",
  commands: [
    // A NAVIGATION command: a validated target, no handler. Runs on the client.
    {
      id: "today.open",
      title: "Go to Today",
      keywords: ["home", "dashboard"],
      kind: "navigate",
      target: { kind: "route", to: "/today" }, // reuses DS-08 SearchResultTarget
    },
    // An EXECUTABLE command: runs once through the authenticated server boundary.
    {
      id: "notes.capture",
      title: "Capture a note",
      kind: "execute",
      run: async ({ workspace, signal }) => {
        // ...authorised server work, honouring `signal`...
        return { ok: true, message: "Captured." };
      },
    },
  ],
});
```

Rules the registry enforces at construction:

- a command is `navigate` (has `target`, no `run`) or `execute` (has `run`, no
  `target`) — anything else throws;
- the navigation target is validated (app-relative only; `javascript:`, `//…`,
  external URLs and control characters are rejected);
- command ids are namespaced under the module (`today.open`);
- a command may not reassign a reserved global shortcut (`Mod+K`, `/`);
- the handler is stored but NEVER invoked to build the registry.

`CommandHandler` receives a `CommandRuntimeContext` (`{ workspace, signal }`) and
returns a typed `CommandExecutionOutcome` — `{ ok: true; message?; target? }` or
`{ ok: false; reason: "unavailable"|"conflict"|"failed"; message }`. It never
throws a raw error and never returns SQL, a stack trace or an infra code.

## The catalogue (browser transport)

The browser needs metadata, not handlers. `GET /commands` returns the catalogue
built from `ModuleRegistry.listCommands()` — bounded, deterministic, ownership
retained, **handlers omitted** (a navigation command carries its validated target;
an executable command carries only its kind). The browser decodes it with
`decodeCommandCatalogue` (never a cast); a structurally-unusable response becomes a
calm palette error state, and record Search still works.

## Executing a command

- **Navigation** runs on the client: the palette navigates to the validated target
  (reusing DS-08's Drawer/route helper) and closes.
- **Execution** posts the command id to `POST /commands/:commandId`. The route
  requires the session (401), resolves the trusted workspace via
  `resolveAuthenticatedWorkspaceScope` (never client-supplied), looks up the exact
  command, rejects unknown (404) and navigation-only (400) commands, runs the
  handler ONCE under a bounded deadline + cancellation signal, and returns a typed
  outcome. There is no automatic retry — a retry is a deliberate new invocation.
  The client blocks a duplicate activation while one is pending, and a monotonic
  token stops a stale response settling a newer activation.

The browser submits only the command id. Module id, title, target and any "flag" it
saw in catalogue metadata grant no authority: authority comes from the
server-resolved workspace and the registry.

## Contextual actions

Registered commands are immutable and global/module-relevant. **Contextual actions**
are transient — supplied by the current surface, Drawer or selection:

```tsx
useRegisterContextualActions(
  useMemo<AppAction[]>(
    () => [
      { id: "today.action.focus_capture", title: "Focus Quick Capture",
        kind: "run", run: () => { focusCapture(); return { ok: true }; } },
    ],
    [focusCapture],
  ),
);
```

They live in `CommandContextProvider` (mounted once at the AppShell boundary), are
removed automatically on unmount (no stale action survives a route/Drawer change),
are deterministically ordered and de-duplicated by id, and are bounded. A contextual
action may close over a record the current UI knows — but the client context is
never treated as server authority; a persistent mutation still calls an authorised
server action. The shared infrastructure never parses an opaque Drawer key: the
owning surface (e.g. Today) decides when a `task:<id>` action is relevant.

The registration re-runs whenever the actions array reference changes, so the
registry always holds the latest closures (`target`/`run`) — a surface that
re-renders with a fresh selection is never activated against a stale one. This does
not loop: registration writes the (separate) list context that only the palette
subscribes to, not the stable registry context the surface holds. Memoise the array
(as Today does) when its content is unchanged, to avoid needless re-registration.

### Disabled vs unavailable

A contextual action carries an optional `disabled` flag. **Disabled ≠ unavailable**:
an unavailable action is simply omitted from the registration; a *disabled* action is
still shown — so the surface stays legible — but cannot be used. The disabled state
travels the whole pipeline (`AppAction` → `appActionToPaletteCommand` →
`PaletteCommand` → ranked command → `PaletteOption` → rendering); it is never derived
from CSS or looked up only at render time. Registered catalogue commands are never
disabled.

A disabled palette option:

- renders as a **non-interactive** element (no `button`/`link`, no click/hover-to-activate)
  with `aria-disabled="true"` and a visible **“Unavailable”** text cue — never
  colour/opacity alone;
- is **skipped by keyboard selection** (see below), so `Enter` and
  `aria-activedescendant` never target it;
- is refused by the controller's `activate()` guard — the authoritative safety
  boundary — so even a click/Enter that reached it would not navigate, run, enter a
  pending state, be added to recents, or close the palette;
- is not re-invokable through **Retry**: if an action becomes disabled (or is removed)
  after it failed, Retry clears the stale banner instead of re-running it;
- yields a keyboard `ShortcutBinding` with `enabled: false` via
  `appActionToShortcutBinding`, so the one shared dispatcher never fires it — the same
  meaning of “disabled” as the Card and Record Header adapters.

## One shared action, four surfaces

`AppAction` is one identity with one execution path. Adapters project it into the
existing DS-04 Card and DS-02 Record Header contracts — no new components:

```tsx
const star: AppAction = { id: "notes.star", title: "Star", kind: "run",
  run: () => ({ ok: true, message: "Starred." }) };

<Card quickActions={[toCardAction(star, { onActivate })]} />
<RecordHeader primaryAction={toRecordAction(star, { onActivate, variant: "primary" })} />
// ...and the same `star` appears in the palette as a contextual action.
```

## Keyboard vocabulary

ONE shared dispatcher (`useCommandShortcuts`) owns all shortcuts — never a listener
per command. It normalises `mod` to Meta on macOS and Control elsewhere, ignores
ordinary shortcuts while typing (permitting the reserved `Mod+K`), ignores
auto-repeat, resolves collisions by precedence (one event → one action), and
`preventDefault`s only when a binding claims the event. Reserved vocabulary:

| Key | Meaning |
|---|---|
| `Mod+K` | Command Palette |
| `/` | Search |
| `g` + letter | Go-to chords (reserved for registered navigation) |
| `↑`/`↓`, `j`/`k` | Movement |
| `x` | Selection |
| `Enter`/`o` | Open |
| `e` | Primary contextual quick action |
| `Escape` | Clear or dismiss the top-most state |
| `?` | Shortcuts overlay (reserved) |
| `[` | Sidebar (reserved) |

### Command-declared shortcuts (navigation dispatched; executable deferred)

`CommandShortcutLayer` installs that single dispatcher app-wide (mounted once inside
`CommandContextProvider`) with the reserved bindings **plus** the shortcuts declared
by commands that navigate — both registered `navigate` commands (from the `/commands`
catalogue) and contextual `navigate` actions. A declared navigation shortcut
therefore actually navigates, not just shows a hint. Precedence is deterministic:
reserved → contextual → registered, so one key event still fires at most one action;
a disabled action yields an `enabled: false` binding and never fires.

**Executable** command / contextual-run shortcuts are intentionally NOT dispatched
globally yet: firing one with the palette closed runs it through the authenticated
boundary and needs a pending/success/failure surface *outside* the palette — the
DS-10 global feedback surface, which DS-09 excludes. Because those shortcuts cannot
currently run app-wide, the palette **does not advertise them**: a shortcut hint is
shown only for a `navigate` command/action (whose shortcut is actually dispatched),
never for an executable command — so no hint promises a control that does nothing.
Global dispatch (and the hint) for executable shortcuts lands with DS-10. Wiring
navigation shortcuts loads the catalogue in the always-on shell (a deliberate,
documented departure from the otherwise fully-lazy palette posture — it pulls only
the small catalogue transport and the pure navigation helper, never the palette UI).

Modules extend the vocabulary; they never reassign a reserved shortcut (the kernel
refuses it).

### Selection policy: skip-disabled

Movement within the list (`↑`/`↓`, Home/End, and their wrapping) **skips disabled
options** — the active option is always one `Enter` can run, and
`aria-activedescendant` is absent when no enabled option exists (e.g. an all-disabled
result set). The active index is *resolved during render* (the raw intent is clamped
to the nearest enabled option) rather than corrected in an effect, so there is no
extra render and no race with a just-typed `Enter`. Pointer hover likewise never
lands the active state on a disabled option. This is the WAI-ARIA-permitted
“skip-disabled” combobox policy; the alternative (focusable-but-inert disabled
options) was not chosen.

## Search reuse

The palette does not implement a second search. It composes DS-08's
`useSearchController` and reuses its normalisation, `/search` endpoint, decoder,
stale-request control, target validation, navigation helper and highlighting.
Command results appear immediately while record search loads; a stale Search
response cannot overwrite newer input; a partial or total Search failure leaves
commands fully usable.

## Development demonstration

[`/design/command-palette`](../../app/routes/design-command-palette.tsx) is a
development-only fixture (excluded from production by the `NODE_ENV` guard in
[`app/routes.ts`](../../app/routes.ts)). It drives the real palette against
in-memory fakes to demonstrate every state: registered navigation/executable
commands, contextual actions appearing/disappearing, fuzzy matching, record
results, partial/total Search failure while commands stay usable, execution
success/failure/timeout, duplicate-activation prevention, long content, and the
Card/Record-Header adapters. No fixture command claims a persistent mutation that
did not happen.

## What DS-09 deliberately does NOT do

No DS-10 toast/Undo, Inspector or Settings; no full shortcuts-help overlay; no
product CRUD or Task/Project/Note persistence; no natural-language parsing, macros,
scripting, arbitrary command arguments, remote plugins, user-created commands,
command-history persistence, analytics or a second Search/Drawer/Card. No migration.
