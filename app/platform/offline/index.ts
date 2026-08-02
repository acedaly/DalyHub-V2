/**
 * PWA — the server-side offline platform.
 *
 * Server-only: these modules read D1 through the workspace composition boundary
 * and must never be imported by client code. The browser half lives in
 * `~/shared/offline`; the contracts both depend on live in `~/kernel/offline`.
 */

export {
  buildOfflineSnapshot,
  summariseToday,
  type BuildSnapshotContext,
} from "./build-snapshot.server";

export {
  claimCapture,
  completeClaim,
  isIdempotencyKey,
  readIdempotencyKey,
  releaseClaim,
  withCaptureIdempotency,
  withReplayGuard,
  type CaptureClaim,
  type CaptureReceiptContext,
} from "./capture-receipts.server";
