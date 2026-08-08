/**
 * PWA-11 — safe diagnostics for the offline surface.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 * The iPhone failure this module was written for produced exactly one piece of
 * evidence: WebKit's "A problem repeatedly occurred" page. Nothing on the device
 * said whether the cause was a failed module load, an IndexedDB that never
 * answered, a service worker that had not activated, or an authentication
 * redirect. Distinguishing those AFTER the fact is impossible; recording them as
 * they happen is cheap.
 *
 * ── What it will never record ────────────────────────────────────────────────
 * DalyHub sits behind Cloudflare Access and the owner's records are the most
 * private data they have, so this file is deliberately paranoid about what it is
 * allowed to keep:
 *
 *   - a bounded, redacted DETAIL string, never a response body, never form input;
 *   - a url reduced to its ORIGIN-RELATIVE PATH, with the query string and any
 *     fragment removed, because an Access redirect carries a token in its query;
 *   - anything token-shaped inside the remaining text replaced with `[redacted]`.
 *
 * The surface the owner sees shows the CODE and a count. The detail is available
 * to a test and to the console, and nothing here is ever sent anywhere: there is
 * no path from this module to a network request.
 *
 * ── And it must never become the loop it is diagnosing ───────────────────────
 * The console is written at most ONCE per code per page lifecycle, and the buffer
 * is a fixed-size ring. A diagnostics channel that logs on every retry is a way
 * to turn a slow failure into a hang.
 */

/** What kind of failure a diagnostic describes. */
export type OfflineDiagnosticCode =
  /** An ordinary uncaught error or rejection in application JavaScript. */
  | "runtime"
  /** A dynamic `import()` / script / stylesheet that could not be loaded. */
  | "moduleLoad"
  /** IndexedDB was unavailable, blocked, or never answered. */
  | "indexedDb"
  /** The service worker could not register, activate or answer. */
  | "serviceWorker"
  /** A request was answered by (or redirected to) an authentication boundary. */
  | "authRedirect"
  /** Stored snapshot or queue data could not be understood. */
  | "snapshotCorrupt"
  /** The browser refuses storage: private mode, blocked storage, or quota. */
  | "storageUnavailable"
  /** A request did not complete. Expected while offline; recorded, not alarming. */
  | "network";

/** One recorded diagnostic. */
export interface OfflineDiagnostic {
  readonly code: OfflineDiagnosticCode;
  /** ISO instant, so a report is legible without a clock reference. */
  readonly at: string;
  /** A redacted, bounded description. Never a body, a token or a query string. */
  readonly detail: string;
}

/** How many diagnostics are kept. A ring: the newest win. */
export const OFFLINE_DIAGNOSTIC_LIMIT = 20;

/** How long a redacted detail may be. */
const DETAIL_LIMIT = 160;

/** Where the ring is mirrored, so it survives the reload it may be describing. */
/**
 * The key the diagnostics ring is stored under. Exported (SET-03) so the
 * account-security local-data model can name it explicitly among the
 * owner-specific entries a sign-out clears.
 */
export const OFFLINE_DIAGNOSTICS_STORAGE_KEY = "dalyhub.offline.diagnostics";
const STORAGE_KEY = OFFLINE_DIAGNOSTICS_STORAGE_KEY;

/**
 * Anything token-shaped: a long unbroken run of url-safe characters. Access
 * tokens, JWTs, session identifiers and signed urls all match; ordinary English
 * and ordinary file names do not.
 */
const TOKEN_LIKE = /[A-Za-z0-9_-]{24,}/g;

/** Reduce a url to a path. Query strings carry authentication tokens. */
export function redactUrl(value: string): string {
  try {
    const url = new URL(value, "https://placeholder.invalid");
    const path = url.pathname;
    return url.origin === "https://placeholder.invalid"
      ? path
      : `${url.origin}${path}`;
  } catch {
    return value.split("?")[0]!.split("#")[0]!;
  }
}

/** Make an arbitrary description safe to keep and safe to show. */
export function redactDetail(value: unknown): string {
  const raw =
    value instanceof Error
      ? `${value.name}: ${value.message}`
      : typeof value === "string"
        ? value
        : value === null || value === undefined
          ? "No detail."
          : typeof value === "object"
            ? (Object.prototype.toString.call(value) ?? "Unknown object.")
            : String(value);
  // Strip query strings and fragments wherever they appear, then anything that
  // still looks like a credential, then bound the length.
  const withoutQueries = raw.replace(
    /https?:\/\/[^\s"']+|\/[^\s"']*\?[^\s"']*/g,
    (match) => redactUrl(match),
  );
  const withoutTokens = withoutQueries.replace(TOKEN_LIKE, "[redacted]");
  return withoutTokens.length > DETAIL_LIMIT
    ? `${withoutTokens.slice(0, DETAIL_LIMIT - 1)}…`
    : withoutTokens;
}

/**
 * Classify a failure into one of the codes above.
 *
 * Deliberately a pure function over the shapes a browser actually produces, so
 * it can be tested exhaustively without a browser.
 */
export function classifyOfflineFailure(input: {
  readonly message?: string | null;
  readonly name?: string | null;
  /** `error`, `link`, `script`, `img` — what the platform said failed. */
  readonly source?: string | null;
}): OfflineDiagnosticCode {
  const name = (input.name ?? "").toLowerCase();
  const message = (input.message ?? "").toLowerCase();
  const source = (input.source ?? "").toLowerCase();
  const text = `${name} ${message}`;

  if (
    source === "script" ||
    source === "link" ||
    text.includes("failed to fetch dynamically imported module") ||
    text.includes("error loading dynamically imported module") ||
    text.includes("importing a module script failed") ||
    text.includes("unexpected token '<'") ||
    text.includes("expected expression, got '<'") ||
    text.includes("error loading route module")
  ) {
    return "moduleLoad";
  }
  if (
    name.includes("versionerror") ||
    name.includes("invalidstateerror") ||
    name.includes("transactioninactiveerror") ||
    name.includes("unknownerror") ||
    message.includes("indexeddb") ||
    message.includes("object store") ||
    message.includes("offline database")
  ) {
    return "indexedDb";
  }
  if (
    name.includes("quotaexceedederror") ||
    name.includes("securityerror") ||
    message.includes("quota") ||
    message.includes("storage is disabled") ||
    message.includes("private mode") ||
    message.includes("not storing offline data")
  ) {
    return "storageUnavailable";
  }
  if (
    message.includes("service worker") ||
    message.includes("serviceworker") ||
    message.includes("sw.js")
  ) {
    return "serviceWorker";
  }
  if (
    message.includes("cloudflare access") ||
    message.includes("sign-in has expired") ||
    message.includes("unauthenticated") ||
    message.includes("401") ||
    message.includes("403")
  ) {
    return "authRedirect";
  }
  if (
    name.includes("syntaxerror") ||
    message.includes("json") ||
    message.includes("snapshot") ||
    message.includes("unexpected end of")
  ) {
    return "snapshotCorrupt";
  }
  if (
    name.includes("aborterror") ||
    name.includes("typeerror") ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("load failed")
  ) {
    return "network";
  }
  return "runtime";
}

/* -------------------------------------------------------------------------- */
/* The ring                                                                   */
/* -------------------------------------------------------------------------- */

let ring: OfflineDiagnostic[] = [];
const listeners = new Set<(entries: readonly OfflineDiagnostic[]) => void>();
const consoleWritten = new Set<OfflineDiagnosticCode>();
let installed = false;
let teardown: (() => void) | null = null;

function persist(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(ring));
  } catch {
    // Storage is exactly what may be broken here. Losing the mirror is fine;
    // the in-memory ring is the authority for this page.
  }
}

function restore(): void {
  try {
    if (typeof sessionStorage === "undefined") return;
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    ring = parsed
      .filter(
        (entry): entry is OfflineDiagnostic =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as OfflineDiagnostic).code === "string" &&
          typeof (entry as OfflineDiagnostic).at === "string",
      )
      .slice(-OFFLINE_DIAGNOSTIC_LIMIT);
  } catch {
    ring = [];
  }
}

/** Record one diagnostic. Bounded, redacted and quiet. */
export function recordOfflineDiagnostic(
  code: OfflineDiagnosticCode,
  detail: unknown,
): OfflineDiagnostic {
  const entry: OfflineDiagnostic = {
    code,
    at: new Date().toISOString(),
    detail: redactDetail(detail),
  };
  ring = [...ring, entry].slice(-OFFLINE_DIAGNOSTIC_LIMIT);
  persist();
  if (!consoleWritten.has(code)) {
    consoleWritten.add(code);
    // Once per code per page lifecycle. A diagnostics channel that writes on
    // every retry is how a slow failure becomes an unresponsive page.
    console.warn(`[DalyHub offline] ${code}: ${entry.detail}`);
  }
  for (const listener of listeners) listener(ring);
  return entry;
}

/** Every diagnostic recorded so far, oldest first. */
export function readOfflineDiagnostics(): readonly OfflineDiagnostic[] {
  return ring;
}

/** A compact per-code summary — what the offline page renders. */
export function summariseOfflineDiagnostics(
  entries: readonly OfflineDiagnostic[] = ring,
): readonly {
  readonly code: OfflineDiagnosticCode;
  readonly count: number;
  readonly lastAt: string;
  readonly lastDetail: string;
}[] {
  const byCode = new Map<
    OfflineDiagnosticCode,
    { count: number; lastAt: string; lastDetail: string }
  >();
  for (const entry of entries) {
    const existing = byCode.get(entry.code);
    byCode.set(entry.code, {
      count: (existing?.count ?? 0) + 1,
      lastAt: entry.at,
      lastDetail: entry.detail,
    });
  }
  return [...byCode.entries()].map(([code, value]) => ({ code, ...value }));
}

/** Subscribe to the ring. Returns an unsubscribe function. */
export function subscribeOfflineDiagnostics(
  listener: (entries: readonly OfflineDiagnostic[]) => void,
): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test seam: empty the ring and re-arm the once-per-code console rule. */
export function resetOfflineDiagnostics(): void {
  ring = [];
  consoleWritten.clear();
  installed = false;
  teardown?.();
  teardown = null;
  try {
    sessionStorage?.removeItem(STORAGE_KEY);
  } catch {
    /* Nothing to clear. */
  }
}

/**
 * Attach the global listeners. Idempotent, and safe to call during SSR (where it
 * does nothing). Returns a cleanup function.
 */
export function installOfflineDiagnostics(): () => void {
  if (typeof window === "undefined") return () => {};
  if (installed) return () => {};
  installed = true;
  restore();

  const onError = (event: ErrorEvent) => {
    // A resource that failed to load fires an `error` event on the ELEMENT and
    // bubbles to `window` with no `error` object — that is a script, stylesheet
    // or image that could not be fetched, which is exactly what a stale or
    // missing precache produces and exactly what must never be silent.
    const target = event.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    if (tag === "script" || tag === "link" || tag === "img") {
      recordOfflineDiagnostic(
        classifyOfflineFailure({ source: tag === "img" ? "img" : tag }),
        `${tag} failed to load: ${redactUrl(
          (
            target as HTMLScriptElement | HTMLLinkElement | HTMLImageElement
          ).getAttribute?.("src") ??
            (target as HTMLLinkElement).getAttribute?.("href") ??
            "unknown",
        )}`,
      );
      return;
    }
    recordOfflineDiagnostic(
      classifyOfflineFailure({
        message: event.message,
        name: event.error instanceof Error ? event.error.name : null,
      }),
      event.error ?? event.message,
    );
  };

  const onRejection = (event: PromiseRejectionEvent) => {
    const reason: unknown = event.reason;
    recordOfflineDiagnostic(
      classifyOfflineFailure({
        message:
          reason instanceof Error ? reason.message : String(reason ?? ""),
        name: reason instanceof Error ? reason.name : null,
      }),
      reason,
    );
  };

  // `capture: true` on `error` is load-bearing: a resource load failure does not
  // bubble, so a bubble-phase listener never sees the failed script that is the
  // single most useful diagnostic here.
  window.addEventListener("error", onError, true);
  window.addEventListener("unhandledrejection", onRejection);
  teardown = () => {
    window.removeEventListener("error", onError, true);
    window.removeEventListener("unhandledrejection", onRejection);
  };
  return () => {
    installed = false;
    teardown?.();
    teardown = null;
  };
}
