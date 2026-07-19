/**
 * DS-09 Command Palette — enabled-aware keyboard selection (pure, React-free).
 *
 * DS-08's selection maths (`nextIndex`/`previousIndex`/`firstIndex`/`lastIndex`)
 * move over a flat count and know nothing about individual options — correct for
 * Search, where every result is activatable. The palette adds ONE thing Search
 * does not have: a disabled contextual action, which is shown but NOT activatable
 * (ADR-024 §24.12). The palette's chosen accessibility policy is SKIP-DISABLED —
 * keyboard movement never lands on a disabled option, so the active option is
 * always one Enter can run and `aria-activedescendant` never points at something
 * inert. These helpers implement that policy over an enabled mask derived from the
 * merged option list; a record option is always enabled, a command option is
 * enabled unless its command is `disabled`. An all-disabled list has no active
 * option (index -1), matching the empty-list convention.
 */

import type { PaletteOption } from "./merge";

/** True when a single option can be activated (record options always can). */
export function isOptionEnabled(option: PaletteOption): boolean {
  return option.kind !== "command" || option.ranked.command.disabled !== true;
}

/** The enabled mask for a flat option list (index-aligned with `view.options`). */
export function optionEnabledMask(
  options: readonly PaletteOption[],
): readonly boolean[] {
  return options.map(isOptionEnabled);
}

/** First enabled index (Home), or -1 when none is enabled. */
export function firstEnabledIndex(enabled: readonly boolean[]): number {
  for (let i = 0; i < enabled.length; i += 1) {
    if (enabled[i]) {
      return i;
    }
  }
  return -1;
}

/** Last enabled index (End), or -1 when none is enabled. */
export function lastEnabledIndex(enabled: readonly boolean[]): number {
  for (let i = enabled.length - 1; i >= 0; i -= 1) {
    if (enabled[i]) {
      return i;
    }
  }
  return -1;
}

/**
 * Next enabled index for ArrowDown — wraps, and skips disabled options. From -1
 * (no active option) it selects the first enabled option. Returns -1 only when no
 * option is enabled.
 */
export function nextEnabledIndex(
  current: number,
  enabled: readonly boolean[],
): number {
  const count = enabled.length;
  if (count === 0) {
    return -1;
  }
  const from = current < 0 ? -1 : current;
  for (let step = 1; step <= count; step += 1) {
    const i = (((from + step) % count) + count) % count;
    if (enabled[i]) {
      return i;
    }
  }
  return -1;
}

/**
 * Previous enabled index for ArrowUp — wraps, and skips disabled options. From -1
 * it selects the last enabled option. Returns -1 only when no option is enabled.
 */
export function previousEnabledIndex(
  current: number,
  enabled: readonly boolean[],
): number {
  const count = enabled.length;
  if (count === 0) {
    return -1;
  }
  const from = current < 0 ? count : current;
  for (let step = 1; step <= count; step += 1) {
    const i = (((from - step) % count) + count) % count;
    if (enabled[i]) {
      return i;
    }
  }
  return -1;
}

/**
 * Keep an active index valid as the option list changes: retain it when it still
 * points at an enabled option, otherwise fall back to the first enabled option (or
 * -1 when the list is empty or wholly disabled). Never lands on a disabled option.
 */
export function clampActiveIndex(
  current: number,
  enabled: readonly boolean[],
): number {
  if (current >= 0 && current < enabled.length && enabled[current]) {
    return current;
  }
  return firstEnabledIndex(enabled);
}
