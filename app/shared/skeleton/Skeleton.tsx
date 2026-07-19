/**
 * PX-02 — the shared Skeleton/loading system.
 *
 * DESIGN_SYSTEM.md → Loading requires skeletons that MIRROR the final layout rather
 * than spinner-blocked blank screens, and PRODUCT_EXPERIENCE #15 adds collection
 * coverage. This module provides one primitive (`Skeleton`) and three composed
 * shapes:
 *   - `CardSkeleton`     — a density-aware ghost of a DS-04 Card;
 *   - `CollectionSkeleton` — a small set of card skeletons for a loading collection;
 *   - `PaneSkeleton`     — a generic ghost for a document/pane surface.
 *
 * Skeletons are decorative (`aria-hidden`); the loading REGION owns `aria-busy` and
 * any polite announcement (CollectionLayout does this). The shimmer honours reduced
 * motion — it collapses to a static tint with no information lost (skeleton.css +
 * the global reduced-motion rule).
 */

import type { CSSProperties } from "react";

export type SkeletonProps = {
  /** Width (any CSS length); defaults to 100%. */
  readonly width?: number | string;
  /** Height (any CSS length); defaults to 1em. */
  readonly height?: number | string;
  /** Border radius token override; defaults to the small radius. */
  readonly radius?: string;
  /** Render a circle (avatar/checkbox ghost). */
  readonly circle?: boolean;
  readonly className?: string;
  readonly style?: CSSProperties;
};

function toLength(value: number | string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  return typeof value === "number" ? `${value}px` : value;
}

/** One shimmering placeholder block. */
export function Skeleton({
  width,
  height,
  radius,
  circle,
  className,
  style,
}: SkeletonProps) {
  const classes = [
    "dh-skeleton",
    circle ? "dh-skeleton--circle" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <span
      className={classes}
      aria-hidden="true"
      style={{
        inlineSize: toLength(width),
        blockSize: toLength(height),
        borderRadius: radius,
        ...style,
      }}
    />
  );
}

export type CardSkeletonProps = {
  readonly density?: "comfortable" | "compact";
};

/** A ghost that mirrors a DS-04 Card's shape. */
export function CardSkeleton({ density = "comfortable" }: CardSkeletonProps) {
  return (
    <div
      className={`dh-card-skeleton dh-card-skeleton--${density}`}
      aria-hidden="true"
    >
      <div className="dh-card-skeleton__row">
        <Skeleton width="4rem" height="0.75rem" />
        <Skeleton width="3rem" height="0.75rem" />
      </div>
      <Skeleton width="70%" height="1rem" />
      <Skeleton width="45%" height="0.75rem" />
      {density === "comfortable" ? (
        <Skeleton width="100%" height="0.5rem" radius="var(--dh-radius-full)" />
      ) : null}
    </div>
  );
}

export type CollectionSkeletonProps = {
  /** How many card skeletons to render (default 4). */
  readonly count?: number;
  readonly density?: "comfortable" | "compact";
  readonly presentation?: "list" | "board" | "grid";
};

/** A set of card skeletons for a loading collection. */
export function CollectionSkeleton({
  count = 4,
  density = "comfortable",
  presentation = "list",
}: CollectionSkeletonProps) {
  return (
    <div
      className={`dh-collection-skeleton dh-collection-skeleton--${presentation}`}
      aria-hidden="true"
    >
      {Array.from({ length: Math.max(1, count) }, (_, index) => (
        <CardSkeleton key={index} density={density} />
      ))}
    </div>
  );
}

/** A generic ghost for a document/pane surface. */
export function PaneSkeleton() {
  return (
    <div className="dh-pane-skeleton" aria-hidden="true">
      <Skeleton width="14rem" height="1.75rem" />
      <Skeleton width="100%" height="0.9rem" />
      <Skeleton width="92%" height="0.9rem" />
      <Skeleton width="80%" height="0.9rem" />
    </div>
  );
}
