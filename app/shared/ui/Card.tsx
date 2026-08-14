/**
 * DS-02 — the generic Card surface.
 *
 * ── Why this exists when the repository already has several cards ────────────
 *
 * It does, and none of them is this. `~/shared/card`'s `Card` is a RECORD card:
 * it has a title that opens something, a status, metadata, selection and an
 * overflow of actions on that record. `DashboardCard` is a titled PANEL with a
 * header action and a footer. `ProjectCard`, `GoalCard`, `AssetCard`,
 * `ReviewCard` and `PersonRow` are the six product families (§5b), and DS-02
 * does not touch them — that is DS-05.
 *
 * What none of them is, is the plain bounded surface: "put these things in a
 * box on the canvas". Lacking one, module stylesheets grew their own — and each
 * new one picked its own padding, its own radius and its own idea of whether a
 * card has a border. This is that box, once.
 *
 * ── D1, and the one place DS-02 amends it ────────────────────────────────────
 *
 * D1 says a card draws no border and no resting shadow: separation is the
 * surface step alone. That was correct for a canvas at tone 97 holding a few
 * large tonal cards, and it is why the `flat` variant below is the DEFAULT.
 *
 * `outlined` is the DS-02 addition, and the concept direction is why: a dense
 * productivity surface puts many small boxes on one canvas, and at that count
 * the tonal step alone stops being a boundary — the eye reads a field of
 * slightly-different-white rectangles rather than a set of objects. A hairline
 * is the cheapest possible boundary and it is what the concepts draw. It is an
 * amendment to D1's scope, not a reversal of it: a card still never spends a
 * border AND a shadow AND a large radius at once, which is the thing D1 was
 * actually protecting.
 *
 * `raised` is for a surface that has genuinely LEFT the canvas — a floating
 * panel, a dragged card. Not for emphasis. A card that needs to look important
 * on a page it shares with others has an ordering problem, not a shadow one.
 *
 * ── What it does not do ──────────────────────────────────────────────────────
 *
 * It does not own its width (the grid it sits in does), it does not know what
 * it contains, and it renders no colour of its own beyond the three surface
 * roles. There is no `tone` prop: a coloured card was the M3X hierarchy's
 * device, it belongs to `SupportingSurface`, and a generic box growing one is
 * how a restrained system becomes a rainbow dashboard again.
 */

import type { ElementType, HTMLAttributes, ReactNode } from "react";

/** See the file header. `flat` is the default; `raised` is rare and literal. */
export type CardVariant = "flat" | "outlined" | "raised";

/**
 * How much air. `default` is `--dh-surface-padding` (which density owns);
 * `compact` is one rung tighter for a dense grid; `none` is for a card whose
 * child draws to the edge — a table, an image, a list of rows.
 */
export type CardPadding = "default" | "compact" | "none";

export interface SurfaceCardProps extends HTMLAttributes<HTMLElement> {
  readonly variant?: CardVariant;
  readonly padding?: CardPadding;
  /**
   * The element to render. Defaults to `div`. Pass `section`/`article` when the
   * card is a real landmark with a heading — a box is not automatically one,
   * and a page of eight `<section>`s with no headings is worse for a screen
   * reader than a page of eight `<div>`s.
   */
  readonly as?: ElementType;
  readonly children?: ReactNode;
}

/**
 * The generic card surface.
 *
 * Exported as `SurfaceCard` and re-exported from `~/shared/ui` as `Card`, so
 * the name a consumer types is `Card` while the module-local name can never be
 * confused with `~/shared/card`'s record `Card` in a file that imports both.
 */
export function SurfaceCard({
  variant = "flat",
  padding = "default",
  as: Element = "div",
  className,
  children,
  ...rest
}: SurfaceCardProps) {
  return (
    <Element
      className={[
        "dh-surface",
        `dh-surface--${variant}`,
        padding === "default" ? null : `dh-surface--pad-${padding}`,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </Element>
  );
}
