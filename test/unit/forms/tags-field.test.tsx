/**
 * DS-06 — the tags control: keyboard add/remove, duplicate prevention.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { Form, TagsField, required, useForm } from "~/shared/forms";

function Harness({ initial = [] as string[] }) {
  const [tags, setTags] = useState<readonly string[]>(initial);
  return (
    <TagsField
      label="Tags"
      value={tags}
      onChange={setTags}
      constraints={{ caseInsensitive: true }}
    />
  );
}

describe("TagsField", () => {
  it("adds a tag on Enter and shows it as a chip", () => {
    render(<Harness />);
    const input = screen.getByRole("textbox", { name: "Tags" });
    fireEvent.change(input, { target: { value: "design" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("design")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove design" }),
    ).toBeInTheDocument();
    expect(input).toHaveValue("");
  });

  it("removes the last tag with Backspace on an empty input", () => {
    render(<Harness initial={["a", "b"]} />);
    const input = screen.getByRole("textbox", { name: "Tags" });
    fireEvent.keyDown(input, { key: "Backspace" });
    expect(screen.queryByText("b")).not.toBeInTheDocument();
    expect(screen.getByText("a")).toBeInTheDocument();
  });

  it("removes a tag via its remove button", () => {
    render(<Harness initial={["keep", "drop"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove drop" }));
    expect(screen.queryByText("drop")).not.toBeInTheDocument();
  });

  it("does not add a duplicate", () => {
    render(<Harness initial={["design"]} />);
    const input = screen.getByRole("textbox", { name: "Tags" });
    fireEvent.change(input, { target: { value: "DESIGN" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getAllByText(/design/i)).toHaveLength(1);
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
        <TagsField label="Tags" required {...form.field("tags")} />
      </Form>
    );
  }

  it("typing the first tag and tabbing away does not leave a false required error", () => {
    render(<FormHarness />);
    const input = screen.getByRole("textbox", { name: "Tags" });
    fireEvent.change(input, { target: { value: "design" } });
    // Blur commits the draft AND validates the committed collection ["design"].
    fireEvent.blur(input);
    expect(screen.getByText("design")).toBeInTheDocument();
    expect(screen.queryByText("Add at least one tag.")).not.toBeInTheDocument();
  });

  it("blurring an empty draft still flags a required empty collection", () => {
    render(<FormHarness />);
    const input = screen.getByRole("textbox", { name: "Tags" });
    fireEvent.blur(input);
    expect(screen.getByText("Add at least one tag.")).toBeInTheDocument();
  });
});
