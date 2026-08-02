/**
 * RELEASE-01 — the ONE application version authority.
 *
 * Every surface that shows a version reads it from here: the About screen, the
 * `/health` payload, and anything added later. Nothing copies a version string, so
 * there is no way for two parts of the product to disagree about which release is
 * running — the failure mode this milestone set out to remove.
 *
 * ── What is safe to expose ────────────────────────────────────────────────────
 * About is behind authentication and only the owner sees it, but "only the owner"
 * is not a reason to be careless: this module is deliberately an ALLOW-LIST, not a
 * dump of the environment. It exposes the version, an optional release name, an
 * optional short commit identifier and a recognised environment label — and
 * nothing else. Bindings, secrets, database identifiers, hostnames, account ids
 * and unrecognised environment values never reach it (AGENTS.md §17).
 *
 * The commit identifier is OPTIONAL and supplied by the deployment through
 * `BUILD_COMMIT`. It is truncated to a short hash and character-checked, so a
 * malformed or hostile value cannot be reflected into the page. When it is absent
 * — every local run, and any deployment that does not set it — About says so
 * plainly rather than inventing one or showing an empty field.
 */

/** The application name. Not configurable: it is the product, not a setting. */
export const APPLICATION_NAME = "DalyHub";

/**
 * The current application version.
 *
 * Hand-maintained here on purpose. The Worker bundle has no reliable way to read
 * `package.json` at runtime, so a "read it from package.json" scheme would be a
 * second authority that silently disagrees. One constant, bumped in the release
 * commit, is honest and greppable.
 *
 * `package.json` carries the SAME string so build metadata and the running
 * application agree, and `test/unit/about/package-version.test.ts` fails if they
 * ever drift. That test — not a runtime read — is what keeps the two in step,
 * so this module stays the only thing the Worker consults.
 */
export const APP_VERSION = "2.0.1";

/**
 * The release this version ships under. Shown beside the number in About.
 *
 * This is the release NAME, not a milestone name. It was "V2 Final Polish" while
 * that milestone was in flight; the shipped product is DalyHub V2, so that is
 * what About, Settings and every export archive now say.
 */
export const APP_RELEASE_NAME = "V2";

/** Environment labels that are safe to display. Anything else reads "unknown". */
const KNOWN_ENVIRONMENTS: ReadonlySet<string> = new Set([
  "development",
  "preview",
  "staging",
  "production",
]);

/** The shape of the environment values this module is willing to read. */
export interface VersionEnvironment {
  readonly ENVIRONMENT?: string;
  readonly BUILD_COMMIT?: string;
}

/** The complete, safe set of build facts a surface may display. */
export interface BuildInfo {
  readonly name: string;
  readonly version: string;
  readonly releaseName: string;
  /** A recognised environment label, or `"unknown"`. Never a raw env value. */
  readonly environment: string;
  /** A short commit identifier, or null when the deployment supplied none. */
  readonly commit: string | null;
}

/**
 * Normalise a supplied commit identifier: hex only, and truncated to a short hash.
 * Anything else is treated as absent rather than displayed, so this can never
 * become a channel for arbitrary text.
 */
function safeCommit(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!/^[0-9a-fA-F]{7,40}$/.test(trimmed)) return null;
  return trimmed.slice(0, 7).toLowerCase();
}

/** Resolve the safe build facts from the environment. Pure, so it is testable. */
export function buildInfo(env?: VersionEnvironment): BuildInfo {
  const rawEnvironment = env?.ENVIRONMENT;
  const environment =
    typeof rawEnvironment === "string" &&
    KNOWN_ENVIRONMENTS.has(rawEnvironment.trim().toLowerCase())
      ? rawEnvironment.trim().toLowerCase()
      : "unknown";

  return {
    name: APPLICATION_NAME,
    version: APP_VERSION,
    releaseName: APP_RELEASE_NAME,
    environment,
    commit: safeCommit(env?.BUILD_COMMIT),
  };
}
