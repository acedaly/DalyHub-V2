/**
 * DS-10 Inspector — context, render-result contract and the `useInspector` hook.
 *
 * `renderInspector` maps the opaque URL key to a presentation, exactly as the
 * DS-03 Drawer's `renderDrawer` does. The Inspector is for DEPTH (all editable
 * fields, via shared DS-06 controls, saved optimistically); the Drawer/Summary is
 * for essentials. Never duplicate field controls between them — share the control.
 */

import { createContext, useContext, type ReactNode } from "react";

import type { InspectorController, InspectorEntry } from "./types";

/** What a module returns from `renderInspector` for a given entry. */
export type InspectorRenderResult = {
  /** Accessible name of the panel (also the visible heading). */
  readonly title: string;
  /** Optional supporting line, wired to `aria-describedby`. */
  readonly description?: string;
  /** The panel body — typically a shared Form of the record's editable fields. */
  readonly children: ReactNode;
  /** Optional pinned footer (e.g. destructive actions, metadata). */
  readonly footer?: ReactNode;
  /** Prevent Escape/close while true or the predicate returns true (unsaved work). */
  readonly preventClose?: boolean | (() => boolean);
};

export type InspectorContextValue = InspectorController;

export const InspectorContext = createContext<InspectorContextValue | null>(
  null,
);

/**
 * Drive the Inspector from any descendant of `InspectorProvider`. Throws outside a
 * provider, so a missing mount is a loud developer error.
 */
export function useInspector(): InspectorContextValue {
  const value = useContext(InspectorContext);
  if (value === null) {
    throw new Error("useInspector must be used within an <InspectorProvider>.");
  }
  return value;
}

export type { InspectorEntry };
