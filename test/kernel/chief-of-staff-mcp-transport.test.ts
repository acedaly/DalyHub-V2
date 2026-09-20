import { describe, expect, it, vi } from "vitest";

import type { ChiefOfStaffRequest } from "~/kernel/chief-of-staff";
import worker from "../../workers/dalyhub-mcp";

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
