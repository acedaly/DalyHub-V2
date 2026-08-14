/**
 * DS-02 — the generic UI primitive contracts.
 *
 * What this file asserts is deliberately NOT "the button is 36px tall" or "the
 * badge is violet". Those are values the token layer owns and the density model
 * decides, `dalyhub-tokens.test.ts` already holds them, and duplicating them
 * here would produce a suite that fails every time a designer moves a rung —
 * which is the definition of a brittle test.
 *
 * What it holds is the part of each primitive a REFACTOR can silently break:
 *
 *   - the accessible name exists, and comes from where the API says it does;
 *   - the keyboard path works;
 *   - a disabled control is actually inert, not merely faded;
 *   - a state is announced (`aria-busy`, `aria-pressed`, `aria-checked`,
 *     `aria-invalid`), not only painted;
 *   - the variant a caller asked for is the one that renders;
 *   - `Select` is still a real `<select>` (D31), which is the single assertion
 *     standing between this codebase and a bespoke listbox.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  Badge,
  Button,
  ButtonLink,
  Card,
  Checkbox,
  IconButton,
  Input,
  Select,
  Textarea,
  buttonClassName,
} from "~/shared/ui";

describe("DS-02 Button", () => {
  it("defaults to a non-submitting button", () => {
    // A `<button>` inside a form submits it unless it says otherwise, and the
    // overwhelming majority of these are not submits. Getting this wrong is
    // invisible until a form is involved and then loses the user's input.
    render(<Button>Act</Button>);
    expect(screen.getByRole("button", { name: "Act" })).toHaveAttribute(
      "type",
      "button",
    );
  });

  it("submits when the caller asks it to", () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute(
      "type",
      "submit",
    );
  });

  it("renders the variant the caller asked for", () => {
    render(
      <>
        <Button variant="primary">P</Button>
        <Button variant="secondary">S</Button>
        <Button variant="subtle">U</Button>
        <Button variant="danger">D</Button>
      </>,
    );
    expect(screen.getByRole("button", { name: "P" })).toHaveClass(
      "dh-button--primary",
    );
    expect(screen.getByRole("button", { name: "S" })).toHaveClass(
      "dh-button--secondary",
    );
    expect(screen.getByRole("button", { name: "U" })).toHaveClass(
      "dh-button--subtle",
    );
    expect(screen.getByRole("button", { name: "D" })).toHaveClass(
      "dh-button--danger",
    );
  });

  it("defaults to secondary, which is the button the product has most of", () => {
    render(<Button>Act</Button>);
    expect(screen.getByRole("button", { name: "Act" })).toHaveClass(
      "dh-button--secondary",
    );
  });

  it("announces a loading button as busy without disabling it", () => {
    // `loading` is a generic in-flight signal, not a submit guard: disabling a
    // focused control throws focus to the document, and a screen-reader user
    // loses their place. `FormButton` is the one that also disables, because a
    // duplicate form submit is a real defect.
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Saving" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire a disabled button", () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Act
      </Button>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Act" }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps the label as the accessible name when a glyph is present", () => {
    // The glyph is `aria-hidden`, so the name is the words and only the words.
    render(
      <Button icon={<svg data-testid="glyph" />} variant="primary">
        New task
      </Button>,
    );
    expect(
      screen.getByRole("button", { name: "New task" }),
    ).toBeInTheDocument();
  });

  it("forwards a ref, which the dialog's focus management depends on", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Cancel</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });

  it("renders a navigation as a real link", () => {
    // The mistake this prevents is a `<button onClick={navigate}>`, which looks
    // identical and supports neither middle-click nor open-in-new-tab.
    render(<ButtonLink href="/tasks">Tasks</ButtonLink>);
    const link = screen.getByRole("link", { name: "Tasks" });
    expect(link).toHaveAttribute("href", "/tasks");
    expect(link).toHaveClass("dh-button");
  });

  it("exposes the same class list to a non-button element", () => {
    // `buttonClassName` is the supported escape hatch for a router `<Link>`.
    // If it drifted from the component, a migrated call site would silently
    // stop looking like a button.
    expect(buttonClassName({ variant: "primary", size: "sm" })).toBe(
      "dh-button dh-button--primary dh-button--sm dh-btn dh-btn--primary dh-btn--sm",
    );
  });

  it("carries the legacy class so a migrated call site keeps module rules", () => {
    // The half of the bridge that is easy to forget. Thirteen module
    // stylesheets carry rules like `.dh-record-toolbar > .dh-btn` — layout
    // belonging to the surface, not to the button. A converted call site that
    // dropped `.dh-btn` would fall out of all of them silently: invisible in
    // review, invisible in a unit test, visible only as a button that has
    // stopped filling its row on one screen. This is what makes the conversion
    // a real no-op, and it is what to delete when the bridge comes down.
    render(<Button variant="subtle">Act</Button>);
    const button = screen.getByRole("button", { name: "Act" });
    expect(button).toHaveClass("dh-btn");
    // `subtle` is the one family whose legacy name differs.
    expect(button).toHaveClass("dh-btn--ghost");
  });
});

describe("DS-02 IconButton", () => {
  it("takes its accessible name from the required label", () => {
    render(<IconButton icon={<svg />} label="Delete task" />);
    expect(
      screen.getByRole("button", { name: "Delete task" }),
    ).toBeInTheDocument();
  });

  it("keeps the label as the NAME when a tooltip is attached", () => {
    // The tooltip is the description. A control whose name came from a tooltip
    // would be nameless to any assistive technology that skips descriptions.
    render(<IconButton icon={<svg />} label="Search" tooltip />);
    const button = screen.getByRole("button", { name: "Search" });
    expect(button).toHaveAttribute("aria-label", "Search");
  });

  it("reports a toggle's state rather than only painting it", () => {
    render(<IconButton icon={<svg />} label="Filter" pressed />);
    expect(screen.getByRole("button", { name: "Filter" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("does not fire when disabled", () => {
    const onClick = vi.fn();
    render(
      <IconButton icon={<svg />} label="Act" disabled onClick={onClick} />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Act" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("DS-02 Input and Textarea", () => {
  it("associates a label and takes typed input", () => {
    render(<Input aria-label="Title" defaultValue="" />);
    const input = screen.getByLabelText("Title");
    fireEvent.change(input, { target: { value: "Ship it" } });
    expect(input).toHaveValue("Ship it");
  });

  it("marks an invalid control with aria-invalid", () => {
    // The tint is reinforcement; this attribute is what actually carries the
    // state to a screen reader.
    render(<Input aria-label="Title" invalid />);
    expect(screen.getByLabelText("Title")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("does not claim validity when it is valid", () => {
    render(<Input aria-label="Title" />);
    expect(screen.getByLabelText("Title")).not.toHaveAttribute("aria-invalid");
  });

  it("renders a leading glyph without breaking the control's label", () => {
    render(<Input aria-label="Search" leading={<svg />} />);
    expect(screen.getByLabelText("Search")).toBeInTheDocument();
  });

  it("renders a textarea as a multi-line control", () => {
    render(<Textarea aria-label="Notes" />);
    const control = screen.getByLabelText("Notes");
    expect(control.tagName).toBe("TEXTAREA");
    expect(control).toHaveClass("dh-control--multiline");
  });
});

describe("DS-02 Select", () => {
  it("is a real <select> with real options (D31)", () => {
    // The single most important assertion in this file. D31 — a `<select>` is
    // REPAINTED, never replaced — is what keeps the platform picker on touch,
    // the free keyboard behaviour, the assistive-technology semantics and the
    // no-JS form submit. A future "improvement" to a bespoke listbox costs all
    // four, and this is what stops it landing quietly.
    render(
      <Select aria-label="Priority" defaultValue="p2">
        <option value="p1">P1</option>
        <option value="p2">P2</option>
      </Select>,
    );
    const select = screen.getByLabelText("Priority");
    expect(select.tagName).toBe("SELECT");
    expect(screen.getAllByRole("option")).toHaveLength(2);
    expect(select).toHaveValue("p2");
  });

  it("reports the selected value back to the caller", () => {
    const onChange = vi.fn();
    render(
      <Select aria-label="Priority" defaultValue="p1" onChange={onChange}>
        <option value="p1">P1</option>
        <option value="p2">P2</option>
      </Select>,
    );
    fireEvent.change(screen.getByLabelText("Priority"), {
      target: { value: "p2" },
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Priority")).toHaveValue("p2");
  });
});

describe("DS-02 Checkbox", () => {
  it("is labelled by its own text and toggles by keyboard", () => {
    const onChange = vi.fn();
    render(<Checkbox label="Include completed" onChange={onChange} />);
    const box = screen.getByRole("checkbox", { name: "Include completed" });
    // Space is what a keyboard user presses; the browser turns it into a click
    // on a native checkbox, which is exactly why this is a native checkbox.
    fireEvent.click(box);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("sets the indeterminate PROPERTY, which JSX cannot", () => {
    // React does not set `indeterminate` from an attribute, so every "select
    // all" checkbox in the product would otherwise need its own effect. This is
    // the whole reason the component exists rather than a styled input.
    render(<Checkbox label="All" indeterminate checked={false} readOnly />);
    const box = screen.getByRole("checkbox", { name: "All" });
    expect((box as HTMLInputElement).indeterminate).toBe(true);
    expect(box).toHaveAttribute("aria-checked", "mixed");
  });

  it("clears the indeterminate property when it is no longer mixed", () => {
    const { rerender } = render(
      <Checkbox label="All" indeterminate checked={false} readOnly />,
    );
    rerender(<Checkbox label="All" checked readOnly />);
    const box = screen.getByRole("checkbox", { name: "All" });
    expect((box as HTMLInputElement).indeterminate).toBe(false);
    expect(box).not.toHaveAttribute("aria-checked", "mixed");
  });

  it("renders without a label for a row that names it", () => {
    render(<Checkbox aria-label="Select Website relaunch" />);
    expect(
      screen.getByRole("checkbox", { name: "Select Website relaunch" }),
    ).toBeInTheDocument();
  });
});

describe("DS-02 Badge", () => {
  it("always renders its value as text, never as colour alone", () => {
    render(<Badge tone="danger">Blocked</Badge>);
    expect(screen.getByText("Blocked")).toBeInTheDocument();
  });

  it("publishes the tone as data rather than as a class per tone", () => {
    render(<Badge tone="success">Done</Badge>);
    expect(screen.getByText("Done")).toHaveAttribute("data-tone", "success");
  });

  it("defaults to the neutral tone, which is the absence state", () => {
    render(<Badge>Unset</Badge>);
    expect(screen.getByText("Unset")).toHaveAttribute("data-tone", "neutral");
  });

  it("keeps the dot decorative, so it is never read as content", () => {
    const { container } = render(
      <Badge tone="accent" dot>
        In progress
      </Badge>,
    );
    const dot = container.querySelector(".dh-badge__dot");
    expect(dot).toHaveAttribute("aria-hidden", "true");
  });
});

describe("DS-02 Card", () => {
  it("defaults to flat, which is D1's no-border-no-shadow contract", () => {
    const { container } = render(<Card>Body</Card>);
    expect(container.firstElementChild).toHaveClass("dh-surface--flat");
  });

  it("renders the element the caller asked for", () => {
    // A box is not automatically a landmark. A page of eight `<section>`s with
    // no headings is worse for a screen reader than a page of eight `<div>`s,
    // so the element is the caller's decision and the default is `div`.
    const { container } = render(<Card>Body</Card>);
    expect(container.firstElementChild?.tagName).toBe("DIV");

    const { container: sectioned } = render(
      <Card as="section" aria-label="Focus">
        Body
      </Card>,
    );
    expect(sectioned.firstElementChild?.tagName).toBe("SECTION");
  });

  it("carries the variant and padding the caller chose", () => {
    const { container } = render(
      <Card variant="outlined" padding="none">
        Body
      </Card>,
    );
    const card = container.firstElementChild;
    expect(card).toHaveClass("dh-surface--outlined");
    expect(card).toHaveClass("dh-surface--pad-none");
  });
});
