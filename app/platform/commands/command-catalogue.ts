/**
 * DS-09 Command Palette — the trusted server-side command-catalogue boundary.
 *
 * Builds the serialisable {@link CommandCatalogue} the browser palette consumes.
 * It discovers commands ONLY through `ModuleRegistry.listCommands()` (there is no
 * manually-maintained module-command list — ADR-024 §24.7), retains each
 * command's module ownership, bounds and orders the metadata deterministically,
 * and — crucially — OMITS every executable handler: only a navigation command's
 * validated target crosses to the browser; an executable command ships as pure
 * metadata and is run later by id through the authenticated execution boundary.
 * No `run` function is ever serialised, so the browser can never receive an
 * executable server handler (ADR-024 §24.8/§24.10).
 *
 * Memoised once per Worker isolate (the registry is static per isolate), mirroring
 * the primary-navigation model (AGENTS.md §16, ADR-016 §30).
 */

import type { ModuleRegistry } from "~/kernel/modules";
import { MAX_CATALOGUE_SIZE } from "~/shared/commands/model";
import type {
  CommandCatalogue,
  CommandCatalogueEntry,
} from "~/shared/commands/model";

import { discoverModuleRegistry } from "~/modules/discover-modules";

let cachedCatalogue: CommandCatalogue | undefined;

/**
 * Build the trusted command catalogue from a registry. Deterministic: it reflects
 * the registry's own deterministic command order, capped at {@link MAX_CATALOGUE_SIZE}.
 */
export function buildCommandCatalogue(
  registry: ModuleRegistry,
): CommandCatalogue {
  const commands: CommandCatalogueEntry[] = [];
  for (const command of registry.listCommands()) {
    if (commands.length >= MAX_CATALOGUE_SIZE) {
      break;
    }
    const moduleLabel =
      registry.getModule(command.moduleId)?.name ?? command.moduleId;
    const base = {
      id: command.id,
      moduleId: command.moduleId,
      moduleLabel,
      title: command.title,
      ...(command.subtitle === undefined ? {} : { subtitle: command.subtitle }),
      keywords: command.keywords ?? [],
      ...(command.shortcut === undefined ? {} : { shortcut: command.shortcut }),
    };
    if (command.kind === "navigate") {
      commands.push({ ...base, kind: "navigate", target: command.target });
    } else {
      // Only metadata crosses the boundary — the `run` handler is deliberately
      // dropped here and never reaches the browser.
      commands.push({ ...base, kind: "execute" });
    }
  }
  return { commands };
}

/**
 * The application command catalogue, discovered from the module registry and
 * built once per isolate. Safe to serialise straight to the browser.
 */
export function getCommandCatalogue(): CommandCatalogue {
  if (cachedCatalogue === undefined) {
    cachedCatalogue = buildCommandCatalogue(discoverModuleRegistry());
  }
  return cachedCatalogue;
}
