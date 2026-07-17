/**
 * Health payload construction, kept as a pure function so it can be unit
 * tested without the Workers runtime.
 *
 * Deliberately minimal: it reports liveness, the application name, and the
 * deployment environment when it is safe to do so. It never reflects secrets,
 * bindings, build internals, or arbitrary environment values.
 */

export interface HealthPayload {
  status: "ok";
  name: string;
  environment: string;
}

const APPLICATION_NAME = "DalyHub";

/** Environment labels we are willing to expose publicly. */
const KNOWN_ENVIRONMENTS = new Set([
  "development",
  "preview",
  "staging",
  "production",
]);

export function buildHealthPayload(
  env?: { ENVIRONMENT?: string } | undefined,
): HealthPayload {
  const rawEnvironment = env?.ENVIRONMENT;
  const environment =
    typeof rawEnvironment === "string" && KNOWN_ENVIRONMENTS.has(rawEnvironment)
      ? rawEnvironment
      : "unknown";

  return {
    status: "ok",
    name: APPLICATION_NAME,
    environment,
  };
}

export function healthResponse(env?: { ENVIRONMENT?: string }): Response {
  return Response.json(buildHealthPayload(env), {
    status: 200,
    headers: {
      "cache-control": "no-store",
    },
  });
}
