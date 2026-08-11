/**
 * CAPTURE-01 Capture kernel — the capture credential model.
 *
 * ── Why a purpose-built credential ──────────────────────────────────────────
 * An Apple Shortcut sitting on a Home Screen is, from a security point of view,
 * a secret stored on a device the owner carries into the world. Handing it a
 * DalyHub session, or a general API key, would mean a lost phone is a lost life:
 * every Task, Note, Person, Diary entry and Meeting, readable and writable.
 *
 * So the capture credential is deliberately the narrowest credential DalyHub
 * has. It can do exactly one thing — bring a new thought IN:
 *
 *     Create a capture              YES
 *     Create a Task                 YES (when granted)
 *     Create a Note                 YES (when granted)
 *     Read any record               NO
 *     Update any record             NO
 *     Delete anything               NO
 *     Admin / settings / export     NO
 *     Choose a workspace            NO — bound at creation, server-resolved
 *
 * There is no read endpoint and no update endpoint for it to reach (CAPTURE-01 §37, §38),
 * so this is not merely a policy — a leaked capture token has nothing to read.
 *
 * ── What is stored ──────────────────────────────────────────────────────────
 * Never the token. D1 holds a SHA-256 digest of the secret and a short, safe
 * fingerprint for logs and for the Settings list. The complete token exists in
 * exactly two places: the response that created it, and the owner's phone.
 *
 * Storage-independent: nothing here imports D1, Cloudflare, React or `env`.
 * `crypto` is the Web Crypto global, present in both the Workers runtime and
 * Node — it is a platform primitive, not a platform dependency.
 */

/* -------------------------------------------------------------------------- */
/* Capabilities                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What a credential may create. Deliberately expressed in the owner's nouns
 * (CAPTURE-01 §34) rather than as scopes or grants — a capture device is allowed to make
 * Tasks, Notes, or both.
 */
export const CAPTURE_CAPABILITIES = ["task", "note"] as const;

export type CaptureCapability = (typeof CAPTURE_CAPABILITIES)[number];

/** True when a value names a capture capability. */
export function isCaptureCapability(
  value: unknown,
): value is CaptureCapability {
  return (
    typeof value === "string" &&
    (CAPTURE_CAPABILITIES as readonly string[]).includes(value)
  );
}

/**
 * Normalise an untrusted capability list: keep only recognised values, dedupe,
 * and return them in the canonical order. An empty result is a real answer — the
 * caller decides whether a credential with no capabilities may be created (it
 * may not).
 */
export function normaliseCaptureCapabilities(
  values: readonly unknown[],
): readonly CaptureCapability[] {
  const seen = new Set<CaptureCapability>();
  for (const value of values) {
    if (isCaptureCapability(value)) seen.add(value);
  }
  return CAPTURE_CAPABILITIES.filter((capability) => seen.has(capability));
}

/** The owner-facing label for a capability. */
export const CAPTURE_CAPABILITY_LABELS: Readonly<
  Record<CaptureCapability, string>
> = {
  task: "Create tasks",
  note: "Create notes",
};

/* -------------------------------------------------------------------------- */
/* Token format                                                               */
/* -------------------------------------------------------------------------- */

/**
 * The DalyHub capture-token prefix (CAPTURE-01 §13).
 *
 * A recognisable prefix is a security feature, not decoration: it lets the token
 * be identified in a log or a screenshot without being confused for another
 * credential, and it is the shape a secret scanner can be taught. It is also why
 * a leaked token is recognisable AS a capture token — narrow by construction —
 * rather than as an unlabelled bearer secret of unknown power.
 */
export const CAPTURE_TOKEN_PREFIX = "dhcap_";

/** The number of random bytes in a capture secret. 32 bytes = 256 bits. */
export const CAPTURE_SECRET_BYTES = 32;

/** The base64url secret length 32 bytes produces, unpadded. */
const SECRET_LENGTH = 43;

/** A structurally acceptable token: the prefix plus a base64url secret. */
const TOKEN_PATTERN = new RegExp(
  `^${CAPTURE_TOKEN_PREFIX}[A-Za-z0-9_-]{${SECRET_LENGTH}}$`,
);

/** The longest token DalyHub will even look at, before any work is done. */
export const CAPTURE_TOKEN_MAX_LENGTH =
  CAPTURE_TOKEN_PREFIX.length + SECRET_LENGTH;

/** True when a value has the structural shape of a DalyHub capture token. */
export function isCaptureTokenShape(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

/** Encode bytes as unpadded base64url. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Mint a new capture token. The returned string is the ONLY time the complete
 * secret exists inside DalyHub — it is shown once and never stored (CAPTURE-01 §12).
 */
export function generateCaptureToken(): string {
  const bytes = new Uint8Array(CAPTURE_SECRET_BYTES);
  crypto.getRandomValues(bytes);
  return `${CAPTURE_TOKEN_PREFIX}${toBase64Url(bytes)}`;
}

/**
 * The stored digest of a token.
 *
 * SHA-256, not a password KDF, and that is a deliberate choice rather than an
 * omission: a capture token is 256 bits of `crypto.getRandomValues` output, not
 * a human-chosen password. There is no dictionary to run and no guessing
 * advantage for an attacker to gain, so the work factor a KDF exists to impose
 * would buy nothing — while costing a Worker CPU budget on every capture, which
 * is the thing that has to stay fast. (This is the same reasoning that makes
 * SHA-256 correct for API keys and wrong for passwords.)
 */
export async function hashCaptureToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** The number of digest characters kept as the safe display fingerprint. */
export const CAPTURE_FINGERPRINT_LENGTH = 12;

/**
 * A short, non-reversible fingerprint of a token, safe to log and to show in
 * Settings. Derived from the DIGEST rather than from the token, so nothing that
 * handles a fingerprint has ever handled the secret (CAPTURE-01 §13).
 */
export function captureTokenFingerprint(tokenHash: string): string {
  return tokenHash.slice(0, CAPTURE_FINGERPRINT_LENGTH);
}

/**
 * Compare two digests in time independent of how many leading characters match.
 *
 * The lookup itself is by digest, so an equality comparison in SQL is the actual
 * gate; this exists for the code paths that compare in JavaScript, and for the
 * property to be TESTABLE rather than assumed. Length is compared first because
 * two digests always have the same length — a difference there is a bug, not a
 * secret.
 */
export function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Read the token off an `Authorization` header value.
 *
 * Accepts `Bearer <token>` only. Returns null for anything else — including a
 * bare token with no scheme, because accepting several shapes is how a boundary
 * grows an accidental one.
 */
export function readBearerCaptureToken(header: string | null): string | null {
  if (header === null) return null;
  const trimmed = header.trim();
  // Bound before matching: a megabyte-long header should cost nothing.
  if (trimmed.length > CAPTURE_TOKEN_MAX_LENGTH + 16) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(trimmed);
  if (match === null) return null;
  const token = match[1] ?? "";
  return isCaptureTokenShape(token) ? token : null;
}

/* -------------------------------------------------------------------------- */
/* The stored credential                                                      */
/* -------------------------------------------------------------------------- */

/**
 * A capture credential as DalyHub stores it. There is no field here that could
 * ever reconstruct the token.
 */
export type CaptureTokenRecord = {
  /** Stable id. Safe to log, safe to show, safe to put in Activity. */
  readonly id: string;
  /** The workspace this credential is PERMANENTLY bound to (CAPTURE-01 §36). */
  readonly workspaceId: string;
  /**
   * The subject that minted it. NOT an authorisation input — `capabilities` is
   * that — but the answer to "whose day is it?" when a capture says "tomorrow":
   * the owner's timezone preference is keyed by subject, so without this a
   * capture would resolve relative dates against the deployment default.
   */
  readonly ownerSubject: string;
  /** The owner-facing device name, e.g. "Aidan's iPhone". */
  readonly name: string;
  /** The short, non-reversible fingerprint shown in Settings and in logs. */
  readonly fingerprint: string;
  /** What this credential may create. Never empty. */
  readonly capabilities: readonly CaptureCapability[];
  /** The source this device is expected to use, or null when unspecified. */
  readonly source: string | null;
  readonly createdAt: Date;
  readonly lastUsedAt: Date | null;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
};

/** Why a credential is not usable. */
export type CaptureTokenStatus = "active" | "revoked" | "expired";

/** The status of a credential at an instant. */
export function captureTokenStatus(
  record: Pick<CaptureTokenRecord, "revokedAt" | "expiresAt">,
  now: Date,
): CaptureTokenStatus {
  if (record.revokedAt !== null) return "revoked";
  if (
    record.expiresAt !== null &&
    record.expiresAt.getTime() <= now.getTime()
  ) {
    return "expired";
  }
  return "active";
}

/**
 * True when a credential may be used right now. Revocation takes effect on the
 * NEXT request with no grace period (CAPTURE-01 §14) because the check is made per request
 * against stored state — there is no cached session to outlive it.
 */
export function captureTokenIsUsable(
  record: Pick<CaptureTokenRecord, "revokedAt" | "expiresAt">,
  now: Date,
): boolean {
  return captureTokenStatus(record, now) === "active";
}

/** True when a credential is permitted to create records of this kind. */
export function captureTokenAllows(
  record: Pick<CaptureTokenRecord, "capabilities">,
  capability: CaptureCapability,
): boolean {
  return record.capabilities.includes(capability);
}

/* -------------------------------------------------------------------------- */
/* Names                                                                      */
/* -------------------------------------------------------------------------- */

/** The longest a capture device name may be, in code points. */
export const CAPTURE_TOKEN_NAME_MAX_LENGTH = 60;

/** Validation failure for a capture-credential field. */
export class CaptureTokenValidationError extends Error {
  readonly field: "name" | "capabilities" | "expiresAt";

  constructor(field: "name" | "capabilities" | "expiresAt", message: string) {
    super(message);
    this.field = field;
    this.name = "CaptureTokenValidationError";
  }
}

/**
 * Validate and normalise a capture device name. Collapses whitespace, strips
 * control characters, and bounds the length — a name is rendered in Settings, so
 * it is treated as untrusted display text.
 */
export function parseCaptureTokenName(raw: unknown): string {
  if (typeof raw !== "string") {
    throw new CaptureTokenValidationError("name", "Give this device a name.");
  }
  const name = raw
    // A device name is rendered in Settings, so control characters are removed
    // rather than stored; that is exactly what this rule warns about.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (name.length === 0) {
    throw new CaptureTokenValidationError("name", "Give this device a name.");
  }
  if (Array.from(name).length > CAPTURE_TOKEN_NAME_MAX_LENGTH) {
    throw new CaptureTokenValidationError(
      "name",
      `A device name may be at most ${CAPTURE_TOKEN_NAME_MAX_LENGTH} characters.`,
    );
  }
  return name;
}

/** Validate the requested capabilities: at least one, all recognised. */
export function parseCaptureTokenCapabilities(
  raw: readonly unknown[],
): readonly CaptureCapability[] {
  const capabilities = normaliseCaptureCapabilities(raw);
  if (capabilities.length === 0) {
    throw new CaptureTokenValidationError(
      "capabilities",
      "Choose at least one thing this device may create.",
    );
  }
  return capabilities;
}
