// Vendored from Untitled UI React (untitledui.com/react), MIT.
// Source: `src/components/application/command-menus/parseHotkeys.ts`, retrieved 2026-09-10.
// Source revision: `0b78cd49beeb9d7ee37ed73cd85878cdb7ffa743`; sync marker: `c42bc4e33eba53dd58549bb6ba6045fe50338921`.
// Source licence: MIT for the open-source component source; Untitled UI React Pro materials remain subject to the purchased Pro license.
// Written by `scripts/vendor-untitled.mjs`; edit the manifest or the override
// layer in `~/shared/ui/untitled/overrides/` rather than this file, which is
// regenerated. Only the import specifiers differ from upstream, plus:
//
// PATCHED by the vendoring script: Upstream imports two types from `react-hotkeys-hook/dist/types`. react-hotkeys-hook
// v5 removed that entry point and does not re-export either type from its root,
// so the import cannot resolve at any version we can install. This file is
// itself a copy of the library's internal module, so declaring the two types
// locally restores exactly what it had and drops the coupling to a private
// path.
// This is a 1:1 copy of the `parseHotkeys.ts` file from `react-hotkeys-hook`.
// We need this because there's no way to import it from the package directly.
// Source: https://github.com/JohannesKlauss/react-hotkeys-hook/blob/main/packages/react-hotkeys-hook/src/lib/parseHotkeys.ts
type KeyboardModifiers = {
    alt?: boolean;
    ctrl?: boolean;
    meta?: boolean;
    shift?: boolean;
    mod?: boolean;
    useKey?: boolean;
};

type Hotkey = KeyboardModifiers & {
    keys?: readonly string[];
    scopes?: string | readonly string[];
    description?: string;
    isSequence?: boolean;
    hotkey: string;
    metadata?: Record<string, unknown>;
};

const reservedModifierKeywords = ["shift", "alt", "meta", "mod", "ctrl", "control"];

const mappedKeys: Record<string, string> = {
    esc: "escape",
    return: "enter",
    left: "arrowleft",
    right: "arrowright",
    up: "arrowup",
    down: "arrowdown",
    ShiftLeft: "shift",
    ShiftRight: "shift",
    AltLeft: "alt",
    AltRight: "alt",
    MetaLeft: "meta",
    MetaRight: "meta",
    OSLeft: "meta",
    OSRight: "meta",
    ControlLeft: "ctrl",
    ControlRight: "ctrl",
};

export function mapCode(key: string): string {
    return (mappedKeys[key.trim()] || key.trim()).toLowerCase().replace(/key|digit|numpad/, "");
}

export function isHotkeyModifier(key: string) {
    return reservedModifierKeywords.includes(key);
}

export function parseKeysHookInput(keys: string, delimiter = ","): string[] {
    return keys.toLowerCase().split(delimiter);
}

export function parseHotkey(hotkey: string, splitKey = "+", sequenceSplitKey = ">", useKey = false, description?: string): Hotkey {
    let keys: string[] = [];
    let isSequence = false;

    if (hotkey.includes(sequenceSplitKey)) {
        isSequence = true;
        keys = hotkey
            .toLocaleLowerCase()
            .split(sequenceSplitKey)
            .map((k) => mapCode(k));
    } else {
        keys = hotkey
            .toLocaleLowerCase()
            .split(splitKey)
            .map((k) => mapCode(k));
    }

    const modifiers: KeyboardModifiers = {
        alt: keys.includes("alt"),
        ctrl: keys.includes("ctrl") || keys.includes("control"),
        shift: keys.includes("shift"),
        meta: keys.includes("meta"),
        mod: keys.includes("mod"),
        useKey,
    };

    const singleCharKeys = keys.filter((k) => !reservedModifierKeywords.includes(k));

    return {
        ...modifiers,
        hotkey,
        keys: singleCharKeys,
        description,
        isSequence,
    };
}
