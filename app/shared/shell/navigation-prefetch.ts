/**
 * PERF-01 — the ONE navigation prefetch policy.
 *
 * Measured, not assumed. A cold click on a primary destination pays for three
 * things in sequence: the browser discovering the route's JavaScript chunk,
 * fetching it, and only then issuing the `.data` request the loader answers. The
 * production Safari capture the owner took shows the chunk fetch alone at
 * 360–460 ms with cache disabled, and it is entirely serial with the data
 * request that follows it.
 *
 * `intent` removes that serialisation for the destination the owner is actually
 * heading to. React Router starts the route module AND its loader data on
 * `mouseenter`, `focus` and `touchstart` — the moment the intent is expressed
 * rather than the moment the click lands — so by the time the click arrives the
 * work is usually already in flight or done.
 *
 * **Why not `render`.** `render` prefetches every destination the moment the
 * rail paints. The rail holds every module in the product, so that is the whole
 * application downloaded on first paint, on every device, whether or not the
 * owner ever leaves Today. On a phone on mobile data it is exactly the download
 * storm this programme is told not to create.
 *
 * **Why `intent` is safe on touch.** React Router's intent trigger includes
 * `touchstart`, which fires for the ONE destination a finger has landed on —
 * not for the others. A tap therefore warms one route a few dozen milliseconds
 * before its click event, which is a real gain and not a storm. Nothing here
 * prefetches on scroll, on viewport entry, or on mount.
 *
 * **Why not `viewport`.** The rail is fully visible at desktop widths, so
 * `viewport` degenerates into `render` there; and the phone's navigation sheet
 * shows every destination at once the moment it opens, so it degenerates into
 * `render` there too.
 *
 * This is a constant rather than a literal in two components because the rail
 * and the phone bar are two renderings of ONE navigation model, and a policy
 * that lives in two places is a policy that drifts.
 */

import type { PrefetchBehavior } from "react-router";

/**
 * The prefetch behaviour every PRIMARY navigation destination uses — the desktop
 * rail, the phone bottom bar and the navigation sheet alike.
 */
export const PRIMARY_NAV_PREFETCH: PrefetchBehavior = "intent";
