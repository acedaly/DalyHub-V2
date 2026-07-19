/**
 * DS-09 Command Palette — the UI/runtime public surface.
 *
 * The React provider, hooks, the shared action model + adapters, and the client
 * transports. The React-FREE model has its own entry (`~/shared/commands/model`)
 * and is intentionally not re-exported here, so the server (catalogue builder,
 * execution boundary) can depend on the model without pulling React in.
 *
 * Note: the shell lazy-loads `CommandPalette` by its module path so the full
 * palette UI stays out of the initial application bundle — import the default
 * export from `~/shared/commands/CommandPalette` directly for that, not this barrel.
 */

export {
  CommandContextProvider,
  useContextualActions,
  useRegisterContextualActions,
} from "./CommandContextProvider";
export {
  appActionToPaletteCommand,
  toCardAction,
  toRecordAction,
  type AppAction,
  type AppActionActivation,
} from "./action";
export { useCommandContext } from "./useCommandContext";
export {
  useCommandController,
  type CommandController,
  type UseCommandControllerOptions,
  type CataloguePhase,
} from "./useCommandController";
export {
  useCommandShortcuts,
  type ShortcutBinding,
  type UseCommandShortcutsOptions,
} from "./useCommandShortcuts";
export { detectShortcutPlatform } from "./platform";
export {
  fetchCommandCatalogue,
  COMMANDS_CATALOGUE_ENDPOINT,
  type CommandCatalogueFn,
} from "./catalogue-client";
export {
  postCommandExecution,
  commandExecuteEndpoint,
  type ExecuteCommandFn,
} from "./execution-client";
export { executeCommand, type ExecuteCommandOptions } from "./execute-command";
export type { CommandPaletteProps } from "./CommandPalette";
