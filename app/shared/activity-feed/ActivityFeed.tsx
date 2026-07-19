/**
 * DS-05 — Activity Feed: the workspace/scope configuration of the ONE shared
 * `ActivityStream`. It is `ActivityStream` with `scope="feed"` and a default label;
 * the route supplies a `loadPage` backed by `activity.listForWorkspace(…)`. The
 * trusted workspace boundary is fixed server-side in the loader — never selected or
 * overridden by client input through this component.
 */

import type { ReactNode } from "react";

import { ActivityStream, type ActivityStreamProps } from "./ActivityStream";

export type ActivityFeedProps = Omit<
  ActivityStreamProps,
  "scope" | "ariaLabel"
> & {
  readonly ariaLabel?: string;
};

export function ActivityFeed({
  ariaLabel = "Activity feed",
  ...props
}: ActivityFeedProps): ReactNode {
  return <ActivityStream scope="feed" ariaLabel={ariaLabel} {...props} />;
}
