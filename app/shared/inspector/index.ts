/**
 * DS-10 Inspector — public barrel.
 *
 * Re-exports the React-free model, the provider + panel, the `useInspector` hook
 * and the render-result contract. A surface mounts `InspectorProvider` with a
 * `renderInspector` callback; descendants drive it via `useInspector`.
 */

export * from "./model";

export { InspectorProvider } from "./InspectorProvider";
export type { InspectorProviderProps } from "./InspectorProvider";
export { Inspector } from "./Inspector";
export type { InspectorPanelProps } from "./Inspector";
export {
  InspectorContext,
  useInspector,
  type InspectorContextValue,
  type InspectorRenderResult,
} from "./inspector-context";
export {
  useInspectorResize,
  type InspectorResize,
} from "./use-inspector-resize";
export { useCompactViewport } from "./use-compact-viewport";
