/**
 * AUDIT-FIX-04 — the mutation-provenance guard against the REAL runtime.
 *
 * The unit suites prove the policy and the boundary's ordering with spies. This
 * one closes the loop the only way that actually settles the question:
 *
 *   - a genuine workerd `Request`, whose `Origin` and `Sec-Fetch-Site` headers
 *     are real headers (a browser DOM's `Request` refuses to carry them, which
 *     is why the unit suites need a builder and this one does not);
 *   - the real request boundary, with the real development authenticator;
 *   - a real DalyHub mutation route — `POST /tasks/new` — writing to a real,
 *     isolated, migrated D1.
 *
 * So "the rejection happens before any application work" is not asserted from a
 * spy's call count alone; it is proven by the database being untouched.
 */

import { env } from "cloudflare:test";
import { RouterContextProvider } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { action as taskCreateAction } from "~/modules/tasks/routes/new";
import type { TasksCreateResult } from "~/modules/tasks/tasks-contract";
import { handleAuthenticatedRequest } from "~/platform/request";

import { countActivities, resetTables } from "./support";

const WS = "test-default-workspace";
const APP = "https://hub.daly.id.au";
const CREATE = `${APP}/tasks/new`;
const SIBLING = "https://other.daly.id.au";
const HOSTILE = "https://evil.example";

/**
 * The environment the boundary reads. Development auth is the one authenticator
 * that runs without a live Access application, and it is gated on an explicit
 * development `ENVIRONMENT` (ADR-016 §5.8), exactly as `pnpm dev` and the
 * Playwright suite use it.
 */
const DEV_ENV = {
  AUTH_MODE: "development",
  ENVIRONMENT: "development",
  DEV_AUTH_SUBJECT: "local-owner",
  DEV_AUTH_EMAIL: "owner@example.invalid",
  DB: env.DB,
  DEFAULT_WORKSPACE_ID: WS,
};

/** A request handler that drives the REAL task-create action. */
function realTaskCreateHandler() {
  return vi.fn(
    async (
      request: Request,
      context?: RouterContextProvider,
    ): Promise<Response> =>
      (await taskCreateAction({
        request,
        context,
        params: {},
      } as unknown as Parameters<typeof taskCreateAction>[0])) as Response,
  );
}

interface CaptureShape {
  readonly method?: string;
  readonly origin?: string;
  readonly fetchSite?: string;
  readonly title?: string;
}

/** A real runtime request carrying whatever provenance the case describes. */
function captureRequest({
  method = "POST",
  origin,
  fetchSite,
  title = "Buy milk",
}: CaptureShape): Request {
  const body = new FormData();
  body.set("title", title);
  const headers = new Headers();
  if (origin !== undefined) headers.set("Origin", origin);
  if (fetchSite !== undefined) headers.set("Sec-Fetch-Site", fetchSite);
  return new Request(CREATE, { method, body, headers });
}

/** How many task rows exist right now, straight from D1. */
async function countTasks(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM entities WHERE type = 'task'",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

/** How many membership rows exist right now, straight from D1. */
async function countMembers(): Promise<number> {
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM workspace_members",
  ).first<{ n: number }>();
  return row?.n ?? 0;
}

describe("request boundary — mutation provenance against the real runtime", () => {
  beforeEach(async () => {
    await resetTables([WS]);
  });

  it("carries the forbidden provenance headers on a real runtime Request", async () => {
    // The premise the rest of this file rests on: unlike a browser DOM's
    // `Request`, workerd's carries `Origin` and `Sec-Fetch-Site` verbatim — so
    // what the boundary reads here is what a real browser would have sent.
    const request = captureRequest({
      origin: APP,
      fetchSite: "same-origin",
    });
    expect(request.headers.get("Origin")).toBe(APP);
    expect(request.headers.get("Sec-Fetch-Site")).toBe("same-origin");
  });

  it("creates the Task on a genuine same-origin submission", async () => {
    const handler = realTaskCreateHandler();
    const provisioner = vi.fn(() => Promise.resolve());

    const response = await handleAuthenticatedRequest(
      captureRequest({ origin: APP, fetchSite: "same-origin" }),
      DEV_ENV,
      handler,
      undefined,
      provisioner,
    );

    expect(response.status).toBe(200);
    const payload = (await response.json()) as TasksCreateResult;
    expect(payload.ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(provisioner).toHaveBeenCalledTimes(1);

    // The write really happened, through the ordinary route.
    expect(await countTasks()).toBe(1);
    expect(await countActivities()).toBe(1);
  });

  it.each([
    ["a plainly hostile origin", HOSTILE, "cross-site"],
    ["a SIBLING same-site origin", SIBLING, "same-site"],
    ["no provenance at all", undefined, undefined],
    ["a contradictory pair", HOSTILE, "same-origin"],
  ])(
    "rejects %s before the route runs, leaving the database untouched",
    async (_label, origin, fetchSite) => {
      const handler = realTaskCreateHandler();
      const provisioner = vi.fn(() => Promise.resolve());

      const response = await handleAuthenticatedRequest(
        captureRequest({ origin, fetchSite, title: "Attacker task" }),
        DEV_ENV,
        handler,
        undefined,
        provisioner,
      );

      expect(response.status).toBe(403);
      // The route never ran…
      expect(handler).not.toHaveBeenCalled();
      expect(provisioner).not.toHaveBeenCalled();
      // …and D1 proves it: no Task, no Activity, no membership row.
      expect(await countTasks()).toBe(0);
      expect(await countActivities()).toBe(0);
      expect(await countMembers()).toBe(0);

      // Nothing about D1, React Router or the route leaks out.
      const body = await response.text();
      expect(body).toBe("Request rejected.");
      const exposed = [...response.headers.values()].join(" ") + " " + body;
      for (const detail of [
        "D1_",
        "SQLITE",
        "entities",
        "tasks/new",
        "react-router",
        "Attacker task",
        HOSTILE,
        SIBLING,
      ]) {
        expect(exposed).not.toContain(detail);
      }
      // And no CORS surface is opened by the rejection.
      expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    },
  );

  it("still refuses after a legitimate mutation has succeeded in the same session", async () => {
    // Guards that only work on a cold boundary are not guards. Create one Task
    // normally, then attack: the count must not move.
    await handleAuthenticatedRequest(
      captureRequest({ origin: APP, fetchSite: "same-origin" }),
      DEV_ENV,
      realTaskCreateHandler(),
      undefined,
      vi.fn(() => Promise.resolve()),
    );
    expect(await countTasks()).toBe(1);

    const handler = realTaskCreateHandler();
    const response = await handleAuthenticatedRequest(
      captureRequest({
        origin: SIBLING,
        fetchSite: "same-site",
        title: "Attacker task",
      }),
      DEV_ENV,
      handler,
      undefined,
      vi.fn(() => Promise.resolve()),
    );

    expect(response.status).toBe(403);
    expect(handler).not.toHaveBeenCalled();
    expect(await countTasks()).toBe(1);
    expect(await countActivities()).toBe(1);
  });

  it("leaves a protected READ through the real boundary working", async () => {
    const handler = vi.fn(
      (_request: Request, _context?: RouterContextProvider) =>
        Promise.resolve(new Response("today")),
    );
    const response = await handleAuthenticatedRequest(
      new Request(`${APP}/today`),
      DEV_ENV,
      handler,
      undefined,
      vi.fn(() => Promise.resolve()),
    );
    expect(response.status).toBe(200);
    expect(handler).toHaveBeenCalledTimes(1);
  });
});
