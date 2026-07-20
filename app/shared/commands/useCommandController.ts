/**
 * DS-09 Command Palette — the controller hook.
 *
 * Owns the palette's runtime: it fetches and decodes the trusted catalogue, merges
 * contextual actions + registered commands + DS-08 record Search into ONE ranked,
 * grouped, selectable view, runs the keyboard-selection maths over that merged
 * index space, and drives the execution state machine (navigate / execute /
 * contextual-run) with stale-protection and duplicate-activation blocking. It
 * REUSES DS-08's `useSearchController` for record search rather than building a
 * second search (ADR-024 §24.11); a partial or total Search failure never disables
 * commands. Recent commands are remembered IN MEMORY for the session only — never
 * persisted (ADR-024 §24.10) — and the store lives on `CommandContextProvider`, not
 * this hook, so it survives the palette unmounting on close.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import {
  buildResultDestination,
  destinationHref,
  useSearchController,
  type SearchFn,
} from "~/shared/search";
import { isExecutableQuery } from "~/shared/search/model";

import { appActionToPaletteCommand, type AppAction } from "./action";
import { useCommandRecents } from "./CommandContextProvider";
import {
  catalogueEntryToPaletteCommand,
  clampActiveIndex,
  firstEnabledIndex,
  groupCommands,
  INITIAL_EXECUTION_STATE,
  beginExecution,
  buildPaletteView,
  lastEnabledIndex,
  MAX_RECENT_COMMANDS,
  nextEnabledIndex,
  optionEnabledMask,
  previousEnabledIndex,
  rankCommands,
  resetExecution,
  sanitiseOutcome,
  settleExecution,
  type CommandCatalogue,
  type CommandExecutionState,
  type PaletteCommand,
  type PaletteContext,
  type PaletteOption,
  type PaletteView,
} from "./model";
import {
  fetchCommandCatalogue,
  type CommandCatalogueFn,
} from "./catalogue-client";
import {
  postCommandExecution,
  type ExecuteCommandFn,
} from "./execution-client";
import { detectShortcutPlatform } from "./platform";
import type { ShortcutPlatform } from "./model";

/** A stable empty search-group list, so the view memo is not invalidated. */
const EMPTY_SEARCH_GROUPS = [] as const;

/** The catalogue load phase. */
export type CataloguePhase = "loading" | "ready" | "error";

/** Options for the command controller. */
export type UseCommandControllerOptions = {
  /** The contextual actions currently registered by surfaces. */
  readonly contextualActions: readonly AppAction[];
  /** The presentation context for relevance. */
  readonly context: PaletteContext;
  /** Injectable catalogue fetcher (real transport by default). */
  readonly catalogue?: CommandCatalogueFn;
  /** Injectable record-search fn (DS-08 real transport by default). */
  readonly search?: SearchFn;
  /** Injectable command executor (real transport by default). */
  readonly execute?: ExecuteCommandFn;
  /** Called to close the palette (after a navigation or a target-bearing success). */
  readonly onClose: () => void;
  /** Search debounce (ms). */
  readonly debounceMs?: number;
};

/** The controller the Command Palette surface renders. */
export type CommandController = {
  readonly query: string;
  setQuery(next: string): void;
  clear(): void;
  readonly view: PaletteView;
  readonly hasQuery: boolean;
  readonly activeIndex: number;
  readonly activeOption: PaletteOption | null;
  setActiveIndex(index: number): void;
  moveUp(): void;
  moveDown(): void;
  moveHome(): void;
  moveEnd(): void;
  activate(option: PaletteOption | null): void;
  readonly cataloguePhase: CataloguePhase;
  retryCatalogue(): void;
  readonly searchPhase: "idle" | "loading" | "ready" | "error";
  readonly searchIsPartial: boolean;
  readonly execution: CommandExecutionState;
  retryExecution(): void;
  readonly platform: ShortcutPlatform;
};

export function useCommandController(
  options: UseCommandControllerOptions,
): CommandController {
  const {
    contextualActions,
    context,
    onClose,
    catalogue: catalogueFn = fetchCommandCatalogue,
    execute: executeFn = postCommandExecution,
    debounceMs,
  } = options;

  const navigate = useNavigate();
  const location = useLocation();
  const platform = useMemo(() => detectShortcutPlatform(), []);

  const [query, setQueryState] = useState("");
  const hasQuery = query.trim().length > 0;
  // The user's raw selection intent; the exposed `activeIndex` is derived from it
  // by clamping to an enabled option during render (see below).
  const [activeIndexState, setActiveIndexState] = useState(0);

  /* ----------------------------- Catalogue ------------------------------ */
  const [catalogue, setCatalogue] = useState<CommandCatalogue | null>(null);
  const [cataloguePhase, setCataloguePhase] =
    useState<CataloguePhase>("loading");
  const [catalogueNonce, setCatalogueNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setCataloguePhase("loading");
    catalogueFn(controller.signal)
      .then((result) => {
        if (!cancelled) {
          setCatalogue(result);
          setCataloguePhase("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setCatalogue(null);
          setCataloguePhase("error");
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [catalogueFn, catalogueNonce]);

  const retryCatalogue = useCallback(() => setCatalogueNonce((n) => n + 1), []);

  /* ------------------------- DS-08 record search ------------------------ */
  const searchController = useSearchController({
    ...(options.search === undefined ? {} : { search: options.search }),
    ...(debounceMs === undefined ? {} : { debounceMs }),
  });
  const searchSetQuery = searchController.setQuery;
  const searchClear = searchController.clear;

  /* ------------------------------ Recents ------------------------------- */
  // Recents live on the provider (session-scoped) so they survive the palette
  // unmounting on close; a local ref is only a fallback when no provider is
  // present (e.g. an isolated controller test). See ADR-024 §24.10.
  const recentsStore = useCommandRecents();
  const localRecentRef = useRef<readonly string[]>([]);
  const getRecentIds = useCallback(
    (): readonly string[] =>
      recentsStore ? recentsStore.getRecentIds() : localRecentRef.current,
    [recentsStore],
  );

  /* -------------------------- Merged palette view ----------------------- */
  const paletteCommands = useMemo<readonly PaletteCommand[]>(() => {
    const contextual = contextualActions.map(appActionToPaletteCommand);
    const registered =
      catalogue?.commands.map(catalogueEntryToPaletteCommand) ?? [];
    return [...contextual, ...registered];
  }, [contextualActions, catalogue]);

  const commandGroups = useMemo(() => {
    const ranked = rankCommands(query, paletteCommands, context);
    return groupCommands(ranked, {
      hasQuery,
      recentIds: getRecentIds(),
    });
  }, [query, paletteCommands, context, hasQuery, getRecentIds]);

  const showSearchGroups = hasQuery && searchController.resultsAreCurrent;
  const searchGroups = showSearchGroups
    ? searchController.groups
    : EMPTY_SEARCH_GROUPS;

  const view = useMemo(
    () => buildPaletteView(commandGroups, searchGroups),
    [commandGroups, searchGroups],
  );

  // The enabled mask drives SKIP-DISABLED selection: a disabled contextual action
  // is shown but never becomes the active option (ADR-024 §24.12) — so Enter and
  // `aria-activedescendant` always refer to an activatable option.
  const enabledMask = useMemo(
    () => optionEnabledMask(view.options),
    [view.options],
  );

  // Resolve the active index DURING RENDER rather than correcting it in an effect:
  // `activeIndexState` is the user's intent, and the exposed `activeIndex` clamps it
  // to an enabled option (or -1 when the list is empty/wholly disabled). Deriving it
  // avoids a set-state-in-effect that would both add a render and race a just-typed
  // Enter. Movement and hover read this resolved value through refs so the callbacks
  // stay stable.
  const activeIndex = clampActiveIndex(activeIndexState, enabledMask);
  const activeIndexRef = useRef(activeIndex);
  activeIndexRef.current = activeIndex;
  const enabledMaskRef = useRef(enabledMask);
  enabledMaskRef.current = enabledMask;

  const activeOption =
    activeIndex >= 0 && activeIndex < view.options.length
      ? view.options[activeIndex]
      : null;

  /* ------------------------------ Query --------------------------------- */
  const setQuery = useCallback(
    (next: string) => {
      setQueryState(next);
      setActiveIndexState(0);
      if (isExecutableQuery(next.trim())) {
        searchSetQuery(next);
      } else {
        searchClear();
      }
    },
    [searchSetQuery, searchClear],
  );

  const clear = useCallback(() => {
    setQueryState("");
    setActiveIndexState(0);
    searchClear();
  }, [searchClear]);

  /* ---------------------------- Selection ------------------------------- */
  // Pointer hover sets the active option — but never onto a disabled one, so the
  // active descendant stays activatable regardless of the input device.
  const setActiveIndex = useCallback((index: number) => {
    const mask = enabledMaskRef.current;
    if (index >= 0 && index < mask.length && mask[index]) {
      setActiveIndexState(index);
    }
  }, []);
  // Movement reads the RESOLVED active index (not the raw intent) so it always
  // steps from an enabled option and skips disabled ones on the way.
  const moveDown = useCallback(
    () =>
      setActiveIndexState(
        nextEnabledIndex(activeIndexRef.current, enabledMaskRef.current),
      ),
    [],
  );
  const moveUp = useCallback(
    () =>
      setActiveIndexState(
        previousEnabledIndex(activeIndexRef.current, enabledMaskRef.current),
      ),
    [],
  );
  const moveHome = useCallback(
    () => setActiveIndexState(firstEnabledIndex(enabledMaskRef.current)),
    [],
  );
  const moveEnd = useCallback(
    () => setActiveIndexState(lastEnabledIndex(enabledMaskRef.current)),
    [],
  );

  /* ---------------------------- Execution ------------------------------- */
  const [execution, setExecution] = useState<CommandExecutionState>(
    INITIAL_EXECUTION_STATE,
  );
  const executionRef = useRef(execution);
  executionRef.current = execution;
  const mountedRef = useRef(true);
  useEffect(() => {
    // Set on mount (not only cleared on unmount) so React's dev double-mount
    // (StrictMode) leaves the ref TRUE after the remount — otherwise a settled
    // execution would be dropped as "unmounted" and the palette would hang pending.
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  // Reset any prior success/error banner when the query changes.
  useEffect(() => {
    setExecution((state) =>
      state.phase === "idle" ? state : resetExecution(state),
    );
  }, [query]);

  const rememberRecent = useCallback(
    (commandId: string) => {
      if (recentsStore) {
        recentsStore.remember(commandId);
        return;
      }
      localRecentRef.current = [
        commandId,
        ...localRecentRef.current.filter((id) => id !== commandId),
      ].slice(0, MAX_RECENT_COMMANDS);
    },
    [recentsStore],
  );

  const navigateToTarget = useCallback(
    (target: Parameters<typeof buildResultDestination>[0]) => {
      const destination = buildResultDestination(target, {
        pathname: location.pathname,
        search: location.search,
      });
      navigate(destinationHref(destination), { preventScrollReset: true });
    },
    [navigate, location.pathname, location.search],
  );

  const runOutcome = useCallback(
    (
      commandId: string,
      producer: (
        signal: AbortSignal,
      ) => Promise<Awaited<ReturnType<ExecuteCommandFn>> | void>,
    ) => {
      // Block a duplicate activation while one is pending.
      if (executionRef.current.phase === "pending") {
        return;
      }
      const started = beginExecution(executionRef.current, commandId);
      setExecution(started);
      const controller = new AbortController();
      Promise.resolve(producer(controller.signal))
        .then((raw) => sanitiseOutcome(raw ?? { ok: true }))
        .catch(() => sanitiseOutcome(null))
        .then((outcome) => {
          if (!mountedRef.current) {
            return;
          }
          // Stale-response guard: a superseded activation (the query changed, or a
          // newer command started) must NOT settle state OR run its side effects.
          // `settleExecution` already drops a stale token from the state, but the
          // recents/navigation below must be gated the same way — otherwise a slow
          // target-bearing success from command A could close the palette and
          // navigate away after command B became the active interaction.
          const live = executionRef.current;
          if (live.phase !== "pending" || live.token !== started.token) {
            return;
          }
          setExecution((state) =>
            settleExecution(state, started.token, outcome),
          );
          if (outcome.ok) {
            rememberRecent(commandId);
            if (outcome.target !== undefined) {
              navigateToTarget(outcome.target);
              onClose();
            }
          }
        });
    },
    [navigateToTarget, onClose, rememberRecent],
  );

  const activate = useCallback(
    (option: PaletteOption | null) => {
      if (option === null) {
        return;
      }
      if (option.kind === "result") {
        // A stale record result is not activatable (guarded by resultsAreCurrent).
        navigateToTarget(option.result.target);
        onClose();
        return;
      }

      const command = option.ranked.command;
      if (command.source === "contextual") {
        const action = contextualActions.find((a) => a.id === command.id);
        if (action === undefined) {
          return;
        }
        // A disabled contextual action is shown but not activatable — mirror the
        // Card/Header adapters so Enter or a click cannot invoke its handler.
        if (action.disabled === true) {
          return;
        }
        if (action.kind === "navigate") {
          rememberRecent(action.id);
          navigateToTarget(action.target);
          onClose();
          return;
        }
        runOutcome(action.id, async () => action.run());
        return;
      }

      // Registered command from the catalogue.
      const entry = catalogue?.commands.find((c) => c.id === command.id);
      if (entry === undefined) {
        return;
      }
      if (entry.kind === "navigate") {
        rememberRecent(entry.id);
        navigateToTarget(entry.target);
        onClose();
        return;
      }
      runOutcome(entry.id, (signal) => executeFn(entry.id, signal));
    },
    [
      catalogue,
      contextualActions,
      executeFn,
      navigateToTarget,
      onClose,
      rememberRecent,
      runOutcome,
    ],
  );

  const retryExecution = useCallback(() => {
    const { commandId } = executionRef.current;
    if (commandId === null) {
      return;
    }
    // A deliberate new invocation of the same command — never an automatic retry.
    const entry = catalogue?.commands.find((c) => c.id === commandId);
    if (entry !== undefined && entry.kind === "execute") {
      runOutcome(entry.id, (signal) => executeFn(entry.id, signal));
      return;
    }
    const action = contextualActions.find(
      (a) => a.id === commandId && a.kind === "run",
    );
    // A contextual action may have been removed or DISABLED since it failed (the
    // surrounding UI state changed). It must never be re-invoked through Retry —
    // clear the stale banner instead of leaving a dead Retry button behind.
    if (
      action === undefined ||
      action.kind !== "run" ||
      action.disabled === true
    ) {
      setExecution((state) =>
        state.phase === "idle" ? state : resetExecution(state),
      );
      return;
    }
    runOutcome(action.id, async () => action.run());
  }, [catalogue, contextualActions, executeFn, runOutcome]);

  return {
    query,
    setQuery,
    clear,
    view,
    hasQuery,
    activeIndex,
    activeOption,
    setActiveIndex,
    moveUp,
    moveDown,
    moveHome,
    moveEnd,
    activate,
    cataloguePhase,
    retryCatalogue,
    searchPhase: searchController.phase,
    searchIsPartial: searchController.isPartial,
    execution,
    retryExecution,
    platform,
  };
}
