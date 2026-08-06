/**
 * APPEARANCE-01 — the one appearance control, as behaviour.
 *
 * The point of these tests is that there is ONE control with two densities: the
 * account menu and Settings render the same component, over the same stored
 * value, posting to the same action — so they cannot show different current
 * appearances or persist through different paths.
 */

import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState } from "react";
import { createRoutesStub } from "react-router";
import { describe, expect, it, vi } from "vitest";

import { FeedbackProvider } from "~/shared/feedback";
import {
  AppearanceSelector,
  APPEARANCE_ACTION_PATH,
} from "~/shared/shell/AppearanceSelector";
import type { AppearancePreference } from "~/kernel/preferences/appearance";

type Submission = { readonly appearance: string | null };

/**
 * Mount one or more selectors over a stub route tree whose
 * `/preferences/appearance` action records what was submitted — the real action
 * runs on the Worker, so the unit boundary is "what does the control POST".
 */
function renderSelectors(
  children: React.ReactNode,
  options: { readonly ok?: boolean } = {},
) {
  const submissions: Submission[] = [];
  const Stub = createRoutesStub([
    {
      path: "/",
      Component: () => <FeedbackProvider>{children}</FeedbackProvider>,
    },
    {
      path: APPEARANCE_ACTION_PATH,
      action: async ({ request }) => {
        const form = await request.formData();
        submissions.push({ appearance: form.get("appearance") as string });
        return { ok: options.ok ?? true };
      },
    },
  ]);
  return { submissions, ...render(<Stub initialEntries={["/"]} />) };
}

function group(name = "Appearance") {
  return screen.getByRole("group", { name });
}

function option(scope: HTMLElement, name: string) {
  return within(scope).getByRole("radio", { name: new RegExp(name) });
}

describe("APPEARANCE-01 AppearanceSelector — semantics", () => {
  it("is a named group of three radios, one per legal preference", () => {
    renderSelectors(<AppearanceSelector value="system" variant="menu" />);
    const fieldset = group();
    const radios = within(fieldset).getAllByRole("radio");
    expect(radios).toHaveLength(3);
    expect(radios.map((radio) => (radio as HTMLInputElement).value)).toEqual([
      "system",
      "light",
      "dark",
    ]);
  });

  it("gives every option an accessible name in words, not only a glyph", () => {
    renderSelectors(<AppearanceSelector value="system" variant="menu" />);
    const fieldset = group();
    for (const label of ["System", "Light", "Dark"]) {
      expect(option(fieldset, label)).toBeInTheDocument();
    }
  });

  it("exposes the CURRENT state through the radio, not only through colour", () => {
    renderSelectors(<AppearanceSelector value="dark" variant="settings" />);
    const fieldset = group();
    expect(option(fieldset, "Dark")).toBeChecked();
    expect(option(fieldset, "Light")).not.toBeChecked();
    expect(option(fieldset, "System")).not.toBeChecked();
  });

  it("keeps its legend as the group name even when it is visually hidden", () => {
    renderSelectors(
      <AppearanceSelector value="light" variant="settings" hideLegend />,
    );
    // Still findable BY NAME — hiding it visually must not un-name the group.
    expect(group()).toBeInTheDocument();
  });

  it("never disables a radio while a save is in flight", async () => {
    // Disabling the focused control inside the account menu would drop focus to
    // the body and lose the owner's place. The form reports busy instead.
    renderSelectors(<AppearanceSelector value="system" variant="menu" />);
    const fieldset = group();
    fireEvent.click(option(fieldset, "Dark"));
    for (const radio of within(fieldset).getAllByRole("radio")) {
      expect(radio).toBeEnabled();
    }
  });

  it("describes each option in the Settings density and not in the menu", () => {
    const { unmount } = renderSelectors(
      <AppearanceSelector value="system" variant="settings" />,
    );
    expect(
      screen.getByText(/Follows your device, and changes with it/),
    ).toBeInTheDocument();
    unmount();

    renderSelectors(<AppearanceSelector value="system" variant="menu" />);
    expect(
      screen.queryByText(/Follows your device, and changes with it/),
    ).not.toBeInTheDocument();
  });
});

describe("APPEARANCE-01 AppearanceSelector — persistence", () => {
  it("posts the chosen preference to the appearance action", async () => {
    const { submissions } = renderSelectors(
      <AppearanceSelector value="system" variant="menu" />,
    );
    fireEvent.click(option(group(), "Light"));
    await waitFor(() => expect(submissions).toHaveLength(1));
    expect(submissions[0].appearance).toBe("light");
  });

  it("posts each of the three choices with its own value", async () => {
    /*
     * A STATEFUL host, because that is what the real one is: the action writes,
     * React Router revalidates, and the new stored value arrives back as a prop.
     * Without that, the control would settle back to the original value and a
     * later click on it would fire no change event at all — which is correct
     * behaviour, and exactly why this test has to model the round trip.
     */
    function Host() {
      const [value, setValue] = useState<AppearancePreference>("system");
      return (
        <div
          onChangeCapture={(event) => {
            const target = event.target as HTMLInputElement;
            setValue(target.value as AppearancePreference);
          }}
        >
          <AppearanceSelector value={value} variant="settings" />
        </div>
      );
    }
    const { submissions } = renderSelectors(<Host />);
    fireEvent.click(option(group(), "Dark"));
    await waitFor(() => expect(submissions).toHaveLength(1));
    fireEvent.click(option(group(), "Light"));
    await waitFor(() => expect(submissions).toHaveLength(2));
    fireEvent.click(option(group(), "System"));
    await waitFor(() => expect(submissions).toHaveLength(3));
    expect(submissions.map((s) => s.appearance)).toEqual([
      "dark",
      "light",
      "system",
    ]);
  });

  it("moves the selection optimistically, before the write settles", () => {
    renderSelectors(<AppearanceSelector value="system" variant="menu" />);
    const fieldset = group();
    fireEvent.click(option(fieldset, "Dark"));
    // The `value` prop has NOT changed (no revalidation has happened yet), so
    // this is the in-flight submission being shown.
    expect(option(fieldset, "Dark")).toBeChecked();
    expect(option(fieldset, "System")).not.toBeChecked();
  });

  it("reverts to the stored value once a rejected write settles", async () => {
    // The optimistic value only survives while the submission is in flight; when
    // it settles the `value` prop takes back over, so a failed save cannot leave
    // the control claiming an appearance that was never stored.
    renderSelectors(<AppearanceSelector value="system" variant="menu" />, {
      ok: false,
    });
    const fieldset = group();
    fireEvent.click(option(fieldset, "Dark"));
    await waitFor(() => expect(option(fieldset, "System")).toBeChecked());
    expect(option(fieldset, "Dark")).not.toBeChecked();
  });

  it("says nothing at all on a successful save", async () => {
    // A success toast on every appearance change would be exactly the
    // unnecessary announcement the accessibility brief rules out — the whole
    // screen changing colour IS the confirmation.
    const { submissions } = renderSelectors(
      <AppearanceSelector value="system" variant="menu" />,
    );
    fireEvent.click(option(group(), "Dark"));
    await waitFor(() => expect(submissions).toHaveLength(1));
    // No toast, no alert, no status message — only the control's own legend and
    // option labels remain on screen.
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/saved/i)).toBeNull();
    expect(screen.queryByText(/Couldn’t save your appearance/)).toBeNull();
  });

  it("SPEAKS when a save fails, so a lost choice is never silent", async () => {
    renderSelectors(<AppearanceSelector value="system" variant="menu" />, {
      ok: false,
    });
    fireEvent.click(option(group(), "Light"));
    expect(
      (await screen.findAllByText(/Couldn’t save your appearance/)).length,
    ).toBeGreaterThan(0);
  });
});

describe("APPEARANCE-01 AppearanceSelector — one shared control", () => {
  /*
   * The account menu and Settings are the two homes of the SAME preference. They
   * are rendered here side by side over one value to prove they agree, and that
   * either one drives the same action — which is what "both surfaces must remain
   * synchronised" means once the loader data behind them is shared.
   */
  function bothSurfaces(value: AppearancePreference) {
    return (
      <>
        <div data-testid="account-menu">
          <AppearanceSelector value={value} variant="menu" />
        </div>
        <div data-testid="settings">
          <AppearanceSelector value={value} variant="settings" />
        </div>
      </>
    );
  }

  it("shows the same current appearance in both surfaces", () => {
    renderSelectors(bothSurfaces("dark"));
    for (const testId of ["account-menu", "settings"]) {
      const surface = screen.getByTestId(testId);
      expect(
        within(surface).getByRole("radio", { name: /Dark/ }),
      ).toBeChecked();
      expect(
        within(surface).getByRole("radio", { name: /Light/ }),
      ).not.toBeChecked();
    }
  });

  it("posts to the same action from either surface", async () => {
    const { submissions } = renderSelectors(bothSurfaces("system"));
    fireEvent.click(
      within(screen.getByTestId("account-menu")).getByRole("radio", {
        name: /Light/,
      }),
    );
    await waitFor(() => expect(submissions).toHaveLength(1));
    fireEvent.click(
      within(screen.getByTestId("settings")).getByRole("radio", {
        name: /Dark/,
      }),
    );
    await waitFor(() => expect(submissions).toHaveLength(2));
    expect(submissions.map((s) => s.appearance)).toEqual(["light", "dark"]);
  });

  it("keeps the two radio groups independent of each other in the DOM", () => {
    // Both use `name="appearance"`, which is what the action reads. Radio
    // grouping is scoped to the FORM, so two selectors on one page must not
    // steal each other's selection.
    renderSelectors(bothSurfaces("system"));
    const menu = within(screen.getByTestId("account-menu"));
    const settings = within(screen.getByTestId("settings"));
    fireEvent.click(menu.getByRole("radio", { name: /Dark/ }));
    expect(menu.getByRole("radio", { name: /Dark/ })).toBeChecked();
    expect(settings.getByRole("radio", { name: /System/ })).toBeChecked();
  });
});

describe("APPEARANCE-01 — the account menu hosts the control", () => {
  it("renders the appearance group inside the open account panel", async () => {
    const { UserMenu } = await import("~/shared/shell/UserMenu");
    const Stub = createRoutesStub([
      {
        path: "/",
        Component: () => (
          <FeedbackProvider>
            <UserMenu email="owner@example.com" appearance="dark" />
          </FeedbackProvider>
        ),
      },
      { path: APPEARANCE_ACTION_PATH, action: () => ({ ok: true }) },
    ]);
    render(<Stub initialEntries={["/"]} />);

    // Closed: no appearance control competing for the chrome.
    expect(screen.queryByRole("group", { name: "Appearance" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /owner/i }));
    const panel = screen.getByRole("group", { name: "Account" });
    const appearance = within(panel).getByRole("group", {
      name: "Appearance",
    });
    expect(
      within(appearance).getByRole("radio", { name: /Dark/ }),
    ).toBeChecked();
  });

  it("does not close the panel when an appearance is chosen", () => {
    // Choosing an appearance is a "look at the result" action. Closing the menu
    // would make correcting a wrong choice a re-open rather than a second click.
    return import("~/shared/shell/UserMenu").then(({ UserMenu }) => {
      const Stub = createRoutesStub([
        {
          path: "/",
          Component: () => (
            <FeedbackProvider>
              <UserMenu email="owner@example.com" appearance="system" />
            </FeedbackProvider>
          ),
        },
        { path: APPEARANCE_ACTION_PATH, action: vi.fn(() => ({ ok: true })) },
      ]);
      render(<Stub initialEntries={["/"]} />);
      const trigger = screen.getByRole("button", { name: /owner/i });
      fireEvent.click(trigger);
      fireEvent.click(
        within(screen.getByRole("group", { name: "Appearance" })).getByRole(
          "radio",
          { name: /Light/ },
        ),
      );
      expect(trigger).toHaveAttribute("aria-expanded", "true");
    });
  });
});
