/**
 * Shared online/offline detection.
 *
 * Promoted from the Notes-local `use-online-status.ts` now that the Universal
 * Relationship System is a second consumer (offline-aware link/unlink). SSR-safe:
 * renders `true` (online) until the client resolves the real value, so there is
 * no hydration mismatch and no false "offline" flash. Callers that want to react
 * to reconnection watch the returned value transition from `false` to `true`.
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
