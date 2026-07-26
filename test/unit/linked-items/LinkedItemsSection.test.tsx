/**
 * The shared Linked Items section: grouped display, navigable links, optimistic
 * add/remove with feedback, and offline behaviour — all against an injected
 * transport (no network). The section is entity-agnostic; these tests drive it
 * with a fake transport the way any record's Linked tab would use the real one.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { DrawerProvider } from "~/shared/drawer";
import { FeedbackProvider } from "~/shared/feedback";
import { LinkedItemsSection } from "~/shared/linked-items";
import type { LinkedItemsTransport } from "~/shared/linked-items";
import type { LinkedItem } from "~/shared/linked-items/linked-items-model";

function noteItem(id: string, title: string): LinkedItem {
  return {
    linkId: `link-${id}`,
    target: { id, type: "note", title },
    linkType: "link.related",
    direction: "outgoing",
    removable: true,
  };
}

function makeTransport(
  overrides: Partial<LinkedItemsTransport> = {},
): LinkedItemsTransport {
  return {
    fetchItems: vi.fn(async () => [noteItem("n1", "Creative brief")]),
    searchTargets: vi.fn(async () => [
      { id: "n2", type: "note", title: "Research doc" },
    ]),
    createLink: vi.fn(async () => ({ ok: true })),
    removeLink: vi.fn(async () => ({ ok: true })),
    fetchSummary: vi.fn(async () => ({
      id: "n1",
      type: "note",
      title: "Creative brief",
      createdAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
    })),
    ...overrides,
  };
}

function renderSection(transport: LinkedItemsTransport, readOnly = false) {
  return render(
    <MemoryRouter>
      <FeedbackProvider>
        <DrawerProvider renderDrawer={() => null}>
          <LinkedItemsSection
            anchorId="anchor-1"
            anchorType="project"
            readOnly={readOnly}
            transport={transport}
          />
        </DrawerProvider>
      </FeedbackProvider>
    </MemoryRouter>,
  );
}

describe("LinkedItemsSection", () => {
  it("loads and renders linked items as navigable links grouped by kind", async () => {
    renderSection(makeTransport());
    const link = await screen.findByRole("link", { name: /Creative brief/ });
    expect(link).toHaveAttribute("href", "/notes/n1");
  });

  it("removes a link optimistically", async () => {
    const transport = makeTransport();
    renderSection(transport);
    await screen.findByRole("link", { name: /Creative brief/ });

    fireEvent.click(
      screen.getByRole("button", { name: /Remove link to Creative brief/ }),
    );
    // Optimistically gone before the server round-trip resolves.
    await waitFor(() =>
      expect(
        screen.queryByRole("link", { name: /Creative brief/ }),
      ).not.toBeInTheDocument(),
    );
    expect(transport.removeLink).toHaveBeenCalledWith({
      anchorId: "anchor-1",
      linkId: "link-n1",
    });
  });

  it("restores the item when removal fails", async () => {
    const transport = makeTransport({
      removeLink: vi.fn(async () => ({ ok: false, message: "nope" })),
    });
    renderSection(transport);
    await screen.findByRole("link", { name: /Creative brief/ });
    fireEvent.click(
      screen.getByRole("button", { name: /Remove link to Creative brief/ }),
    );
    // It reappears after the failed removal rolls back.
    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /Creative brief/ }),
      ).toBeInTheDocument(),
    );
  });

  it("hides add/remove controls in read-only mode", async () => {
    renderSection(makeTransport(), true);
    await screen.findByRole("link", { name: /Creative brief/ });
    expect(
      screen.queryByRole("button", { name: /Remove link to Creative brief/ }),
    ).not.toBeInTheDocument();
    // No "Link a record" search field either.
    expect(
      screen.queryByText(/Search your workspace to relate/),
    ).not.toBeInTheDocument();
  });

  it("shows an error state with retry when loading fails", async () => {
    const transport = makeTransport({
      fetchItems: vi.fn(async () => {
        throw new Error("boom");
      }),
    });
    renderSection(transport);
    expect(
      await screen.findByText(/Couldn.t load linked items/),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});
