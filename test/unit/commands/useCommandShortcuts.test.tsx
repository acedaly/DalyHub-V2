import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  appActionToShortcutBinding,
  useCommandShortcuts,
  type AppAction,
  type ShortcutBinding,
} from "~/shared/commands";

function Harness({
  bindings,
}: {
  readonly bindings: readonly ShortcutBinding[];
}) {
  useCommandShortcuts(bindings, { platform: "mac" });
  return (
    <div>
      <input aria-label="field" />
    </div>
  );
}

function press(init: KeyboardEventInit & { key: string }) {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { cancelable: true, bubbles: true, ...init }),
  );
}

describe("useCommandShortcuts dispatcher", () => {
  it("fires Meta+K on macOS and Control+K elsewhere", () => {
    const onTrigger = vi.fn();
    render(
      <Harness
        bindings={[
          {
            shortcut: { key: "k", modifiers: ["mod"] },
            onTrigger,
            allowInInput: true,
          },
        ]}
      />,
    );
    press({ key: "k", metaKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);

    // Ctrl+K on mac (mod resolves to Meta) must NOT fire.
    press({ key: "k", ctrlKey: true });
    expect(onTrigger).toHaveBeenCalledTimes(1);
  });

  it("ignores browser auto-repeat (one press → one action)", () => {
    const onTrigger = vi.fn();
    render(
      <Harness
        bindings={[
          {
            shortcut: { key: "k", modifiers: ["mod"] },
            onTrigger,
            allowInInput: true,
          },
        ]}
      />,
    );
    press({ key: "k", metaKey: true, repeat: true });
    expect(onTrigger).not.toHaveBeenCalled();
  });

  it("ignores ordinary shortcuts while typing but permits allowInInput", () => {
    const ordinary = vi.fn();
    const reserved = vi.fn();
    const { getByLabelText } = render(
      <Harness
        bindings={[
          { shortcut: { key: "/" }, onTrigger: ordinary },
          {
            shortcut: { key: "k", modifiers: ["mod"] },
            onTrigger: reserved,
            allowInInput: true,
          },
        ]}
      />,
    );
    const input = getByLabelText("field");
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "/",
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(ordinary).not.toHaveBeenCalled();
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "k",
        metaKey: true,
        bubbles: true,
        cancelable: true,
      }),
    );
    expect(reserved).toHaveBeenCalledTimes(1);
  });

  it("resolves collisions by precedence: one event triggers one action", () => {
    const first = vi.fn();
    const second = vi.fn();
    render(
      <Harness
        bindings={[
          {
            shortcut: { key: "g", modifiers: ["mod"] },
            onTrigger: first,
            allowInInput: true,
          },
          {
            shortcut: { key: "g", modifiers: ["mod"] },
            onTrigger: second,
            allowInInput: true,
          },
        ]}
      />,
    );
    press({ key: "g", metaKey: true });
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("respects disabled bindings and lets a later one win", () => {
    const disabled = vi.fn();
    const enabled = vi.fn();
    render(
      <Harness
        bindings={[
          {
            shortcut: { key: "g", modifiers: ["mod"] },
            onTrigger: disabled,
            enabled: false,
            allowInInput: true,
          },
          {
            shortcut: { key: "g", modifiers: ["mod"] },
            onTrigger: enabled,
            allowInInput: true,
          },
        ]}
      />,
    );
    press({ key: "g", metaKey: true });
    expect(disabled).not.toHaveBeenCalled();
    expect(enabled).toHaveBeenCalledTimes(1);
  });

  it("never fires a disabled AppAction's shortcut, but fires an enabled one", () => {
    const shortcut = { key: "j", modifiers: ["mod"] as const };
    const disabledTrigger = vi.fn();
    const enabledTrigger = vi.fn();
    const disabledAction: AppAction = {
      id: "a.off",
      title: "Off",
      kind: "run",
      run: () => ({ ok: true }),
      shortcut,
      disabled: true,
    };
    const enabledAction: AppAction = {
      id: "a.on",
      title: "On",
      kind: "run",
      run: () => ({ ok: true }),
      shortcut,
    };
    const bindings = [
      appActionToShortcutBinding(disabledAction, disabledTrigger),
      appActionToShortcutBinding(enabledAction, enabledTrigger),
    ].filter((b): b is ShortcutBinding => b !== null);
    render(<Harness bindings={bindings} />);
    press({ key: "j", metaKey: true });
    // The disabled action is skipped; the enabled lower-precedence one still wins.
    expect(disabledTrigger).not.toHaveBeenCalled();
    expect(enabledTrigger).toHaveBeenCalledTimes(1);
  });

  it("cleans up its listener on unmount", () => {
    const onTrigger = vi.fn();
    const { unmount } = render(
      <Harness
        bindings={[
          {
            shortcut: { key: "k", modifiers: ["mod"] },
            onTrigger,
            allowInInput: true,
          },
        ]}
      />,
    );
    unmount();
    press({ key: "k", metaKey: true });
    expect(onTrigger).not.toHaveBeenCalled();
  });
});
