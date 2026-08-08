/**
 * SET-03 — the browser-side Account & security platform's public surface.
 *
 * Client-only. These modules touch IndexedDB, Cache Storage, Web Storage and
 * `window.location`, and must never be imported by a Worker/loader path. The
 * pure model they derive from lives in `~/kernel/account-security`, and the
 * server-side history endpoints live in the Settings module.
 */

export {
  PERSONAL_LOCAL_STORAGE_KEYS,
  PERSONAL_SESSION_STORAGE_KEYS,
  clearPersonalWebStorage,
} from "./local-data";

export {
  SIGN_OUT_RECORD_PATH,
  useSignOut,
  type SignOutState,
  type UseSignOutResult,
} from "./use-sign-out";

export {
  LOCAL_DATA_CLEARED_RECORD_PATH,
  recordLocalDataCleared,
} from "./record-local-data-cleared";
