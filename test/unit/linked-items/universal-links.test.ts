/**
 * The Universal Relationship System server helper: `loadLinkedItems` must paginate
 * THROUGH the underlying EntityLink pages while filtering reserved structural
 * spine links, so an anchor with many structural links still surfaces its later
 * `link.related` relationships and never renders as empty.
 *
 * Regression for Codex thread PRRT_kwDOTbatJs6T6Oyq (read only the first page,
 * discarded nextCursor, filtered from an already-truncated page).
 */

import { describe, expect, it, vi } from "vitest";

import type { EntityLinkPickerDeps } from "~/platform/entity-links";
import { loadLinkedItems } from "~/platform/entity-links";

type ListForEntity = EntityLinkPickerDeps["entityLinks"]["listForEntity"];

/** A minimal EntityLinkView for the fields loadLinkedItems reads. */
function view(linkId: string, type: string, counterpartId: string) {
  return {
    link: { id: linkId, type },
    direction: "outgoing" as const,
    counterpart: { id: counterpartId, type: "note", title: counterpartId },
  };
}

/** A page as the kernel EntityLinkRepository returns it. */
function page(items: ReturnType<typeof view>[], nextCursor: string | null) {
  return { items, nextCursor, hasMore: nextCursor !== null };
}

/** Build fake deps whose listForEntity replays the given pages in order. */
function depsFromPages(pages: ReturnType<typeof page>[]): {
  deps: EntityLinkPickerDeps;
  listForEntity: ReturnType<typeof vi.fn>;
} {
  let call = 0;
  const listForEntity = vi.fn(async () => pages[call++] ?? page([], null));
  const deps = {
    entities: {} as EntityLinkPickerDeps["entities"],
    entityLinks: {
      listForEntity: listForEntity as unknown as ListForEntity,
    } as EntityLinkPickerDeps["entityLinks"],
  };
  return { deps, listForEntity };
}

describe("loadLinkedItems", () => {
  it("pages past a full page of structural links to reach a later link.related", async () => {
    // Page 1 is entirely reserved structural links (all filtered out) but signals
    // more remain; page 2 holds the newer relationship.
    const { deps, listForEntity } = depsFromPages([
      page(
        [
          view("s1", "task.belongs_to_project", "p1"),
          view("s2", "goal.belongs_to_area", "a1"),
        ],
        "cursor-2",
      ),
      page([view("r1", "link.related", "n9")], null),
    ]);

    const result = await loadLinkedItems(deps, "anchor");

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.linkId).toBe("r1");
    expect(result.items[0]!.removable).toBe(true);
    expect(result.nextCursor).toBeNull();
    // It continued to the second page using the first page's cursor.
    expect(listForEntity).toHaveBeenCalledTimes(2);
    expect(listForEntity.mock.calls[1]![1]).toMatchObject({
      cursor: "cursor-2",
    });
  });

  it("returns a nextCursor when the display page fills but more remain", async () => {
    const { deps, listForEntity } = depsFromPages([
      page([view("r1", "link.related", "n1")], "cursor-2"),
      page([view("r2", "link.related", "n2")], null),
    ]);

    const result = await loadLinkedItems(deps, "anchor", { limit: 1 });

    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.linkId).toBe("r1");
    // The display page is full and more remain — surface the cursor, don't drop.
    expect(result.nextCursor).toBe("cursor-2");
    // Only one underlying fetch was needed to fill the limit.
    expect(listForEntity).toHaveBeenCalledTimes(1);
  });

  it("returns an empty page with no cursor when the anchor has no links", async () => {
    const { deps } = depsFromPages([page([], null)]);
    const result = await loadLinkedItems(deps, "anchor");
    expect(result.items).toEqual([]);
    expect(result.nextCursor).toBeNull();
  });
});
