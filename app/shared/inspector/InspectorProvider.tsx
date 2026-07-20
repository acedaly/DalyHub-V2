/**
 * DS-10 Inspector — the provider (mounted per surface, like the DS-03 Drawer).
 *
 * The open state lives ENTIRELY in the URL (`?inspector=<key>`), so the panel is a
 * pure function of the address: deep-linkable, refresh-proof and Back/Forward
 * correct. A surface mounts one provider around its content and supplies a
 * `renderInspector(entry)` callback mapping the opaque key to a presentation —
 * exactly the Drawer's `renderDrawer` contract. This is the single Inspector
 * implementation; no module builds its own edit drawer.
 *
 * Opening pushes one history entry; closing is Back-aware (so Forward restores)
 * when this provider did the push, else it strips the param in place (a
 * deep-linked/refreshed open). The docked width and compact/sheet mode are owned
 * here so the surrounding content can reflow (padding) and never be covered.
 */

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";

import { Inspector } from "./Inspector";
import {
  InspectorContext,
  type InspectorContextValue,
  type InspectorRenderResult,
} from "./inspector-context";
import {
  DEFAULT_INSPECTOR_PARAM,
  readInspectorKey,
  withInspector,
  withoutInspector,
} from "./inspector-url";
import { useCompactViewport } from "./use-compact-viewport";
import { useInspectorResize } from "./use-inspector-resize";
import type { InspectorEntry, InspectorKey } from "./types";

export type InspectorProviderProps = {
  readonly children: ReactNode;
  /** Map an entry (its URL key) to a presentation, or `null` for not-found. */
  readonly renderInspector: (
    entry: InspectorEntry,
  ) => InspectorRenderResult | null;
  /** URL search-param name (default `"inspector"`). */
  readonly param?: string;
};

/**
 * Shown for an unknown/stale `?inspector=` key. Rendered THROUGH the `Inspector`
 * component (not a bespoke panel) so a not-found deep link on a compact viewport
 * still gets the full modal contract — scrim, focus trap, inert background, scroll
 * lock and focus management — instead of an `aria-modal` shell with none of them.
 */
const NOT_FOUND_RESULT: InspectorRenderResult = {
  title: "Not found",
  children: (
    <p role="note">
      This item couldn’t be found. It may have been moved or deleted.
    </p>
  ),
};

function isCloseBlocked(result: InspectorRenderResult | null): boolean {
  if (!result || result.preventClose === undefined) {
    return false;
  }
  return typeof result.preventClose === "function"
    ? result.preventClose()
    : result.preventClose;
}

export function InspectorProvider({
  children,
  renderInspector,
  param = DEFAULT_INSPECTOR_PARAM,
}: InspectorProviderProps) {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const compact = useCompactViewport();
  const resize = useInspectorResize();

  const titleId = useId();
  const descriptionId = useId();

  const openKey = readInspectorKey(searchParams, param);
  const isOpen = openKey !== null;

  // Whether THIS provider pushed the currently-open panel (so close can go Back).
  const didPushRef = useRef(false);
  // The element focused when the panel opened, to restore focus on close.
  const openerRef = useRef<HTMLElement | null>(null);

  const navigateWithParams = useCallback(
    (params: URLSearchParams, options: { replace: boolean }) => {
      const search = params.toString();
      navigate(
        {
          pathname: location.pathname,
          search: search ? `?${search}` : "",
          hash: location.hash,
        },
        { replace: options.replace, preventScrollReset: true },
      );
    },
    [navigate, location.pathname, location.hash],
  );

  const openInspector = useCallback(
    (key: InspectorKey) => {
      if (openKey === key) {
        return;
      }
      if (typeof document !== "undefined") {
        const active = document.activeElement;
        openerRef.current =
          active instanceof HTMLElement && active !== document.body
            ? active
            : null;
      }
      // Switching between records while open replaces; a fresh open pushes.
      const replace = isOpen;
      if (!replace) {
        didPushRef.current = true;
      }
      navigateWithParams(withInspector(searchParams, key, param), { replace });
    },
    [openKey, isOpen, navigateWithParams, searchParams, param],
  );

  const replaceInspector = useCallback(
    (key: InspectorKey) => {
      navigateWithParams(withInspector(searchParams, key, param), {
        replace: true,
      });
    },
    [navigateWithParams, searchParams, param],
  );

  const closeInspector = useCallback(() => {
    if (didPushRef.current && typeof window !== "undefined") {
      didPushRef.current = false;
      navigate(-1);
      return;
    }
    navigateWithParams(withoutInspector(searchParams, param), {
      replace: true,
    });
  }, [navigate, navigateWithParams, searchParams, param]);

  const result = useMemo<InspectorRenderResult | null>(
    () => (openKey === null ? null : renderInspector({ key: openKey })),
    [openKey, renderInspector],
  );

  const attemptClose = useCallback(() => {
    if (isCloseBlocked(result)) {
      return;
    }
    closeInspector();
  }, [result, closeInspector]);

  const controller = useMemo<InspectorContextValue>(
    () => ({
      openKey,
      isOpen,
      openInspector,
      replaceInspector,
      closeInspector,
    }),
    [openKey, isOpen, openInspector, replaceInspector, closeInspector],
  );

  // Post-close focus safety net. `useDrawerFocus` restores focus to the opener on
  // close, but a DEEP-LINKED open never captured one (openInspector was not
  // called), so focus would fall to <body>. Mirror DrawerProvider's net: when the
  // panel closes and focus has landed on the body, move it to the main content.
  const wasOpenRef = useRef(false);
  useEffect(() => {
    const wasOpen = wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!wasOpen || isOpen || typeof document === "undefined") {
      return;
    }
    const raf = requestAnimationFrame(() => {
      const active = document.activeElement;
      if (!active || active === document.body) {
        const main = document.getElementById("main-content");
        main?.focus?.();
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [isOpen]);

  return (
    <InspectorContext.Provider value={controller}>
      <div
        className="dh-inspector-layout"
        data-inspector-open={isOpen ? "true" : "false"}
        data-compact={compact ? "true" : "false"}
        style={
          isOpen && !compact
            ? ({
                ["--dh-inspector-width" as string]: `${resize.width}px`,
              } as React.CSSProperties)
            : undefined
        }
      >
        <div className="dh-inspector-content">{children}</div>
        {isOpen ? (
          <Inspector
            // An unknown/stale key renders the not-found result THROUGH the same
            // panel, so a not-found deep link keeps the full modal contract.
            result={result ?? NOT_FOUND_RESULT}
            titleId={titleId}
            descriptionId={descriptionId}
            compact={compact}
            resize={resize}
            opener={openerRef.current}
            onRequestClose={attemptClose}
          />
        ) : null}
      </div>
    </InspectorContext.Provider>
  );
}
