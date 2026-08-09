/**
 * MOBILE-01 — the contract every Quick Capture panel implements.
 *
 * A panel owns one entity type's minimum-viable capture. It receives only the
 * ref the sheet uses for deterministic initial focus (so the phone keyboard opens
 * onto the field being captured, not onto the Close button) and the sheet's close
 * callback. Everything else — validation, persistence, error recovery — belongs to
 * the module's canonical creation authority, which the panel posts to.
 */

import type { RefObject } from "react";
import type { CaptureContextContract } from "./capture-context";

export type CapturePanelProps = {
  /**
   * The sheet's initial-focus target. A panel assigns its first input to this ref
   * (via the DS-06 `controlRef` binding) so focus and the keyboard land there.
   */
  readonly firstFieldRef: RefObject<HTMLElement | null>;
  /** Close the capture sheet ("Done", or after opening the created record). */
  readonly onClose: () => void;
  /** Optional record context supplied by a meaningful originating surface. */
  readonly captureContext: CaptureContextContract | null;
  /**
   * UIX-01 — the DOM id the sheet's header Save button submits.
   *
   * A panel that wants its primary action in the sheet's header puts this on
   * its `<Form id={…}>`; the header renders `<button type="submit" form={…}>`,
   * which is the native way for a control outside a form to submit it. A panel
   * that keeps its own in-body submit simply ignores it.
   */
  readonly formId?: string;
};

/** The three next steps every panel offers after a successful capture. */
export type CaptureSuccess = {
  /** The created record's id. */
  readonly id: string;
  /** Where "Open …" navigates to. */
  readonly href: string;
  /** The label of the open action, e.g. "Open task". */
  readonly openLabel: string;
  /** The confirmation announced to assistive technology. */
  readonly message: string;
};
