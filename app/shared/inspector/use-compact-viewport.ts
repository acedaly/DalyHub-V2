/**
 * DS-10 Inspector — compact-viewport detection.
 *
 * Below the DS-01 `md` breakpoint the Inspector becomes a modal sheet; above it,
 * a docked, resizable side panel. SSR renders the docked (desktop-first) form and
 * the real value is resolved after mount, so there is no hydration mismatch — the
 * sheet-only modal behaviour (focus trap, scroll lock, inert background) is gated
 * on this and only ever engages on the client.
 *
 * MOBILE-01 promoted the implementation to `~/shared/viewport` so the Record
 * Layout's tab overflow uses the SAME signal rather than growing a second copy.
 * This module stays as the Inspector's named entry point; the behaviour and the
 * breakpoint are unchanged.
 */

export {
  COMPACT_VIEWPORT_QUERY as INSPECTOR_COMPACT_QUERY,
  useCompactViewport,
} from "~/shared/viewport/use-compact-viewport";
