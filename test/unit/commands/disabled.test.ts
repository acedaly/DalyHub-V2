import { describe, expect, it } from "vitest";

import {
  appActionToPaletteCommand,
  appActionToShortcutBinding,
  toCardAction,
  toRecordAction,
  type AppAction,
} from "~/shared/commands";
import {
  buildPaletteView,
  clampActiveIndex,
  firstEnabledIndex,
  groupCommands,
  isOptionEnabled,
  lastEnabledIndex,
  nextEnabledIndex,
  optionEnabledMask,
  previousEnabledIndex,
  rankCommands,
  type CommandShortcut,
  type PaletteCommand,
  type PaletteOption,
} from "~/shared/commands/model";

/**
 * DS-09 — disabled contextual actions must survive the whole pure pipeline
 * (AppAction → PaletteCommand → ranking → grouping → view) and drive skip-disabled
 * selection. Disabled ≠ omitted: the option is present but never activatable.
 */

type RunActionOverrides = {
  readonly id?: string;
  readonly title?: string;
  readonly subtitle?: string;
  readonly keywords?: readonly string[];
  readonly shortcut?: CommandShortcut;
  readonly disabled?: boolean;
};

const runAction = (over: RunActionOverrides = {}): AppAction => ({
  id: over.id ?? "ctx.archive",
  title: over.title ?? "Archive",
  ...(over.subtitle === undefined ? {} : { subtitle: over.subtitle }),
  ...(over.keywords === undefined ? {} : { keywords: over.keywords }),
  ...(over.shortcut === undefined ? {} : { shortcut: over.shortcut }),
  ...(over.disabled === undefined ? {} : { disabled: over.disabled }),
  kind: "run",
  run: () => ({ ok: true }),
});

function commandOption(
  index: number,
  command: PaletteCommand,
): Extract<PaletteOption, { kind: "command" }> {
  return {
    kind: "command",
    index,
    ranked: { command, tier: 0, titleMatches: [] },
  };
}

const contextualCommand = (
  id: string,
  title: string,
  disabled?: boolean,
): PaletteCommand => ({
  id,
  source: "contextual",
  kind: "execute",
  title,
  keywords: [],
  ...(disabled === undefined ? {} : { disabled }),
});

describe("disabled state survives the action projection", () => {
  it("appActionToPaletteCommand preserves disabled: true", () => {
    expect(
      appActionToPaletteCommand(runAction({ disabled: true })).disabled,
    ).toBe(true);
  });

  it("appActionToPaletteCommand omits disabled when the action is enabled", () => {
    expect("disabled" in appActionToPaletteCommand(runAction())).toBe(false);
  });

  it("appActionToShortcutBinding yields enabled:false for a disabled action", () => {
    const shortcut = { key: "a", modifiers: ["mod"] as const };
    const disabled = appActionToShortcutBinding(
      runAction({ shortcut, disabled: true }),
      () => {},
    );
    expect(disabled?.enabled).toBe(false);
    const enabled = appActionToShortcutBinding(
      runAction({ shortcut }),
      () => {},
    );
    expect(enabled?.enabled).toBe(true);
    // No shortcut declared → no binding at all.
    expect(appActionToShortcutBinding(runAction(), () => {})).toBeNull();
  });
});

describe("disabled state survives ranking, matching and grouping", () => {
  it("keeps a disabled command through ranking and query matching", () => {
    const commands = [
      contextualCommand("ctx.on", "Archive record", false),
      contextualCommand("ctx.off", "Archive draft", true),
    ];
    const ranked = rankCommands("archive", commands);
    expect(ranked).toHaveLength(2);
    const off = ranked.find((r) => r.command.id === "ctx.off");
    expect(off?.command.disabled).toBe(true);
  });

  it("keeps a disabled command through grouping", () => {
    const ranked = rankCommands("archive", [
      contextualCommand("ctx.off", "Archive", true),
    ]);
    const groups = groupCommands(ranked, { hasQuery: true });
    const command = groups[0]?.commands[0]?.command;
    expect(command?.disabled).toBe(true);
  });

  it("keeps enabled and disabled commands with identical metadata distinct", () => {
    const view = buildPaletteView(
      groupCommands(
        rankCommands("archive", [
          contextualCommand("ctx.on", "Archive", false),
          contextualCommand("ctx.off", "Archive", true),
        ]),
        { hasQuery: true },
      ),
      [],
    );
    const mask = optionEnabledMask(view.options);
    // Two options, exactly one disabled — never merged into one.
    expect(view.options).toHaveLength(2);
    expect(mask.filter((v) => v === false)).toHaveLength(1);
  });
});

describe("one disabled AppAction is disabled consistently across every surface", () => {
  it("Card action, Record Header action, palette command and shortcut all reflect disabled", () => {
    const shortcut = { key: "s", modifiers: ["mod"] as const };
    const action = runAction({
      id: "shared.x",
      title: "Shared",
      shortcut,
      disabled: true,
    });
    expect(toCardAction(action, { onActivate: () => {} }).disabled).toBe(true);
    expect(toRecordAction(action, { onActivate: () => {} }).disabled).toBe(
      true,
    );
    expect(appActionToPaletteCommand(action).disabled).toBe(true);
    expect(appActionToShortcutBinding(action, () => {})?.enabled).toBe(false);
  });

  it("the same action when enabled is activatable across every surface", () => {
    const shortcut = { key: "s", modifiers: ["mod"] as const };
    const action = runAction({ id: "shared.y", title: "Shared", shortcut });
    expect(
      toCardAction(action, { onActivate: () => {} }).disabled,
    ).toBeUndefined();
    expect(
      toRecordAction(action, { onActivate: () => {} }).disabled,
    ).toBeUndefined();
    expect("disabled" in appActionToPaletteCommand(action)).toBe(false);
    expect(appActionToShortcutBinding(action, () => {})?.enabled).toBe(true);
  });
});

describe("option-enabled predicate and mask", () => {
  it("marks a disabled command option as not enabled; result options always are", () => {
    const disabled = commandOption(0, contextualCommand("x", "X", true));
    const enabled = commandOption(1, contextualCommand("y", "Y"));
    expect(isOptionEnabled(disabled)).toBe(false);
    expect(isOptionEnabled(enabled)).toBe(true);
    expect(optionEnabledMask([disabled, enabled])).toEqual([false, true]);
  });
});

describe("skip-disabled selection maths", () => {
  const mask = [false, true, false, true]; // enabled at 1 and 3

  it("firstEnabledIndex/lastEnabledIndex skip disabled ends", () => {
    expect(firstEnabledIndex(mask)).toBe(1);
    expect(lastEnabledIndex(mask)).toBe(3);
  });

  it("nextEnabledIndex skips disabled and wraps", () => {
    expect(nextEnabledIndex(-1, mask)).toBe(1);
    expect(nextEnabledIndex(1, mask)).toBe(3);
    expect(nextEnabledIndex(3, mask)).toBe(1); // wrap past the disabled tail
  });

  it("previousEnabledIndex skips disabled and wraps", () => {
    expect(previousEnabledIndex(-1, mask)).toBe(3);
    expect(previousEnabledIndex(3, mask)).toBe(1);
    expect(previousEnabledIndex(1, mask)).toBe(3); // wrap past the disabled head
  });

  it("clampActiveIndex retains an enabled index and repairs a disabled one", () => {
    expect(clampActiveIndex(1, mask)).toBe(1);
    expect(clampActiveIndex(0, mask)).toBe(1); // 0 disabled → first enabled
    expect(clampActiveIndex(9, mask)).toBe(1); // out of range → first enabled
  });

  it("an all-disabled list has no active option", () => {
    const none = [false, false];
    expect(firstEnabledIndex(none)).toBe(-1);
    expect(lastEnabledIndex(none)).toBe(-1);
    expect(nextEnabledIndex(-1, none)).toBe(-1);
    expect(previousEnabledIndex(0, none)).toBe(-1);
    expect(clampActiveIndex(0, none)).toBe(-1);
  });

  it("an empty list has no active option", () => {
    expect(nextEnabledIndex(-1, [])).toBe(-1);
    expect(firstEnabledIndex([])).toBe(-1);
    expect(clampActiveIndex(0, [])).toBe(-1);
  });
});
