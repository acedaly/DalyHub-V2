/**
 * DS-02 — Shared Record Layout behaviour & accessibility.
 *
 * Proves the acceptance criteria: header regions render, optional regions can be
 * omitted, actions carry accessible names, the summary/content states behave,
 * long content stays wrappable, and the layout is entity-agnostic (the same
 * component renders a Project and a Person with no entity-specific assumptions).
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

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
          { id: "more", label: "⋯", ariaLabel: "More actions" },
        ]}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Mark complete" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Link" })).toBeInTheDocument();
    // The terse label is overridden by an explicit accessible name.
    expect(
      screen.getByRole("button", { name: "More actions" }),
    ).toBeInTheDocument();
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
      <RecordContent isLoading isEmpty error="Couldn't load — try again.">
        Body
      </RecordContent>,
    );
    const region = screen.getByRole("region", { name: "Content" });
    expect(region).toHaveAttribute("data-state", "error");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Couldn't load — try again.",
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

  it("renders the active tab's panel as the content region when tabs are given", () => {
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
