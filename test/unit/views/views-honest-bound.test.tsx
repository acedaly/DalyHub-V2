import { render, screen } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import { ViewsWorkspace } from "~/modules/views/ViewsWorkspace";
import type { ViewsPageData } from "~/modules/views/views-contract";

/**
 * RECALL-00-B (DEBT-223) — `/views` states its bound honestly.
 *
 * The 60-row page limit STAYS (the recorded decision on the roadmap item:
 * disclosure over pagination; a keyset cursor remains a later option), so the
 * surface must say what the page is. The old copy — a bare count plus
 * "(first page)" / "Showing the first page" — implied a second page nothing
 * could reach, and rendered only when a SCOPE read saturated, so a merged set
 * of 61–119 candidates was presented as complete.
 *
 * These are the sentence-level halves of the kernel proof in
 * `test/kernel/cross-module-view-query.test.ts` (which pins the flags, the
 * statement budget and the bind cap): the flags must actually reach the owner
 * as the Analytics-style "of the N read" honesty. Falsification: restore the
 * old copy, or gate the sentence back onto scope saturation alone, and these
 * fail.
 */

function data(overrides: Partial<ViewsPageData>): ViewsPageData {
  return {
    title: "Views",
    groups: [],
    total: 0,
    bounded: false,
    readCount: 0,
    saturatedScopes: [],
    unavailable: [],
    scopeOptions: [
      {
        scope: "note",
        label: "Notes",
        selected: true,
        query: "scopes=note",
        hidden: false,
      },
      {
        scope: "meeting",
        label: "Meetings",
        selected: true,
        query: "scopes=meeting",
        hidden: false,
      },
    ],
    views: [],
    activeViewId: null,
    modified: false,
    filterCount: 0,
    currentQuery: "",
    shareUrl: "https://app.test/views",
    changeBoundary: null,
    awaitingFirstReview: false,
    ...overrides,
  };
}

function renderViews(pageData: ViewsPageData) {
  // A data-router stub: the saved-view switcher inside the workspace calls
  // `useRevalidator`, which a plain MemoryRouter cannot provide.
  const Stub = createRoutesStub([
    { path: "/views", Component: () => <ViewsWorkspace data={pageData} /> },
  ]);
  return render(<Stub initialEntries={["/views"]} />);
}

describe("RECALL-00-B — the /views bound is stated, never implied", () => {
  it("says 'first N of the M records read' when the merged answer was cut to the page", () => {
    renderViews(data({ total: 60, bounded: true, readCount: 74 }));
    // The bound is IN the headline sentence (Analytics' rule), not only in a
    // note a reader may never reach.
    expect(
      screen.getByText(/first 60 of the 74 records read · Notes \+ Meetings/),
    ).toBeInTheDocument();
    // And the notice states the same truth with the next action.
    expect(
      screen.getByText(
        /shows the first 60 of the 74 records read\. Narrow the view/,
      ),
    ).toBeInTheDocument();
    // The dishonest copy is gone: there is no "first page" to reach.
    expect(screen.queryByText(/first page/i)).not.toBeInTheDocument();
  });

  it("names each scope whose candidate READ was itself bounded", () => {
    renderViews(
      data({
        total: 60,
        bounded: true,
        readCount: 120,
        saturatedScopes: ["note"],
      }),
    );
    expect(
      screen.getByText(/Only the first 120 notes were read/),
    ).toBeInTheDocument();
    // The other scope did not saturate, so it is not accused.
    expect(
      screen.queryByText(/Only the first 120 meetings/),
    ).not.toBeInTheDocument();
  });

  it("discloses a bounded read even when the page itself was not cut", () => {
    // A scope saturated at 120 candidates and a later filter kept only 12:
    // "12 records" alone would read as complete, and it is not.
    renderViews(
      data({
        total: 12,
        bounded: true,
        readCount: 12,
        saturatedScopes: ["meeting"],
        groups: [],
      }),
    );
    expect(screen.getByText(/12 records \(bounded read\)/)).toBeInTheDocument();
    expect(
      screen.getByText(/Only the first 120 meetings were read/),
    ).toBeInTheDocument();
  });

  it("keeps the plain complete-answer sentence when nothing was bounded", () => {
    renderViews(data({ total: 12, bounded: false, readCount: 12 }));
    expect(
      screen.getByText(/12 records · Notes \+ Meetings/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/bounded read/)).not.toBeInTheDocument();
    expect(screen.queryByText(/records read/)).not.toBeInTheDocument();
  });
});
