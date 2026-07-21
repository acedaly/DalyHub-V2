/**
 * DS-09 Command Palette — the global command-shortcut layer.
 *
 * Installs the ONE shared shortcut dispatcher for the app (there is never a
 * listener per command — ADR-024 §24.13). It owns the reserved global bindings
 * passed by AppShell (`Mod+K`, `/`) and adds NAVIGATION bindings built from the
 * commands that declare a `shortcut`:
 *
 *   - contextual `navigate` actions (from `CommandContextProvider`), and
 *   - registered `navigate` commands (from the trusted `/commands` catalogue).
 *
 * A declared navigation shortcut therefore actually navigates, not just displays a
 * hint. Precedence is deterministic: reserved first, then contextual, then
 * registered — so one key event still triggers at most one action.
 *
 * CONTEXTUAL `run` action shortcuts (e.g. Today's `P` / `Shift+P` / `C`) are ALSO
 * dispatched here (TODAY-05). This was deferred at DS-09 because firing a run action
 * with the palette closed needs a pending/success/failure surface OUTSIDE the
 * palette; DS-10 shipped that (the shared Feedback platform), and a contextual run
 * action reports its own feedback through it, so dispatching it globally is honest.
 * REGISTERED `execute` commands (server-run through `POST /commands/:id`) stay
 * deferred — they need the authenticated-execution surface, which no module uses yet.
 *
 * This layer deliberately loads the catalogue in the always-on shell (a departure
 * from the otherwise fully-lazy palette posture) — the cost of making declared
 * navigation shortcuts work app-wide. It pulls only the small catalogue transport
 * and the pure DS-08 navigation helper, never the palette UI/controller.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";

import {
  buildResultDestination,
  destinationHref,
} from "~/shared/search/navigation";

import { useContextualActions } from "./CommandContextProvider";
import { appActionToShortcutBinding } from "./action";
import {
  fetchCommandCatalogue,
  type CommandCatalogueFn,
} from "./catalogue-client";
import type { CommandCatalogue, SearchResultTarget } from "./types";
import {
  useCommandShortcuts,
  type ShortcutBinding,
} from "./useCommandShortcuts";

export type CommandShortcutLayerProps = {
  /** Reserved global bindings (Mod+K, /) — highest precedence. */
  readonly reserved: readonly ShortcutBinding[];
  /** Injectable catalogue fetcher (real transport by default; a fake in tests). */
  readonly catalogue?: CommandCatalogueFn;
};

/**
 * Mount ONCE inside `CommandContextProvider` (so it can read contextual actions)
 * and within the router (so it can navigate). Renders nothing.
 */
export function CommandShortcutLayer({
  reserved,
  catalogue: catalogueFn = fetchCommandCatalogue,
}: CommandShortcutLayerProps) {
  const contextualActions = useContextualActions();
  const navigate = useNavigate();
  const location = useLocation();

  const [catalogue, setCatalogue] = useState<CommandCatalogue | null>(null);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    catalogueFn(controller.signal)
      .then((result) => {
        if (!cancelled) {
          setCatalogue(result);
        }
      })
      .catch(() => {
        // A failed catalogue simply means no registered navigation shortcuts —
        // contextual navigation shortcuts and the palette itself are unaffected.
        if (!cancelled) {
          setCatalogue(null);
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [catalogueFn]);

  const navigateToTarget = useCallback(
    (target: SearchResultTarget) => {
      const destination = buildResultDestination(target, {
        pathname: location.pathname,
        search: location.search,
      });
      navigate(destinationHref(destination), { preventScrollReset: true });
    },
    [navigate, location.pathname, location.search],
  );

  const bindings = useMemo<readonly ShortcutBinding[]>(() => {
    const result: ShortcutBinding[] = [...reserved];

    // Contextual actions (higher precedence than registered). A disabled action
    // yields an `enabled: false` binding, so it never fires (same "disabled" as every
    // other surface). Navigation actions navigate; run actions execute their client
    // callback (which reports its own DS-10 feedback) — TODAY-05.
    for (const action of contextualActions) {
      if (action.shortcut === undefined) {
        continue;
      }
      const onTrigger =
        action.kind === "navigate"
          ? () => navigateToTarget(action.target)
          : () => {
              void action.run();
            };
      const binding = appActionToShortcutBinding(action, onTrigger);
      if (binding !== null) {
        result.push(binding);
      }
    }

    // Registered navigate commands from the trusted catalogue.
    for (const entry of catalogue?.commands ?? []) {
      if (entry.kind !== "navigate" || entry.shortcut === undefined) {
        continue;
      }
      result.push({
        shortcut: entry.shortcut,
        onTrigger: () => navigateToTarget(entry.target),
      });
    }

    return result;
  }, [reserved, contextualActions, catalogue, navigateToTarget]);

  useCommandShortcuts(bindings);
  return null;
}
