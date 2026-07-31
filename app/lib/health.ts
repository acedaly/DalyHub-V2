/**
 * Health payload construction, kept as a pure function so it can be unit
 * tested without the Workers runtime.
 *
 * Deliberately minimal: it reports liveness, the application name, the running
 * version and the deployment environment when it is safe to do so. It never
 * reflects secrets, bindings, build internals, or arbitrary environment values.
 *
 * RELEASE-01 — the name, version and environment come from the ONE version
 * authority (`app/lib/version.ts`), the same one the About screen reads, so a
 * deployment check and the in-app About can never disagree about what is running.
 * The commit identifier is deliberately NOT included here: `/health` is the
 * liveness endpoint used by smoke checks and uptime monitoring, and which build a
 * deployment is running is not something that surface needs to publish.
 */

import { buildInfo, type VersionEnvironment } from "./version";

export interface HealthPayload {
  status: "ok";
  name: string;
  version: string;
  environment: string;
}

export function buildHealthPayload(
  env?: VersionEnvironment | undefined,
): HealthPayload {
  const build = buildInfo(env);
  return {
    status: "ok",
    name: build.name,
    version: build.version,
    environment: build.environment,
  };
}

export function healthResponse(env?: VersionEnvironment): Response {
  return Response.json(buildHealthPayload(env), {
    status: 200,
    headers: {
      "cache-control": "no-store",
    },
  });
}
