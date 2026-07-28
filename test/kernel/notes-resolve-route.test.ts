/**
 * Integration test for the `[[Wiki Link]]` resolver (`GET /notes/resolve?title=`)
 * against the real Workers runtime + D1. Regression for Codex thread
 * PRRT_kwDOTbatJs6T6Oyr: an exact-title target created beyond the first 500
 * entities (past the old 5-page scan cutoff) must still resolve, not fall back to
 * `/notes`. Entity listing is creation-time ordered, so the target is seeded LAST.
 *
 * NOTES-02 replaced the whole-workspace page scan with the SAME bounded, indexed
 * `resolveReferenceTargets` lookup that relationship reconciliation uses (the
 * performance half of DEBT-39). This suite is the proof that the replacement
 * preserved the behaviour the regression above pinned down — and it now also
 * pins the property that makes the shared lookup worth having: navigation and
 * the persisted relationship resolve the SAME record.
 */

import { env } from "cloudflare:workers";
import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as resolveLoader } from "~/modules/notes/routes/resolve";

import { makeContext, makeNoteRepository, resetTables } from "./support";

const WS = "test-default-workspace";

function authedContext(): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: { subject: "owner-subject", email: "owner@example.com" },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

/**
 * Bulk-seed `count` filler notes then one target note, all with strictly
 * increasing `created_at` so `(created_at, id)` ascending order places the target
 * LAST — i.e. on a page well beyond the old fixed cutoff. Uses batched raw inserts
 * (a test-only seeding shortcut) so seeding hundreds of rows stays fast.
 */
async function seedNotesWithTargetLast(
  count: number,
  targetId: string,
  targetTitle: string,
): Promise<void> {
  const base = Date.parse("2026-07-17T00:00:00.000Z");
  const iso = (i: number) => new Date(base + i * 1000).toISOString();
  const insert = (id: string, title: string, i: number): D1PreparedStatement =>
    env.DB.prepare(
      "INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at) VALUES (?, ?, 'note', ?, ?, ?, NULL)",
    ).bind(id, WS, title, iso(i), iso(i));

  const statements: D1PreparedStatement[] = [];
  for (let i = 0; i < count; i += 1) {
    statements.push(
      insert(`filler-${String(i).padStart(4, "0")}`, `Filler ${i}`, i),
    );
  }
  // The target is created LAST (largest created_at) → last in ascending order.
  statements.push(insert(targetId, targetTitle, count));

  // Apply in chunks to keep each batch modest.
  for (let i = 0; i < statements.length; i += 100) {
    await env.DB.batch(statements.slice(i, i + 100));
  }
}

async function runResolve(title: string): Promise<Response> {
  const url = `https://app.test/notes/resolve?title=${encodeURIComponent(title)}`;
  return (await resolveLoader({
    request: new Request(url),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof resolveLoader>[0])) as Response;
}

describe("GET /notes/resolve — wiki-link resolution", () => {
  beforeEach(async () => {
    await resetTables([WS]);
  });

  it("resolves an exact-title note created beyond the first 500 entities", async () => {
    const targetId = "wiki-target-note";
    const targetTitle = "The Deeply Buried Note";
    // 500 fillers + the target → the target is entity #501 (past the old 5×100
    // page cutoff), forcing the resolver to page beyond it.
    await seedNotesWithTargetLast(500, targetId, targetTitle);

    const response = await runResolve(targetTitle);

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`/notes/${targetId}`);
  });

  it("redirects to /notes when no title matches", async () => {
    await seedNotesWithTargetLast(50, "some-note", "A Present Note");
    const response = await runResolve("No Such Title Anywhere");
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/notes");
  });

  it("matches case-insensitively and ignores surrounding whitespace", async () => {
    await seedNotesWithTargetLast(2, "cased-note", "The Cased Note");
    const response = await runResolve("  the cased NOTE  ");
    expect(response.headers.get("location")).toBe("/notes/cased-note");
  });

  it("resolves to the SAME record the saved relationship points at", async () => {
    // Navigation and reconciliation must never disagree about which record a
    // title means, so both go through `resolveReferenceTargets` with one total,
    // stable tie-break. Assert the two agree rather than trusting that they do.
    const targetTitle = "The Shared Resolution Note";
    await seedNotesWithTargetLast(3, "shared-target", targetTitle);

    const resolved = await makeNoteRepository(
      makeContext(WS),
    ).resolveReferenceTargets([targetTitle]);
    expect(resolved.get(targetTitle.toLocaleLowerCase())?.id).toBe(
      "shared-target",
    );

    const response = await runResolve(targetTitle);
    expect(response.headers.get("location")).toBe("/notes/shared-target");
  });

  it("never resolves a title that exists only in ANOTHER workspace", async () => {
    const other = "ws_resolve_other";
    await resetTables([WS, other]);
    await env.DB.prepare(
      "INSERT INTO entities (id, workspace_id, type, title, created_at, updated_at, deleted_at) VALUES (?, ?, 'note', ?, ?, ?, NULL)",
    )
      .bind(
        "foreign-note",
        other,
        "A Foreign Note",
        "2026-07-17T00:00:00.000Z",
        "2026-07-17T00:00:00.000Z",
      )
      .run();

    const response = await runResolve("A Foreign Note");
    expect(response.headers.get("location")).toBe("/notes");
  });

  it("never resolves a soft-deleted record", async () => {
    await seedNotesWithTargetLast(1, "deleted-note", "The Deleted Note");
    await env.DB.prepare("UPDATE entities SET deleted_at = ? WHERE id = ?")
      .bind("2026-07-18T00:00:00.000Z", "deleted-note")
      .run();

    const response = await runResolve("The Deleted Note");
    expect(response.headers.get("location")).toBe("/notes");
  });
});
