/**
 * DS-02 — Shared Record Layout behaviour & accessibility.
 *
 * Proves the acceptance criteria: header regions render, optional regions can be
 * omitted, actions carry accessible names, the summary/content states behave,
 * long content stays wrappable, and the layout is entity-agnostic (the same
 * component renders a Project and a Person with no entity-specific assumptions).
 */

import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { RecordContent, RecordLayout } from "~/shared/record-layout";
import type { RecordTab } from "~/shared/record-layout";

describe("RecordLayout — header regions", () => {
  it("renders every header region when provided", () => {
    render(
      <RecordLayout
        typeLabel="Project"
        icon={<svg data-testid="glyph" />}
        title="Website relaunch"
        status={{ label: "In progress", tone: "accent" }}
        breadcrumb={[
          { id: "area", label: "Career", href: "/areas/career" },
          { id: "self", label: "Website relaunch" },
        ]}
        metadata={[{ id: "owner", label: "Owner", value: "Aidan" }]}
        primaryAction={{ id: "done", label: "Mark complete" }}
        secondaryActions={[{ id: "link", label: "Link" }]}
      />,
    );

    // Title is the record heading (level 1 by default).
    expect(
      screen.getByRole("heading", { level: 1, name: "Website relaunch" }),
    ).toBeInTheDocument();
    // Type label, status, breadcrumb, metadata.
    expect(screen.getByText("Project")).toBeInTheDocument();
    expect(screen.getByText("In progress")).toBeInTheDocument();
    const breadcrumb = screen.getByRole("navigation", { name: "Breadcrumb" });
    expect(
      within(breadcrumb).getByRole("link", { name: "Career" }),
    ).toHaveAttribute("href", "/areas/career");
    // Last crumb is aria-current and not a link.
    expect(within(breadcrumb).getByText("Website relaunch")).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByText("Owner")).toBeInTheDocument();
  });

  it("omits optional regions cleanly", () => {
    render(<RecordLayout title="Untitled" />);
    expect(
      screen.getByRole("heading", { level: 1, name: "Untitled" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("navigation", { name: "Breadcrumb" })).toBeNull();
    // No status, metadata list or action buttons when not provided.
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("supports a configurable heading level for a correct outline", () => {
    render(<RecordLayout title="Nested record" headingLevel={2} />);
    expect(
      screen.getByRole("heading", { level: 2, name: "Nested record" }),
    ).toBeInTheDocument();
  });

  it("labels the layout landmark by its heading", () => {
    render(<RecordLayout title="Labelled" />);
    const article = screen.getByRole("article");
    const heading = screen.getByRole("heading", { name: "Labelled" });
    expect(article).toHaveAttribute("aria-labelledby", heading.id);
    expect(heading.id).toBeTruthy();
  });
});

describe("RecordLayout — actions have accessible names", () => {
  it("gives every action an accessible name (label or ariaLabel)", () => {
    render(
      <RecordLayout
        title="Record"
        primaryAction={{ id: "done", label: "Mark complete" }}
        secondaryActions={[
          { id: "link", label: "Link" },
          { id: "tag", label: "⋯", ariaLabel: "Edit tags" },
        ]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Mark complete" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link" })).toBeInTheDocument();

    /*
     * M3-INT — the SECOND secondary action is folded into the shared overflow
     * (see `MAX_VISIBLE_SECONDARY_ACTIONS` in `RecordHeader`). It keeps its
     * accessible name there, which is the thing this test is about: a terse
     * visible label is still overridden by an explicit `ariaLabel`, wherever
     * the action ends up.
     */
    fireEvent.click(screen.getByRole("button", { name: /More actions/ }));
    expect(
      screen.getByRole("menuitem", { name: "Edit tags" }),
    ).toBeInTheDocument();
  });

  /*
   * M3-INT — the record header is identity first. A module declares its actions
   * in priority order and the shared header decides how many compete with the
   * title: one primary, one secondary, and the rest in the menu that already
   * holds every record's lifecycle actions. Nothing is dropped.
   */
  it("shows one secondary action and folds the rest into the overflow", () => {
    const onArchive = vi.fn();
    render(
      <RecordLayout
        title="Record"
        primaryAction={{ id: "done", label: "Mark complete" }}
        secondaryActions={[
          { id: "edit", label: "Edit details" },
          { id: "rename", label: "Rename" },
          { id: "export", label: "Export" },
        ]}
        overflowActions={[
          { id: "archive", label: "Archive", onSelect: onArchive },
        ]}
      />,
    );

    expect(
      screen.getByRole("button", { name: "Edit details" }),
    ).toBeInTheDocument();
    for (const demoted of ["Rename", "Export"]) {
      expect(
        screen.queryByRole("button", { name: demoted }),
      ).not.toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: /More actions/ }));
    // Demoted actions come first, then the lifecycle group they were separated
    // from — declaration order preserved within each.
    const items = screen
      .getAllByRole("menuitem")
      .map((item) => item.textContent);
    expect(items).toEqual(["Rename", "Export", "Archive"]);

    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));
    expect(onArchive).toHaveBeenCalled();
  });

  it("renders an action with an href as a link", () => {
    render(
      <RecordLayout
        title="Record"
        primaryAction={{ id: "open", label: "Open", href: "/x" }}
      />,
    );
    expect(screen.getByRole("link", { name: "Open" })).toHaveAttribute(
      "href",
      "/x",
    );
  });

  it("marks a disabled action disabled", () => {
    render(
      <RecordLayout
        title="Record"
        primaryAction={{ id: "done", label: "Done", disabled: true }}
      />,
    );
    expect(screen.getByRole("button", { name: "Done" })).toBeDisabled();
  });
});

describe("RecordLayout — summary", () => {
  it("shows description and metadata when provided", () => {
    render(
      <RecordLayout
        title="Record"
        summary={{
          description: "A short summary.",
          metadata: [{ id: "area", label: "Area", value: "Career" }],
        }}
      />,
    );
    const summary = screen.getByRole("region", { name: "Summary" });
    expect(within(summary).getByText("A short summary.")).toBeInTheDocument();
    expect(within(summary).getByText("Area")).toBeInTheDocument();
    expect(within(summary).getByText("Career")).toBeInTheDocument();
  });

  it("shows a clear empty state when the summary is requested but empty", () => {
    render(<RecordLayout title="Record" summary={{}} />);
    const summary = screen.getByRole("region", { name: "Summary" });
    expect(within(summary).getByText("No summary yet.")).toBeInTheDocument();
  });

  it("omits the summary region entirely when not requested", () => {
    render(<RecordLayout title="Record" />);
    expect(screen.queryByRole("region", { name: "Summary" })).toBeNull();
  });
});

describe("RecordLayout — long content", () => {
  const LONG =
    "supercalifragilisticexpialidocious-antidisestablishmentarianism-pneumonoultramicroscopicsilicovolcanoconiosis";

  it("renders long titles/descriptions with wrapping enabled", () => {
    render(<RecordLayout title={LONG} summary={{ description: LONG }} />);
    const heading = screen.getByRole("heading", { name: LONG });
    expect(heading).toHaveClass("record-title");
    // The wrapping guarantees are CSS (overflow-wrap: anywhere); assert the
    // structural hooks that carry them are present and the content rendered.
    const summary = screen.getByRole("region", { name: "Summary" });
    expect(
      within(summary)
        .getByText(LONG)
        .classList.contains("record-summary__description"),
    ).toBe(true);
  });
});

describe("RecordContent — state slots", () => {
  it("renders children when ready", () => {
    render(<RecordContent>Body</RecordContent>);
    const region = screen.getByRole("region", { name: "Content" });
    expect(region).toHaveAttribute("data-state", "ready");
    expect(within(region).getByText("Body")).toBeInTheDocument();
  });

  it("renders a busy loading region", () => {
    render(<RecordContent isLoading label="Overview" />);
    const region = screen.getByRole("region", { name: "Overview" });
    expect(region).toHaveAttribute("data-state", "loading");
    expect(region).toHaveAttribute("aria-busy", "true");
  });

  it("renders an empty slot", () => {
    render(<RecordContent isEmpty />);
    const region = screen.getByRole("region", { name: "Content" });
    expect(region).toHaveAttribute("data-state", "empty");
    expect(within(region).getByText("Nothing here yet.")).toBeInTheDocument();
  });

  it("announces an error via role=alert with precedence over other states", () => {
    render(
      <RecordContent isLoading isEmpty error="Couldn’t load — try again.">
        Body
      </RecordContent>,
    );
    const region = screen.getByRole("region", { name: "Content" });
    expect(region).toHaveAttribute("data-state", "error");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn’t load — try again.",
    );
    expect(screen.queryByText("Body")).toBeNull();
  });
});

describe("RecordLayout — entity-agnostic", () => {
  const tabs: RecordTab[] = [
    { id: "overview", label: "Overview", content: <p>Overview body</p> },
    { id: "activity", label: "Activity", content: <p>Activity body</p> },
  ];

  it("renders a Project and a Person with the same component and no entity coupling", () => {
    const { unmount } = render(
      <RecordLayout typeLabel="Project" title="Website relaunch" tabs={tabs} />,
    );
    expect(
      screen.getByRole("heading", { name: "Website relaunch" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    unmount();

    render(
      <RecordLayout
        typeLabel="Person"
        title="Dana Example"
        summary={{ description: "A person you know." }}
      >
        <RecordContent>Person body</RecordContent>
      </RecordLayout>,
    );
    expect(
      screen.getByRole("heading", { name: "Dana Example" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Person body")).toBeInTheDocument();
  });

  it("renders the active tab’s panel as the content region when tabs are given", () => {
    render(<RecordLayout title="Record" tabs={tabs} />);
    expect(screen.getByText("Overview body")).toBeVisible();
    // Inactive panel content is hidden.
    const activityPanel = screen
      .getAllByRole("tabpanel", { hidden: true })
      .find((panel) =>
        panel.getAttribute("aria-labelledby")?.includes("activity"),
      );
    expect(activityPanel).toHaveAttribute("hidden");
  });
});

/**
 * DS-12 — the Record Header's overflow (⋯) slot.
 *
 * The Design System documented this slot from DS-02 onwards but nothing rendered
 * it, so every module invented its own home for secondary and destructive
 * actions. These assert the structural contract: the overflow is the SAME shared
 * menu the Card uses, it always sits last in the action row, and it disappears
 * entirely rather than rendering an empty affordance.
 */
describe("RecordLayout — overflow menu (DS-12)", () => {
  it("renders the overflow last, after the primary action", () => {
    render(
      <RecordLayout
        title="Website relaunch"
        primaryAction={{ id: "done", label: "Complete project" }}
        secondaryActions={[{ id: "rename", label: "Rename" }]}
        overflowActions={[{ id: "archive", label: "Archive Project" }]}
      />,
    );
    const trigger = screen.getByRole("button", {
      name: "More actions for Website relaunch",
    });
    const buttons = Array.from(
      document.querySelectorAll(".record-header__actions button"),
    );
    expect(buttons[buttons.length - 1]).toBe(trigger);
  });

  it("names the trigger for its record, so several menus on a page stay distinguishable", () => {
    render(
      <RecordLayout
        title="Career"
        overflowActions={[{ id: "a", label: "Archive Area" }]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "More actions for Career" }),
    ).toBeInTheDocument();
  });

  it("renders no overflow affordance at all when there are no items", () => {
    render(<RecordLayout title="Career" overflowActions={[]} />);
    expect(
      screen.queryByRole("button", { name: /More actions/ }),
    ).not.toBeInTheDocument();
  });
});
