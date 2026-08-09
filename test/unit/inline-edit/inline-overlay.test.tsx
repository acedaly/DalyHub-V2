/**
 * EDIT-03 — the inline editors' option lists must be REACHABLE, not merely present.
 *
 * The bug these guard is the one an owner reported against the redesigned Tasks
 * list: opening Priority, Project or Due date showed the value already stored
 * and none of the alternatives. Nothing was missing from the DOM — the menu was
 * rendered inside a task row, and a task row clips its own overflow (its swipe
 * tray slides underneath it) and pins its Project column to a fixed 12rem track.
 * A `position: absolute` menu inside that is cut to the row: 45px of a 305px
 * menu, and what survived was wrapped one word per line.
 *
 * So the assertions below are deliberately about PLACEMENT and REACHABILITY
 * rather than about appearance, because "the option exists in the markup" was
 * true throughout the defect:
 *
 *   - the surface escapes an `overflow: hidden` ancestor entirely;
 *   - an option can still be CHOSEN once the surface is somewhere else in the
 *     document (the dismissal rule has to know the trigger is "inside");
 *   - every valid option is offered, and one value replaces another directly;
 *   - the phone presentation offers the same vocabulary in the shared sheet.
 *
 * jsdom has no layout, so the pixel geometry is tested where it lives — as pure
 * arithmetic in `test/unit/anchored/anchored-placement.test.ts` — and the real
 * clipping is measured in a browser by `e2e/inline-editor-overlay.spec.ts`.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { InlineDateField, InlineSelectField } from "~/shared/inline-edit";

const PRIORITIES = [
  { value: "p1", label: "P1 · Urgent" },
  { value: "p2", label: "P2 · High" },
  { value: "p3", label: "P3 · Normal" },
  { value: "p4", label: "P4 · Low" },
];

/**
 * The task row, as far as this defect is concerned: a box that clips whatever
 * its children try to paint outside it.
 */
function ClippingRow({ children }: { readonly children: React.ReactNode }) {
  return (
    <div data-testid="row" style={{ overflow: "hidden", height: "45px" }}>
      {children}
    </div>
  );
}

/** Stub `matchMedia` so the fields see a phone (or a desktop). */
function stubViewport(compact: boolean): MockInstance {
  return vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        matches: compact,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }) as unknown as MediaQueryList,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("InlineSelectField — the menu escapes the row that clips it", () => {
  it("renders the menu OUTSIDE the clipping ancestor", () => {
    render(
      <ClippingRow>
        <InlineSelectField
          label="Priority"
          value="p2"
          options={PRIORITIES}
          clearable
          onSave={async () => ({ ok: true })}
        />
      </ClippingRow>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Priority: P2 · High" }),
    );

    const menu = screen.getByRole("menu");
    const row = screen.getByTestId("row");
    // The whole point: a descendant of the row is a descendant of the row's
    // clip. This is the assertion that fails against the old implementation.
    expect(row.contains(menu)).toBe(false);
    expect(menu.closest(".dh-anchored")).not.toBeNull();
  });

  it("offers EVERY valid option, not just the one already chosen", () => {
    render(
      <ClippingRow>
        <InlineSelectField
          label="Priority"
          value="p2"
          options={PRIORITIES}
          emptyLabel="No priority"
          clearable
          clearLabel="Clear priority"
          onSave={async () => ({ ok: true })}
        />
      </ClippingRow>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Priority: P2 · High" }),
    );

    expect(
      screen.getAllByRole("menuitemradio").map((item) => item.textContent),
    ).toEqual([
      "P1 · Urgent",
      "P2 · High",
      "P3 · Normal",
      "P4 · Low",
      "Clear priority",
    ]);
    expect(
      screen.getByRole("menuitemradio", { name: "P2 · High" }),
    ).toHaveAttribute("aria-checked", "true");
  });

  it("still SAVES the option that is clicked", async () => {
    /*
     * The regression this exists for is subtle and total. A host that dismisses
     * on "pointer-down outside my container" is correct while the menu is a
     * child of that container and catastrophically wrong once it is portalled:
     * the press on an option counted as outside, the menu unmounted, and the
     * click that would have chosen it never landed. The field became a control
     * that could be opened and never used.
     */
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <ClippingRow>
        <InlineSelectField
          label="Priority"
          value="p2"
          options={PRIORITIES}
          onSave={onSave}
        />
      </ClippingRow>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Priority: P2 · High" }),
    );

    const option = screen.getByRole("menuitemradio", { name: "P4 · Low" });
    fireEvent.pointerDown(option);
    fireEvent.click(option);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("p4"));
  });

  it("dismisses on a press that is genuinely elsewhere", async () => {
    render(
      <>
        <InlineSelectField
          label="Priority"
          value="p2"
          options={PRIORITIES}
          onSave={async () => ({ ok: true })}
        />
        <button type="button">Somewhere else</button>
      </>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Priority: P2 · High" }),
    );
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.pointerDown(
      screen.getByRole("button", { name: "Somewhere else" }),
    );
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
  });

  it("closes when the trigger itself is pressed again", async () => {
    render(
      <InlineSelectField
        label="Priority"
        value="p2"
        options={PRIORITIES}
        onSave={async () => ({ ok: true })}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Priority: P2 · High" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu")).toBeInTheDocument();
    // The press lands on the anchor, which the overlay layer correctly treats
    // as "inside" — so the toggle is what has to close it.
    fireEvent.pointerDown(trigger);
    fireEvent.click(trigger);
    await waitFor(() =>
      expect(screen.queryByRole("menu")).not.toBeInTheDocument(),
    );
  });

  it("jumps to an option by typing its first letters", () => {
    // The Project chooser is handed up to fifty candidates. Typeahead is how a
    // keyboard reaches the far end of that list without fifty ArrowDowns.
    render(
      <InlineSelectField
        label="Project or Area"
        value=""
        options={[
          { value: "a", label: "Activity showcase" },
          { value: "b", label: "Conference talk" },
          { value: "c", label: "Kitchen fit-out" },
        ]}
        emptyLabel="Unassigned"
        onSave={async () => ({ ok: true })}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Project or Area: Unassigned" }),
    );
    fireEvent.keyDown(screen.getByRole("menu"), { key: "k" });
    expect(
      screen.getByRole("menuitemradio", { name: "Kitchen fit-out" }),
    ).toHaveFocus();
  });
});

describe("InlineSelectField — the phone presentation", () => {
  it("offers the same vocabulary as a sheet below the md breakpoint", async () => {
    stubViewport(true);
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineSelectField
        label="Priority"
        value="p2"
        options={PRIORITIES}
        clearable
        clearLabel="Clear priority"
        onSave={onSave}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Priority: P2 · High" }),
    );

    const sheet = await screen.findByRole("dialog", { name: "Priority" });
    // A menu of 28px rows anchored to a 28px trigger is a desktop idea; the
    // phone gets the shared sheet's large labelled rows instead.
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    for (const option of PRIORITIES) {
      expect(
        within(sheet).getByRole("button", { name: new RegExp(option.label) }),
      ).toBeInTheDocument();
    }
    expect(
      within(sheet).getByRole("button", { name: "Clear priority" }),
    ).toBeInTheDocument();

    fireEvent.click(within(sheet).getByRole("button", { name: /P4 · Low/ }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("p4"));
  });
});

describe("InlineDateField — the full date-selection interface", () => {
  it("escapes the clipping row and offers the product's one-press dates", async () => {
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <ClippingRow>
        <InlineDateField
          label="Due date"
          value="2026-08-09"
          shortcuts={[
            { label: "Today", value: "2026-08-09" },
            { label: "Tomorrow", value: "2026-08-10" },
            { label: "Next week", value: "2026-08-16" },
          ]}
          onSave={onSave}
        />
      </ClippingRow>,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Due date: 2026-08-09" }),
    );

    const dialog = screen.getByRole("dialog", { name: "Edit due date" });
    expect(screen.getByTestId("row").contains(dialog)).toBe(false);

    // The whole supported interface: shortcuts, the picker, and Clear.
    expect(
      screen.getByRole("button", { name: "Tomorrow" }),
    ).toBeInTheDocument();
    expect(dialog.querySelector('input[type="date"]')).not.toBeNull();
    expect(screen.getByRole("button", { name: "Clear" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));
    await waitFor(() => expect(onSave).toHaveBeenCalledWith("2026-08-10"));
  });

  it("marks the shortcut that matches the stored date", () => {
    render(
      <InlineDateField
        label="Due date"
        value="2026-08-09"
        shortcuts={[
          { label: "Today", value: "2026-08-09" },
          { label: "Tomorrow", value: "2026-08-10" },
        ]}
        onSave={async () => ({ ok: true })}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Due date: 2026-08-09" }),
    );
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Tomorrow" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("shows no shortcuts at all when the caller cannot name the owner's day", () => {
    // The owner's calendar day is a server fact (ADR-022). A field that has not
    // been given one offers the input and the commands, never a "Today" guessed
    // from the browser clock.
    render(
      <InlineDateField
        label="Target date"
        value={null}
        onSave={async () => ({ ok: true })}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Target date: Add a date" }),
    );
    expect(
      screen.queryByRole("button", { name: "Today" }),
    ).not.toBeInTheDocument();
  });

  it("presents the same editor as a sheet on a phone", async () => {
    stubViewport(true);
    const onSave = vi.fn(async () => ({ ok: true }) as const);
    render(
      <InlineDateField
        label="Due date"
        value="2026-08-09"
        shortcuts={[{ label: "Tomorrow", value: "2026-08-10" }]}
        onSave={onSave}
      />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Due date: 2026-08-09" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Edit due date" });
    expect(
      within(sheet).getByRole("button", { name: "Tomorrow" }),
    ).toBeInTheDocument();
    expect(sheet.querySelector('input[type="date"]')).not.toBeNull();
    expect(
      within(sheet).getByRole("button", { name: "Clear" }),
    ).toBeInTheDocument();
  });
});
