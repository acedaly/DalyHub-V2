/**
 * DS-09 — the development-only Command Palette demonstration
 * (`/design/command-palette`).
 *
 * Development fixture, EXCLUDED from production by the `NODE_ENV` guard in
 * `app/routes.ts` (same as the DS-02…DS-08 fixtures). It is not a module, ships no
 * product functionality, and persists nothing. It drives the REAL `CommandPalette`
 * + controller + model against IN-MEMORY fakes (an injected catalogue, a DS-08
 * `executeSearch` over fake providers, and an injected command executor) so every
 * state is demonstrable deterministically: registered navigation + executable
 * commands, contextual actions that appear/disappear, fuzzy matching, DS-08 record
 * results, partial and total Search failure while commands stay usable, execution
 * success / failure / timeout, duplicate-activation prevention, long content, no
 * results, and the Card/Record-Header adapters over ONE shared action.
 *
 * No fixture command claims a persistent mutation that did not happen.
 */

import { useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import CommandPalette from "~/shared/commands/CommandPalette";
import {
  toCardAction,
  toRecordAction,
  useRegisterContextualActions,
  type AppAction,
} from "~/shared/commands";
import type {
  CommandCatalogue,
  CommandExecutionOutcome,
} from "~/shared/commands/model";
import { Card } from "~/shared/card";
import { RecordHeader } from "~/shared/record-layout";
import { parseModuleId } from "~/kernel/modules";
import type {
  ModuleRuntimeContext,
  RegisteredSearchProvider,
  SearchResultItem,
} from "~/kernel/modules";
import { workspaceContextFromId } from "~/kernel/workspaces";
import { executeSearch } from "~/shared/search";
import type { SearchFn } from "~/shared/search";

import "~/styles/search-demo.css";

export function meta() {
  return [{ title: "Command Palette — DalyHub design fixture" }];
}

/* -------------------------------------------------------------------------- */
/* Fake catalogue (registered commands)                                       */
/* -------------------------------------------------------------------------- */

const DEMO_CATALOGUE: CommandCatalogue = {
  commands: [
    {
      id: "today.open",
      moduleId: "today",
      moduleLabel: "Today",
      title: "Go to Today",
      subtitle: "The calm daily home",
      keywords: ["today", "home", "dashboard"],
      kind: "navigate",
      target: { kind: "route", to: "/today" },
    },
    {
      id: "projects.open",
      moduleId: "projects",
      moduleLabel: "Projects",
      title: "Go to Projects",
      keywords: ["projects", "work"],
      kind: "navigate",
      target: { kind: "route", to: "/projects" },
    },
    {
      id: "demo.reindex",
      moduleId: "demo",
      moduleLabel: "Demo",
      title: "Reindex the workspace",
      subtitle: "Runs through the authenticated command boundary",
      keywords: ["reindex", "rebuild", "search"],
      shortcut: { key: "r", modifiers: ["mod", "shift"] },
      kind: "execute",
    },
    {
      id: "demo.digest",
      moduleId: "demo",
      moduleLabel: "Demo",
      title: "Send the weekly digest",
      keywords: ["digest", "email", "weekly"],
      // A deliberate collision with reindex to demonstrate deterministic
      // collision resolution (the first claimant wins).
      shortcut: { key: "r", modifiers: ["mod", "shift"] },
      kind: "execute",
    },
    {
      id: "demo.long",
      moduleId: "demo",
      moduleLabel: "Demo",
      title:
        "Reconcile the quarterly reconciliation spreadsheet with the finance export and file the variance memo before the board review",
      subtitle:
        "A deliberately very long title and subtitle to prove truncation and wrapping behave inside the palette without overflowing horizontally",
      keywords: ["reconcile", "finance", "variance"],
      kind: "execute",
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Fake record search (DS-08)                                                 */
/* -------------------------------------------------------------------------- */

const DEMO_RECORDS: readonly SearchResultItem[] = [
  {
    id: "task-relaunch",
    title: "Finish the Acme relaunch brief",
    subtitle: "Career · due today",
    entityType: "task",
    target: { kind: "route", to: "/today" },
  },
  {
    id: "project-relaunch",
    title: "Acme relaunch",
    subtitle: "Career · active",
    entityType: "project",
    target: { kind: "route", to: "/today" },
  },
];

function demoProvider(fail = false): RegisteredSearchProvider {
  return {
    id: "demo.search",
    moduleId: parseModuleId("demo"),
    label: "Demo",
    search: async (query) => {
      if (fail) {
        throw new Error("simulated provider failure (never shown)");
      }
      const q = query.text.toLowerCase();
      return DEMO_RECORDS.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.subtitle?.toLowerCase().includes(q) ?? false),
      ).slice(0, query.limit);
    },
  };
}

const DEMO_CONTEXT: ModuleRuntimeContext = {
  workspace: workspaceContextFromId("design-demo-workspace"),
};

type SearchScenario = "healthy" | "partial" | "total";

function makeSearch(scenario: SearchScenario): SearchFn {
  const providers =
    scenario === "healthy"
      ? [demoProvider()]
      : scenario === "partial"
        ? [demoProvider(), demoProvider(true)]
        : [demoProvider(true)];
  return (query) =>
    executeSearch({ providers, context: DEMO_CONTEXT, rawQuery: query });
}

/* -------------------------------------------------------------------------- */
/* Fake command executor                                                      */
/* -------------------------------------------------------------------------- */

type ExecScenario = "success" | "failure" | "timeout" | "hang";

function makeExecute(scenario: ExecScenario) {
  return (
    _commandId: string,
    signal: AbortSignal,
  ): Promise<CommandExecutionOutcome> => {
    if (scenario === "success") {
      return Promise.resolve({ ok: true, message: "Reindex complete." });
    }
    if (scenario === "failure") {
      return Promise.resolve({
        ok: false,
        reason: "failed",
        message: "The command didn’t complete.",
      });
    }
    if (scenario === "hang") {
      // Never resolves — demonstrates the pending state + duplicate-activation
      // prevention (a second activation while pending is blocked).
      return new Promise(() => {});
    }
    // timeout: resolve with an honest timeout outcome shortly after (simulating
    // the server's bounded deadline) — never claims the effect was cancelled.
    return new Promise((resolve) => {
      const timer = setTimeout(
        () =>
          resolve({
            ok: false,
            reason: "failed",
            message:
              "The command is taking too long. It may still be finishing.",
          }),
        150,
      );
      signal.addEventListener("abort", () => clearTimeout(timer), {
        once: true,
      });
    });
  };
}

/* -------------------------------------------------------------------------- */
/* Demo contextual actions + adapter proof                                    */
/* -------------------------------------------------------------------------- */

function useDemoContextualActions(
  extra: boolean,
  onFeedback: (message: string) => void,
): AppAction[] {
  return useMemo<AppAction[]>(() => {
    const actions: AppAction[] = [
      {
        id: "demo.ctx.tidy",
        title: "Tidy the current view",
        subtitle: "A contextual action for this surface",
        keywords: ["tidy", "clean"],
        kind: "run",
        run: () => {
          onFeedback("Tidied (in memory only).");
          return { ok: true, message: "Tidied (in memory only)." };
        },
      },
      {
        // A contextual action that is SHOWN but not activatable (disabled ≠
        // omitted). It must never navigate, execute, become pending, be retried
        // or fire a shortcut — from pointer OR keyboard.
        id: "demo.ctx.disabled",
        title: "Archive the current record",
        subtitle: "Disabled: not available for this record",
        keywords: ["archive", "disabled", "unavailable"],
        kind: "run",
        disabled: true,
        run: () => {
          onFeedback("Disabled action ran — this must never appear.");
          return { ok: true, message: "This should never run." };
        },
      },
    ];
    if (extra) {
      actions.push({
        id: "demo.ctx.selection",
        title: "Act on the current selection",
        subtitle: "Only present while something is selected",
        kind: "run",
        run: () => ({ ok: true, message: "Acted on selection." }),
      });
    }
    return actions;
  }, [extra, onFeedback]);
}

/* -------------------------------------------------------------------------- */
/* Route                                                                      */
/* -------------------------------------------------------------------------- */

export default function DesignCommandPaletteRoute() {
  const [open, setOpen] = useState(false);
  const [searchScenario, setSearchScenario] =
    useState<SearchScenario>("healthy");
  const [execScenario, setExecScenario] = useState<ExecScenario>("success");
  const [hasSelection, setHasSelection] = useState(false);
  const [cardFeedback, setCardFeedback] = useState("");
  const openerRef = useRef<HTMLButtonElement>(null);

  // Register demo contextual actions into the app-shell CommandContextProvider so
  // they appear in the palette's "Current context" group.
  const contextualActions = useDemoContextualActions(hasSelection, () => {});
  useRegisterContextualActions(contextualActions);

  // The adapter proof: ONE shared action rendered as a Card action AND a Record
  // Header action — same identity, same execution path.
  const sharedAction: AppAction = useMemo(
    () => ({
      id: "demo.shared.star",
      title: "Star",
      subtitle: "The same shared action on a Card and a Record Header",
      kind: "run",
      run: () => {
        setCardFeedback("Starred (in memory only).");
        return { ok: true, message: "Starred." };
      },
    }),
    [],
  );
  const activate = (action: AppAction) => {
    if (action.kind === "run") void action.run();
  };

  return (
    <div className="dh-design-search">
      <h1>Command Palette</h1>
      <p>
        The DS-09 palette, driven by an in-memory catalogue, a DS-08 search over
        fake providers, and an injected executor. Open it and try{" "}
        <code>go</code> (navigation), <code>reindex</code> (executable),{" "}
        <code>rcncl</code> (fuzzy), or a nonsense string (no results). Use ↑/↓,
        Home/End, Enter and Escape. <kbd>⌘K</kbd> opens the real palette.
      </p>

      <fieldset className="dh-design-search__actions">
        <legend>Record search</legend>
        {(["healthy", "partial", "total"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={searchScenario === s}
            onClick={() => setSearchScenario(s)}
          >
            {s === "healthy"
              ? "Healthy"
              : s === "partial"
                ? "Partial failure"
                : "Total failure"}
          </button>
        ))}
      </fieldset>

      <fieldset className="dh-design-search__actions">
        <legend>Executable command result</legend>
        {(["success", "failure", "timeout", "hang"] as const).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={execScenario === s}
            onClick={() => setExecScenario(s)}
          >
            {s === "success"
              ? "Success"
              : s === "failure"
                ? "Failure"
                : s === "timeout"
                  ? "Timeout"
                  : "Pending (hang)"}
          </button>
        ))}
      </fieldset>

      <fieldset className="dh-design-search__actions">
        <legend>Contextual actions</legend>
        <button
          type="button"
          aria-pressed={hasSelection}
          onClick={() => setHasSelection((v) => !v)}
        >
          {hasSelection ? "Clear selection" : "Select something"}
        </button>
        <p className="dh-design-search__hint">
          Selecting adds a selection-only contextual action; clearing removes it
          — proving the palette changes with context.
        </p>
      </fieldset>

      <div className="dh-design-search__actions">
        <button type="button" ref={openerRef} onClick={() => setOpen(true)}>
          Open Command Palette
        </button>
      </div>

      <AdapterProof
        action={sharedAction}
        onActivate={activate}
        feedback={cardFeedback}
      />

      {open ? (
        <CommandPalette
          opener={openerRef.current}
          onClose={() => setOpen(false)}
          catalogue={async () => DEMO_CATALOGUE}
          search={makeSearch(searchScenario)}
          execute={makeExecute(execScenario)}
        />
      ) : null}
    </div>
  );
}

function AdapterProof({
  action,
  onActivate,
  feedback,
}: {
  readonly action: AppAction;
  readonly onActivate: (action: AppAction) => void;
  readonly feedback: string;
}): ReactNode {
  return (
    <section
      className="dh-design-search__panel"
      aria-label="Quick Action adapter proof"
    >
      <h2>One action, three surfaces</h2>
      <Card
        id="demo-card"
        title="A demo record"
        typeLabel="Demo"
        quickActions={[toCardAction(action, { onActivate })]}
      />
      <RecordHeader
        title="A demo record"
        typeLabel="Demo"
        headingLevel={3}
        primaryAction={toRecordAction(action, {
          onActivate,
          variant: "primary",
        })}
      />
      <p className="dh-design-search__hint" role="status" aria-live="polite">
        {feedback}
      </p>
    </section>
  );
}
