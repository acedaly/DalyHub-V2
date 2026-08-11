/**
 * CAPTURE-01 Capture kernel — bounded capture rates.
 *
 * The capture endpoint is the one DalyHub surface reachable without a Cloudflare
 * Access session, so it must be bounded (CAPTURE-01 §15). The bound has two jobs, and they
 * pull in opposite directions:
 *
 *   - a human emptying their head after a meeting fires several captures in a
 *     few seconds, and every one of them must succeed. A limit that makes the
 *     owner's own thoughts bounce is worse than no limit at all;
 *   - a stolen token, or a stuck retry loop, must not be able to write for ever.
 *
 * So the limits are per-CREDENTIAL fixed windows, generous per minute and firmer
 * per hour. They are evaluated per capture device, never globally: one misbehaving
 * Shortcut can exhaust its OWN budget and nothing else — it can never lock the
 * owner out of DalyHub, or out of capturing from a different device (CAPTURE-01 §15, §52).
 *
 * Pure and clock-injected, so the tests are deterministic and never sleep (CAPTURE-01 §52).
 * The counter STORE is a platform concern; this module owns the arithmetic.
 */

/** One fixed window and the number of captures allowed inside it. */
export type CaptureRateWindow = {
  /** The window length in seconds. */
  readonly seconds: number;
  /** The most captures one credential may make inside one window. */
  readonly limit: number;
};

/**
 * The windows, narrowest first.
 *
 * 30 a minute is roughly one capture every two seconds sustained — far beyond
 * what dictating or typing on a phone can produce, so a real burst never touches
 * it. 300 an hour bounds the damage of a token that has escaped.
 */
export const CAPTURE_RATE_WINDOWS: readonly CaptureRateWindow[] = [
  { seconds: 60, limit: 30 },
  { seconds: 3_600, limit: 300 },
];

/** The start of the fixed window containing `now`, as epoch seconds. */
export function captureWindowStart(now: Date, seconds: number): number {
  const epochSeconds = Math.floor(now.getTime() / 1000);
  return epochSeconds - (epochSeconds % seconds);
}

/** Seconds remaining until the window containing `now` resets. */
export function captureWindowResetIn(now: Date, seconds: number): number {
  const elapsed =
    Math.floor(now.getTime() / 1000) - captureWindowStart(now, seconds);
  return Math.max(1, seconds - elapsed);
}

/** The outcome of asking whether one more capture is allowed. */
export type CaptureRateDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly retryAfterSeconds: number };

/**
 * Decide from the CURRENT counts (the value each window's counter holds after
 * this capture was counted) whether the capture is within its budget.
 *
 * Counting first and deciding after is deliberate: it means a rejected capture
 * still consumes budget, so a client hammering a limit cannot ride the boundary
 * of a window, and the decision needs no read-then-write race.
 */
export function evaluateCaptureRate(
  counts: readonly number[],
  now: Date,
  windows: readonly CaptureRateWindow[] = CAPTURE_RATE_WINDOWS,
): CaptureRateDecision {
  let retryAfterSeconds = 0;
  for (let index = 0; index < windows.length; index += 1) {
    const window = windows[index];
    const count = counts[index];
    if (window === undefined || count === undefined) continue;
    if (count > window.limit) {
      retryAfterSeconds = Math.max(
        retryAfterSeconds,
        captureWindowResetIn(now, window.seconds),
      );
    }
  }
  return retryAfterSeconds === 0
    ? { allowed: true }
    : { allowed: false, retryAfterSeconds };
}

/**
 * The storage seam. `consume` counts ONE capture against every window for an
 * identity and returns the resulting counts, narrowest window first.
 *
 * The identity is the capture credential's id — or, for email capture, a stable
 * synthetic identity — never an IP address, which DalyHub deliberately does not
 * record (`account-security-events.ts` states the same rule).
 */
export interface CaptureRateLimiter {
  consume(identity: string, now: Date): Promise<readonly number[]>;
}
