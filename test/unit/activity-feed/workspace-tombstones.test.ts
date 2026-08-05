/**
 * AUDIT-FIX-03 — a purge tombstone must name its record on the WORKSPACE feed.
 *
 * The module-scoped descriptor maps (`ASSETS_ACTIVITY_DESCRIPTORS`,
 * `REVIEWS_ACTIVITY_DESCRIPTORS`) are used on a module's own Activity surfaces.
 * But a tombstone's whole purpose is to be readable AFTER the record is gone —
 * and the record's own page no longer exists. The surface that actually carries
 * it is the cross-module feed (Today / workspace activity), which builds from
 * `buildWorkspaceActivityDescriptors(registry.listActivityTypes())` with NO
 * module overrides.
 *
 * So the curated cross-module map is the one that has to name the destroyed
 * record. It is also the map where a label-only or subject-resolving descriptor
 * silently degrades: with no subject to resolve, `selectReferenceSubject` returns
 * null and the line becomes "…Deleted review" — an audit event that cannot say
 * what it is about.
 *
 * These assertions run against the REAL registry-derived map, not a hand-built
 * one, so they fail if a tombstone type is ever added without a payload-driven
 * cross-module line.
 */

import { describe, expect, it } from "vitest";

import { AREA_DELETED } from "~/kernel/area-settings";
import { ASSET_DELETED } from "~/kernel/assets";
import { REVIEW_DELETED } from "~/kernel/reviews";
import { discoverModuleRegistry } from "~/modules/discover-modules";
import {
  buildWorkspaceActivityDescriptors,
  toActivityItem,
  type ActivityItem,
} from "~/shared/activity-feed/model";

/** Exactly what the Today / workspace feed resolves against. */
const FEED_DESCRIPTORS = buildWorkspaceActivityDescriptors(
  discoverModuleRegistry().listActivityTypes(),
);

function renderOnFeed(
  type: string,
  payload: Record<string, unknown>,
): ActivityItem {
  return toActivityItem(
    {
      id: "act-1",
      workspaceId: "ws-1",
      type,
      actor: { type: "user", id: "user-1" },
      occurredAt: new Date("2026-08-05T10:00:00.000Z"),
      payload,
      // Subject-less, exactly as every purge writes it.
      subjects: [],
    } as never,
    { descriptors: FEED_DESCRIPTORS, resolveActorLabel: () => "Aidan" },
  );
}

function readable(item: ActivityItem): string {
  return item.presentation.segments
    .map((segment) => {
      if (segment.kind === "text" || segment.kind === "emphasis")
        return segment.text;
      if (segment.kind === "actor") return item.actor.label;
      return segment.entityId;
    })
    .join("");
}

describe("purge tombstones on the cross-module workspace feed", () => {
  const cases = [
    {
      type: ASSET_DELETED,
      payload: { assetId: "asset-1", title: "Workshop compressor" },
      title: "Workshop compressor",
      fallback: "an asset",
    },
    {
      type: REVIEW_DELETED,
      payload: { reviewId: "rev-1", title: "Weekly Review — 27 July 2026" },
      title: "Weekly Review — 27 July 2026",
      fallback: "a review",
    },
    {
      type: AREA_DELETED,
      payload: { areaId: "area-1", title: "Health" },
      title: "Health",
      fallback: "an area",
    },
  ];

  it.each(cases)(
    "$type names the destroyed record on the feed",
    ({ type, payload, title }) => {
      const item = renderOnFeed(type, payload);
      expect(item.isKnownType).toBe(true);
      expect(readable(item)).toBe(`Aidan permanently deleted ${title}`);
      // Never an entity link — the record it would open no longer exists.
      expect(item.presentation.segments.some((s) => s.kind === "entity")).toBe(
        false,
      );
      expect(item.presentation.tone).toBe("danger");
    },
  );

  it.each(cases)(
    "$type degrades calmly when the payload cannot name the record",
    ({ type, fallback }) => {
      // A legacy row written before AUDIT-FIX-03 has no title in its payload.
      expect(readable(renderOnFeed(type, {}))).toBe(
        `Aidan permanently deleted ${fallback}`,
      );
    },
  );

  it("reads ONLY the title from the payload, never any other field", () => {
    // The curated cross-module map is a privacy boundary: a module's payload
    // fields must not leak onto another module's surface. A tombstone is the one
    // deliberate exception, and it is narrow — the record's own name, which every
    // other event already shows through its resolved entity link.
    const item = renderOnFeed(ASSET_DELETED, {
      assetId: "asset-1",
      title: "Ute",
      serialNumber: "SECRET-SERIAL",
      purchasePriceMinor: 1234567,
    });
    const text = readable(item);
    expect(text).toBe("Aidan permanently deleted Ute");
    expect(text).not.toContain("SECRET-SERIAL");
    expect(text).not.toContain("1234567");
    expect(item.presentation.metadata ?? []).toEqual([]);
  });
});
