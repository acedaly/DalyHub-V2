/**
 * PROJ-04 — the project Activity Timeline's pure model (React-free).
 *
 * The one place the Projects module extends the shared DS-05 descriptor set for the
 * events a PROJECT is a subject of. It registers presentations ONLY for the two
 * project-specific spine events that lack a kernel default — `project.completed` and
 * `project.reopened` — layered over `DEFAULT_ACTIVITY_DESCRIPTORS` (the seven
 * kernel-reserved lifecycle types, incl. `entity.created`, `entity.updated` and the
 * `entity_link.*` events that carry the project's creation, rename, structural links
 * and Key-link changes). Every other registered type falls through to the shared
 * safe generic fallback — there is deliberately NO Projects-only switch statement and
 * NO duplicated registry.
 *
 * It imports only the pure activity model and the spine event-type constants; it
 * never touches React, D1 or Cloudflare bindings, so the resource-route loader can
 * map records with it server-side and a unit test can exercise it directly.
 */

import { PROJECT_COMPLETED, PROJECT_REOPENED } from "~/kernel/spine";
import {
  createActivityDescriptorMap,
  type ActivityItem,
  type ActivityTypeDescriptor,
} from "~/shared/activity-feed/model";

/**
 * How many events a single project Timeline page loads. Bounded — the Timeline never
 * "loads everything"; the client pages through with the opaque scope-bound cursor.
 */
export const PROJECT_ACTIVITY_PAGE_SIZE = 30;

/**
 * Project-specific descriptors, layered over the kernel lifecycle defaults. These are
 * the only two events whose subject is the project that the shared defaults don't
 * already render. They set a calm label, the `project` entity marker and a restrained
 * tone; the shared mapper renders the standard `actor · label — subject` line, so
 * there is no bespoke Projects formatter and no risk of dumping raw payload JSON.
 */
export const PROJECT_ACTIVITY_DESCRIPTORS: Record<
  string,
  ActivityTypeDescriptor
> = {
  [PROJECT_COMPLETED]: {
    label: "Completed project",
    entityType: "project",
    tone: "success",
  },
  [PROJECT_REOPENED]: {
    label: "Reopened project",
    entityType: "project",
  },
};

/**
 * The frozen descriptor map the project Timeline resolves against: the kernel
 * lifecycle defaults with the two project events merged on top. Reused by both the
 * loader (server-side mapping) and the descriptor unit test.
 */
export const PROJECT_ACTIVITY_DESCRIPTOR_MAP = createActivityDescriptorMap(
  PROJECT_ACTIVITY_DESCRIPTORS,
);

/** The JSON-safe shape of an `ActivityItem` (its only `Date` → ISO string). */
export type SerializedProjectActivityItem = Omit<ActivityItem, "occurredAt"> & {
  readonly occurredAt: string;
};

/** One bounded page of a project's Activity Timeline (the resource-route payload). */
export interface ProjectActivityPage {
  readonly items: readonly SerializedProjectActivityItem[];
  readonly nextCursor: string | null;
  readonly hasMore: boolean;
}
