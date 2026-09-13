/**
 * UNTITLED-05 — Untitled's tab RAIL, drawn for real navigation links.
 *
 * ── Why this exists, and why `application/tabs` is not it ────────────────────
 *
 * DalyHub's view switchers are NAVIGATION. Each option is a link to a different
 * URL, and the collection it selects is fetched and rendered by the router
 * somewhere else in the document — not inside the switcher, and across a route
 * boundary the switcher does not own.
 *
 * Phase 4 built them on `application/tabs` anyway, which made every option a
 * `role="tab"`. ARIA's tab pattern requires each tab to control a `tabpanel`,
 * so each one was given a visually hidden panel containing the words "Viewing
 * …". That satisfies `aria-controls` syntactically and describes the WRONG
 * content to a screen reader: the tab announces a three-word placeholder while
 * the collection it conceptually controls sits outside the panel entirely. A
 * valid-looking lie is worse than the dangling reference it replaced, and this
 * component is shared, so the mismatch propagated product-wide.
 *
 * React Aria does support tabs-as-links, and its own routed example keeps the
 * routed content (`<Outlet />`) inside the matching panel. A shared switcher
 * rendered in a collection HEADER cannot do that.
 *
 * So the semantics go back to what they always described — a labelled
 * `navigation` landmark of anchors, the current one carrying
 * `aria-current="page"` — and the APPEARANCE stays Untitled's. Every class
 * string below is copied verbatim from `application/tabs`
 * (`getHorizontalStyles`, `sizes`, `getTabStyles`), which does not export them;
 * the selected/hovered arms are expressed as Tailwind variants because a link
 * has no React Aria render-prop state to read them from.
 *
 * The record's OWN tabs are untouched and remain real tabs: they switch content
 * inside one page, the panel genuinely holds the tab's content, and
 * `RecordTabs` owns both halves of the relationship.
 */

import type { ReactNode } from "react";

import { cx } from "~/shared/ui/untitled/utils/cx";

/** The rail's visual treatment. Untitled's `type`, for the two DalyHub uses. */
export type LinkTabRailType = "underline" | "button-border" | "button-minimal";

/**
 * The strip. `getHorizontalStyles({ size: "sm" })[type]`, plus the underline
 * variant's hairline, which upstream applies only to horizontal lists.
 */
const RAIL: Record<LinkTabRailType, string> = {
  underline: cx(
    "gap-3",
    "relative before:absolute before:inset-x-0 before:bottom-0 before:h-px before:bg-border-secondary",
  ),
  "button-border":
    "gap-1 rounded-[10px] bg-secondary_alt p-1 ring-1 ring-secondary ring-inset",
  "button-minimal":
    "gap-0.5 rounded-lg bg-secondary_alt ring-1 ring-inset ring-secondary",
};

/** `sizes.sm[type]`. */
const SIZE: Record<LinkTabRailType, string> = {
  underline: "px-0.5 pb-2.5 pt-0",
  "button-border": "py-2 px-2.5",
  "button-minimal": "py-2 px-2.5",
};

/**
 * `getTabStyles({ isSelected, isHovered })[type]`, as variants.
 *
 * `aria-[current=page]:` stands in for upstream's `isSelected`, and `hover:`
 * for its `isHovered` — the same two declarations, reached the way a plain
 * anchor can reach them.
 */
const TONE: Record<LinkTabRailType, string> = {
  underline: cx(
    "rounded-none border-b-2 border-transparent outline-focus-ring",
    "hover:border-fg-brand-primary_alt hover:text-brand-secondary",
    "aria-[current=page]:border-fg-brand-primary_alt aria-[current=page]:text-brand-secondary",
    "focus-visible:outline-2 focus-visible:-outline-offset-2",
  ),
  "button-border": cx(
    "outline-focus-ring",
    "hover:bg-primary_alt hover:text-secondary hover:shadow-sm",
    "aria-[current=page]:bg-primary_alt aria-[current=page]:text-secondary aria-[current=page]:shadow-sm",
    "focus-visible:outline-2 focus-visible:-outline-offset-2",
  ),
  "button-minimal": cx(
    "rounded-lg outline-focus-ring",
    "hover:bg-primary_alt hover:text-secondary hover:shadow-xs hover:ring-1 hover:ring-primary hover:ring-inset",
    "aria-[current=page]:bg-primary_alt aria-[current=page]:text-secondary aria-[current=page]:shadow-xs aria-[current=page]:ring-1 aria-[current=page]:ring-primary aria-[current=page]:ring-inset",
    "focus-visible:outline-2 focus-visible:-outline-offset-2",
  ),
};

/** The strip's class list, for a caller that renders its own anchors. */
export function linkTabRailClassName(
  type: LinkTabRailType,
  className?: string,
): string {
  return cx("group flex", RAIL[type], className);
}

/**
 * One option's class list.
 *
 * `sizes.sm.base` and the shared root from upstream's `Tab`, then the type's
 * size and tone. The phone TOUCH FLOOR is DalyHub's own and is stated on the
 * width rather than on the pointer: a 320px viewport is the case that matters
 * whether or not the pointer reports as coarse.
 */
export function linkTabClassName(
  type: LinkTabRailType,
  className?: string,
): string {
  return cx(
    "z-10 flex h-max cursor-pointer items-center justify-center gap-2 rounded-md whitespace-nowrap text-quaternary no-underline transition duration-100 ease-linear",
    /*
     * UNTITLED-12 — `shrink-0`, which is NOT upstream's and is load-bearing.
     *
     * A tab is a flex item and a flex item shrinks by default, while this
     * class also sets `whitespace-nowrap` — so an option compresses its BOX
     * while its text keeps its full width, and the text spills. MEASURED at
     * 320px, Diary's Day/Timeline switcher drew "Day" and "Timeline"
     * overlapping each other, and the ten-option type filter drew all ten as
     * one unreadable smear.
     *
     * It is safe because the rail is already a scroller: `ViewSwitcher` gives
     * the `nav` `w-auto max-w-full overflow-x-auto` for precisely the reason
     * its own comment states — a control that forces its own width pushes the
     * DOCUMENT sideways instead of scrolling inside itself. Items that keep
     * their intrinsic width inside a scroller scroll; they do not overflow the
     * page.
     *
     * Untitled has no opinion here because its own rails never hold enough
     * options to meet the case.
     */
    "shrink-0",
    "text-sm font-semibold *:data-icon:size-4",
    SIZE[type],
    TONE[type],
    "max-md:min-h-[var(--app-touch-target-min)] max-md:min-w-[var(--app-touch-target-min)] max-md:justify-center",
    className,
  );
}

/**
 * Upstream wraps a tab's content in this span; the rail's links match it.
 *
 * `px-0.5` unconditionally: upstream omits it only for `type="line"`, the
 * vertical rail, which this override does not offer.
 */
export function LinkTabContent({ children }: { readonly children: ReactNode }) {
  return <span className="flex items-center gap-1.5 px-0.5">{children}</span>;
}
