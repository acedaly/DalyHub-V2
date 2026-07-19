/**
 * DS-09 Command Palette — the browser catalogue transport.
 *
 * Fetches the trusted command catalogue from the authenticated `GET /commands`
 * resource route and decodes it with the untrusted-JSON decoder (never a cast).
 * A structurally-unusable response throws, and the palette turns that into a calm
 * catalogue-error state (ADR-024 §24.8).
 */

import { decodeCommandCatalogue } from "./catalogue";
import type { CommandCatalogue } from "./types";

/** The authenticated catalogue endpoint. */
export const COMMANDS_CATALOGUE_ENDPOINT = "/commands";

/** Injectable fetcher (real transport by default; a fake in tests/demos). */
export type CommandCatalogueFn = (
  signal: AbortSignal,
) => Promise<CommandCatalogue>;

/** Fetch and decode the command catalogue. Throws on a network or shape failure. */
export async function fetchCommandCatalogue(
  signal: AbortSignal,
): Promise<CommandCatalogue> {
  const response = await fetch(COMMANDS_CATALOGUE_ENDPOINT, {
    headers: { accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    throw new Error("command catalogue request failed");
  }
  const catalogue = decodeCommandCatalogue(await response.json());
  if (catalogue === null) {
    throw new Error("invalid command catalogue");
  }
  return catalogue;
}
