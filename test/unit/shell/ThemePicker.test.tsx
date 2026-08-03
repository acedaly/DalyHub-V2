/**
 * THEME-01 — the Settings theme picker and the user-menu quick switch.
 *
 * Asserts the behaviour the milestone requires of the picker: every theme is
 * offered, each is a real text-labelled control (never a colour-only swatch), the
 * current choice is conveyed semantically, choosing one posts the theme to the
 * persistence action, and each option carries a visual preview whose colours come
 * from that theme's palette rather than the active one.
 */

import { render, screen, within } from "@testing-library/react";
import { createRoutesStub } from "react-router";
import { describe, expect, it } from "vitest";

import {
  ThemePicker,
  ThemeQuickSwitch,
  THEME_ACTION_PATH,
} from "~/shared/shell/ThemePicker";
import { THEMES, THEME_IDS, type ThemePreference } from "~/shared/shell/theme";
import { THEME_COLOR_MAPS } from "~/shared/tokens";

function renderPicker(current: ThemePreference = "system") {
  const Stub = createRoutesStub([
    { path: "/", Component: () => <ThemePicker current={current} /> },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

function renderQuickSwitch(current: ThemePreference = "system") {
  const Stub = createRoutesStub([
    { path: "/", Component: () => <ThemeQuickSwitch current={current} /> },
  ]);
  return render(<Stub initialEntries={["/"]} />);
}

describe("THEME-01 theme picker", () => {
  it("offers every curated theme plus Match system", () => {
    renderPicker();
    for (const theme of THEMES) {
      expect(
        screen.getByRole("button", { name: new RegExp(theme.name) }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: /Match system/ }),
    ).toBeInTheDocument();
    // One control per curated theme, plus the appearance mode. `system` must be
    // an ADDITION, never a replacement for a curated theme.
    expect(screen.getAllByRole("button")).toHaveLength(THEME_IDS.length + 1);
  });

  it("names every option in text, so it never depends on colour", () => {
    renderPicker();
    for (const option of screen.getAllByRole("button")) {
      expect((option.textContent ?? "").trim().length).toBeGreaterThan(0);
    }
  });

  it("describes each theme, so the owner picks a look rather than a name", () => {
    renderPicker();
    for (const theme of THEMES) {
      expect(screen.getByText(theme.description)).toBeInTheDocument();
    }
  });

  it("never shows a raw theme id to the owner", () => {
    const { container } = renderPicker();
    const visible = container.textContent ?? "";
    for (const id of THEME_IDS) {
      expect(visible).not.toContain(id);
    }
  });

  it("marks the current choice semantically, not only visually", () => {
    renderPicker("eucalypt");
    const selected = screen.getByRole("button", { name: /Eucalypt/ });
    expect(selected).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Daly Dark/ })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    // Reinforced in text as well as by the border tint.
    expect(within(selected).getByText("Selected")).toBeInTheDocument();
  });

  it("selects the dark theme when it is the stored choice", () => {
    renderPicker("daly-dark");
    expect(screen.getByRole("button", { name: /Daly Dark/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("labels each theme's appearance so light and dark are distinguishable in text", () => {
    renderPicker();
    const dark = screen.getByRole("button", { name: /Daly Dark/ });
    expect(within(dark).getByText("Dark")).toBeInTheDocument();
    const light = screen.getByRole("button", { name: /Daly Light/ });
    expect(within(light).getByText("Light")).toBeInTheDocument();
  });

  it("posts the chosen theme to the persistence action", () => {
    const { container } = renderPicker();
    const form = container.querySelector("form");
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute("method", "post");
    expect(form?.getAttribute("action")).toContain(THEME_ACTION_PATH);
    for (const id of THEME_IDS) {
      const option = container.querySelector(`button[value="${id}"]`);
      expect(option, `no submit control for "${id}"`).not.toBeNull();
      expect(option).toHaveAttribute("name", "theme");
    }
  });

  it("states which theme is in use", () => {
    renderPicker("coastal");
    expect(screen.getByRole("status")).toHaveTextContent("Using Coastal");
  });

  it("previews each theme in ITS OWN colours, not the active theme's", () => {
    const { container } = renderPicker("daly-dark");
    for (const theme of THEMES) {
      const option = container.querySelector(`button[value="${theme.id}"]`);
      const preview = option?.querySelector(".dh-theme-preview");
      expect(preview, `no preview for "${theme.id}"`).not.toBeNull();
      const style = (preview as HTMLElement).getAttribute("style") ?? "";
      // The swatch carries that theme's own background and accent, even though a
      // different theme is currently applied.
      expect(style).toContain(THEME_COLOR_MAPS[theme.id]["surface-page"]);
      expect(style).toContain(THEME_COLOR_MAPS[theme.id].accent);
    }
  });

  it("hides the preview swatch from assistive tech (it repeats nothing)", () => {
    const { container } = renderPicker();
    for (const preview of container.querySelectorAll(".dh-theme-preview")) {
      expect(preview).toHaveAttribute("aria-hidden", "true");
    }
  });
});

describe("THEME-01 user-menu quick switch", () => {
  it("offers the same options, still text-labelled", () => {
    renderQuickSwitch();
    for (const theme of THEMES) {
      expect(
        screen.getByRole("button", { name: theme.name }),
      ).toBeInTheDocument();
    }
    expect(
      screen.getByRole("button", { name: "Match system" }),
    ).toBeInTheDocument();
  });

  it("posts to the same action as the Settings picker", () => {
    const { container } = renderQuickSwitch();
    expect(container.querySelector("form")?.getAttribute("action")).toContain(
      THEME_ACTION_PATH,
    );
  });

  it("marks the current choice semantically", () => {
    renderQuickSwitch("ember");
    expect(screen.getByRole("button", { name: "Ember" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
