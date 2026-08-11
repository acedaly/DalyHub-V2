/**
 * CAPTURE-01 — `POST /api/capture` against the REAL Workers runtime and REAL D1.
 *
 * This is where the security acceptance criteria are actually proved, because
 * every one of them is a property of the storage-backed path rather than of a
 * pure function: the credential lookup, revocation taking effect immediately,
 * workspace isolation, the idempotency claim under genuine concurrency, the rate
 * limiter's counters, and the Activity that a replay must NOT append twice.
 *
 * Nothing here mocks D1. The committed migrations are applied to an isolated
 * per-file database, and captures terminate in the SAME Task and Note
 * repositories the application's own routes use — which is how these tests also
 * demonstrate that CAPTURE-01 grew no parallel storage.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  captureTokenFingerprint,
  generateCaptureToken,
  hashCaptureToken,
  type CaptureCapability,
} from "~/kernel/capture";
import { action as captureAction } from "~/routes/api-capture";

import {
  makeAppPreferencesRepository,
  makeContext,
  makeNoteDetailsRepository,
  makeTaskRepository,
  resetTables,
} from "./support";

const WS = "test-default-workspace";
const OTHER = "ws_capture_other";
/** The authenticated subject that mints the credentials these tests use. */
const OWNER_SUBJECT = "owner-subject";

/* -------------------------------------------------------------------------- */
/* Fixtures                                                                   */
/* -------------------------------------------------------------------------- */

type SeededToken = { readonly token: string; readonly id: string };

/**
 * Mint a credential the way the Settings endpoint does — a real token, only its
 * digest stored — so these tests exercise the production authentication path
 * rather than a test-only shortcut.
 */
async function seedToken(
  options: {
    readonly workspaceId?: string;
    readonly capabilities?: readonly CaptureCapability[];
    readonly revokedAt?: string | null;
    readonly expiresAt?: string | null;
    readonly name?: string;
    readonly ownerSubject?: string;
  } = {},
): Promise<SeededToken> {
  const token = generateCaptureToken();
  const tokenHash = await hashCaptureToken(token);
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO capture_tokens
       (id, workspace_id, owner_subject, name, token_hash, fingerprint,
        capabilities, source, created_at, last_used_at, expires_at, revoked_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL, ?8, NULL, ?9, ?10)`,
  )
    .bind(
      id,
      options.workspaceId ?? WS,
      options.ownerSubject ?? OWNER_SUBJECT,
      options.name ?? "Test iPhone",
      tokenHash,
      captureTokenFingerprint(tokenHash),
      (options.capabilities ?? ["task", "note"]).join(","),
      new Date("2026-08-01T00:00:00.000Z").toISOString(),
      options.expiresAt ?? null,
      options.revokedAt ?? null,
    )
    .run();
  return { token, id };
}

type CaptureBody = Record<string, unknown>;

async function post(
  token: string | null,
  body: CaptureBody | string,
  headers: Record<string, string> = {},
): Promise<Response> {
  const request = new Request("https://hub.daly.id.au/api/capture", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  return (await captureAction({
    request,
    context: undefined as never,
    params: {},
  } as unknown as Parameters<typeof captureAction>[0])) as Response;
}

async function capture(
  token: string,
  body: CaptureBody,
): Promise<{ readonly status: number; readonly json: never }> {
  const response = await post(token, body);
  return { status: response.status, json: (await response.json()) as never };
}

async function countRows(table: string, workspaceId = WS): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) AS n FROM ${table} WHERE workspace_id = ?1`,
  )
    .bind(workspaceId)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

async function countActivitiesOfType(type: string): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM activities WHERE type = ?1",
  )
    .bind(type)
    .first<{ n: number }>();
  return row?.n ?? 0;
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
});

/* -------------------------------------------------------------------------- */
/* The happy paths                                                            */
/* -------------------------------------------------------------------------- */

describe("capture terminates in the existing DalyHub domain", () => {
  it("creates a real Task through the existing Task repository", async () => {
    const { token } = await seedToken();
    const { status, json } = await capture(token, {
      kind: "task",
      text: "Follow up academy accommodation",
      source: "ios-shortcut",
    });

    expect(status).toBe(201);
    expect(json).toMatchObject({
      ok: true,
      capture: { kind: "task", destination: "Inbox" },
    });

    // Not a capture-owned row: the ordinary Task the ordinary repository reads.
    const task = await makeTaskRepository(makeContext(WS)).getTask(
      (json as { capture: { id: string } }).capture.id,
    );
    expect(task?.title).toBe("Follow up academy accommodation");
    // An external capture is an INBOX task: unassigned, by construction.
    expect(task?.project).toBeNull();
    expect(task?.area).toBeNull();
  });

  it("creates a real Note with its Markdown body and its source link", async () => {
    const { token } = await seedToken();
    const { json } = await capture(token, {
      kind: "note",
      title: "OpO modularisation idea",
      text: "Induction may work better as a prerequisite.",
      source: "ios-share-sheet",
      sourceUrl: "https://example.com/article",
      sourceTitle: "The article",
    });

    const noteId = (json as { capture: { id: string } }).capture.id;
    const details = await makeNoteDetailsRepository(makeContext(WS)).get(
      noteId,
    );
    expect(details?.content).toContain(
      "Induction may work better as a prerequisite.",
    );
    expect(details?.content).toContain(
      "Source: [The article](https://example.com/article)",
    );
    expect((json as { capture: { title: string } }).capture.title).toBe(
      "OpO modularisation idea",
    );
  });

  it("reuses the deterministic Task parser rather than a second one", async () => {
    const { token } = await seedToken();
    const { json } = await capture(token, {
      kind: "task",
      text: "Call Sarah tomorrow p1",
      source: "ios-shortcut",
    });
    const task = await makeTaskRepository(makeContext(WS)).getTask(
      (json as { capture: { id: string } }).capture.id,
    );
    // The tokens were consumed by the SAME parser `/tasks/new` uses: "p1" became
    // the priority and the trailing "tomorrow" became the scheduled date, so
    // neither is left littering the title.
    expect(task?.title).toBe("Call Sarah");
    expect(task?.priority).toBe("p1");
    expect(task?.scheduledDate).not.toBeNull();
    // And the phrase is not duplicated into a description nobody asked for.
    expect(task?.description).toBeNull();
  });

  it("resolves a relative date in the OWNER's timezone, not the default", async () => {
    // The owner is in Auckland; the deployment default is Sydney. At 12:30 UTC
    // those are the same calendar day, so the interesting case is an instant
    // where they are NOT — and the capture must follow the owner.
    const { token } = await seedToken();
    // Written through the repository the application itself uses, so the test
    // exercises the real preference path rather than a hand-built row.
    await makeAppPreferencesRepository(makeContext(WS)).update(OWNER_SUBJECT, {
      timezone: "Pacific/Kiritimati",
    });

    const { json } = await capture(token, {
      kind: "task",
      text: "Water the plants today",
      source: "ios-shortcut",
    });
    const task = await makeTaskRepository(makeContext(WS)).getTask(
      (json as { capture: { id: string } }).capture.id,
    );
    // Kiritimati is UTC+14 — the furthest-forward zone there is — so "today"
    // there is never the same as "today" in the Sydney default at every instant.
    // What matters is that the date came from the OWNER's preference: it equals
    // the Kiritimati calendar day for the moment of capture.
    const expected = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Pacific/Kiritimati",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    expect(task?.scheduledDate).toBe(expected);
  });

  it("classifies conservatively when asked to, and never loses the thought", async () => {
    const { token } = await seedToken();
    const ambiguous = await capture(token, {
      kind: "auto",
      text: "Look into camper solar",
      source: "ios-shortcut",
    });
    expect(
      (ambiguous.json as { capture: { destination: string } }).capture
        .destination,
    ).toBe("Inbox");
    expect(await countRows("entities")).toBe(1);
  });

  it("returns a small, useful body with a deep link and nothing internal", async () => {
    const { token } = await seedToken();
    const { json } = await capture(token, {
      kind: "task",
      text: "Something",
      source: "ios-shortcut",
    });
    const body = json as { capture: Record<string, unknown> };
    expect(Object.keys(body.capture).sort()).toEqual([
      "destination",
      "id",
      "kind",
      "path",
      "replayed",
      "title",
    ]);
    expect(body.capture.path).toMatch(/^\/tasks\/[0-9a-f-]+$/);
    // No workspace id, no actor, no token, no storage detail.
    expect(JSON.stringify(json)).not.toContain(WS);
  });
});

/* -------------------------------------------------------------------------- */
/* Authentication                                                             */
/* -------------------------------------------------------------------------- */

describe("authentication — a leaked capture token must not be full access", () => {
  it("refuses a request with no credential", async () => {
    const response = await post(null, { kind: "task", text: "x" });
    expect(response.status).toBe(401);
    expect(await countRows("entities")).toBe(0);
  });

  it("refuses a malformed credential", async () => {
    for (const bad of ["not-a-token", "dhcap_short", "dhcap_"]) {
      const response = await post(bad, { kind: "task", text: "x" });
      expect(response.status).toBe(401);
    }
    expect(await countRows("entities")).toBe(0);
  });

  it("refuses an unknown but well-formed credential", async () => {
    const response = await post(generateCaptureToken(), {
      kind: "task",
      text: "x",
    });
    expect(response.status).toBe(401);
  });

  it("refuses a REVOKED credential immediately, with no grace period", async () => {
    const { token, id } = await seedToken();
    expect(
      (await capture(token, { kind: "task", text: "before" })).status,
    ).toBe(201);
    await env.DB.prepare(
      "UPDATE capture_tokens SET revoked_at = ?1 WHERE id = ?2",
    )
      .bind(new Date().toISOString(), id)
      .run();
    const after = await post(token, { kind: "task", text: "after" });
    expect(after.status).toBe(401);
    expect(await countRows("entities")).toBe(1);
  });

  it("refuses an EXPIRED credential", async () => {
    const { token } = await seedToken({
      expiresAt: new Date("2020-01-01T00:00:00.000Z").toISOString(),
    });
    expect((await post(token, { kind: "task", text: "x" })).status).toBe(401);
  });

  it("gives the SAME answer for unknown, revoked and expired credentials", async () => {
    const unknown = await post(generateCaptureToken(), {
      kind: "task",
      text: "x",
    });
    const { token: revoked } = await seedToken({
      revokedAt: new Date().toISOString(),
    });
    const { token: expired } = await seedToken({
      expiresAt: new Date("2020-01-01T00:00:00.000Z").toISOString(),
    });
    const bodies = await Promise.all(
      [
        unknown,
        await post(revoked, { text: "x" }),
        await post(expired, { text: "x" }),
      ].map(async (response) => JSON.stringify(await response.json())),
    );
    expect(new Set(bodies).size).toBe(1);
  });

  it("refuses a credential that is not permitted to create that kind", async () => {
    const { token } = await seedToken({ capabilities: ["task"] });
    const notes = await post(token, { kind: "note", text: "A note" });
    expect(notes.status).toBe(403);
    expect(await countRows("entities")).toBe(0);
    // And still works for what it IS allowed to do.
    expect((await post(token, { kind: "task", text: "A task" })).status).toBe(
      201,
    );
  });

  it("does not accept the credential on any other method", async () => {
    const { token } = await seedToken();
    for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
      const response = (await captureAction({
        request: new Request("https://hub.daly.id.au/api/capture", {
          method,
          headers: { authorization: `Bearer ${token}` },
        }),
        context: undefined as never,
        params: {},
      } as unknown as Parameters<typeof captureAction>[0])) as Response;
      expect(response.status).toBe(405);
    }
    expect(await countRows("entities")).toBe(0);
  });

  it("records last-used without ever exposing the digest", async () => {
    const { token, id } = await seedToken();
    await capture(token, { kind: "task", text: "x" });
    const row = await env.DB.prepare(
      "SELECT last_used_at, token_hash FROM capture_tokens WHERE id = ?1",
    )
      .bind(id)
      .first<{ last_used_at: string | null; token_hash: string }>();
    expect(row?.last_used_at).not.toBeNull();
    // The stored value is a digest, and it is not the token.
    expect(row?.token_hash).toBe(await hashCaptureToken(token));
    expect(row?.token_hash).not.toContain(token);
  });

  it("stores no raw token anywhere in D1", async () => {
    const { token } = await seedToken();
    await capture(token, { kind: "task", text: "x" });
    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table'",
    ).all<{ name: string }>();
    for (const { name } of tables.results ?? []) {
      if (name.startsWith("sqlite_") || name.startsWith("_cf")) continue;
      const rows = await env.DB.prepare(`SELECT * FROM "${name}"`).all();
      expect(JSON.stringify(rows.results ?? [])).not.toContain(token);
    }
  });
});

/* -------------------------------------------------------------------------- */
/* Workspace isolation                                                        */
/* -------------------------------------------------------------------------- */

describe("workspace isolation is structural, not a check", () => {
  it("refuses a credential minted in another workspace", async () => {
    const { token } = await seedToken({ workspaceId: OTHER });
    expect((await post(token, { kind: "task", text: "x" })).status).toBe(401);
    expect(await countRows("entities", OTHER)).toBe(0);
  });

  it("ignores a workspaceId a caller tries to submit", async () => {
    const { token } = await seedToken();
    const { json } = await capture(token, {
      kind: "task",
      text: "Redirected?",
      workspaceId: OTHER,
      workspace_id: OTHER,
    });
    const created = (json as { capture: { id: string } }).capture.id;
    const row = await env.DB.prepare(
      "SELECT workspace_id FROM entities WHERE id = ?1",
    )
      .bind(created)
      .first<{ workspace_id: string }>();
    expect(row?.workspace_id).toBe(WS);
    expect(await countRows("entities", OTHER)).toBe(0);
  });
});

/* -------------------------------------------------------------------------- */
/* Idempotency                                                                */
/* -------------------------------------------------------------------------- */

describe("idempotency — a phone that retries must not duplicate", () => {
  it("creates one Task for two POSTs with the same clientCaptureId", async () => {
    const { token } = await seedToken();
    const body = {
      kind: "task",
      text: "Book Hilux service",
      source: "ios-shortcut",
      clientCaptureId: "11111111-2222-3333-4444-555555555555",
    };
    const first = await capture(token, body);
    const second = await capture(token, body);

    expect(await countRows("entities")).toBe(1);
    expect((second.json as { capture: { id: string } }).capture.id).toBe(
      (first.json as { capture: { id: string } }).capture.id,
    );
    expect(
      (second.json as { capture: { replayed: boolean } }).capture.replayed,
    ).toBe(true);
    expect(
      (first.json as { capture: { replayed: boolean } }).capture.replayed,
    ).toBe(false);
  });

  it("reports the SAME title on a replay as on the original capture", async () => {
    const { token } = await seedToken();
    const body = {
      kind: "task",
      text: "Call Sarah tomorrow p1",
      clientCaptureId: "99999999-7777-7777-7777-777777777777",
    };
    const first = await capture(token, body);
    const replay = await capture(token, body);
    // The replay reads nothing back; both titles are derived deterministically
    // from the same request against the same owner day.
    expect((replay.json as { capture: { title: string } }).capture.title).toBe(
      (first.json as { capture: { title: string } }).capture.title,
    );
    expect((replay.json as { capture: { title: string } }).capture.title).toBe(
      "Call Sarah",
    );
  });

  it("does NOT deduplicate ordinary repeated human text", async () => {
    const { token } = await seedToken();
    await capture(token, {
      kind: "task",
      text: "Water the plants",
      clientCaptureId: "aaaaaaaa-1111-1111-1111-111111111111",
    });
    await capture(token, {
      kind: "task",
      text: "Water the plants",
      clientCaptureId: "bbbbbbbb-2222-2222-2222-222222222222",
    });
    // The same words, twice, deliberately — two real tasks.
    expect(await countRows("entities")).toBe(2);
  });

  it("scopes the key to the credential, so two devices never collide", async () => {
    const phone = await seedToken({ name: "Phone" });
    const laptop = await seedToken({ name: "Laptop" });
    const clientCaptureId = "cccccccc-3333-3333-3333-333333333333";
    const first = await capture(phone.token, {
      kind: "task",
      text: "From the phone",
      clientCaptureId,
    });
    const second = await capture(laptop.token, {
      kind: "task",
      text: "From the laptop",
      clientCaptureId,
    });
    expect(second.status).toBe(201);
    expect((second.json as { capture: { id: string } }).capture.id).not.toBe(
      (first.json as { capture: { id: string } }).capture.id,
    );
    expect(await countRows("entities")).toBe(2);
  });

  it("creates one Task for two CONCURRENT retries of the same capture", async () => {
    const { token } = await seedToken();
    const body = {
      kind: "task",
      text: "Concurrent retry",
      clientCaptureId: "dddddddd-4444-4444-4444-444444444444",
    };
    const [a, b] = await Promise.all([post(token, body), post(token, body)]);

    // The database arbitrates: exactly one attempt creates. The loser either
    // replays the created id (201) or is told the claim is in flight (409) —
    // both are correct, and neither creates a second record.
    expect(await countRows("entities")).toBe(1);
    expect(
      [a.status, b.status].filter((status) => status === 201).length,
    ).toBeGreaterThanOrEqual(1);
    for (const status of [a.status, b.status]) {
      expect([201, 409]).toContain(status);
    }
  });

  it("works for Notes as well as Tasks", async () => {
    const { token } = await seedToken();
    const body = {
      kind: "note",
      text: "A repeated note",
      clientCaptureId: "eeeeeeee-5555-5555-5555-555555555555",
    };
    await capture(token, body);
    await capture(token, body);
    expect(await countRows("entities")).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Activity                                                                   */
/* -------------------------------------------------------------------------- */

describe("Activity records the source honestly, exactly once", () => {
  it("appends one capture.received beside the record's own entity.created", async () => {
    const { token } = await seedToken({ name: "Aidan’s iPhone" });
    await capture(token, {
      kind: "task",
      text: "Something",
      source: "ios-shortcut",
    });
    expect(await countActivitiesOfType("capture.received")).toBe(1);
    expect(await countActivitiesOfType("entity.created")).toBe(1);

    const row = await env.DB.prepare(
      "SELECT payload_json, actor_type FROM activities WHERE type = 'capture.received'",
    ).first<{ payload_json: string; actor_type: string }>();
    const payload = JSON.parse(row?.payload_json ?? "{}") as Record<
      string,
      unknown
    >;
    expect(payload.source).toBe("ios-shortcut");
    expect(payload.deviceName).toBe("Aidan’s iPhone");
    expect(row?.actor_type).toBe("integration");
  });

  it("puts no captured content in the Activity payload", async () => {
    const { token } = await seedToken();
    await capture(token, {
      kind: "note",
      title: "A private title",
      text: "Something deeply personal",
      source: "ios-shortcut",
      sourceUrl: "https://private.example/page",
    });
    const row = await env.DB.prepare(
      "SELECT payload_json FROM activities WHERE type = 'capture.received'",
    ).first<{ payload_json: string }>();
    expect(row?.payload_json).not.toContain("deeply personal");
    expect(row?.payload_json).not.toContain("A private title");
    expect(row?.payload_json).not.toContain("private.example");
  });

  it("does not append a SECOND capture.received for an idempotent replay", async () => {
    const { token } = await seedToken();
    const body = {
      kind: "task",
      text: "Replayed",
      source: "ios-shortcut",
      clientCaptureId: "ffffffff-6666-6666-6666-666666666666",
    };
    await capture(token, body);
    await capture(token, body);
    expect(await countActivitiesOfType("capture.received")).toBe(1);
  });

  it("records nothing extra for DalyHub's own in-app capture", async () => {
    const { token } = await seedToken();
    await capture(token, {
      kind: "task",
      text: "From the app",
      source: "dalyhub",
    });
    expect(await countActivitiesOfType("capture.received")).toBe(0);
    expect(await countActivitiesOfType("entity.created")).toBe(1);
  });
});

/* -------------------------------------------------------------------------- */
/* Bounds, rate limits and the error model                                     */
/* -------------------------------------------------------------------------- */

describe("the endpoint is bounded", () => {
  it("refuses an absurd body with 413 and writes nothing", async () => {
    const { token } = await seedToken();
    const response = await post(token, {
      kind: "task",
      text: "x".repeat(60_000),
    });
    expect(response.status).toBe(413);
    expect(await countRows("entities")).toBe(0);
  });

  it("refuses a body that claims to be enormous before reading it", async () => {
    const { token } = await seedToken();
    const response = await post(
      token,
      { kind: "task", text: "small" },
      { "content-length": "99999999" },
    );
    expect(response.status).toBe(413);
  });

  it("refuses malformed JSON with a structured 400", async () => {
    const { token } = await seedToken();
    const response = await post(token, "{not json");
    expect(response.status).toBe(400);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("invalid_capture");
  });

  it("refuses a non-JSON content type", async () => {
    const { token } = await seedToken();
    const request = new Request("https://hub.daly.id.au/api/capture", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "text/plain",
      },
      body: "kind=task&text=x",
    });
    const response = (await captureAction({
      request,
      context: undefined as never,
      params: {},
    } as unknown as Parameters<typeof captureAction>[0])) as Response;
    expect(response.status).toBe(400);
  });

  it("bounds a credential's capture rate and answers 429 cleanly", async () => {
    const { token } = await seedToken();
    let limited: Response | null = null;
    for (let attempt = 0; attempt < 40 && limited === null; attempt += 1) {
      const response = await post(token, {
        kind: "task",
        text: `Burst ${attempt}`,
      });
      if (response.status === 429) limited = response;
    }
    expect(limited).not.toBeNull();
    expect(limited?.headers.get("retry-after")).toMatch(/^\d+$/);
    const body = (await limited?.json()) as { error: { code: string } };
    expect(body.error.code).toBe("capture_rate_limited");
  });

  it("lets a normal human burst through untouched", async () => {
    const { token } = await seedToken();
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await post(token, {
        kind: "task",
        text: `Thought ${attempt}`,
      });
      expect(response.status).toBe(201);
    }
  });

  it("bounds one device without bounding another", async () => {
    const noisy = await seedToken({ name: "Noisy" });
    for (let attempt = 0; attempt < 40; attempt += 1) {
      await post(noisy.token, { kind: "task", text: `Noise ${attempt}` });
    }
    const quiet = await seedToken({ name: "Quiet" });
    expect(
      (await post(quiet.token, { kind: "task", text: "Still fine" })).status,
    ).toBe(201);
  });

  it("never leaks infrastructure detail in a failure", async () => {
    const responses = await Promise.all([
      post(null, { text: "x" }),
      post("dhcap_bad", { text: "x" }),
      post((await seedToken()).token, "{broken"),
    ]);
    for (const response of responses) {
      const text = await response.text();
      for (const forbidden of [
        "D1_",
        "SQLITE",
        "SELECT",
        "INSERT",
        "capture_tokens",
        "workspace_id",
        "at Object",
        "stack",
      ]) {
        expect(text).not.toContain(forbidden);
      }
    }
  });
});
