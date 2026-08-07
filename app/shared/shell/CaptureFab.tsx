/**
 * M3-01 / CAPTURE-02 — the floating action button.
 *
 * Material Design 3 gives an application ONE floating action button for its
 * single most frequent creative act. DalyHub's is capture, and this control is
 * wired to the SAME shared Quick Capture surface every other entry point uses
 * (`useCapture`) — the phone bar's Capture slot, the command palette, every
 * empty state. It adds no behaviour of its own: it is a second door onto one
 * room, which is why there is nothing here to keep in sync.
 *
 * ── CAPTURE-02: where it exists, and where it does not ───────────────────────
 * It is the global capture affordance for windows the phone shell does not
 * claim. BELOW `md` it is not shown at all: there the bottom navigation bar
 * already carries a labelled Capture slot in the same corner, and shipping both
 * gave a phone two global capture controls a thumb's width apart (DEBT-96,
 * confirmed as finding 1 of the August 2026 interaction audit). The bar wins on
 * a phone because its action is named, sits in the navigation a phone user
 * already reads, and does not float over the page.
 *
 * That rule lives entirely in `shell.css` — `display: none` inside the same
 * media query that raises the bar — rather than in a media-query hook here. One
 * responsive source of truth, no hydration mismatch, and `display: none`
 * genuinely removes the button from the Tab order and the accessibility tree,
 * which a merely hidden or transparent control would not.
 *
 * Placement follows the specification and the insets the shell already
 * publishes: `--app-fab-inset` from the bottom-right, above the navigation bar's
 * height (`--app-bottomnav-height`) and above the home indicator
 * (`env(safe-area-inset-bottom)`). It moves out of the way with the navigation
 * bar while the on-screen keyboard is up, for the same reason the bar does. The
 * space it occupies is published as `--app-fab-band` / `--app-fab-inline-band`
 * and reserved by the content pane, so the button never sits on top of a
 * control.
 *
 * Accessibility: an icon-only control, so it carries an explicit `aria-label`
 * and meets the 56px target the specification sets — comfortably above WCAG
 * 2.2's 44px floor — and it composes the ONE shared tooltip so the pointer and
 * keyboard both get the same explanation. Focus returns to it when the capture
 * surface closes, because the button hands itself to `openCapture` as the
 * opener.
 */

import { useRef } from "react";

import { useCapture } from "~/shared/capture";
import { PlusIcon } from "~/shared/icons";
import { Tooltip, composeRefs } from "~/shared/tooltip";

export function CaptureFab() {
  const capture = useCapture();
  const ref = useRef<HTMLButtonElement>(null);

  return (
    <Tooltip label="Capture" placement="top">
      {(tip) => (
        <button
          type="button"
          ref={composeRefs(ref, tip.ref)}
          className="dh-fab md-state-layer"
          aria-label="Capture"
          aria-describedby={tip.describedBy}
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
      )}
    </Tooltip>
  );
}
