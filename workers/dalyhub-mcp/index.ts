import { createMcpHandler } from "agents/mcp/server";

import type {
  ChiefOfStaffRequest,
  ChiefOfStaffResult,
} from "~/kernel/chief-of-staff";
import type { ChiefOfStaffEntrypoint } from "../app";
import { authenticateMcpRequest, McpAuthenticationError } from "./auth";
import { createDalyHubMcpServer } from "./tools";

type DalyHubBinding = Service<typeof ChiefOfStaffEntrypoint>;

function jsonError(status: number, error: string): Response {
  const headers = new Headers({ "cache-control": "no-store" });
  if (status === 401)
    headers.set("www-authenticate", 'Bearer realm="dalyhub-mcp"');
  return Response.json(
    { error },
    {
      status,
      headers,
    },
  );
}

export default {
  async fetch(request, env, ctx): Promise<Response> {
    if (new URL(request.url).pathname !== "/mcp")
      return jsonError(404, "Not found");
    let actor;
    try {
      actor = await authenticateMcpRequest(request, env);
    } catch (error) {
      if (error instanceof McpAuthenticationError)
        return jsonError(error.status, error.message);
      return jsonError(401, "Authentication required");
    }

    const dalyhub = env.DALYHUB as DalyHubBinding;
    const allowedHostnames =
      env.ENVIRONMENT === "production"
        ? ["mcp.daly.id.au"]
        : ["localhost", "127.0.0.1"];
    const handler = createMcpHandler(
      () =>
        createDalyHubMcpServer(
          (rpcRequest: ChiefOfStaffRequest): Promise<ChiefOfStaffResult> =>
            dalyhub.invoke(rpcRequest),
          actor.subject,
        ),
      {
        route: "/mcp",
        allowedHostnames,
      },
    );
    return handler(request, env, ctx);
  },
} satisfies ExportedHandler<McpEnv>;
