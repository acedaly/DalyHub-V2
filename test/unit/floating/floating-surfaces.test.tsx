import { fireEvent, render, screen, within } from "@testing-library/react";
import { useRef, useState } from "react";
import { afterEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { Menu, Picker, Popover } from "~/shared/floating";
import type { FloatingMenuOption, PickerOption } from "~/shared/floating";

/**
 * DHDS-09 — the shared floating surfaces, as BEHAVIOUR.
 *
 * These assertions are the product-wide contract for "what happens when I open
 * something". They are deliberately about what a user can observe — roles,
 * focus, what a key does, what is announced as current — rather than about
 * markup, because the whole point of the convergence is that four surfaces stop
 * having four answers to the same questions.
 *
 * The geometry is not here: it is pure arithmetic in
 * `test/unit/anchored/anchored-placement.test.ts` and measured in a real engine
 * by `e2e/floating-surfaces.spec.ts`. jsdom has no layout.
 */

/** Stub `matchMedia` so a surface sees a desktop (or a phone). */
function stubViewport(compact: boolean): MockInstance {
  return vi.spyOn(window, "matchMedia").mockImplementation(
    (query: string) =>
      ({
        media: query,
        matches: compact,
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

/* -------------------------------------------------------------------------- */
/* Menu                                                                       */
/* -------------------------------------------------------------------------- */

const COMMANDS: FloatingMenuOption[] = [
  { id: "duplicate", label: "Duplicate" },
  { id: "move", label: "Move to…" },
  { id: "archive", label: "Archive", separatorBefore: true },
  { id: "delete", label: "Delete", tone: "danger" },
];

function MenuHost({
  items = COMMANDS,
  value,
  onClosed,
}: {
  readonly items?: readonly FloatingMenuOption[];
  readonly value?: string | null;
  readonly onClosed?: (restoreFocus: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button type="button">before</button>
      <button type="button" ref={triggerRef} onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <Menu
          anchorRef={triggerRef}
          label="Row actions"
          items={items}
          {...(value === undefined ? {} : { value })}
          onClose={(restoreFocus) => {
            setOpen(false);
            if (restoreFocus) triggerRef.current?.focus();
            onClosed?.(restoreFocus);
          }}
        />
      ) : null}
    </>
  );
}

describe("Menu — the one menu", () => {
  it("is a WAI-ARIA menu whose first item takes focus", () => {
    stubViewport(false);
    render(<MenuHost />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const menu = screen.getByRole("menu", { name: "Row actions" });
    expect(within(menu).getAllByRole("menuitem")).toHaveLength(4);
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toHaveFocus();
  });

  it("roves with the arrow keys, wraps, and jumps with Home/End", () => {
    stubViewport(false);
    render(<MenuHost />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const menu = screen.getByRole("menu");

    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Move to…" })).toHaveFocus();

    fireEvent.keyDown(menu, { key: "End" });
    expect(screen.getByRole("menuitem", { name: "Delete" })).toHaveFocus();

    // Wrapping past the end returns to the first item, not to nothing.
    fireEvent.keyDown(menu, { key: "ArrowDown" });
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toHaveFocus();

    fireEvent.keyDown(menu, { key: "Home" });
    expect(screen.getByRole("menuitem", { name: "Duplicate" })).toHaveFocus();
  });

  it("walks OVER a disabled item rather than landing on it", () => {
    stubViewport(false);
    render(
      <MenuHost
        items={[
          { id: "a", label: "Alpha" },
          { id: "b", label: "Blocked", disabled: true },
          { id: "c", label: "Charlie" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.keyDown(screen.getByRole("menu"), { key: "ArrowDown" });

    // A row that cannot be chosen is not a destination — but it is still
    // VISIBLE and still explains itself, which is what a hidden item does not.
    expect(screen.getByRole("menuitem", { name: "Charlie" })).toHaveFocus();
    expect(screen.getByRole("menuitem", { name: "Blocked" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
  });

  it("searches by typing, and a repeated key CYCLES rather than sticking", () => {
    stubViewport(false);
    render(
      <MenuHost
        items={[
          { id: "personal", label: "Personal" },
          { id: "product", label: "Product" },
          { id: "work", label: "Work" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const menu = screen.getByRole("menu");

    fireEvent.keyDown(menu, { key: "p" });
    expect(screen.getByRole("menuitem", { name: "Product" })).toHaveFocus();
    fireEvent.keyDown(menu, { key: "p" });
    expect(screen.getByRole("menuitem", { name: "Personal" })).toHaveFocus();
  });

  it("closes on Escape and returns focus to the trigger", () => {
    stubViewport(false);
    const onClosed = vi.fn();
    render(<MenuHost onClosed={onClosed} />);
    const trigger = screen.getByRole("button", { name: "Open" });
    fireEvent.click(trigger);

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" });
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(onClosed).toHaveBeenCalledWith(true);
    expect(trigger).toHaveFocus();
  });

  it("leaves on Tab WITHOUT pulling focus back — the user is already going", () => {
    stubViewport(false);
    const onClosed = vi.fn();
    render(<MenuHost onClosed={onClosed} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    fireEvent.keyDown(screen.getByRole("menu"), { key: "Tab" });
    expect(onClosed).toHaveBeenCalledWith(false);
  });

  it("closes BEFORE running a command, so a dialog gets a live opener", () => {
    stubViewport(false);
    const order: string[] = [];
    render(
      <MenuHost
        items={[
          {
            id: "archive",
            label: "Archive",
            onSelect: () => order.push("handler"),
          },
        ]}
        onClosed={() => order.push("closed")}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive" }));

    expect(order).toEqual(["closed", "handler"]);
  });

  it("announces the current value with menuitemradio when it picks one", () => {
    stubViewport(false);
    render(
      <MenuHost
        value="p2"
        items={[
          { id: "p1", label: "Priority 1" },
          { id: "p2", label: "Priority 2" },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    expect(
      screen.getByRole("menuitemradio", { name: "Priority 2" }),
    ).toHaveAttribute("aria-checked", "true");
    // …and it opens ON that value rather than at the top of the list.
    expect(
      screen.getByRole("menuitemradio", { name: "Priority 2" }),
    ).toHaveFocus();
  });

  it("keeps a COMMAND inside a radio menu a plain menuitem", () => {
    stubViewport(false);
    render(
      <MenuHost
        value="p1"
        items={[
          { id: "p1", label: "Priority 1" },
          { id: "search", label: "Search all…", isCommand: true },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    // Announcing "not selected" for a row that can never be selected would be a
    // lie about the field's state.
    expect(
      screen.getByRole("menuitem", { name: "Search all…" }),
    ).not.toHaveAttribute("aria-checked");
  });

  it("draws a separator as a real sibling, never as a border on a wrapper", () => {
    stubViewport(false);
    render(<MenuHost />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const menu = screen.getByRole("menu");
    expect(within(menu).getAllByRole("separator")).toHaveLength(1);
    // `role="menu"` requires menu items, groups or separators as its children;
    // a `div` between them is an `aria-required-children` violation.
    for (const child of Array.from(menu.children)) {
      expect(
        ["menuitem", "menuitemradio", "separator"].includes(
          child.getAttribute("role") ?? "",
        ),
        `unexpected menu child: ${child.outerHTML.slice(0, 80)}`,
      ).toBe(true);
    }
  });

  it("becomes a SHEET on a phone, with the same roles and the same order", () => {
    stubViewport(true);
    render(<MenuHost />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const sheet = screen.getByRole("dialog", { name: "Row actions" });
    const menu = within(sheet).getByRole("menu", { name: "Row actions" });
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((item) => item.textContent),
    ).toEqual(["Duplicate", "Move to…", "Archive", "Delete"]);
  });
});

/* -------------------------------------------------------------------------- */
/* Picker                                                                     */
/* -------------------------------------------------------------------------- */

const PROJECTS: PickerOption[] = [
  { id: "p-personal", label: "Personal", group: "Recent" },
  { id: "p-dalyhub", label: "DalyHub", group: "Recent" },
  { id: "p-camper", label: "Camper upgrades", group: "All projects" },
  { id: "p-oppo", label: "OPPO redesign", group: "All projects" },
];

function PickerHost({
  options = PROJECTS,
  value = null,
  onSelect,
  onCreate,
  clear,
  loading,
}: {
  readonly options?: readonly PickerOption[];
  readonly value?: string | null;
  readonly onSelect?: (id: string) => void;
  readonly onCreate?: (name: string) => void;
  readonly clear?: { readonly label: string; readonly onSelect: () => void };
  readonly loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button type="button" ref={triggerRef} onClick={() => setOpen(true)}>
        Open
      </button>
      {open ? (
        <Picker
          anchorRef={triggerRef}
          label="Project"
          options={options}
          value={value}
          onSelect={(id) => onSelect?.(id)}
          onClose={(restoreFocus) => {
            setOpen(false);
            if (restoreFocus) triggerRef.current?.focus();
          }}
          {...(onCreate ? { onCreate } : {})}
          {...(clear ? { clear } : {})}
          {...(loading === undefined ? {} : { loading })}
        />
      ) : null}
    </>
  );
}

describe("DEBT-185 — a picker option's accessible NAME is its label alone", () => {
  /*
   * DHDS-09's own documentation states that the supporting line is "never part
   * of the accessible NAME (it is referenced separately)". It was: `Picker`
   * rendered the support as a DOM descendant of the `role="option"` element and
   * referenced it with `aria-describedby`, and `aria-describedby` does not
   * remove a descendant from the name computation. So an option read as
   * "Home & Property Area", announced the qualifier a second time as its
   * description, and was unmatchable by the words it visibly shows — which is
   * what a screen-reader user navigates a list of options by.
   *
   * Both assertions fail against the previous implementation.
   */
  const WITH_SUPPORT: PickerOption[] = [
    { id: "a-home", label: "Home & Property", support: "Area" },
    { id: "p-camper", label: "Camper upgrades", support: "Project" },
  ];

  it("names the option by its label, not label-plus-support", () => {
    stubViewport(false);
    render(<PickerHost options={WITH_SUPPORT} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    // Matchable by exactly the words it shows.
    expect(
      screen.getByRole("option", { name: "Home & Property" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("option", { name: "Camper upgrades" }),
    ).toBeInTheDocument();
    // And NOT by the name it used to have.
    expect(
      screen.queryByRole("option", { name: "Home & Property Area" }),
    ).toBeNull();
  });

  it("keeps the support as a DESCRIPTION, so nothing is lost", () => {
    // The qualifier is still announced — once, as what it is.
    stubViewport(false);
    render(<PickerHost options={WITH_SUPPORT} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const option = screen.getByRole("option", { name: "Home & Property" });
    const describedBy = option.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe("Area");
  });

  it("still honours an explicit ariaLabel where a caller supplies one", () => {
    stubViewport(false);
    render(
      <PickerHost
        options={[
          {
            id: "p1",
            label: "P1",
            support: "Priority",
            ariaLabel: "Priority 1",
          },
        ]}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    expect(
      screen.getByRole("option", { name: "Priority 1" }),
    ).toBeInTheDocument();
  });
});

describe("Picker — the one searchable picker", () => {
  it("is a combobox controlling a listbox, with the search field focused", () => {
    stubViewport(false);
    render(<PickerHost />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const search = screen.getByRole("combobox", { name: "Search project" });
    expect(search).toHaveFocus();
    expect(search).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByRole("listbox", { name: "Project" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(4);
  });

  it("filters as you type and keeps the groups the caller ordered", () => {
    stubViewport(false);
    render(<PickerHost />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const listbox = screen.getByRole("listbox");
    expect(within(listbox).getByText("Recent")).toBeInTheDocument();
    expect(within(listbox).getByText("All projects")).toBeInTheDocument();

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "camp" },
    });
    expect(
      screen.getAllByRole("option").map((option) => option.textContent),
    ).toEqual(["Camper upgrades"]);
  });

  it("says WHAT was searched for when nothing matches", () => {
    stubViewport(false);
    render(<PickerHost />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Training" },
    });

    expect(screen.getByText(/No project matches/)).toBeInTheDocument();
    expect(screen.getByText("“Training”")).toBeInTheDocument();
    // No create affordance, because this host cannot create.
    expect(screen.queryByText(/^Create/)).not.toBeInTheDocument();
  });

  it("offers to create only when creation is genuinely supported", () => {
    stubViewport(false);
    const onCreate = vi.fn();
    render(<PickerHost onCreate={onCreate} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Training" },
    });

    const create = screen.getByRole("option", { name: "Create “Training”" });
    fireEvent.click(create);
    expect(onCreate).toHaveBeenCalledWith("Training");
  });

  it("never offers to create something already in the list under that name", () => {
    stubViewport(false);
    render(<PickerHost onCreate={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "DalyHub" },
    });

    expect(
      screen.queryByRole("option", { name: /^Create/ }),
    ).not.toBeInTheDocument();
  });

  it("arrows past a group HEADING, which is not a destination", () => {
    stubViewport(false);
    render(<PickerHost />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));
    const search = screen.getByRole("combobox");

    // The cursor starts on the first row; a heading may never hold it.
    const activeLabel = () => {
      const id = search.getAttribute("aria-activedescendant");
      return id === null
        ? null
        : (document.getElementById(id)?.textContent ?? null);
    };
    expect(activeLabel()).toBe("Personal");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(activeLabel()).toBe("DalyHub");
    // The next row down is under "All projects" — the heading is skipped.
    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(activeLabel()).toBe("Camper upgrades");
  });

  it("commits the active option on Enter and closes", () => {
    stubViewport(false);
    const onSelect = vi.fn();
    render(<PickerHost onSelect={onSelect} />);
    const trigger = screen.getByRole("button", { name: "Open" });
    fireEvent.click(trigger);

    const search = screen.getByRole("combobox");
    fireEvent.keyDown(search, { key: "ArrowDown" });
    fireEvent.keyDown(search, { key: "Enter" });

    expect(onSelect).toHaveBeenCalledWith("p-dalyhub");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("marks the current value as selected", () => {
    stubViewport(false);
    render(<PickerHost value="p-oppo" />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    expect(
      screen.getByRole("option", { name: "OPPO redesign" }),
    ).toHaveAttribute("aria-selected", "true");
  });

  it("puts the clear command IN the list, where the arrow keys can reach it", () => {
    stubViewport(false);
    const onClear = vi.fn();
    render(
      <PickerHost
        value="p-oppo"
        clear={{ label: "Move to Inbox", onSelect: onClear }}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const clear = screen.getByRole("option", { name: "Move to Inbox" });
    expect(clear).toBeInTheDocument();
    fireEvent.click(clear);
    expect(onClear).toHaveBeenCalled();
  });

  it("opens IMMEDIATELY while options load, with placeholders holding the height", () => {
    stubViewport(false);
    render(<PickerHost options={[]} loading />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    // The shell is usable at once — the search field exists and has focus.
    expect(screen.getByRole("combobox")).toHaveFocus();
    // …and nothing announces a placeholder as a choosable option.
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("closes on Escape and returns focus to the trigger", () => {
    stubViewport(false);
    render(<PickerHost />);
    const trigger = screen.getByRole("button", { name: "Open" });
    fireEvent.click(trigger);

    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("becomes a SHEET on a phone, with the same options", () => {
    stubViewport(true);
    render(<PickerHost />);
    fireEvent.click(screen.getByRole("button", { name: "Open" }));

    const sheet = screen.getByRole("dialog", { name: "Choose project" });
    expect(within(sheet).getAllByRole("option")).toHaveLength(4);
    expect(within(sheet).getByRole("combobox")).toBeInTheDocument();
  });
});

/* -------------------------------------------------------------------------- */
/* Popover                                                                    */
/* -------------------------------------------------------------------------- */

function PopoverHost({ onClosed }: { readonly onClosed?: () => void }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  return (
    <>
      <button type="button" ref={triggerRef} onClick={() => setOpen(true)}>
        Tomorrow
      </button>
      {open ? (
        <Popover
          anchorRef={triggerRef}
          label="Edit due date"
          onClose={(restoreFocus) => {
            setOpen(false);
            if (restoreFocus) triggerRef.current?.focus();
            onClosed?.();
          }}
        >
          <button type="button">Today</button>
          <button type="button">Next week</button>
        </Popover>
      ) : null}
    </>
  );
}

describe("Popover — the one contextual surface that is not a list", () => {
  it("is a named dialog whose FIRST control takes focus", () => {
    stubViewport(false);
    render(<PopoverHost />);
    fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));

    expect(
      screen.getByRole("dialog", { name: "Edit due date" }),
    ).toBeInTheDocument();
    // The presets are the answer four times out of five, so the surface opens
    // on one rather than on the calendar behind them.
    expect(screen.getByRole("button", { name: "Today" })).toHaveFocus();
  });

  it("closes on Escape and returns focus to the trigger", () => {
    stubViewport(false);
    render(<PopoverHost />);
    const trigger = screen.getByRole("button", { name: "Tomorrow" });
    fireEvent.click(trigger);

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("is NOT a menu — its contents are controls, not choices", () => {
    stubViewport(false);
    render(<PopoverHost />);
    fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));

    // A menu, a listbox and a dialog are different things, and the whole point
    // of the taxonomy is that a surface declares which one it is.
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("becomes a SHEET on a phone", () => {
    stubViewport(true);
    render(<PopoverHost />);
    fireEvent.click(screen.getByRole("button", { name: "Tomorrow" }));

    const sheet = screen.getByRole("dialog", { name: "Edit due date" });
    expect(
      within(sheet).getByRole("button", { name: "Today" }),
    ).toBeInTheDocument();
  });
});
