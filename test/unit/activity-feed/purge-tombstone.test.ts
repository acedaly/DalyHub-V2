/**
 * AUDIT-FIX-03 — the subject-less purge tombstone renders honestly.
 *
 * Every other descriptor names its record through `primarySubject` and renders a
 * Drawer link. A permanent-deletion tombstone has no subject by construction (the
 * entity row was removed by the batch that appended the event), so before this
 * fix the Review tombstone degraded to an anonymous "permanently deleted this
 * review" and the Asset purge appended no event at all.
 *
 * These assertions pin what a reader must see instead: the destroyed record's
 * name, taken from the event's own immutable payload, as EMPHASIS rather than a
 * link that could only 404 — and a calm fallback when the payload cannot supply
 * one, because `describe` is contractually pure and total.
 */

import { describe, expect, it } from "vitest";

import type { ActivityPayload } from "~/kernel/activity";
import {
  purgeTombstoneDescriptor,
  toActivityItem,
  type ActivityItem,
} from "~/shared/activity-feed/model";

const REVIEW_TOMBSTONE = purgeTombstoneDescriptor({
  label: "Review permanently deleted",
  verb: "permanently deleted",
  titleKey: "title",
  fallbackText: "a review",
  entityType: "review",
});

function renderTombstone(payload: ActivityPayload): ActivityItem {
  return toActivityItem(
    {
      id: "act-1",
      workspaceId: "ws-1",
      type: "review.deleted",
      actor: { type: "user", id: "user-1" },
      occurredAt: new Date("2026-08-05T10:00:00.000Z"),
      payload,
      subjects: [],
    } as never,
    {
      descriptors: { "review.deleted": REVIEW_TOMBSTONE },
      resolveActorLabel: () => "Aidan",
    },
  );
}

/** The text a reader actually sees, with the actor resolved. */
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

describe("purge tombstone presentation", () => {
  it("names the destroyed record from the payload, as emphasis rather than a link", () => {
    const item = renderTombstone({
      reviewId: "rev-1",
      title: "Weekly Review — 27 July 2026",
    });

    expect(item.isKnownType).toBe(true);
    expect(readable(item)).toBe(
      "Aidan permanently deleted Weekly Review — 27 July 2026",
    );
    // The title is EMPHASIS, never an entity segment: the record it would link
    // to no longer exists, so a link could only lead nowhere.
    expect(item.presentation.segments.some((s) => s.kind === "entity")).toBe(
      false,
    );
    expect(item.presentation.segments).toContainEqual({
      kind: "emphasis",
      text: "Weekly Review — 27 July 2026",
    });
    expect(item.presentation.entityType).toBe("review");
    expect(item.presentation.tone).toBe("danger");
  });

  it("falls back calmly when the payload carries no usable title", () => {
    // `describe` must never throw on an unfamiliar payload — a missing key, a
    // non-string value and a blank string all degrade to the same calm phrase.
    for (const payload of [
      {},
      { title: 42 } as unknown as ActivityPayload,
      { title: "   " },
      { title: null } as unknown as ActivityPayload,
    ]) {
      const item = renderTombstone(payload as ActivityPayload);
      expect(readable(item)).toBe("Aidan permanently deleted a review");
    }
  });

  it("never emits a subject segment even if the event somehow carries one", () => {
    // Defence in depth: the repositories guarantee a subject-less tombstone, but
    // a legacy row written before AUDIT-FIX-03 could still have one. The line
    // must stay driven by the payload rather than resurrecting a dead link.
    const item = toActivityItem(
      {
        id: "act-2",
        workspaceId: "ws-1",
        type: "review.deleted",
        actor: { type: "user", id: "user-1" },
        occurredAt: new Date("2026-08-05T10:00:00.000Z"),
        payload: { reviewId: "rev-2", title: "Legacy review" },
        subjects: [{ entityId: "rev-2", role: "subject" }],
      } as never,
      {
        descriptors: { "review.deleted": REVIEW_TOMBSTONE },
        resolveActorLabel: () => "Aidan",
      },
    );
    expect(readable(item)).toBe("Aidan permanently deleted Legacy review");
    expect(item.presentation.segments.some((s) => s.kind === "entity")).toBe(
      false,
    );
  });
});
