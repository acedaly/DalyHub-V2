/**
 * DS-06 — explicit-form correctness under concurrency:
 *   - a submission commits its own SNAPSHOT as the baseline, so an edit made
 *     while the save is in flight stays dirty and is never silently discarded;
 *   - a pending async validator is invalidated when its field changes, so a stale
 *     response can't attach an error to a newer value (incl. out-of-order);
 *   - whole-form dirty honours a per-field `isEqual` comparator.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  Form,
  FormButton,
  TextField,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";
import type { AsyncValidator } from "~/shared/forms/model";

type V = { title: string };

describe("submission snapshot baseline (P1)", () => {
  function Harness({
    onSubmit,
  }: {
    readonly onSubmit: (v: V) => Promise<SubmitOutcome<V> | void>;
  }) {
    const form = useForm<V>({ initialValues: { title: "" }, onSubmit });
    return (
      <Form onSubmit={form.handleSubmit}>
        <TextField label="Title" {...form.field("title")} />
        <FormButton type="submit" pending={form.isSubmitting}>
          Save
        </FormButton>
        <button type="button" onClick={form.reset}>
          Cancel
        </button>
        <span data-testid="dirty">{form.isDirty ? "dirty" : "clean"}</span>
      </Form>
    );
  }

  it("keeps a mid-submission edit dirty; the saved snapshot becomes the baseline", async () => {
    let resolve!: (v: SubmitOutcome<V>) => void;
    const received: string[] = [];
    const onSubmit = vi.fn((v: V) => {
      received.push(v.title);
      return new Promise<SubmitOutcome<V>>((r) => (resolve = r));
    });
    render(<Harness onSubmit={onSubmit} />);
    const input = screen.getByLabelText("Title", { exact: false });

    fireEvent.change(input, { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());

    // Edit to B WHILE the save is in flight.
    fireEvent.change(input, { target: { value: "B" } });
    resolve({ status: "success" });

    // The server received the snapshot A; the baseline is now A, but the UI
    // shows B and the form is still dirty (the later edit is preserved).
    await waitFor(() =>
      expect(screen.getByTestId("dirty")).toHaveTextContent("dirty"),
    );
    expect(received).toEqual(["A"]);
    expect(input).toHaveValue("B");

    // Cancel returns to the committed snapshot A (not the empty initial value).
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(input).toHaveValue("A");
    expect(screen.getByTestId("dirty")).toHaveTextContent("clean");
  });

  it("uses the snapshot for async submit validation too", async () => {
    let resolveValidate!: (ok: boolean) => void;
    const validated: string[] = [];
    const validateAsync: AsyncValidator<string> = (value) => {
      validated.push(value);
      return new Promise(
        (r) =>
          (resolveValidate = (ok) =>
            r(ok ? { ok: true } : { ok: false, message: "no" })),
      );
    };
    const onSubmit = vi.fn(async () => ({ status: "success" as const }));

    function AsyncHarness() {
      const form = useForm<V>({
        initialValues: { title: "" },
        fields: { title: { validateAsync } },
        onSubmit,
      });
      return (
        <Form onSubmit={form.handleSubmit}>
          <TextField label="Title" {...form.field("title")} />
          <FormButton type="submit" pending={form.isSubmitting}>
            Save
          </FormButton>
          <span data-testid="dirty">{form.isDirty ? "dirty" : "clean"}</span>
        </Form>
      );
    }
    render(<AsyncHarness />);
    const input = screen.getByLabelText("Title", { exact: false });
    fireEvent.change(input, { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(validated).toEqual(["A"]));
    // Edit during async submit validation.
    fireEvent.change(input, { target: { value: "B" } });
    resolveValidate(true);
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ title: "A" }));
    await waitFor(() =>
      expect(screen.getByTestId("dirty")).toHaveTextContent("dirty"),
    );
    expect(input).toHaveValue("B");
  });
});

describe("stale async field validation (P2)", () => {
  function Harness({
    validateAsync,
  }: {
    readonly validateAsync: AsyncValidator<string>;
  }) {
    const form = useForm<V>({
      initialValues: { title: "" },
      fields: { title: { validateAsync } },
      onSubmit: async () => ({ status: "success" }),
    });
    return (
      <Form onSubmit={form.handleSubmit}>
        <TextField label="Title" {...form.field("title")} />
      </Form>
    );
  }

  it("ignores a pending validator's result once its field has changed", async () => {
    const resolvers = new Map<string, (ok: boolean) => void>();
    const validateAsync: AsyncValidator<string> = (value) =>
      new Promise((r) =>
        resolvers.set(value, (ok) =>
          r(ok ? { ok: true } : { ok: false, message: `${value} bad` }),
        ),
      );
    render(<Harness validateAsync={validateAsync} />);
    const input = screen.getByLabelText("Title", { exact: false });

    fireEvent.change(input, { target: { value: "A" } });
    fireEvent.blur(input); // starts async("A")
    await waitFor(() => expect(resolvers.has("A")).toBe(true));

    fireEvent.change(input, { target: { value: "B" } }); // invalidates async("A")
    resolvers.get("A")!(false); // A resolves with an error — must be ignored

    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("A bad")).not.toBeInTheDocument();
  });

  it("out-of-order resolutions: only the current value's result applies", async () => {
    const resolvers = new Map<string, (ok: boolean) => void>();
    const validateAsync: AsyncValidator<string> = (value) =>
      new Promise((r) =>
        resolvers.set(value, (ok) =>
          r(ok ? { ok: true } : { ok: false, message: `${value} bad` }),
        ),
      );
    render(<Harness validateAsync={validateAsync} />);
    const input = screen.getByLabelText("Title", { exact: false });

    fireEvent.change(input, { target: { value: "A" } });
    fireEvent.blur(input); // async("A")
    await waitFor(() => expect(resolvers.has("A")).toBe(true));
    fireEvent.change(input, { target: { value: "B" } });
    fireEvent.blur(input); // async("B")
    await waitFor(() => expect(resolvers.has("B")).toBe(true));

    resolvers.get("B")!(true); // current value B is valid
    resolvers.get("A")!(false); // stale A error arrives late — ignored

    await new Promise((r) => setTimeout(r, 20));
    expect(screen.queryByText("A bad")).not.toBeInTheDocument();
  });
});

describe("per-field dirty comparator (isEqual)", () => {
  it("honours a case-insensitive comparator when computing whole-form dirty", () => {
    function Harness() {
      const form = useForm<V>({
        initialValues: { title: "Hello" },
        fields: {
          title: {
            isEqual: (a, b) => a.toLowerCase() === b.toLowerCase(),
          },
        },
        onSubmit: async () => ({ status: "success" }),
      });
      return (
        <Form onSubmit={form.handleSubmit}>
          <TextField label="Title" {...form.field("title")} />
          <span data-testid="dirty">{form.isDirty ? "dirty" : "clean"}</span>
        </Form>
      );
    }
    render(<Harness />);
    const input = screen.getByLabelText("Title", { exact: false });
    fireEvent.change(input, { target: { value: "HELLO" } });
    // Same string case-insensitively → NOT dirty per the comparator.
    expect(screen.getByTestId("dirty")).toHaveTextContent("clean");
    fireEvent.change(input, { target: { value: "Goodbye" } });
    expect(screen.getByTestId("dirty")).toHaveTextContent("dirty");
  });
});
