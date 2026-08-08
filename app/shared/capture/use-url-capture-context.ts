/**
 * DEBT-45 — read the capture context a full-form hand-off carried in the URL.
 *
 * The Quick Capture sheet holds its context in React state, which is correct while
 * the sheet is mounted and useless the moment the user chooses a module's fuller
 * creation surface — a different route, a different component tree. So the sheet
 * hands off through the `?ctx=` parameter
 * ({@link import("./capture-context").CAPTURE_CONTEXT_PARAM}) and the destination
 * form reads it back here.
 *
 * The value is a display + submission convenience only. It is re-parsed through
 * the shared contract parser (a tampered or truncated parameter is simply no
 * context) and every canonical create route revalidates the source id/type in the
 * authenticated workspace before writing a relationship.
 *
 * The parameter is deliberately CONSUMED — removed from the URL, in place — once
 * the form has used it or the user has removed the chip. Until then it survives a
 * refresh, so a hand-off is not lost by reloading; afterwards the surface is
 * neutral again, so re-opening the same create form on the same page never
 * silently re-offers a context the user has finished with.
 */

import { useCallback, useMemo, useState } from "react";
import { useSearchParams } from "react-router";

import {
  CAPTURE_CONTEXT_PARAM,
  contextForCaptureType,
  readCaptureContextParam,
  type CaptureContextContract,
} from "./capture-context";
import type { CaptureType } from "./capture-model";

export interface UrlCaptureContext {
  /** The context to display and submit, or null. */
  readonly context: CaptureContextContract | null;
  /** Drop the context deliberately (the chip's Remove control). */
  readonly clear: () => void;
  /** Mark the context used, so the surface is neutral if re-opened here. */
  readonly consume: () => void;
}

/**
 * The capture context carried into this route, narrowed to the capture type the
 * form creates (a context whose relationship plan does not apply to this type is
 * ignored rather than shown as a promise the server would not keep).
 */
export function useUrlCaptureContext(
  captureType: CaptureType,
): UrlCaptureContext {
  const [searchParams, setSearchParams] = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  const fromUrl = useMemo(
    () =>
      contextForCaptureType(captureType, readCaptureContextParam(searchParams)),
    [captureType, searchParams],
  );

  // Removing the parameter is a REPLACE: the hand-off is one step of one create
  // flow, not a place in history the user should have to walk back through.
  const stripParam = useCallback(() => {
    if (!searchParams.has(CAPTURE_CONTEXT_PARAM)) return;
    const next = new URLSearchParams(searchParams);
    next.delete(CAPTURE_CONTEXT_PARAM);
    setSearchParams(next, { replace: true, preventScrollReset: true });
  }, [searchParams, setSearchParams]);

  const clear = useCallback(() => {
    setDismissed(true);
    stripParam();
  }, [stripParam]);

  return {
    context: dismissed ? null : fromUrl,
    clear,
    consume: stripParam,
  };
}
