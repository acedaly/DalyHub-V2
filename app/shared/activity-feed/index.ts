/**
 * DS-05 — the Shared Timeline & Activity Feed public API (UI barrel).
 *
 * The React components, hooks and the full pure model are exported here. Pure,
 * React-free consumers (server surfaces, tests) should import from
 * `~/shared/activity-feed/model` instead. Consumers never import D1, repositories,
 * cursor internals or Cloudflare bindings through this surface — the route owns
 * those behind the `loadPage` loader it supplies.
 */

// The pure model (types, mapping, grouping, dates, paging, window, filter fields).
export * from "./model";

// The shared renderer and its two configurations.
export { ActivityStream, type ActivityStreamProps } from "./ActivityStream";
export { Timeline, type TimelineProps } from "./Timeline";
export { ActivityFeed, type ActivityFeedProps } from "./ActivityFeed";

// The one shared event item and the day heading.
export {
  ActivityEventItem,
  type ActivityEventItemProps,
  type RenderEntityLink,
} from "./ActivityEventItem";
export {
  ActivityDayHeading,
  type ActivityDayHeadingProps,
} from "./ActivityDayHeading";

// Hooks (for advanced consumers composing their own layout).
export {
  useActivityStream,
  type ActivityLoadPhase,
  type ActivityStreamState,
  type UseActivityStreamOptions,
} from "./use-activity-stream";
export {
  useActivityWindow,
  type ActivityWindowState,
  type RowRefCallback,
  type UseActivityWindowOptions,
} from "./use-activity-window";
