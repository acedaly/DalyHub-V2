/**
 * NOTES-01C — online/offline detection for the autosave status indicator.
 *
 * A save failure is ambiguous by default (server rejection? network drop?).
 * When the browser's own connectivity signal says we're offline, the failure
 * can be attributed honestly ("you're offline") instead of a generic
 * "couldn't save". SSR-safe: renders `true` (online) until the client resolves
 * the real value, so there is no hydration mismatch and no false "offline"
 * flash. Callers that want to react to reconnection (e.g. auto-retry) watch
 * the returned value transition from `false` to `true` themselves.
 */

import { useEffect, useState } from "react";

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    if (typeof navigator === "undefined" || typeof window === "undefined") {
      return;
    }
    setOnline(navigator.onLine);

    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return online;
}
