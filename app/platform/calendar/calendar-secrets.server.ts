/**
 * CAL-01 — the calendar module's use of the kernel sealed-secret primitive.
 *
 * A thin, deliberate seam. The crypto lives in `~/kernel/secrets`; what lives
 * here is the ONE decision this module makes about it — what the additional
 * authenticated data says — and it says it in exactly one place so a value
 * sealed by the Settings action can be opened by the scheduled synchroniser and
 * by nothing else.
 *
 * The AAD names the PURPOSE and the WORKSPACE. A ciphertext lifted out of one
 * workspace's row and written into another's therefore fails to open rather than
 * quietly becoming that workspace's feed — which is a real isolation property,
 * not a theoretical one, in a product whose whole security model is workspace
 * scope.
 */

import {
  EncryptionKeyUnavailableError,
  fingerprintSecret,
  importEncryptionKey,
  openSecret,
  sealSecret,
} from "~/kernel/secrets";

/** The environment this module reads. `APP_ENCRYPTION_KEY` is a Worker secret. */
export interface CalendarSecretsEnv {
  readonly APP_ENCRYPTION_KEY?: string;
}

/**
 * The AAD for a feed URL. Purpose, version and workspace — and nothing that
 * changes over the life of a source, so renaming a calendar cannot make its
 * stored URL unopenable.
 */
function feedUrlAad(workspaceId: string): string {
  return `dalyhub.calendar.feed_url.v1:${workspaceId}`;
}

/** Is encrypted storage configured at all? Asked before offering to add a source. */
export function calendarEncryptionConfigured(env: CalendarSecretsEnv): boolean {
  return (env.APP_ENCRYPTION_KEY ?? "").trim().length > 0;
}

/**
 * Seal a normalised feed URL, and derive its duplicate-detection fingerprint.
 *
 * Both in one call, because they must be derived from the SAME normalised value
 * — a fingerprint of one string beside a ciphertext of another is a duplicate
 * check that does not check anything.
 */
export async function sealFeedUrl(
  env: CalendarSecretsEnv,
  workspaceId: string,
  normalisedUrl: string,
): Promise<{ readonly sealed: string; readonly fingerprint: string }> {
  const aad = feedUrlAad(workspaceId);
  const key = await importEncryptionKey(env.APP_ENCRYPTION_KEY);
  const [sealed, fingerprint] = await Promise.all([
    sealSecret(key, normalisedUrl, aad),
    fingerprintSecret(env.APP_ENCRYPTION_KEY, normalisedUrl, aad),
  ]);
  return { sealed, fingerprint };
}

/**
 * Open a sealed feed URL.
 *
 * The ONLY path from storage back to a usable URL, and it exists so exactly one
 * caller can use it: the synchroniser, server-side, for the duration of one
 * fetch. Nothing returns the result of this function to a browser.
 */
export async function openFeedUrl(
  env: CalendarSecretsEnv,
  workspaceId: string,
  sealed: string,
): Promise<string> {
  const key = await importEncryptionKey(env.APP_ENCRYPTION_KEY);
  return openSecret(key, sealed, feedUrlAad(workspaceId));
}

export { EncryptionKeyUnavailableError };
