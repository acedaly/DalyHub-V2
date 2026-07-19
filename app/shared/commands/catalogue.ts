/**
 * DS-09 Command Palette — catalogue validation + browser decoder (pure).
 *
 * The browser receives the command catalogue as JSON from an authenticated
 * resource route. It is treated as UNTRUSTED: this decoder rebuilds a bounded,
 * well-formed {@link CommandCatalogue} from validated pieces, dropping any
 * malformed entry rather than trusting a `JSON.parse` cast (ADR-024 §24.8). A
 * structurally-unusable response (not an object, no `commands` array) yields
 * `null`, which the palette turns into a calm catalogue-error state. Navigation
 * targets are re-validated with the shared validator; no handler ever appears in
 * a catalogue (it is never serialised server-side), so none can be decoded here.
 */

import { validateNavigationTarget } from "~/kernel/modules";

import {
  MAX_CATALOGUE_SIZE,
  MAX_COMMAND_ID_LENGTH,
  MAX_COMMAND_KEYWORDS,
  MAX_COMMAND_KEYWORD_LENGTH,
  MAX_COMMAND_SUBTITLE_LENGTH,
  MAX_COMMAND_TITLE_LENGTH,
  MAX_MODULE_ID_LENGTH,
  MAX_MODULE_LABEL_LENGTH,
} from "./limits";
import type {
  CommandCatalogue,
  CommandCatalogueEntry,
  CommandShortcut,
  PaletteCommand,
} from "./types";

const SHORTCUT_MODIFIERS: ReadonlySet<string> = new Set([
  "mod",
  "shift",
  "alt",
  "ctrl",
  "meta",
]);

/** A bounded, control-character-free string, or null. */
function boundedString(value: unknown, max: number): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > max) {
    return null;
  }
  for (const cp of trimmed) {
    const code = cp.codePointAt(0) ?? 0;
    if (code <= 0x1f || (code >= 0x7f && code <= 0x9f)) {
      return null;
    }
  }
  return trimmed;
}

/** Validate optional keywords into a bounded array (never throws). */
function decodeKeywords(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const keywords: string[] = [];
  for (const raw of value) {
    if (keywords.length >= MAX_COMMAND_KEYWORDS) {
      break;
    }
    const keyword = boundedString(raw, MAX_COMMAND_KEYWORD_LENGTH);
    if (keyword !== null) {
      keywords.push(keyword);
    }
  }
  return keywords;
}

/** Validate an optional shortcut; returns undefined if malformed. */
function decodeShortcut(value: unknown): CommandShortcut | undefined {
  if (value === null || typeof value !== "object") {
    return undefined;
  }
  const { key, modifiers } = value as {
    readonly key?: unknown;
    readonly modifiers?: unknown;
  };
  if (typeof key !== "string" || key.length === 0 || key.length > 16) {
    return undefined;
  }
  if (modifiers === undefined) {
    return { key };
  }
  if (!Array.isArray(modifiers)) {
    return undefined;
  }
  const safe: ("mod" | "shift" | "alt" | "ctrl" | "meta")[] = [];
  for (const modifier of modifiers) {
    if (typeof modifier !== "string" || !SHORTCUT_MODIFIERS.has(modifier)) {
      return undefined;
    }
    safe.push(modifier as "mod" | "shift" | "alt" | "ctrl" | "meta");
  }
  return { key, modifiers: safe };
}

/** Decode one untrusted catalogue entry, or null if unusable. */
export function decodeCatalogueEntry(
  value: unknown,
): CommandCatalogueEntry | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const id = boundedString(raw.id, MAX_COMMAND_ID_LENGTH);
  const moduleId = boundedString(raw.moduleId, MAX_MODULE_ID_LENGTH);
  const moduleLabel = boundedString(raw.moduleLabel, MAX_MODULE_LABEL_LENGTH);
  const title = boundedString(raw.title, MAX_COMMAND_TITLE_LENGTH);
  if (
    id === null ||
    moduleId === null ||
    moduleLabel === null ||
    title === null
  ) {
    return null;
  }
  const subtitleRaw = raw.subtitle;
  const subtitle =
    subtitleRaw === undefined
      ? undefined
      : (boundedString(subtitleRaw, MAX_COMMAND_SUBTITLE_LENGTH) ?? undefined);
  const keywords = decodeKeywords(raw.keywords);
  const shortcut = decodeShortcut(raw.shortcut);

  const base = {
    id,
    moduleId,
    moduleLabel,
    title,
    ...(subtitle === undefined ? {} : { subtitle }),
    keywords,
    ...(shortcut === undefined ? {} : { shortcut }),
  };

  if (raw.kind === "navigate") {
    const target = validateNavigationTarget(raw.target);
    if (target === null) {
      return null;
    }
    return { ...base, kind: "navigate", target };
  }
  if (raw.kind === "execute") {
    return { ...base, kind: "execute" };
  }
  return null;
}

/**
 * Decode an untrusted catalogue JSON value into a bounded {@link CommandCatalogue}.
 * Returns null when the shape is structurally unusable (so the palette can show a
 * calm error); otherwise malformed entries are dropped and the list is capped.
 */
export function decodeCommandCatalogue(
  value: unknown,
): CommandCatalogue | null {
  if (value === null || typeof value !== "object") {
    return null;
  }
  const { commands } = value as { readonly commands?: unknown };
  if (!Array.isArray(commands)) {
    return null;
  }
  const decoded: CommandCatalogueEntry[] = [];
  const seen = new Set<string>();
  for (const entry of commands) {
    if (decoded.length >= MAX_CATALOGUE_SIZE) {
      break;
    }
    const command = decodeCatalogueEntry(entry);
    if (command !== null && !seen.has(command.id)) {
      seen.add(command.id);
      decoded.push(command);
    }
  }
  return { commands: decoded };
}

/** Project a registered catalogue entry into a normalised palette command. */
export function catalogueEntryToPaletteCommand(
  entry: CommandCatalogueEntry,
): PaletteCommand {
  return {
    id: entry.id,
    source: "registered",
    kind: entry.kind,
    title: entry.title,
    ...(entry.subtitle === undefined ? {} : { subtitle: entry.subtitle }),
    keywords: entry.keywords,
    ...(entry.shortcut === undefined ? {} : { shortcut: entry.shortcut }),
    moduleId: entry.moduleId,
    moduleLabel: entry.moduleLabel,
  };
}
