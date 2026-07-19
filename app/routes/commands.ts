/**
 * DS-09 Command Palette — the trusted command-catalogue resource route
 * (`GET /commands`).
 *
 * A JSON resource route behind the Worker auth boundary (like DS-08's `/search`).
 * It renders no shell, so it stays OUTSIDE the app-shell layout. It returns the
 * serialisable command catalogue built from `ModuleRegistry.listCommands()` — pure
 * metadata with NO executable handlers (ADR-024 §24.7/§24.8). It never accepts a
 * client-supplied workspace id: the catalogue is registry metadata, identical for
 * every authenticated caller, so it needs no workspace resolution.
 */

import { requireAuthenticatedSession } from "~/platform/request";
import { getCommandCatalogue } from "~/platform/commands";

import type { Route } from "./+types/commands";

export async function loader({ context }: Route.LoaderArgs) {
  // Authentication is authoritative: a missing session is a 401 (thrown Response),
  // never a catalogue. Only authenticated callers receive the catalogue.
  requireAuthenticatedSession(context);

  const catalogue = getCommandCatalogue();
  return new Response(JSON.stringify(catalogue), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
