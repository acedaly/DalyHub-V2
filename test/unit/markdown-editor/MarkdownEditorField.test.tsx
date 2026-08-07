/**
 * EDIT-02 — the shared writing surface as a DS-06 field.
 *
 * The point of this component is that a form which used to hold a bare
 * `<textarea>` + "Show preview" (the Diary body, a Task's description) can hold
 * the SAME writing surface as a Note without giving up the form's own anatomy or
 * its own save semantics. So the contract is: a real visible label with the
 * required/optional cue, help and error routed into the editor, the formatting
 * toolbar present, and a disabled state that reaches the writing surface.
 *
 * CodeMirror never mounts in happy-dom, so what these assertions see is the
 * accessible SSR/no-JS `<textarea>` fallback — which is exactly the surface a
 * keyboard or assistive-tech user gets before enhancement, and therefore the one
 * worth pinning.
 */

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MarkdownEditorField } from "~/shared/markdown-editor";

function renderField(
  props: Partial<React.ComponentProps<typeof MarkdownEditorField>> = {},
) {
  const onChange = vi.fn();
  render(
    <MarkdownEditorField
      label={props.label ?? "Details"}
      value={props.value ?? ""}
      onChange={props.onChange ?? onChange}
      {...props}
    />,
  );
  return { onChange };
}

describe("MarkdownEditorField", () => {
  it("renders a real visible label and the optional cue, like every other field", () => {
    renderField();
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Optional")).toBeInTheDocument();
    // Exactly ONE group named for the field: the writing surface itself. The
    // wrapper is presentational, so nothing is announced twice.
    expect(screen.getAllByRole("group", { name: "Details" })).toHaveLength(1);
  });

  it("marks a required field, and drops the optional cue", () => {
    renderField({ required: true });
    expect(screen.getByText("(required)")).toBeInTheDocument();
    expect(screen.queryByText("Optional")).not.toBeInTheDocument();
  });

  it("carries the SAME formatting toolbar as a Note", () => {
    renderField();
    // Named for the field, so two editors on one page are distinguishable.
    expect(
      screen.getByRole("toolbar", { name: /Details formatting/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bold" })).toBeInTheDocument();
  });

  it("emits the exact Markdown source it was given", () => {
    const { onChange } = renderField({ value: "# Heading" });
    const surface = screen.getByRole("textbox", { name: "Details" });
    expect(surface).toHaveValue("# Heading");
    fireEvent.change(surface, { target: { value: "# Heading\n\nBody" } });
    expect(onChange).toHaveBeenCalledWith("# Heading\n\nBody");
  });

  it("shows help and reports an error politely, both wired to the surface", () => {
    renderField({ help: "Markdown is supported.", error: "That’s too large." });
    expect(screen.getByText("Markdown is supported.")).toBeInTheDocument();
    expect(screen.getByText("That’s too large.")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Details" })).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("disables the writing surface and its toolbar while a submit is in flight", () => {
    renderField({ disabled: true });
    expect(screen.getByRole("textbox", { name: "Details" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Bold" })).toBeDisabled();
  });

  it("treats a read-only field the same way — one 'you cannot type here' state", () => {
    renderField({ readOnly: true });
    expect(screen.getByRole("textbox", { name: "Details" })).toBeDisabled();
  });
});
