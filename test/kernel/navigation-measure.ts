/**
 * PERF-01 — measure one real route loader, end to end, over the real D1.
 *
 * The loaders under measurement reach their database through `env.DB` from
 * `cloudflare:workers`, exactly as they do in production — so measuring them
 * means substituting the binding for the duration of the call rather than
 * handing them an injected scope. That substitution is what makes the number
 * complete: it includes the workspace-existence check and the preferences read
 * that every loader pays before its own work starts, which an injected scope
 * would silently omit.
 *
 * The binding is always restored, including on a throw.
 */

import { env } from "cloudflare:test";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";

import { profileDb, type RecordedStatement } from "./perf-instrument";

export const PERF_OWNER = "perf-owner-subject";

/** An authenticated request context, the way the Worker boundary builds one. */
export function perfContext(subject = PERF_OWNER): RouterContextProvider {
  const context = new RouterContextProvider();
  const session: AuthenticatedSession = {
    user: { subject, email: "owner@example.test", displayName: "Perf Owner" },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  setAuthenticatedSession(context, session);
  return context;
}

/** A loader as the framework calls it, narrowed to what a measurement needs. */
export type MeasurableLoader = (args: {
  readonly request: Request;
  readonly context: RouterContextProvider;
  readonly params: Record<string, string>;
}) => Promise<unknown>;

/**
 * Adopt a real route loader as a measurable one.
 *
 * React Router generates a per-route argument type carrying `url`, `pattern`,
 * `matches` and the route's own `Info`, none of which the loaders measured here
 * read — they take `{ request, context }` and nothing else. Rather than
 * fabricate a whole typed match tree per route just to call a function, the
 * narrowing is done ONCE, here, where the reason for it is written down. If a
 * measured loader ever starts reading `matches`, this is where it will fail.
 */
export function measurable(loader: unknown): MeasurableLoader {
  return loader as MeasurableLoader;
}

export interface LoaderMeasurement {
  /** What the loader returned (or the thrown Response, for a redirect). */
  readonly result: unknown;
  /** `prepare()` calls — the same unit every existing statement budget uses. */
  readonly statements: number;
  /** Executions issued (a `batch` counts once: it is one round trip). */
  readonly executions: number;
  /** Serial round-trip depth: the longest chain of statements that waited. */
  readonly depth: number;
  /** The recorded executions, for a plan or payload pass. */
  readonly records: readonly RecordedStatement[];
  /** The JSON size of the loader's return value, in bytes. */
  readonly payloadBytes: number;
}

/** Run one loader against the instrumented binding and report what it cost. */
export async function measureLoader(
  loader: MeasurableLoader,
  url: string,
  options: { readonly params?: Record<string, string> } = {},
): Promise<LoaderMeasurement> {
  const profile = profileDb(env.DB);
  const original = env.DB;
  let result: unknown;
  try {
    (env as unknown as Record<string, unknown>).DB = profile.db;
    result = await loader({
      request: new Request(url),
      context: perfContext(),
      params: options.params ?? {},
    });
  } catch (error) {
    // A loader that throws a Response (a redirect, a 401) has still done its
    // reads, and the measurement is about the reads.
    if (!(error instanceof Response)) throw error;
    result = error;
  } finally {
    (env as unknown as Record<string, unknown>).DB = original;
  }
  return {
    result,
    statements: profile.prepared(),
    executions: profile.executions(),
    depth: profile.depth(),
    records: profile.records(),
    payloadBytes: jsonBytes(result),
  };
}

/** The serialized size a `.data` response would carry for this loader value. */
export function jsonBytes(value: unknown): number {
  if (value instanceof Response) return 0;
  try {
    return new TextEncoder().encode(JSON.stringify(value ?? null)).length;
  } catch {
    return -1;
  }
}
