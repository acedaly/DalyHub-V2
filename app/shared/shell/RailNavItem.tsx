/**
 * UNTITLED-02 — the primary-navigation ROW.
 *
 * The anatomy, spacing, states and type here are Untitled UI's `NavItemBase`
 * (`~/shared/ui/untitled/application/app-navigation/base-components/nav-item`),
 * adopted deliberately rather than referenced: the same rounded 36px row, the
 * same `text-sm font-semibold` label, the same quaternary icon that warms on
 * hover, the same selected treatment.
 *
 * ── Why this composes those styles instead of rendering that component ──────
 *
 * `NavItemBase` renders a React Aria `<Link href>`. With `AriaRouterProvider`
 * mounted that navigates correctly, but React Aria's link has no equivalent of
 * React Router's `prefetch`, and DalyHub's rail warms every destination on
 * INTENT (PERF-01, `navigation-prefetch.ts`) — hover or focus starts the
 * loaders before the click. Losing that would make every module slower to open
 * in exchange for nothing.
 *
 * So the row keeps React Router's `<Link>` — which is a real `<a>`, so the link
 * semantics React Aria would provide are already native — and takes Untitled's
 * presentation. Three DalyHub behaviours ride along that a stock nav item has no
 * concept of: `aria-current` from the shared active rule, `aria-busy`/`data-pending`
 * while the destination's loaders run, and the collapsed-rail tooltip.
 *
 * Keeping the class strings in ONE place is the point — this is the only file in
 * the product that describes what a navigation row looks like.
 */

import type { ReactNode, Ref } from "react";
import { Link } from "react-router";

import { cx } from "~/shared/ui/untitled/utils/cx";

/**
 * Untitled's `NavItemBase` geometry, with DalyHub's two extra states.
 *
 * `pending` deliberately reuses the SELECTED background rather than inventing a
 * third treatment: the row a click is on its way to should look like the row it
 * is about to become, so the acknowledgement is continuous with the result
 * instead of being a separate animation the eye has to interpret.
 *
 * ── Why the selected treatment depends on the SURFACE ───────────────────────
 *
 * Untitled's nav item assumes it sits on `bg-primary` and marks the current row
 * with `bg-secondary`. DalyHub's rail is itself `bg-secondary` — it is RECESSED
 * under the page canvas (AGENTS.md §6 D35) — so taking that pairing unchanged
 * paints the selected row in the exact colour it is sitting on, and the "you are
 * here" anchor disappears. Caught in the first render of this shell: every row
 * on `/today` looked identical.
 *
 * So the relationship is inverted where the surface is: on the recessed rail the
 * current row RISES to `bg-primary` with a hairline, which is the same idea one
 * tone up, and on the phone sheet — which is `bg-primary` — Untitled's original
 * pairing is correct and is used as-is.
 */
const surfaces = {
  /** The recessed desktop rail. The current row rises out of it. */
  rail: {
    hover: "hover:bg-primary/60",
    selected: "bg-primary shadow-xs ring-1 ring-secondary ring-inset",
    pending: "bg-primary/70",
  },
  /** The phone navigation sheet, drawn on the primary surface. */
  sheet: {
    hover: "hover:bg-primary_hover",
    selected: "bg-secondary",
    pending: "bg-secondary/70",
  },
} as const;

const ROOT =
  "group/item relative flex w-full cursor-pointer items-center rounded-md p-2 outline-focus-ring transition duration-100 ease-linear select-none focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2";

export type RailNavItemProps = {
  /** The destination. */
  readonly href: string;
  /** The module's glyph, already resolved by `NavIcon`. */
  readonly icon: ReactNode;
  /** The visible label, and the row's accessible name. */
  readonly label: string;
  /** Whether this row is the current destination. */
  readonly current?: boolean;
  /** Whether this row's destination is loading. */
  readonly pending?: boolean;
  /**
   * Whether the rail is collapsed to glyphs. The label stays in the DOM and is
   * hidden with the visually-hidden technique rather than removed, so a screen
   * reader still reads "Projects" at every width — what a collapsed row loses is
   * the name for a POINTER, which is what the tooltip restores.
   */
  readonly collapsed?: boolean;
  /** React Router's prefetch policy for this row (PERF-01). */
  readonly prefetch?: "none" | "intent" | "render" | "viewport";
  /** Called after the destination is chosen (closes the mobile sheet). */
  readonly onNavigate?: () => void;
  /** The tooltip's ref and description id, when one is attached. */
  readonly tooltipRef?: Ref<HTMLAnchorElement>;
  readonly describedBy?: string;
  /**
   * Which surface this row is drawn on. It decides the selected and hover
   * treatments, because "one tone up from here" is a different colour on the
   * recessed rail than it is on the phone sheet. See `surfaces`.
   */
  readonly surface?: keyof typeof surfaces;
};

export function RailNavItem({
  href,
  icon,
  label,
  current = false,
  pending = false,
  collapsed = false,
  prefetch,
  onNavigate,
  tooltipRef,
  describedBy,
  surface = "rail",
}: RailNavItemProps) {
  const tone = surfaces[surface];
  return (
    <Link
      to={href}
      ref={tooltipRef}
      prefetch={prefetch}
      className={cx(
        ROOT,
        "h-[var(--dh-shell-nav-row-height)]",
        surface === "sheet" && "min-h-11",
        !current && tone.hover,
        current && tone.selected,
        !current && pending && tone.pending,
        collapsed && "justify-center",
      )}
      aria-current={current ? "page" : undefined}
      aria-busy={pending ? true : undefined}
      data-pending={pending ? "true" : undefined}
      aria-describedby={describedBy}
      onClick={onNavigate}
    >
      <span
        aria-hidden="true"
        className={cx(
          // `*:size-full` because DalyHub's glyphs are SVG components that size
          // to their box rather than taking a className, unlike Untitled's icon
          // set. The box is Untitled's 20px either way.
          "flex size-5 shrink-0 items-center justify-center transition-inherit-all *:size-full",
          current
            ? "text-fg-brand-primary"
            : "text-fg-quaternary group-hover/item:text-fg-quaternary_hover",
          collapsed ? "" : "mr-2",
        )}
      >
        {icon}
      </span>
      <span
        className={cx(
          "flex-1 truncate text-sm font-semibold transition-inherit-all",
          current
            ? "text-secondary_hover"
            : "text-secondary group-hover/item:text-secondary_hover",
          collapsed && "sr-only",
        )}
      >
        {label}
      </span>
    </Link>
  );
}
