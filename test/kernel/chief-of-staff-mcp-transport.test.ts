import { describe, expect, it, vi } from "vitest";

import type { ChiefOfStaffRequest } from "~/kernel/chief-of-staff";
import worker from "../../workers/dalyhub-mcp";
import { MCP_TOOL_NAMES } from "../../workers/dalyhub-mcp/tools";

const token = "local-development-token-that-is-long-enough";
const executionContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  props: {},
} as unknown as ExecutionContext;

function localEnv(invoke = vi.fn()) {
  return {
    ENVIRONMENT: "development",
    AUTH_MODE: "development",
    DEV_MCP_TOKEN: token,
    DALYHUB: { invoke },
  } as unknown as McpEnv;
}

function post(
  body: unknown,
  authorised = true,
): Parameters<typeof worker.fetch>[0] {
  const request = new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      origin: "http://localhost",
      "mcp-protocol-version": "2025-11-25",
      ...(authorised ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  // Constructed Fetch Requests do not carry the network-owned Host header that
  // workerd supplies to a real inbound request. Preserve the real Request while
  // supplying that one network fact to the handler's DNS-rebinding guard.
  const headers = new Proxy(request.headers, {
    get(target, property) {
      if (property === "get") {
        return (name: string) =>
          name.toLowerCase() === "host" ? "localhost" : target.get(name);
      }
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
  return new Proxy(request, {
    get(target, property) {
      if (property === "headers") return headers;
      const value = Reflect.get(target, property, target) as unknown;
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as unknown as Parameters<typeof worker.fetch>[0];
}

async function mcpPayload(
  response: Response,
): Promise<Record<string, unknown>> {
  const body = await response.text();
  const data = body
    .split("\n")
    .find((line) => line.startsWith("data: "))
    ?.slice("data: ".length);
  return JSON.parse(data ?? body) as Record<string, unknown>;
}

describe("Chief of Staff MCP Streamable HTTP boundary", () => {
  it("denies unauthenticated requests before any service-binding invocation", async () => {
    const invoke = vi.fn();
    const response = await worker.fetch(
      post({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }, false),
      localEnv(invoke),
      executionContext,
    );
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain("Bearer");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("invokes an authorised read tool through Streamable HTTP and the private RPC contract", async () => {
    const invoke = vi.fn(async (request: ChiefOfStaffRequest) => ({
      echoedAction: request.action,
    }));
    const response = await worker.fetch(
      post({
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name: "get_today", arguments: {} },
      }),
      localEnv(invoke),
      executionContext,
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const payload = (await mcpPayload(response)) as {
      result?: { structuredContent?: { echoedAction?: string } };
    };
    expect(payload.result?.structuredContent?.echoedAction).toBe("get_today");
    expect(invoke).toHaveBeenCalledWith({ action: "get_today" });
  });

  it("carries the verified Access subject into a Project/Note write", async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    const response = await worker.fetch(
      post({
        jsonrpc: "2.0",
        id: 11,
        method: "tools/call",
        params: {
          name: "create_note",
          arguments: {
            title: "Reporting background",
            content: "Context worth keeping.",
            projectId: "prj_1",
          },
        },
      }),
      localEnv(invoke),
      executionContext,
    );
    expect(response.status, await response.clone().text()).toBe(200);
    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create_note",
        actor: expect.objectContaining({ subject: "local-mcp-developer" }),
        input: expect.objectContaining({ projectId: "prj_1" }),
      }),
    );
  });

  it("rejects malformed Project/Note input before the service binding is called", async () => {
    const invoke = vi.fn();
    for (const params of [
      { name: "create_project", arguments: { title: "", areaId: "area_1" } },
      {
        name: "update_project",
        arguments: { projectId: "prj_1", status: "finished" },
      },
      {
        name: "create_note",
        arguments: { title: "Tagged", tags: [""] },
      },
      { name: "get_note", arguments: {} },
    ]) {
      const response = await worker.fetch(
        post({ jsonrpc: "2.0", id: 12, method: "tools/call", params }),
        localEnv(invoke),
        executionContext,
      );
      const payload = (await mcpPayload(response)) as {
        result?: { isError?: boolean };
        error?: unknown;
      };
      expect(
        payload.error !== undefined || payload.result?.isError === true,
        `${params.name} should have been refused`,
      ).toBe(true);
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it("advertises exactly the bounded tool surface, each described well enough to choose it", async () => {
    const response = await worker.fetch(
      post({ jsonrpc: "2.0", id: 20, method: "tools/list", params: {} }),
      localEnv(),
      executionContext,
    );
    const payload = (await mcpPayload(response)) as {
      result?: {
        tools?: readonly { name: string; description?: string }[];
      };
    };
    const tools = payload.result?.tools ?? [];
    expect([...tools.map((tool) => tool.name)].sort()).toEqual(
      [...MCP_TOOL_NAMES].sort(),
    );

    // The descriptions are the only thing standing between "create an area
    // called Wedding" and a Project called Wedding, so each creation tool says
    // what its record IS — and, where it is confusable, what it is not.
    const describe_ = (name: string) =>
      tools.find((tool) => tool.name === name)?.description ?? "";
    expect(describe_("create_area")).toMatch(/long-running|responsibilit/i);
    expect(describe_("create_area")).toMatch(/not use it for a finite/i);
    expect(describe_("create_project")).toMatch(/finite outcome/i);
    expect(describe_("create_goal")).toMatch(/outcome/i);
    expect(describe_("create_person")).toMatch(/person\/contact/i);
    expect(describe_("capture_item")).toMatch(/unstructured/i);
    expect(describe_("capture_item")).toMatch(/create_person/);
    for (const tool of tools) {
      expect(tool.description ?? "").not.toBe("");
    }
  });

  it("maps every advertised tool onto exactly one request-union action", async () => {
    /*
     * The MCP tool list and the ChiefOfStaffEntrypoint's closed request union
     * are two lists that have to stay the same list. TypeScript makes the
     * SERVICE exhaustive over the union; nothing but this makes the TOOLS
     * exhaustive over it, so a tool added without a union member — or wired to
     * the wrong action — is caught here rather than at the first real call.
     */
    const minimalArguments: Record<string, Record<string, unknown>> = {
      get_chief_of_staff_context: {},
      get_weekly_review_context: {},
      get_today: {},
      get_projects: {},
      get_project: { projectId: "p1" },
      get_note: { noteId: "n1" },
      get_notes: {},
      get_people: {},
      get_person: { personId: "pe1" },
      get_areas: {},
      get_area: { areaId: "a1" },
      get_goals: {},
      get_goal: { goalId: "g1" },
      get_decisions: {},
      get_waiting_for: {},
      search_dalyhub: { query: "opo" },
      capture_item: { type: "idea", title: "Something" },
      create_task: { title: "Something" },
      update_task: { taskId: "t1", title: "Something" },
      complete_task: { taskId: "t1" },
      reopen_task: { taskId: "t1" },
      create_project: { title: "Something", areaId: "a1" },
      update_project: { projectId: "p1", title: "Something" },
      create_person: { name: "Someone" },
      update_person: { personId: "pe1", role: "Something" },
      create_area: { title: "Something" },
      update_area: { areaId: "a1", title: "Something" },
      create_goal: { title: "Something", areaId: "a1" },
      update_goal: { goalId: "g1", title: "Something" },
      create_note: { title: "Something" },
      update_note: { noteId: "n1", title: "Something" },
      record_decision: { decision: "Did it", decisionDate: "2026-09-21" },
      create_waiting_for: { what: "A reply", personOrSource: "John" },
      resolve_waiting_for: { taskId: "t1" },
    };
    expect(Object.keys(minimalArguments).sort()).toEqual(
      [...MCP_TOOL_NAMES].sort(),
    );

    for (const name of MCP_TOOL_NAMES) {
      const invoke = vi.fn(async () => ({ ok: true }));
      const response = await worker.fetch(
        post({
          jsonrpc: "2.0",
          id: 30,
          method: "tools/call",
          params: { name, arguments: minimalArguments[name] },
        }),
        localEnv(invoke),
        executionContext,
      );
      expect(response.status, `${name} was not accepted`).toBe(200);
      expect(
        invoke,
        `${name} did not reach the entrypoint`,
      ).toHaveBeenCalledWith(expect.objectContaining({ action: name }));
      // A write carries the verified Access subject; a read carries no actor
      // at all, so a read can never be attributed as if it had changed data.
      const request = invoke.mock.calls[0]?.[0] as
        (ChiefOfStaffRequest & { actor?: { subject?: string } }) | undefined;
      const isWrite =
        name.startsWith("create_") ||
        name.startsWith("update_") ||
        [
          "capture_item",
          "complete_task",
          "reopen_task",
          "record_decision",
          "resolve_waiting_for",
        ].includes(name);
      expect(request?.actor?.subject, `${name} actor`).toBe(
        isWrite ? "local-mcp-developer" : undefined,
      );
    }
  });

  it("carries a People write, with its named references, over the same contract", async () => {
    const invoke = vi.fn(async () => ({ ok: true }));
    const response = await worker.fetch(
      post({
        jsonrpc: "2.0",
        id: 21,
        method: "tools/call",
        params: {
          name: "create_person",
          arguments: {
            name: "Vaughn Ellis",
            role: "Finance Manager",
            projectIds: ["OpO3 Finance Sessions"],
          },
        },
      }),
      localEnv(invoke),
      executionContext,
    );
    expect(response.status, await response.clone().text()).toBe(200);
    expect(invoke).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "create_person",
        actor: expect.objectContaining({ subject: "local-mcp-developer" }),
        input: expect.objectContaining({
          name: "Vaughn Ellis",
          // A human-readable reference reaches the application layer verbatim;
          // the MCP Worker resolves nothing and knows nothing about the data.
          projectIds: ["OpO3 Finance Sessions"],
        }),
      }),
    );
  });

  it("returns an ambiguity as an ordinary result, not an error", async () => {
    // An ambiguous reference is the tool declining to guess, and Claude needs
    // the candidates to ask the owner which John. Flattening it into an error
    // string would lose exactly the part that makes it answerable.
    const invoke = vi.fn(async () => ({
      status: "ambiguous_reference",
      field: "personId",
      matches: [
        { type: "person", id: "pe1", title: "John Smith", subtitle: "Finance" },
        { type: "person", id: "pe2", title: "John Smith", subtitle: "Orana" },
      ],
    }));
    const response = await worker.fetch(
      post({
        jsonrpc: "2.0",
        id: 22,
        method: "tools/call",
        params: {
          name: "create_note",
          arguments: { title: "Discussed OpO3", personId: "John" },
        },
      }),
      localEnv(invoke),
      executionContext,
    );
    const payload = (await mcpPayload(response)) as {
      result?: {
        isError?: boolean;
        structuredContent?: { status?: string; matches?: unknown[] };
      };
    };
    expect(payload.result?.isError).not.toBe(true);
    expect(payload.result?.structuredContent?.status).toBe(
      "ambiguous_reference",
    );
    expect(payload.result?.structuredContent?.matches).toHaveLength(2);
  });

  it("rejects malformed People/Area/Goal input before the service binding is called", async () => {
    const invoke = vi.fn();
    for (const params of [
      { name: "create_person", arguments: { name: "" } },
      { name: "create_person", arguments: {} },
      {
        name: "create_person",
        arguments: { name: "Kate", relationship: "frenemy" },
      },
      {
        name: "create_person",
        arguments: { name: "Kate", followUpFrequency: "hourly" },
      },
      { name: "create_area", arguments: { title: "   " } },
      { name: "update_area", arguments: { title: "No id" } },
      { name: "create_goal", arguments: { title: "No area" } },
      {
        name: "create_goal",
        arguments: { title: "Bad date", areaId: "Health", targetDate: "soon" },
      },
      {
        name: "update_goal",
        arguments: { goalId: "g1", condition: "crushing it" },
      },
      { name: "get_person", arguments: {} },
      { name: "reopen_task", arguments: { taskId: "" } },
      {
        name: "create_person",
        arguments: { name: "Too linked", projectIds: Array(11).fill("p") },
      },
    ]) {
      const response = await worker.fetch(
        post({ jsonrpc: "2.0", id: 23, method: "tools/call", params }),
        localEnv(invoke),
        executionContext,
      );
      const payload = (await mcpPayload(response)) as {
        result?: { isError?: boolean };
        error?: unknown;
      };
      expect(
        payload.error !== undefined || payload.result?.isError === true,
        `${params.name} should have been refused: ${JSON.stringify(params.arguments)}`,
      ).toBe(true);
    }
    expect(invoke).not.toHaveBeenCalled();
  });

  it("rejects malformed tool input before the service binding is called", async () => {
    const invoke = vi.fn();
    const response = await worker.fetch(
      post({
        jsonrpc: "2.0",
        id: 8,
        method: "tools/call",
        params: {
          name: "create_task",
          arguments: { title: "", dueDate: "tomorrow" },
        },
      }),
      localEnv(invoke),
      executionContext,
    );
    expect(response.status, await response.clone().text()).toBe(200);
    const payload = (await mcpPayload(response)) as {
      result?: { isError?: boolean };
      error?: unknown;
    };
    expect(
      payload.error !== undefined || payload.result?.isError === true,
    ).toBe(true);
    expect(invoke).not.toHaveBeenCalled();
  });
});
