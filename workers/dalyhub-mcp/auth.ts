import { createRemoteJWKSet, jwtVerify } from "jose";

export type McpAuthEnv = {
  readonly ENVIRONMENT: string;
  readonly AUTH_MODE: string;
  readonly TEAM_DOMAIN?: string;
  readonly POLICY_AUD?: string;
  readonly DEV_MCP_TOKEN?: string;
};

export type AuthenticatedMcpActor = { readonly subject: string };

export class McpAuthenticationError extends Error {
  readonly status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.name = "McpAuthenticationError";
    this.status = status;
  }
}

let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;
let cachedIssuer: string | undefined;

function accessJwks(issuer: string): ReturnType<typeof createRemoteJWKSet> {
  if (cachedJwks === undefined || cachedIssuer !== issuer) {
    cachedIssuer = issuer;
    cachedJwks = createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
  }
  return cachedJwks;
}

async function constantTimeEqual(
  left: string,
  right: string,
): Promise<boolean> {
  const encoder = new TextEncoder();
  const [a, b] = [encoder.encode(left), encoder.encode(right)];
  if (a.byteLength !== b.byteLength) return false;
  const [aDigest, bDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", a),
    crypto.subtle.digest("SHA-256", b),
  ]);
  const av = new Uint8Array(aDigest);
  const bv = new Uint8Array(bDigest);
  let difference = 0;
  for (let index = 0; index < av.length; index += 1)
    difference |= av[index]! ^ bv[index]!;
  return difference === 0;
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice(7);
}

export async function authenticateMcpRequest(
  request: Request,
  env: McpAuthEnv,
): Promise<AuthenticatedMcpActor> {
  if (env.AUTH_MODE === "development") {
    if (env.ENVIRONMENT !== "development") {
      throw new McpAuthenticationError(
        "Development authentication is disabled",
        503,
      );
    }
    const supplied = bearerToken(request);
    if (!env.DEV_MCP_TOKEN || env.DEV_MCP_TOKEN.length < 32 || !supplied) {
      throw new McpAuthenticationError("Authentication required");
    }
    if (!(await constantTimeEqual(supplied, env.DEV_MCP_TOKEN))) {
      throw new McpAuthenticationError("Authentication required");
    }
    return { subject: "local-mcp-developer" };
  }

  if (
    env.AUTH_MODE !== "cloudflare-access" ||
    !env.TEAM_DOMAIN ||
    !env.POLICY_AUD
  ) {
    throw new McpAuthenticationError(
      "MCP authentication is not configured",
      503,
    );
  }
  const token = request.headers.get("cf-access-jwt-assertion");
  if (!token) throw new McpAuthenticationError("Authentication required");

  const issuer = env.TEAM_DOMAIN.replace(/\/$/, "");
  if (
    !issuer.startsWith("https://") ||
    !issuer.endsWith(".cloudflareaccess.com")
  ) {
    throw new McpAuthenticationError(
      "MCP authentication is not configured",
      503,
    );
  }
  try {
    const { payload } = await jwtVerify(token, accessJwks(issuer), {
      issuer,
      audience: env.POLICY_AUD,
      algorithms: ["RS256"],
    });
    if (typeof payload.sub !== "string" || payload.sub.length === 0) {
      throw new McpAuthenticationError("Authentication required");
    }
    return { subject: payload.sub };
  } catch (cause) {
    if (cause instanceof McpAuthenticationError) throw cause;
    throw new McpAuthenticationError("Authentication required");
  }
}
