/**
 * M3-01 — the floating action button.
 *
 * Material Design 3 gives an application ONE floating action button for its
 * single most frequent creative act. DalyHub's is capture, and this control is
 * wired to the SAME shared Quick Capture surface every other entry point uses
 * (`useCapture`) — the phone bar's Capture slot, the command palette, every
 * empty state. It adds no behaviour of its own: it is a second door onto one
 * room, which is why there is nothing here to keep in sync.
 *
 * Placement follows the specification and the two insets the phone shell already
 * publishes: 24px from the bottom-right, above the navigation bar's height
 * (`--app-bottomnav-height`, `0px` on desktop) and above the home indicator
 * (`env(safe-area-inset-bottom)`). It moves out of the way with the navigation
 * bar while the on-screen keyboard is up, for the same reason the bar does.
 *
 * Accessibility: an icon-only control, so it carries an explicit `aria-label`
 * and meets the 56px target the specification sets — comfortably above WCAG
 * 2.2's 44px floor. Focus returns to it when the capture surface closes, because
 * the button hands itself to `openCapture` as the opener.
 */

import { useRef } from "react";

import { useCapture } from "~/shared/capture";
import { PlusIcon } from "~/shared/icons";

export function CaptureFab() {
  const capture = useCapture();
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <button
      type="button"
      ref={ref}
      className="dh-fab md-state-layer"
      aria-label="Capture"
      onClick={() => {
        if (ref.current) {
          capture?.openCapture(undefined, ref.current);
        }
      }}
    >
      <span className="dh-fab__icon" aria-hidden="true">
        <PlusIcon />
      </span>
    </button>
  );
}
