/**
 * DS-06 / V2.6 FIND-02 — the tags control, tested through what an owner does.
 *
 * The control's INTERACTION changed with FIND-02: it is now an adapter over the
 * shared DHDS-09 `Picker` rather than a bespoke chip input, because the tag
 * vocabulary it needed to pick from now exists (DEBT-182's own desired state).
 * These assertions are deliberately re-expressed rather than loosened — every
 * guarantee the old file held is still held here, through the new interaction:
 *
 *   - a tag can be ADDED, and appears as a chip;
 *   - a tag can be REMOVED, by a real keyboard-reachable button;
 *   - a DUPLICATE is refused, case-insensitively — and now unconditionally so,
 *     because a tag has one canonical identity;
 *   - blur validation sees the COMMITTED collection, so adding the first tag
 *     cannot leave a false "required" error behind.
 *
 * And two the old control could not offer at all: the workspace's existing words
 * are OFFERED, and a word that is not there yet can be CREATED from the same
 * surface.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Form, TagsField, required, useForm } from "~/shared/forms";

const VOCABULARY = [
  { key: "design", label: "Design" },
  { key: "errand", label: "Errand" },
  { key: "reading", label: "reading" },
];

function Harness({
  initial = [] as string[],
  vocabulary = VOCABULARY,
}: {
  readonly initial?: string[];
  readonly vocabulary?: readonly { key: string; label: string }[];
}) {
  const [tags, setTags] = useState<readonly string[]>(initial);
  return (
    <TagsField
      label="Tags"
      value={tags}
      onChange={setTags}
      vocabulary={vocabulary}
    />
  );
}

/** Open the field's picker the way an owner does. */
function openPicker(name = "Add a tag…") {
  fireEvent.click(screen.getByRole("button", { name }));
  return screen.getByRole("combobox", { name: "Search tags" });
}

/**
 * The tags the FIELD carries, read from its chips.
 *
 * Read from the chips rather than from `getByText`, because a multi-select
 * picker stays open after a choice (DHDS-09 §32) — so the same word is
 * legitimately on screen twice, once as a chosen chip and once as the row that
 * chose it, and a text query cannot tell the two apart.
 */
function chips(): string[] {
  return [...document.querySelectorAll(".dh-tags__chip-text")].map(
    (node) => node.textContent ?? "",
  );
}

describe("TagsField", () => {
  it("declares a DIALOG rather than a menu, and says when it is open", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Add a tag…" });
    // DHDS-09: a picker is a `role="dialog"` containing a combobox and a
    // listbox. The trigger has to say so before anyone presses it.
    expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("offers the workspace's existing tags, and adds the chosen one as a chip", () => {
    render(<Harness />);
    openPicker();
    fireEvent.click(screen.getByRole("option", { name: "Errand" }));
    expect(chips()).toEqual(["Errand"]);
    expect(
      screen.getByRole("button", { name: "Remove Errand" }),
    ).toBeInTheDocument();
  });

  it("keeps the vocabulary's spelling, not the one the owner searched with", () => {
    render(<Harness />);
    const input = openPicker();
    fireEvent.change(input, { target: { value: "err" } });
    fireEvent.click(screen.getByRole("option", { name: "Errand" }));
    // The label belongs to the workspace vocabulary — `Errand`, as it was first
    // typed — never to whatever the search box happened to contain.
    expect(chips()).toEqual(["Errand"]);
  });

  it("creates a tag the workspace does not have yet", () => {
    render(<Harness />);
    const input = openPicker();
    fireEvent.change(input, { target: { value: "Deep Work" } });
    fireEvent.click(screen.getByRole("option", { name: /Create/ }));
    expect(chips()).toEqual(["Deep Work"]);
  });

  it("removes a tag via its remove button", () => {
    render(<Harness initial={["keep", "drop"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove drop" }));
    expect(screen.queryByText("drop")).not.toBeInTheDocument();
    expect(screen.getByText("keep")).toBeInTheDocument();
  });

  it("un-chooses a chosen tag from the picker, so the surface toggles", () => {
    render(<Harness initial={["Errand"]} />);
    openPicker();
    const option = screen.getByRole("option", { name: "Errand" });
    expect(option).toHaveAttribute("aria-selected", "true");
    fireEvent.click(option);
    expect(chips()).toEqual([]);
  });

  it("does not add a duplicate, whatever its case", () => {
    // FIND-02 — canonical comparison is UNCONDITIONAL here, whatever the
    // caller's constraints say: `Errand` and `errand` are one tag, so a field
    // that let both onto one record would offer a state storage collapses.
    render(<Harness initial={["Errand"]} />);
    const input = openPicker();
    fireEvent.change(input, { target: { value: "ERRAND" } });
    // The create command is not even offered for a word already chosen…
    expect(screen.queryByRole("option", { name: /Create/ })).toBeNull();
    fireEvent.click(screen.getByRole("option", { name: "Errand" }));
    // …and choosing the existing one toggles it OFF rather than duplicating it.
    expect(chips()).toEqual([]);
  });

  it("keeps working when the workspace has no tags yet", () => {
    // An empty vocabulary is a legitimate state, not a failure: everything to
    // create, nothing to pick.
    render(<Harness vocabulary={[]} />);
    const input = openPicker();
    fireEvent.change(input, { target: { value: "first" } });
    fireEvent.click(screen.getByRole("option", { name: /Create/ }));
    expect(chips()).toEqual(["first"]);
  });

  it("stops offering to add once the limit is reached, and says so", () => {
    function Limited() {
      const [tags, setTags] = useState<readonly string[]>(["a", "b"]);
      return (
        <TagsField
          label="Tags"
          value={tags}
          onChange={setTags}
          vocabulary={VOCABULARY}
          constraints={{ maxTags: 2 }}
        />
      );
    }
    render(<Limited />);
    const trigger = screen.getByRole("button", { name: "Limit reached" });
    expect(trigger).toBeDisabled();
  });
});

describe("TagsField committed-value blur validation (P2)", () => {
  function FormHarness() {
    const form = useForm<{ tags: readonly string[] }>({
      initialValues: { tags: [] },
      fields: { tags: { validate: required("Add at least one tag.") } },
      onSubmit: async () => ({ status: "success" }),
    });
    return (
      <Form onSubmit={form.handleSubmit}>
        <TagsField
          label="Tags"
          required
          vocabulary={VOCABULARY}
          {...form.field("tags")}
        />
      </Form>
    );
  }

  it("choosing the first tag does not leave a false required error", () => {
    // The original defect: validation ran against the collection as it was
    // BEFORE the add. It is still validated against the exact committed value.
    render(<FormHarness />);
    openPicker();
    fireEvent.click(screen.getByRole("option", { name: "Design" }));
    expect(chips()).toEqual(["Design"]);
    expect(screen.queryByText("Add at least one tag.")).not.toBeInTheDocument();
  });

  it("removing the last tag flags the required empty collection", () => {
    render(<FormHarness />);
    openPicker();
    fireEvent.click(screen.getByRole("option", { name: "Design" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove Design" }));
    expect(screen.getByText("Add at least one tag.")).toBeInTheDocument();
  });
});
