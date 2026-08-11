/**
 * CAPTURE-01 — the D1 capture rate-limit counter.
 *
 * One `INSERT … ON CONFLICT DO UPDATE … RETURNING count` per window, run as a
 * single batch. Two properties matter:
 *
 *   - the increment and the read are the SAME statement, so two concurrent
 *     captures cannot both read "29" and both be allowed. The database
 *     arbitrates, exactly as it does for idempotency receipts;
 *   - the counter is keyed by workspace AND identity, so one capture device can
 *     only ever exhaust its own budget. Nothing here can bound the owner's
 *     access to DalyHub itself (CAPTURE-01 §15, §52).
 *
 * The arithmetic — which windows exist, where they start, what is allowed — lives
 * in the kernel. This file only counts.
 */

import {
  CAPTURE_RATE_WINDOWS,
  captureWindowStart,
  type CaptureRateLimiter,
  type CaptureRateWindow,
} from "~/kernel/capture";
import type { WorkspaceContext } from "~/kernel/workspaces";

export type D1CaptureRateLimiterOptions = {
  readonly windows?: readonly CaptureRateWindow[];
};

export class D1CaptureRateLimiter implements CaptureRateLimiter {
  readonly #db: D1Database;
  readonly #workspaceId: string;
  readonly #windows: readonly CaptureRateWindow[];

  constructor(
    db: D1Database,
    context: WorkspaceContext,
    options: D1CaptureRateLimiterOptions = {},
  ) {
    this.#db = db;
    this.#workspaceId = context.workspaceId;
    this.#windows = options.windows ?? CAPTURE_RATE_WINDOWS;
  }

  async consume(identity: string, now: Date): Promise<readonly number[]> {
    const statements = this.#windows.map((window) =>
      this.#db
        .prepare(
          `INSERT INTO capture_rate_windows
             (workspace_id, identity, window_seconds, window_start, count)
           VALUES (?1, ?2, ?3, ?4, 1)
           ON CONFLICT (workspace_id, identity, window_seconds, window_start)
             DO UPDATE SET count = count + 1
           RETURNING count`,
        )
        .bind(
          this.#workspaceId,
          identity,
          window.seconds,
          captureWindowStart(now, window.seconds),
        ),
    );
    const results = await this.#db.batch<{ count: number }>(statements);
    return results.map((result) => result.results?.[0]?.count ?? 0);
  }
}

/**
 * Delete counters whose window has closed. Not called on the capture path — a
 * capture must not pay for housekeeping — and safe to call from anywhere: it can
 * only ever remove rows that no longer influence any decision.
 */
export async function pruneCaptureRateWindows(
  db: D1Database,
  context: WorkspaceContext,
  now: Date,
  windows: readonly CaptureRateWindow[] = CAPTURE_RATE_WINDOWS,
): Promise<void> {
  const widest = windows.reduce(
    (longest, window) => Math.max(longest, window.seconds),
    0,
  );
  const cutoff = captureWindowStart(now, Math.max(widest, 1)) - widest;
  await db
    .prepare(
      `DELETE FROM capture_rate_windows
        WHERE workspace_id = ?1 AND window_start < ?2`,
    )
    .bind(context.workspaceId, cutoff)
    .run();
}
