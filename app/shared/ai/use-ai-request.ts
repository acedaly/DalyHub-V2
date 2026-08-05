/**
 * AI-01 shared — the client-side AI request controller.
 *
 * It owns exactly three things a surface should not re-implement: the state
 * machine, cancellation, and duplicate-submit prevention.
 *
 * **Cancellation is honest.** Cancelling aborts the fetch, which aborts the
 * server's own provider request through the same signal. What the UI says is
 * therefore true: the wait stopped, no result will be applied, and the ledger
 * records whatever the provider reported using rather than pretending it used
 * nothing.
 */

import { useCallback, useRef, useState } from "react";

import { NO_CANDIDATES, type AiSurfaceState } from "./ai-view";

/** The controller a surface renders from. */
export interface AiRequestController {
  readonly state: AiSurfaceState;
  /** Run one request. A second call while busy is ignored, not queued. */
  readonly run: (body: Record<string, string>) => Promise<void>;
  readonly cancel: () => void;
  readonly reset: () => void;
  /** Send an acceptance or rejection to the apply route. */
  readonly apply: (body: Record<string, string>) => Promise<unknown>;
}

/** Build the controller for one AI surface. */
export function useAiRequest(
  initial: AiSurfaceState = { kind: "idle" },
): AiRequestController {
  const [state, setState] = useState<AiSurfaceState>(initial);
  const controllerRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  const cancel = useCallback(() => {
    if (controllerRef.current !== null) {
      setState({ kind: "cancelling" });
      controllerRef.current.abort();
    }
  }, []);

  const reset = useCallback(() => {
    controllerRef.current = null;
    busyRef.current = false;
    setState({ kind: "idle" });
  }, []);

  const run = useCallback(async (body: Record<string, string>) => {
    // Duplicate-submit prevention has two halves: this guard stops a second
    // in-flight request, and the server's idempotency key stops a refresh or a
    // retried POST from becoming a second paid request.
    if (busyRef.current) return;
    busyRef.current = true;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ kind: "running" });

    try {
      const response = await fetch("/ai/assist", {
        method: "POST",
        credentials: "same-origin",
        body: new URLSearchParams(body),
        signal: controller.signal,
      });
      const payload = (await response.json()) as Record<string, unknown>;

      if (payload.ok !== true) {
        setState({
          kind: "error",
          code: String(payload.code ?? "internal"),
          message: String(payload.message ?? "That didn’t work."),
        });
        return;
      }
      if (payload.source === "deterministic") {
        const answer = payload.answer as {
          summary: string;
          citations: {
            title: string;
            href: string | null;
            date: string | null;
          }[];
        };
        setState({
          kind: "deterministic",
          summary: answer.summary,
          citations: answer.citations,
        });
        return;
      }
      setState({
        kind: "result",
        result: payload.result as AiSurfaceState extends { result: infer R }
          ? R
          : never,
        citations: (payload.citations ?? []) as never,
        detail: payload.detail as never,
        disclosure: payload.disclosure as never,
        candidates: (payload.candidates ?? NO_CANDIDATES) as never,
        usageId: String(payload.usageId ?? ""),
      } as AiSurfaceState);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") {
        setState({
          kind: "error",
          code: "cancelled",
          message:
            "That request was cancelled. Nothing was added to DalyHub. If the provider had already started, the usage is still recorded.",
        });
        return;
      }
      setState({
        kind: "error",
        code: "internal",
        message: "That didn’t work. Nothing was changed.",
      });
    } finally {
      busyRef.current = false;
      controllerRef.current = null;
    }
  }, []);

  const apply = useCallback(async (body: Record<string, string>) => {
    const response = await fetch("/ai/apply", {
      method: "POST",
      credentials: "same-origin",
      body: new URLSearchParams(body),
    });
    return (await response.json()) as unknown;
  }, []);

  return { state, run, cancel, reset, apply };
}
