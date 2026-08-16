/**
 * REDESIGN-04 — the collection CONTROL ROW.
 *
 * `mockup3.png` draws the band beneath the Projects header as one row with two
 * ends: the lifecycle tab rail at the leading edge, the Grid/Table presentation
 * toggle at the trailing edge. Both already exist as shared controls
 * (`ViewTabs`, `ViewSwitcher`); what did not exist was the row that holds them,
 * so a module wanting the composition had to invent a flexbox wrapper of its
 * own — which is how the product ended up with `dh-meetings-filters`,
 * `dh-assets-filters` and friends all solving the same layout privately.
 *
 * ── Why not the PaneHeader's `viewSwitcher` slot ────────────────────────────
 * That slot is real and stays. It puts the switcher on the TITLE row, which is
 * right for a collection whose header band is otherwise sparse. mockup3 puts
 * Projects' presentation toggle a band lower, level with the lifecycle tabs,
 * because the title row is already carrying search and the primary action —
 * three control clusters on one line at 1280 is where that row breaks. The
 * semantic ownership rule (UIQ-013) is untouched: this is still the ONE
 * view-switcher control, changing presentation and never the record subset. It
 * has simply been given the row the reference draws it on.
 *
 * Presentation only: two slots, a flex row, and the phone behaviour §7 asks for
 * (both ends stay on one row; the leading rail scrolls horizontally rather than
 * wrapping the trailing toggle onto a second line).
 */

import type { ReactNode } from "react";

export type CollectionControlRowProps = {
  /**
   * The leading cluster — the lifecycle/mode rail, and any filter that must
   * stay visible. Scrolls horizontally on a phone rather than wrapping.
   */
  readonly leading?: ReactNode;
  /** The trailing cluster — the presentation toggle. Never scrolls away. */
  readonly trailing?: ReactNode;
  readonly className?: string;
  readonly "data-testid"?: string;
};

export function CollectionControlRow({
  leading,
  trailing,
  className,
  "data-testid": testId,
}: CollectionControlRowProps) {
  return (
    <div
      className={["dh-controlrow", className].filter(Boolean).join(" ")}
      data-testid={testId}
    >
      {leading ? <div className="dh-controlrow__lead">{leading}</div> : null}
      {trailing ? <div className="dh-controlrow__trail">{trailing}</div> : null}
    </div>
  );
}
