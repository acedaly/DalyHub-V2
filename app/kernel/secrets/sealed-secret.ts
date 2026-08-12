/**
 * CAL-01 — the SEALED SECRET primitive: authenticated encryption at rest for the
 * small number of third-party credentials DalyHub has to keep usable.
 *
 * ── Why this is a kernel primitive rather than Calendar code ─────────────────
 * DalyHub already holds two kinds of secret and neither of them needs this. A
 * capture token is stored as a SHA-256 digest, because nothing ever needs the
 * token back (`app/kernel/capture`); an AI provider key is a Worker secret,
 * because there is exactly one of it and the owner never configures it in the
 * product. An ICS feed URL is the first value that is BOTH a credential and
 * owner-supplied data: the owner adds several, names them, removes them — so it
 * has to live in D1 — and the synchroniser has to recover the exact URL to fetch
 * it, so a digest is not an option.
 *
 * That combination will recur (a webhook endpoint, an inbound feed token), so
 * the primitive is a kernel one and the Calendar module simply uses it. Crypto
 * logic embedded in a feature module is how a product ends up with two of it.
 *
 * ── What it is ───────────────────────────────────────────────────────────────
 * AES-256-GCM through the Web Crypto API the Workers runtime already provides —
 * platform-standard authenticated encryption, no invented construction, no
 * third-party crypto dependency, and the same API in the Workers runtime, in
 * Node 22 and in the Workers Vitest pool, so the tests exercise the real thing.
 *
 *   sealed := "v1" "." base64url(iv, 12 bytes) "." base64url(ciphertext||tag)
 *
 * A version prefix, because a stored ciphertext outlives the code that wrote it
 * and "which scheme is this?" must be answerable without guessing.
 *
 * ── The three properties that matter ─────────────────────────────────────────
 *   - **Authenticated.** GCM's tag is verified on open, so a tampered ciphertext
 *     FAILS rather than decrypting to something attacker-chosen. A stored value
 *     is therefore either exactly what was sealed or an error — never a
 *     substituted URL the synchroniser would then fetch.
 *   - **Context-bound.** The caller supplies an `aad` (additional authenticated
 *     data) naming what the value IS and which workspace it belongs to. A
 *     ciphertext lifted from one workspace's row and pasted into another's does
 *     not open. Confidentiality alone would not have stopped that.
 *   - **Random per seal.** A fresh 12-byte IV per operation, from
 *     `crypto.getRandomValues`. Sealing the same URL twice produces different
 *     ciphertexts, so the column leaks nothing by comparison — which is why
 *     duplicate detection uses a separate keyed fingerprint rather than
 *     comparing ciphertexts.
 *
 * ── What it is deliberately NOT ──────────────────────────────────────────────
 * Not a key-management system, not envelope encryption with per-record data
 * keys, and not a rotation mechanism. One key, supplied as a Cloudflare secret,
 * with a documented re-entry procedure if it is ever rotated (see
 * `docs/development/DEPLOYMENT.md`). Anything more would be infrastructure for a
 * personal deployment holding a handful of feed URLs.
 *
 * The key never reaches the browser. Every caller of this module is server-side
 * (a loader, an action or the scheduled handler); nothing in `app/shared` or a
 * component imports it, and the sealed value itself is never sent to the client
 * either — see `docs/product/CAL_01_UNIFIED_EXTERNAL_SCHEDULE_2026_08.md`.
 */

/** The one scheme this module writes. Read support is per-version, on purpose. */
const VERSION = "v1";

/** AES-GCM's standard nonce length. 96 bits is the size the mode is defined for. */
const IV_BYTES = 12;

/** AES-256. The key material is therefore exactly 32 bytes. */
const KEY_BYTES = 32;

/**
 * A configuration failure: no key, or a key that is not usable.
 *
 * Separate from {@link SealedSecretError} because the two demand different
 * actions. This one is "the deployment is not configured", which the Settings
 * surface reports as a calm, actionable state rather than as a sync failure.
 */
export class EncryptionKeyUnavailableError extends Error {
  constructor(
    message = "Encrypted storage is not configured for this deployment.",
  ) {
    super(message);
    this.name = "EncryptionKeyUnavailableError";
  }
}

/**
 * A seal/open failure. Deliberately says nothing about WHY — a distinction
 * between "wrong key", "tampered ciphertext" and "wrong context" is an oracle,
 * and none of the three is separately actionable for the owner.
 */
export class SealedSecretError extends Error {
  constructor(operation: string, options?: ErrorOptions) {
    super(`A sealed value could not be ${operation}.`, options);
    this.name = "SealedSecretError";
  }
}

/** base64url, without padding — safe in a URL, a header and a JSON string. */
function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded.padEnd(Math.ceil(padded.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

/**
 * Import the deployment's encryption key from its configured form.
 *
 * The configured value is 32 bytes of randomness in base64 or base64url — the
 * shape `openssl rand -base64 32` produces, because a procedure an operator can
 * run from memory is one they will actually follow. Anything shorter is refused
 * rather than stretched: silently accepting a weak key is worse than refusing to
 * start, and there is no password-derivation step here to hide behind.
 *
 * The imported key is NOT extractable, so once it exists as a `CryptoKey` the
 * runtime will not hand its bytes back to application code.
 */
export async function importEncryptionKey(
  configured: string | undefined | null,
): Promise<CryptoKey> {
  const trimmed = (configured ?? "").trim();
  if (trimmed.length === 0) {
    throw new EncryptionKeyUnavailableError();
  }
  let material: Uint8Array;
  try {
    material = fromBase64Url(trimmed);
  } catch {
    throw new EncryptionKeyUnavailableError(
      "The configured encryption key is not valid base64.",
    );
  }
  if (material.length !== KEY_BYTES) {
    throw new EncryptionKeyUnavailableError(
      `The configured encryption key must be ${KEY_BYTES} random bytes.`,
    );
  }
  try {
    return await crypto.subtle.importKey(
      "raw",
      material as unknown as BufferSource,
      { name: "AES-GCM" },
      // Never extractable: the bytes go in and do not come back out.
      false,
      ["encrypt", "decrypt"],
    );
  } catch {
    throw new EncryptionKeyUnavailableError(
      "The configured encryption key could not be used.",
    );
  }
}

/**
 * Seal a value. `aad` binds the ciphertext to its purpose and its workspace and
 * is NOT stored — the opener reconstructs it from the row it is reading, so a
 * ciphertext moved to a different row or a different workspace fails to open.
 */
export async function sealSecret(
  key: CryptoKey,
  plaintext: string,
  aad: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  try {
    const sealed = await crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv as unknown as BufferSource,
        additionalData: new TextEncoder().encode(
          aad,
        ) as unknown as BufferSource,
      },
      key,
      new TextEncoder().encode(plaintext) as unknown as BufferSource,
    );
    return `${VERSION}.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(sealed))}`;
  } catch (cause) {
    throw new SealedSecretError("sealed", { cause });
  }
}

/** Open a sealed value, or throw. Never returns a partially-verified result. */
export async function openSecret(
  key: CryptoKey,
  sealed: string,
  aad: string,
): Promise<string> {
  const parts = sealed.split(".");
  if (parts.length !== 3 || parts[0] !== VERSION) {
    throw new SealedSecretError("opened");
  }
  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: fromBase64Url(parts[1]!) as unknown as BufferSource,
        additionalData: new TextEncoder().encode(
          aad,
        ) as unknown as BufferSource,
      },
      key,
      fromBase64Url(parts[2]!) as unknown as BufferSource,
    );
    return new TextDecoder().decode(plaintext);
  } catch (cause) {
    throw new SealedSecretError("opened", { cause });
  }
}

/**
 * A KEYED fingerprint of a value, as 64 lowercase hex characters.
 *
 * Used for the one thing a random-IV ciphertext cannot answer: "is this the same
 * feed the owner already added?". It is HMAC-SHA-256 under the SAME deployment
 * key rather than a bare digest, because a bare digest of a URL is a guessable
 * value — anyone holding the database and a candidate URL could confirm it. With
 * the key held only as a Cloudflare secret, a database dump confirms nothing.
 *
 * It is derived from the value, so it is safe to store beside the ciphertext and
 * safe to index. It is NEVER shown to the owner and never returned to a browser.
 */
export async function fingerprintSecret(
  configuredKey: string | undefined | null,
  value: string,
  aad: string,
): Promise<string> {
  const trimmed = (configuredKey ?? "").trim();
  if (trimmed.length === 0) {
    throw new EncryptionKeyUnavailableError();
  }
  let material: Uint8Array;
  try {
    material = fromBase64Url(trimmed);
  } catch {
    throw new EncryptionKeyUnavailableError(
      "The configured encryption key is not valid base64.",
    );
  }
  if (material.length !== KEY_BYTES) {
    throw new EncryptionKeyUnavailableError(
      `The configured encryption key must be ${KEY_BYTES} random bytes.`,
    );
  }
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    material as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    hmacKey,
    new TextEncoder().encode(`${aad}\n${value}`) as unknown as BufferSource,
  );
  return [...new Uint8Array(signature)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
