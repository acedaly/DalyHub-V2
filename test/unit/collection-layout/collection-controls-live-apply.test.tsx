/**
 * V2.3-GATE-01 — the shared collection controls COMBINE, even under load.
 *
 * `CollectionControlsPopover` live-applies (CONTROL-01): each choice is
 * committed as it is made, composed over the parameters the collection reports
 * as applied. A collection that validates its URL state hands those parameters
 * down from its LOADER (`TasksWorkspace`'s `canonicalParams`), which is right —
 * the controls must never claim a filter the query did not apply — and which
 * means the committed state does not advance until the loader answers.
 *
 * Between the two, a second choice used to be composed over a base that had
 * never heard of the first, so choosing Priority 1 and then Due Overdue wrote
 * `?due=overdue` alone. The canonical contract is that filters COMBINE
 * (`DESIGN_SYSTEM.md → Filters: one filter system`).
 *
 * This reproduces the exact shape — a real router, a loader held open, and the
 * canonical parameters handed down from loader data — and asserts what the
 * SECOND write actually contained. It is deterministic: the loader is released
 * by the test, never by a timer.
 */

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryRouter,
  useLoaderData,
  useNavigation,
} from "react-router";
import { describe, expect, it } from "vitest";

import { CollectionControls } from "~/shared/collection-layout";
import type { CollectionControlGroup } from "~/shared/collection-layout";

const GROUPS: readonly CollectionControlGroup[] = [
  {
    id: "priority",
    label: "Priority",
    param: "priority",
    options: [
      { value: "", label: "Any priority" },
      { value: "p1", label: "P1 · Urgent" },
    ],
  },
  {
    id: "due",
    label: "Due",
    param: "due",
    options: [
      { value: "", label: "Any due date" },
      { value: "overdue", label: "Overdue" },
    ],
  },
];

/** A gate the test opens by hand, so nothing here depends on a timer. */
function gate() {
  let open!: () => void;
  const held = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { held, open };
}

/**
 * The collection, wired the way Tasks wires it: the parameters the controls read
 * come from LOADER DATA, not from the raw URL.
 */
function Collection() {
  const applied = useLoaderData() as string;
  const navigation = useNavigation();
  return (
    <>
      <CollectionControls
        groups={GROUPS}
        params={new URLSearchParams(applied)}
      />
      {/* What the router is on its way to — i.e. what the last write said. */}
      <p data-testid="target">{navigation.location?.search ?? `?${applied}`}</p>
    </>
  );
}

describe("collection controls — live apply", () => {
  it("composes a second choice over the first, before the loader has answered", async () => {
    const first = gate();
    let loads = 0;
    const router = createMemoryRouter(
      [
        {
          path: "/tasks",
          loader: async ({ request }) => {
            loads += 1;
            // The FIRST reload is held open; the initial load and everything
            // after it answer immediately.
            if (loads === 2) await first.held;
            return new URL(request.url).searchParams.toString();
          },
          Component: Collection,
        },
      ],
      { initialEntries: ["/tasks"] },
    );
    render(<RouterProvider router={router} />);

    // The desktop popover is the live-applying surface under test.
    fireEvent.click(await screen.findByTestId("collection-filter-trigger"));
    fireEvent.click(screen.getByTestId("collection-popover-priority-p1"));
    // The first write carried the first choice…
    expect(await screen.findByTestId("target")).toHaveTextContent(
      "priority=p1",
    );

    // …and the second is made while that write is STILL IN FLIGHT.
    fireEvent.click(screen.getByTestId("collection-popover-due-overdue"));
    const target = await screen.findByTestId("target");
    expect(target).toHaveTextContent("priority=p1");
    expect(target).toHaveTextContent("due=overdue");

    first.open();
  });

  it("composes a second choice made before the router has even STARTED the first", async () => {
    /*
     * V2.4-GATE-01 — the half of the window the test above does not cover, and
     * the answer to a question its absence left open.
     *
     * That one waits for `target` to show the first write, which means it waits
     * for the router to report `state === "loading"`. Nothing waits for that in
     * real use, so the obvious worry is the gap between `record()` and the
     * router picking the navigation up: in that gap `useAppliedParams` sees an
     * IDLE router, and its render-time clear cannot tell "not started yet" from
     * "already finished". If it dropped the remembered write there, the second
     * choice would compose over the committed state and delete the first — the
     * exact defect this file exists for.
     *
     * It does not. Both clicks here are in one synchronous block with no wait
     * between them, and the write still carries both. The gap is not observable
     * because the router dispatches `loading` in the same batch as the
     * `setSearchParams` that caused it, so no render ever sees the idle-but-
     * pending state. This test is here to keep it that way: it is the assertion
     * that would fail if that batching ever changed, and it was written because
     * a CI failure made the question worth answering rather than assuming.
     */
    const first = gate();
    let loads = 0;
    const router = createMemoryRouter(
      [
        {
          path: "/tasks",
          loader: async ({ request }) => {
            loads += 1;
            if (loads === 2) await first.held;
            return new URL(request.url).searchParams.toString();
          },
          Component: Collection,
        },
      ],
      { initialEntries: ["/tasks"] },
    );
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByTestId("collection-filter-trigger"));
    fireEvent.click(screen.getByTestId("collection-popover-priority-p1"));
    fireEvent.click(screen.getByTestId("collection-popover-due-overdue"));

    const target = await screen.findByTestId("target");
    await waitFor(() => {
      expect(target).toHaveTextContent("priority=p1");
      expect(target).toHaveTextContent("due=overdue");
    });

    first.open();
  });

  it("returns to the committed state once the router settles", async () => {
    const router = createMemoryRouter(
      [
        {
          path: "/tasks",
          // A collection that REJECTS a value canonicalises it away. The
          // controls must follow the server, not their own last write.
          loader: ({ request }) => {
            const params = new URL(request.url).searchParams;
            params.delete("due");
            return params.toString();
          },
          Component: Collection,
        },
      ],
      { initialEntries: ["/tasks"] },
    );
    render(<RouterProvider router={router} />);

    fireEvent.click(await screen.findByTestId("collection-filter-trigger"));
    fireEvent.click(screen.getByTestId("collection-popover-due-overdue"));

    /*
     * Settled: the rejected dimension is gone from the chips and the badge,
     * rather than being re-asserted by a remembered write.
     *
     * V2.4-GATE-01 — waited for, as ONE settled state, rather than read
     * synchronously after a `findBy` that never waited for it. The trigger is
     * in the document from the first render, so `findByTestId` resolved
     * immediately and both assertions raced the router's settle: the chips
     * survive one extra render tick, and the run in which they did reported a
     * defect that is not there. The assertions themselves are unchanged, and
     * neither is weakened — a chip that genuinely stayed would still fail here,
     * on the same values, at the end of the timeout instead of before the
     * product had answered.
     */
    await waitFor(() => {
      expect(
        screen.getByTestId("collection-filter-trigger"),
      ).not.toHaveTextContent("1");
      expect(screen.queryByTestId("collection-filter-chips")).toBeNull();
    });
  });
});
