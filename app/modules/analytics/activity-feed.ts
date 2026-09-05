/**
 * V2.9 INS-04 — the pure model for Insight's "What changed" feed.
 *
 * **Moved here from `today/landing/activity.ts` in the same change that gave it
 * a consumer.** TODAY-08 built this for a Today widget the redesign later
 * removed, leaving a resource route nothing rendered (DEBT-103). It now belongs
 * to the module that asks "what happened over this period?", and the Today
 * route went with the move rather than being left stranded — one owner, no
 * second door onto the same stream.
 *
 * The panel renders the ONE shared DS-05 Activity Feed over the SINGLE FND-05
 * Activity stream, now through `listInWindow` so the events shown are the
 * events inside the window the page is about. It invents no second history
 * model.
 *
 * Because a workspace feed spans EVERY module's events, its descriptors come from
 * the SHARED cross-module set plus the FND-06 module registry
 * (`buildWorkspaceActivityDescriptors`), not from a partial list maintained here.
 * That is what fixed the feed rendering registered-but-undescribed events (a
 * Meeting item conversion, a Person or Asset change) as unrecognised: every type a
 * module declares now has a readable line, and Analytics never imports another
 * module's internals — the registry and the kernel constants are shared surfaces,
 * so the module import boundary holds.
 */

import { discoverModuleRegistry } from "~/modules/discover-modules";
import {
  buildWorkspaceActivityDescriptors,
  type ActivityDescriptorMap,
  type ActivityItem,
} from "~/shared/activity-feed/model";

/** How many events one page of the feed loads. Bounded; the client pages. */
export const INSIGHT_ACTIVITY_PAGE_SIZE = 30;

/**
 * The descriptor map the feed resolves against, built ONCE per isolate:
 *
 *   kernel lifecycle defaults → every module's declared labels → the shared
 *   curated cross-module set
 *
 * The registry is build-time data, identical for every request and workspace, so
 * it is resolved once rather than per page read.
 */
let cachedDescriptors: ActivityDescriptorMap | null = null;

export function insightActivityDescriptors(): ActivityDescriptorMap {
  cachedDescriptors ??= buildWorkspaceActivityDescriptors(
    discoverModuleRegistry().listActivityTypes(),
  );
  return cachedDescriptors;
}

/**
 * V2.9 INS-04 — the EXACT number of D1 statements one page of the feed costs,
 * asserted against real D1 by `test/kernel/ins-04-what-changed.test.ts` at a
 * 3-event page and a 28-event one: the owner's preferences, the windowed page
 * read with its subject batch, the bounded entity batch and the bounded actor
 * directory. Never one read per event. A number rather than "equal counts",
 * so a per-event read fails the build rather than the owner's page.
 */
export const INSIGHT_ACTIVITY_PAGE_BUDGET = 5;

/** The JSON-safe shape of an `ActivityItem` (its only `Date` → ISO string). */
export type SerializedActivityItem = Omit<ActivityItem, "occurredAt"> & {
  readonly occurredAt: string;
};

/** One bounded page of the feed (the `/analytics/activity` resource payload). */
export interface InsightActivityPage {
  readonly items: readonly SerializedActivityItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
