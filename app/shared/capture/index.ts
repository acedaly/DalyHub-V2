/**
 * MOBILE-01 — public entry for the shared Quick Capture framework.
 *
 * Import `useCapture` to open the ONE capture surface from any button, command or
 * empty state. The provider is mounted once by the AppShell and lazy-loads the
 * sheet and its panels, so nothing here reaches the initial bundle.
 *
 * Never build a module-specific capture modal: add a capture type here so every
 * surface gains it at once, and post to the module's canonical creation route.
 */

export { CaptureProvider, useCapture } from "./CaptureProvider";
export type { CaptureContextValue } from "./CaptureProvider";
export {
  CAPTURE_TYPES,
  CAPTURE_TYPE_DESCRIPTORS,
  CAPTURE_TYPE_SESSION_KEY,
  MEETING_ROUNDING_MINUTES,
  captureDescriptor,
  defaultMeetingStartLocal,
  isCaptureType,
  readRememberedCaptureType,
  rememberCaptureType,
  resolveInitialCaptureType,
} from "./capture-model";
export type { CaptureType, CaptureTypeDescriptor } from "./capture-model";
export type { CaptureContextPayload } from "~/routes/capture-context";
export { CaptureContextChip } from "./CaptureContextChip";
export {
  CAPTURE_CONTEXT_PARAM,
  contextForCaptureType,
  contextPresentation,
  encodeCaptureContext,
  fullFormLabel,
  fullFormRoute,
  parseCaptureContextContract,
  readCaptureContextParam,
} from "./capture-context";
export type { CaptureContextContract } from "./capture-context";
export { useUrlCaptureContext } from "./use-url-capture-context";
