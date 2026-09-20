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
    expect(MCP_TOOL_NAMES).toHaveLength(18);
    expect(
      MCP_TOOL_NAMES.some((name) =>
        /delete|destroy|purge|merge|bulk|sql|query_db|admin|secret|token|proxy|fetch|exec/.test(
          name,
        ),
      ),
    ).toBe(false);
    // The Project and Note domains are reachable, and ONLY through their
    // bounded create/update tools — no deletion path exists for either.
    expect(MCP_TOOL_NAMES).toEqual(
      expect.arrayContaining([
        "create_project",
        "update_project",
        "create_note",
        "update_note",
        "get_note",
      ]),
    );
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
