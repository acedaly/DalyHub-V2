/**
 * DS-10 Inspector — the docked-panel resize hook.
 *
 * Provides an accessible, keyboard-AND-pointer resizable width for the desktop
 * docked panel, persisted across sessions. The returned handle props describe a
 * WAI-ARIA `separator` (orientation vertical) with Left/Right/Home/End keyboard
 * control and a pointer-drag path — never pointer-only. The width is clamped to
 * the DS-10 bounds and mirrored to a CSS custom property the panel consumes.
 */

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  INSPECTOR_DEFAULT_WIDTH,
  INSPECTOR_MAX_WIDTH,
  INSPECTOR_MIN_WIDTH,
  INSPECTOR_RESIZE_STEP,
  INSPECTOR_WIDTH_STORAGE_KEY,
  clampInspectorWidth,
} from "./types";

export type InspectorResize = {
  readonly width: number;
  readonly handleProps: {
    readonly role: "separator";
    readonly "aria-orientation": "vertical";
    readonly "aria-label": string;
    readonly "aria-valuemin": number;
    readonly "aria-valuemax": number;
    readonly "aria-valuenow": number;
    readonly tabIndex: 0;
    readonly onKeyDown: (event: ReactKeyboardEvent) => void;
    readonly onPointerDown: (event: ReactPointerEvent) => void;
  };
};

function readStoredWidth(): number {
  if (typeof window === "undefined") {
    return INSPECTOR_DEFAULT_WIDTH;
  }
  try {
    const raw = window.localStorage.getItem(INSPECTOR_WIDTH_STORAGE_KEY);
    if (raw === null) {
      return INSPECTOR_DEFAULT_WIDTH;
    }
    return clampInspectorWidth(Number.parseInt(raw, 10));
  } catch {
    return INSPECTOR_DEFAULT_WIDTH;
  }
}

export function useInspectorResize(): InspectorResize {
  const [width, setWidth] = useState<number>(INSPECTOR_DEFAULT_WIDTH);
  const dragStateRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );

  // Hydration-safe: read the persisted width after mount (SSR renders default).
  useEffect(() => {
    setWidth(readStoredWidth());
  }, []);

  const commitWidth = useCallback((next: number) => {
    const clamped = clampInspectorWidth(next);
    setWidth(clamped);
    try {
      window.localStorage.setItem(INSPECTOR_WIDTH_STORAGE_KEY, String(clamped));
    } catch {
      /* storage may be unavailable — width still applies for the session */
    }
    return clamped;
  }, []);

  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent) => {
      // The panel is anchored on the RIGHT, so a LEFT arrow widens it.
      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          commitWidth(width + INSPECTOR_RESIZE_STEP);
          break;
        case "ArrowRight":
          event.preventDefault();
          commitWidth(width - INSPECTOR_RESIZE_STEP);
          break;
        case "Home":
          event.preventDefault();
          commitWidth(INSPECTOR_MAX_WIDTH);
          break;
        case "End":
          event.preventDefault();
          commitWidth(INSPECTOR_MIN_WIDTH);
          break;
        default:
          break;
      }
    },
    [commitWidth, width],
  );

  const onPointerDown = useCallback(
    (event: ReactPointerEvent) => {
      if (event.button !== 0) {
        return;
      }
      event.preventDefault();
      dragStateRef.current = { startX: event.clientX, startWidth: width };
      const target = event.currentTarget;
      target.setPointerCapture?.(event.pointerId);

      const onMove = (moveEvent: PointerEvent) => {
        const drag = dragStateRef.current;
        if (!drag) {
          return;
        }
        // Dragging left (smaller clientX) widens the right-anchored panel.
        const delta = drag.startX - moveEvent.clientX;
        commitWidth(drag.startWidth + delta);
      };
      const onUp = () => {
        dragStateRef.current = null;
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
      };
      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [commitWidth, width],
  );

  return {
    width,
    handleProps: {
      role: "separator",
      "aria-orientation": "vertical",
      "aria-label": "Resize inspector",
      "aria-valuemin": INSPECTOR_MIN_WIDTH,
      "aria-valuemax": INSPECTOR_MAX_WIDTH,
      "aria-valuenow": width,
      tabIndex: 0,
      onKeyDown,
      onPointerDown,
    },
  };
}
