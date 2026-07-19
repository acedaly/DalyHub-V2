/**
 * DS-09 Command Palette — the server command boundary (public surface).
 *
 * The trusted, server-side catalogue builder. The authenticated resource route
 * imports it to serialise the palette catalogue; the execution route uses the
 * registry and the runtime runner directly. Kept in `app/platform` so the
 * dependency direction points at the kernel/shared contracts, not the other way.
 */

export {
  buildCommandCatalogue,
  getCommandCatalogue,
} from "./command-catalogue";

export { runRegisteredCommand, type RunCommandResult } from "./run-command";
