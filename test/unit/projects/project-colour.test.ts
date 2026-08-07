import { describe, expect, it } from "vitest";

import { toProjectCardData } from "~/modules/projects/project-view";
import type { SerializedProjectListItem } from "~/modules/projects/project-view";
import { areaAccentForRank } from "~/shared/pill";

/**
 * #130 — the Project's visual identity colour.
 *
 * Projects joined the Area mechanism rather than growing one of their own: a
 * stable 0-based rank over the workspace's `(created_at, id)` ordering, folded
 * into the shared six-colour ramp. These assertions are the properties that
 * make it an IDENTITY rather than a decoration — it is assigned without asking,
 * it differs between neighbours, and it cannot be moved by anything the owner
 * does to the Project afterwards.
 *
 * The rank itself is produced by one SQL window (`d1-project-repository.ts`),
 * deliberately over every `project` row regardless of lifecycle, so archiving
 * or soft-deleting one Project never recolours another.
 */

function listItem(
  overrides: Partial<SerializedProjectListItem> = {},
): SerializedProjectListItem {
  return {
    id: "p-1",
    title: "Launch the site",
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-02T00:00:00.000Z",
    completedAt: null,
    status: "active",
    archivedAt: null,
    area: { id: "a-1", title: "Work" },
    goal: null,
    areaColourRank: 4,
    colourRank: 0,
    iconKey: null,
    taskTotal: 3,
    taskCompleted: 1,
    health: {
      state: "on_track",
      tone: "success",
      label: "On track",
      reasons: [],
    },
    healthVisible: true,
    ...overrides,
  } as SerializedProjectListItem;
}

describe("Project identity colour", () => {
  it("is the Project's OWN rank, not the Area it belongs to", () => {
    // The Area's rank (4 -> accent 5) is deliberately not what the card wears:
    // a Project is recognisable as itself, and the Area stays named as text.
    const card = toProjectCardData(listItem({ areaColourRank: 4 }));
    expect(card.colourRank).toBe(0);
    expect(card.areaColourRank).toBe(4);
    expect(areaAccentForRank(card.colourRank)).not.toBe(
      areaAccentForRank(card.areaColourRank!),
    );
  });

  it("gives consecutively-created Projects different colours", () => {
    // Four Projects created in order take ranks 0..3 and therefore four
    // distinct entries in the ramp — no owner choice, no repeated default.
    const accents = [0, 1, 2, 3].map((rank) =>
      areaAccentForRank(
        toProjectCardData(listItem({ colourRank: rank })).colourRank,
      ),
    );
    expect(new Set(accents).size).toBe(4);
  });

  it("gives a Project with no Area a real identity, not the neutral container", () => {
    const card = toProjectCardData(
      listItem({ area: null, areaColourRank: null, colourRank: 2 }),
    );
    expect(card.colourRank).toBe(2);
    // `AccentIcon` paints the neutral container only for a null rank, and a
    // Project's own rank is never null.
    expect(card.colourRank).not.toBeNull();
  });

  it("does not move when the Project is renamed, re-described or worked on", () => {
    const before = toProjectCardData(listItem({ colourRank: 3 }));
    const after = toProjectCardData(
      listItem({
        colourRank: 3,
        title: "A completely different name",
        updatedAt: "2026-08-30T00:00:00.000Z",
        taskTotal: 40,
        taskCompleted: 39,
        status: "on_hold",
      }),
    );
    expect(after.colourRank).toBe(before.colourRank);
  });

  it("does not move when the Project's icon changes", () => {
    // Icon identity and icon colour are separate attributes: choosing a glyph
    // must never silently reassign the colour, and vice versa.
    const plain = toProjectCardData(listItem({ colourRank: 1, iconKey: null }));
    const chosen = toProjectCardData(
      listItem({ colourRank: 1, iconKey: "travel" }),
    );
    expect(chosen.colourRank).toBe(plain.colourRank);
    expect(chosen.iconKey).toBe("travel");
    expect(plain.iconKey).toBeNull();
  });

  it("does not move when the Project is archived or completed", () => {
    // The rank is computed over EVERY project row, so a lifecycle change
    // neither recolours this Project nor shifts the ones created after it.
    const active = toProjectCardData(listItem({ colourRank: 5 }));
    const archived = toProjectCardData(
      listItem({
        colourRank: 5,
        archivedAt: "2026-08-01T00:00:00.000Z",
        completedAt: "2026-07-30T00:00:00.000Z",
      }),
    );
    expect(archived.colourRank).toBe(active.colourRank);
  });

  it("folds into the shared ramp, so it is always a palette colour", () => {
    // Never an invented colour: a large rank wraps back into the same six
    // accents Areas use, and the accent is always 1-based within the ramp.
    for (const rank of [0, 5, 6, 11, 12, 97]) {
      const accent = areaAccentForRank(rank);
      expect(accent).toBeGreaterThanOrEqual(1);
      expect(accent).toBeLessThanOrEqual(6);
    }
    expect(areaAccentForRank(6)).toBe(areaAccentForRank(0));
  });
});
