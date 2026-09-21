import { describe, expect, it, vi } from "vitest";

import { authenticateMcpRequest } from "../../workers/dalyhub-mcp/auth";
import {
  createDalyHubMcpServer,
  MCP_TOOL_NAMES,
} from "../../workers/dalyhub-mcp/tools";

const token = "local-development-token-that-is-long-enough";
function localEnv() {
  return {
    ENVIRONMENT: "development",
    AUTH_MODE: "development",
    DEV_MCP_TOKEN: token,
  } as unknown as McpEnv;
}

function post(body: unknown, authorised = true) {
  return new Request("http://localhost/mcp", {
    method: "POST",
    headers: {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...(authorised ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("Chief of Staff MCP transport", () => {
  it("registers exactly the bounded Chief of Staff tools and no destructive/admin tool", () => {
    const server = createDalyHubMcpServer(vi.fn(), "owner-subject");
    for (const name of MCP_TOOL_NAMES) {
      expect(server.toolInputSchemaJson(name)).toBeDefined();
    }
    expect(MCP_TOOL_NAMES).toHaveLength(34);
    expect(new Set(MCP_TOOL_NAMES).size).toBe(MCP_TOOL_NAMES.length);
    expect(
      MCP_TOOL_NAMES.some((name) =>
        /delete|destroy|purge|merge|bulk|sql|query_db|admin|secret|token|proxy|fetch|exec/.test(
          name,
        ),
      ),
    ).toBe(false);
    // Every domain is reachable, and ONLY through its bounded read/create/
    // update tools — no deletion path exists for any of them. Archiving is the
    // whole of "put it away", and it is reversible through the same tool.
    expect(MCP_TOOL_NAMES).toEqual(
      expect.arrayContaining([
        "create_project",
        "update_project",
        "create_note",
        "update_note",
        "get_note",
        "get_people",
        "get_person",
        "create_person",
        "update_person",
        "get_areas",
        "get_area",
        "create_area",
        "update_area",
        "get_goals",
        "get_goal",
        "create_goal",
        "update_goal",
      ]),
    );
  });

  it("keeps every established tool name, so an existing Claude setup still works", () => {
    // BACKWARDS COMPATIBILITY, asserted rather than assumed: the first
    // Chief-of-Staff release published these eighteen names, and a rename
    // would silently break the owner's saved prompts and habits.
    for (const established of [
      "get_chief_of_staff_context",
      "get_weekly_review_context",
      "get_today",
      "get_projects",
      "get_project",
      "get_note",
      "search_dalyhub",
      "capture_item",
      "create_task",
      "update_task",
      "complete_task",
      "create_project",
      "update_project",
      "create_note",
      "update_note",
      "record_decision",
      "create_waiting_for",
      "resolve_waiting_for",
    ]) {
      expect(MCP_TOOL_NAMES).toContain(established);
    }
  });

  it("accepts a person's name as a reference, and rejects an empty one", () => {
    const server = createDalyHubMcpServer(vi.fn(), "owner-subject");
    const schema = server.toolInputSchemaJson("get_person") as {
      properties: { personId: { maxLength?: number; minLength?: number } };
      required?: readonly string[];
    };
    // A reference is a NAME-sized string, not an id-sized one: "John Smith"
    // and a UUID both have to fit, and neither may be empty.
    expect(schema.properties.personId.minLength).toBe(1);
    expect(schema.properties.personId.maxLength).toBe(200);
    expect(schema.required).toContain("personId");
  });

  it("accepts only the explicitly configured local bearer secret", async () => {
    await expect(
      authenticateMcpRequest(post({}, true), localEnv()),
    ).resolves.toEqual({ subject: "local-mcp-developer" });
    await expect(
      authenticateMcpRequest(
        new Request("http://localhost/mcp", {
          headers: { authorization: "Bearer wrong-token" },
        }),
        localEnv(),
      ),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("cannot enable development authentication in production", async () => {
    await expect(
      authenticateMcpRequest(post({}, true), {
        ...localEnv(),
        ENVIRONMENT: "production",
      }),
    ).rejects.toMatchObject({ status: 503 });
  });

  it("fails closed when production Access configuration or its assertion is absent", async () => {
    await expect(
      authenticateMcpRequest(post({}, false), {
        ENVIRONMENT: "production",
        AUTH_MODE: "cloudflare-access",
      }),
    ).rejects.toMatchObject({ status: 503 });
    await expect(
      authenticateMcpRequest(post({}, false), {
        ENVIRONMENT: "production",
        AUTH_MODE: "cloudflare-access",
        TEAM_DOMAIN: "https://owner.cloudflareaccess.com",
        POLICY_AUD: "mcp-audience",
      }),
    ).rejects.toMatchObject({ status: 401 });
  });
});
