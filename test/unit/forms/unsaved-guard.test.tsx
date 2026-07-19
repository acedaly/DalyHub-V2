/**
 * DS-06 — the unsaved-changes guard over the REAL DS-03 Drawer URL contract, and
 * the confirm dialog's modal accessibility.
 *
 * The drawer stack lives in repeated `drawer` search params; closing/replacing a
 * drawer is a same-pathname, search-param-only navigation. These tests drive those
 * exact transitions (via the drawer's own URL transforms and `navigate(-1)`) and
 * assert the guard intercepts the ones that remove the form's drawer level, lets
 * harmless ones through, and that Stay/Leave/Escape/focus behave as a real modal.
 */

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryRouter,
  useLocation,
  useNavigate,
  useSearchParams,
} from "react-router";
import { describe, expect, it } from "vitest";

import {
  withDrawerPushed,
  withTopDrawerRemoved,
  withTopDrawerReplaced,
} from "~/shared/drawer";
import { Form, TextField, UnsavedChangesGuard, useForm } from "~/shared/forms";

const FORM_KEY = "rec:a";

function Harness() {
  const form = useForm<{ title: string }>({
    initialValues: { title: "" },
    onSubmit: async () => ({ status: "success" }),
  });
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const location = useLocation();

  const go = (search: URLSearchParams, replace: boolean) =>
    navigate(
      { pathname: "/host", search: `?${search.toString()}` },
      { replace },
    );

  return (
    <Form onSubmit={form.handleSubmit}>
      <TextField label="Title" {...form.field("title")} />
      <UnsavedChangesGuard when={form.isDirty} drawerKey={FORM_KEY} />
      <button
        type="button"
        data-testid="close"
        onClick={() => go(withTopDrawerRemoved(params, "drawer"), true)}
      >
        Close drawer
      </button>
      <button
        type="button"
        data-testid="replace"
        onClick={() =>
          go(withTopDrawerReplaced(params, "rec:b", "drawer"), true)
        }
      >
        Replace drawer
      </button>
      <button
        type="button"
        data-testid="push"
        onClick={() => go(withDrawerPushed(params, "rec:b", "drawer"), false)}
      >
        Push drawer
      </button>
      <button
        type="button"
        data-testid="filter"
        onClick={() => {
          const next = new URLSearchParams(params);
          next.set("status", "active");
          go(next, false);
        }}
      >
        Change filter
      </button>
      <button type="button" data-testid="back" onClick={() => navigate(-1)}>
        Back
      </button>
      <span data-testid="loc">{location.pathname + location.search}</span>
    </Form>
  );
}

function renderHarness() {
  const router = createMemoryRouter([{ path: "/host", element: <Harness /> }], {
    initialEntries: ["/host", "/host?drawer=rec:a"],
    initialIndex: 1,
  });
  return render(<RouterProvider router={router} />);
}

function makeDirty() {
  fireEvent.change(screen.getByLabelText("Title", { exact: false }), {
    target: { value: "Draft" },
  });
}

describe("unsaved guard over the DS-03 drawer URL contract", () => {
  it("intercepts closing the form's drawer and Stay keeps the draft", async () => {
    renderHarness();
    makeDirty();
    fireEvent.click(screen.getByTestId("close"));

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toBeInTheDocument();
    // Still on the drawer URL; draft intact.
    expect(screen.getByTestId("loc")).toHaveTextContent("/host?drawer=rec:a");

    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Title", { exact: false })).toHaveValue(
      "Draft",
    );
    expect(screen.getByTestId("loc")).toHaveTextContent("/host?drawer=rec:a");
  });

  it("Leave lets the drawer close proceed exactly once", async () => {
    renderHarness();
    makeDirty();
    fireEvent.click(screen.getByTestId("close"));
    await screen.findByRole("alertdialog");
    fireEvent.click(screen.getByRole("button", { name: "Leave" }));
    await waitFor(() =>
      expect(screen.getByTestId("loc")).toHaveTextContent("/host"),
    );
    expect(screen.getByTestId("loc")).not.toHaveTextContent("drawer=rec:a");
  });

  it("intercepts replacing the top drawer and browser Back", async () => {
    renderHarness();
    makeDirty();
    fireEvent.click(screen.getByTestId("replace"));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));

    fireEvent.click(screen.getByTestId("back"));
    expect(await screen.findByRole("alertdialog")).toBeInTheDocument();
  });

  it("does NOT block a deeper drawer push or an unrelated filter change", async () => {
    renderHarness();
    makeDirty();
    fireEvent.click(screen.getByTestId("push"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("loc")).toHaveTextContent("drawer=rec%3Ab"),
    );

    fireEvent.click(screen.getByTestId("filter"));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});

describe("confirm dialog modal accessibility", () => {
  async function openDialog() {
    renderHarness();
    makeDirty();
    const close = screen.getByTestId("close");
    close.focus();
    fireEvent.click(close);
    await screen.findByRole("alertdialog");
    return close;
  }

  it("moves initial focus to Stay (the safe choice)", async () => {
    await openDialog();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Stay" })).toHaveFocus(),
    );
  });

  it("Escape chooses Stay and keeps the draft", async () => {
    await openDialog();
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "Escape" });
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("loc")).toHaveTextContent("/host?drawer=rec:a");
  });

  it("wraps focus with Shift+Tab from the first control", async () => {
    await openDialog();
    const stay = screen.getByRole("button", { name: "Stay" });
    const leave = screen.getByRole("button", { name: "Leave" });
    await waitFor(() => expect(stay).toHaveFocus());
    fireEvent.keyDown(screen.getByRole("alertdialog"), {
      key: "Tab",
      shiftKey: true,
    });
    expect(leave).toHaveFocus();
  });

  it("restores focus to the initiating control after Stay", async () => {
    const close = await openDialog();
    fireEvent.click(screen.getByRole("button", { name: "Stay" }));
    await waitFor(() => expect(close).toHaveFocus());
  });

  it("makes the background inert while open", async () => {
    await openDialog();
    // The form (a sibling branch of the guard root) is inert while the dialog is up.
    const input = screen.getByLabelText("Title", { exact: false });
    expect(input.closest("[inert]")).not.toBeNull();
  });
});
