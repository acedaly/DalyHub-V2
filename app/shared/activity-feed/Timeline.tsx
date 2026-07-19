/**
 * DS-05 — Timeline: the record-scoped configuration of the ONE shared
 * `ActivityStream`. Suitable for the Activity tab of the DS-02 Record Layout. It is
 * literally `ActivityStream` with `scope="timeline"` and a sensible default label;
 * the route supplies a `loadPage` backed by `activity.listForEntity(entityId, …)`.
 */

import type { ReactNode } from "react";

import { ActivityStream, type ActivityStreamProps } from "./ActivityStream";

export type TimelineProps = Omit<ActivityStreamProps, "scope" | "ariaLabel"> & {
  readonly ariaLabel?: string;
};

export function Timeline({
  ariaLabel = "Timeline",
  ...props
}: TimelineProps): ReactNode {
  return <ActivityStream scope="timeline" ariaLabel={ariaLabel} {...props} />;
}
