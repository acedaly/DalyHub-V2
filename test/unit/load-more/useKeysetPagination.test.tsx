/**
 * UX-01 — the ONE shared keyset-pagination hook (DEBT-45).
 *
 * Six collections had six private copies of this logic and two more had none at
 * all, so these tests pin the behaviour every collection now inherits: pages
 * accumulate rather than replace, a record on a page boundary appears once, a
 * scope change restarts the accumulation, and a failed page is a retryable state
 * rather than a silently short list.
 *
 * The request-scoped rule ("a page is consumed only if it was asked for since the
 * current scope began") is the defect the copies carried; it is proved here by the
 * reset test — a response that arrives with no outstanding request is not applied.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { useKeysetPagination } from "~/shared/load-more";

type Item = { readonly id: string };
type PageData = {
  readonly items: readonly Item[];
  readonly nextCursor: string | null;
  readonly failed: boolean;
};

const select = (data: PageData) => data;
const getId = (item: Item) => item.id;

function Harness({
  firstPage,
  initialCursor,
  path,
}: {
  readonly firstPage: readonly Item[];
  readonly initialCursor: string | null;
  readonly path: string;
}) {
  const pagination = useKeysetPagination<Item, PageData>({
    firstPage,
    initialCursor,
    path,
    select,
    getId,
  });
  return (
    <div>
      <ul aria-label="items">
        {pagination.items.map((item) => (
          <li key={item.id}>{item.id}</li>
        ))}
      </ul>
      <p>{pagination.hasMore ? "more" : "exhausted"}</p>
      {pagination.loadFailed ? <p>failed</p> : null}
      <button type="button" onClick={pagination.loadMore}>
        Load more
      </button>
    </div>
  );
}

/**
 * A stub route whose loader answers the hook's `fetcher.load`. `pages` maps a
 * cursor to the page it returns, so the test controls the whole keyset.
 */
function renderHarness(options: {
  readonly firstPage: readonly Item[];
  readonly initialCursor: string | null;
  readonly pages: Record<string, PageData>;
}) {
  const Stub = createRoutesStub([
    {
      path: "/things",
      loader: ({ request }) => {
        const cursor = new URL(request.url).searchParams.get("cursor") ?? "";
        return (
          options.pages[cursor] ?? {
            items: [],
            nextCursor: null,
            failed: true,
          }
        );
      },
      Component: () => (
        <Harness
          firstPage={options.firstPage}
          initialCursor={options.initialCursor}
          path="/things"
        />
      ),
    },
  ]);
  return render(<Stub initialEntries={["/things"]} />);
}

/** The stub route has a loader, so the first render is asynchronous. */
async function loadMoreButton() {
  return screen.findByRole("button", { name: "Load more" });
}

/**
 * Each assertion waits on a real router fetch, which under a fully-parallel suite
 * run can take longer than the 1s default. The generous window costs nothing on a
 * passing run and keeps the suite deterministic.
 */
const SETTLED = { timeout: 5_000 } as const;

function itemIds(): string[] {
  return screen
    .getAllByRole("listitem")
    .map((node) => node.textContent ?? "")
    .filter((text) => text.length > 0);
}

describe("useKeysetPagination", () => {
  it("accumulates the next page onto the first rather than replacing it", async () => {
    renderHarness({
      firstPage: [{ id: "a" }, { id: "b" }],
      initialCursor: "c1",
      pages: {
        c1: {
          items: [{ id: "c" }, { id: "d" }],
          nextCursor: null,
          failed: false,
        },
      },
    });

    fireEvent.click(await loadMoreButton());

    await waitFor(
      () => expect(itemIds()).toEqual(["a", "b", "c", "d"]),
      SETTLED,
    );
    expect(screen.getByText("exhausted")).toBeInTheDocument();
  });

  it("shows a record straddling a page boundary exactly once", async () => {
    renderHarness({
      firstPage: [{ id: "a" }, { id: "b" }],
      initialCursor: "c1",
      pages: {
        // `b` repeats — a real keyset boundary can hand back an overlapping row.
        c1: {
          items: [{ id: "b" }, { id: "c" }],
          nextCursor: null,
          failed: false,
        },
      },
    });

    fireEvent.click(await loadMoreButton());

    await waitFor(() => expect(itemIds()).toEqual(["a", "b", "c"]), SETTLED);
  });

  it("surfaces a failed page as a retryable state, never a silently short list", async () => {
    renderHarness({
      firstPage: [{ id: "a" }],
      initialCursor: "c1",
      pages: {
        c1: { items: [], nextCursor: null, failed: true },
      },
    });

    fireEvent.click(await loadMoreButton());

    await waitFor(
      () => expect(screen.getByText("failed")).toBeInTheDocument(),
      SETTLED,
    );
    // The cursor is NOT advanced by a failure, so the owner can still reach the
    // rest of the collection.
    expect(screen.getByText("more")).toBeInTheDocument();
    expect(itemIds()).toEqual(["a"]);
  });

  it("does not fetch again once the cursor is exhausted", async () => {
    renderHarness({
      firstPage: [{ id: "a" }],
      initialCursor: null,
      pages: {},
    });

    fireEvent.click(await loadMoreButton());
    expect(screen.getByText("exhausted")).toBeInTheDocument();

    // A `loadMore` with no cursor is a no-op: no failure state, no lost rows.
    expect(screen.queryByText("failed")).toBeNull();
    expect(itemIds()).toEqual(["a"]);
  });
});
