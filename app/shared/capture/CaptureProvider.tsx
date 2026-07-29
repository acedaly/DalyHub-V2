/**
 * MOBILE-01 — the shared Quick Capture provider.
 *
 * Mounted ONCE by the AppShell so any surface — the phone bottom navigation, a
 * Today "Capture" button, a Command Palette action, a module's empty state — opens
 * the SAME capture sheet rather than routing to its own create page. That is what
 * makes "capture from almost anywhere in seconds" true without a second create
 * route per module.
 *
 * The sheet implementation itself is lazy-loaded (`CaptureSheet` and, beneath it,
 * each type's panel), so the capture framework costs the initial bundle only a
 * context and a lazy boundary — the shell never pulls a module's forms merely to
 * render the bottom navigation.
 */

import {
  Suspense,
  createContext,
  lazy,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";

import type { CaptureType } from "./capture-model";
import type { CaptureContextContract } from "./capture-context";

/** Lazily-loaded so no capture form enters the initial application bundle. */
const CaptureSheet = lazy(() => import("./CaptureSheet"));

export type CaptureContextValue = {
  /**
   * Open the shared capture sheet. With no `type` the sheet opens on the chooser
   * (or the type remembered for this session); with one it opens straight into
   * that panel with its first field focused.
   */
  readonly openCapture: (
    type?: CaptureType,
    opener?: HTMLElement | null,
    captureContext?: CaptureContextContract | null,
  ) => void;
  /** Close the sheet. */
  readonly closeCapture: () => void;
  /** Whether the sheet is currently open (for `aria-expanded` on a trigger). */
  readonly captureOpen: boolean;
};

const CaptureContext = createContext<CaptureContextValue | null>(null);

/**
 * Access the shared capture surface.
 *
 * Returns `null` outside a provider rather than throwing, so a component tree
 * rendered in isolation (a unit test, a `/design/*` fixture) still renders — the
 * caller simply hides its capture affordance.
 */
export function useCapture(): CaptureContextValue | null {
  return useContext(CaptureContext);
}

export function CaptureProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [requestedType, setRequestedType] = useState<CaptureType | undefined>(
    undefined,
  );
  const [opener, setOpener] = useState<HTMLElement | null>(null);
  const [captureContext, setCaptureContext] =
    useState<CaptureContextContract | null>(null);

  const openCapture = useCallback(
    (
      type?: CaptureType,
      openerElement?: HTMLElement | null,
      nextContext?: CaptureContextContract | null,
    ) => {
      setRequestedType(type);
      setCaptureContext(nextContext ?? null);
      setOpener(
        openerElement ??
          (typeof document === "undefined"
            ? null
            : (document.activeElement as HTMLElement | null)),
      );
      setOpen(true);
    },
    [],
  );

  const closeCapture = useCallback(() => setOpen(false), []);

  const value = useMemo<CaptureContextValue>(
    () => ({ openCapture, closeCapture, captureOpen: open }),
    [openCapture, closeCapture, open],
  );

  return (
    <CaptureContext.Provider value={value}>
      {children}
      {open ? (
        <Suspense fallback={null}>
          <CaptureSheet
            requestedType={requestedType}
            opener={opener}
            captureContext={captureContext}
            onClose={closeCapture}
          />
        </Suspense>
      ) : null}
    </CaptureContext.Provider>
  );
}
