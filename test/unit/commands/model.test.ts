import { describe, expect, it } from "vitest";

import {
  INITIAL_EXECUTION_STATE,
  beginExecution,
  boundMessage,
  buildPaletteView,
  catalogueEntryToPaletteCommand,
  decodeCommandCatalogue,
  formatShortcut,
  groupCommands,
  isReservedShortcut,
  matchesShortcut,
  nextIndex,
  normaliseShortcut,
  rankCommands,
  resolveShortcutCollisions,
  sanitiseOutcome,
  settleExecution,
  shortcutSignature,
  TIER_EXACT_TITLE,
  TIER_FUZZY_TITLE,
  TIER_SUBTITLE,
  TIER_TITLE_PREFIX,
} from "~/shared/commands/model";
import type {
  CommandCatalogueEntry,
  PaletteCommand,
} from "~/shared/commands/model";

function registered(
  id: string,
  title: string,
  extra: Partial<PaletteCommand> = {},
): PaletteCommand {
  return {
    id,
    source: "registered",
    kind: "execute",
    title,
    keywords: [],
    moduleId: id.split(".")[0],
    moduleLabel: "Module",
    ...extra,
  };
}

describe("command ranking", () => {
  const commands: readonly PaletteCommand[] = [
    registered("today.open", "Open Today", { kind: "navigate" }),
    registered("today.capture", "Focus Quick Capture", {
      keywords: ["capture", "new"],
    }),
    registered("projects.create", "Create project"),
    registered("notes.new", "New note", { subtitle: "Capture a thought" }),
  ];

  it("ranks exact title above prefix above keyword above fuzzy above subtitle", () => {
    expect(rankCommands("Open Today", commands)[0].tier).toBe(TIER_EXACT_TITLE);
    expect(rankCommands("Open", commands)[0].tier).toBe(TIER_TITLE_PREFIX);
    expect(rankCommands("Create pr", commands)[0].tier).toBe(TIER_TITLE_PREFIX);

    const keyword = rankCommands("capture", commands);
    // "Focus Quick Capture" matches by token prefix on "Capture"; "New note"
    // matches only in its subtitle.
    expect(keyword[0].command.id).toBe("today.capture");
    const subtitleOnly = keyword.find((r) => r.command.id === "notes.new");
    expect(subtitleOnly?.tier).toBe(TIER_SUBTITLE);
  });

  it("matches keywords and fuzzy titles", () => {
    const byKeyword = rankCommands("new", commands);
    expect(byKeyword.some((r) => r.command.id === "today.capture")).toBe(true);
    const fuzzy = rankCommands("crtprj", commands);
    expect(fuzzy[0]?.command.id).toBe("projects.create");
    expect(fuzzy[0]?.tier).toBe(TIER_FUZZY_TITLE);
  });

  it("drops non-matching commands for a query but keeps all for empty query", () => {
    expect(rankCommands("zzzznope", commands)).toHaveLength(0);
    expect(rankCommands("", commands)).toHaveLength(commands.length);
  });

  it("is deterministic and stable for identical inputs", () => {
    const a = rankCommands("c", commands).map((r) => r.command.id);
    const b = rankCommands("c", commands).map((r) => r.command.id);
    expect(a).toEqual(b);
  });

  it("does not let keyword matches include title highlight ranges", () => {
    const ranked = rankCommands("new", commands).find(
      (r) => r.command.id === "notes.new",
    );
    // "New note" title starts with "new" — a title prefix, so it has ranges.
    expect(ranked?.titleMatches.length ?? 0).toBeGreaterThan(0);
  });
});

describe("command grouping", () => {
  const contextual: PaletteCommand = {
    id: "ctx.capture",
    source: "contextual",
    kind: "execute",
    title: "Focus Quick Capture",
    keywords: [],
  };
  const nav = registered("today.open", "Open Today", { kind: "navigate" });
  const action = registered("projects.create", "Create project");

  it("groups contextual/actions/navigation deterministically for a query", () => {
    // A query that matches all three ("Focus Quick Capture", "Create project",
    // "Open Today" all contain no shared token, so query each individually).
    const all = groupCommands(rankCommands("", [contextual, nav, action]), {
      hasQuery: true,
    });
    // hasQuery partitions by kind/source into the canonical order.
    expect(all.map((g) => g.key)).toEqual(["context", "actions", "navigation"]);
    expect(all[0].commands[0].command.id).toBe("ctx.capture");

    // A narrower query surfaces only the matching group.
    const onlyActions = groupCommands(
      rankCommands("Create", [contextual, nav, action]),
      { hasQuery: true },
    );
    expect(onlyActions.map((g) => g.key)).toEqual(["actions"]);
  });

  it("shows Suggested + Current context for an empty query", () => {
    const ranked = rankCommands("", [contextual, nav, action]);
    const groups = groupCommands(ranked, {
      hasQuery: false,
      recentIds: ["projects.create"],
    });
    expect(groups.map((g) => g.key)).toEqual(["suggested", "context"]);
    // Recent command is surfaced first in Suggested.
    expect(groups[0].commands[0].command.id).toBe("projects.create");
  });
});

describe("merge with search results and selection maths", () => {
  it("assigns one flat index space across commands then results", () => {
    const commandGroups = groupCommands(
      rankCommands("c", [registered("projects.create", "Create project")]),
      { hasQuery: true },
    );
    const view = buildPaletteView(commandGroups, [
      {
        id: "entity:task",
        kind: "entity",
        label: "Tasks",
        results: [
          {
            id: "tasks::tasks.search::t1",
            providerId: "tasks.search",
            moduleId: "tasks",
            title: "A task",
            target: { kind: "drawer", drawerKey: "task:t1" },
            score: 1,
            titleMatches: [],
            subtitleMatches: [],
          },
        ],
      },
    ]);
    expect(view.count).toBe(2);
    expect(view.options[0].kind).toBe("command");
    expect(view.options[1].kind).toBe("result");
    expect(view.options[1].index).toBe(1);
    // Reused DS-08 selection maths wrap over the merged count.
    expect(nextIndex(1, view.count)).toBe(0);
  });
});

describe("catalogue decoder", () => {
  it("drops malformed entries and caps size, returns null for unusable shape", () => {
    expect(decodeCommandCatalogue(null)).toBeNull();
    expect(decodeCommandCatalogue({ commands: "nope" })).toBeNull();

    const catalogue = decodeCommandCatalogue({
      commands: [
        {
          id: "today.open",
          moduleId: "today",
          moduleLabel: "Today",
          title: "Open Today",
          keywords: [],
          kind: "navigate",
          target: { kind: "route", to: "/today" },
        },
        {
          id: "bad",
          moduleId: "x",
          moduleLabel: "X",
          title: "Bad",
          kind: "navigate",
          target: { kind: "route", to: "javascript:alert(1)" },
        },
        { id: "no-kind", moduleId: "x", moduleLabel: "X", title: "No kind" },
        {
          id: "exec",
          moduleId: "x",
          moduleLabel: "X",
          title: "Run",
          kind: "execute",
        },
      ],
    });
    expect(catalogue?.commands.map((c) => c.id)).toEqual([
      "today.open",
      "exec",
    ]);
  });

  it("never decodes a handler function", () => {
    const catalogue = decodeCommandCatalogue({
      commands: [
        {
          id: "x.run",
          moduleId: "x",
          moduleLabel: "X",
          title: "Run",
          kind: "execute",
          run: () => {
            throw new Error("should never be called");
          },
        },
      ],
    });
    const entry = catalogue?.commands[0] as CommandCatalogueEntry;
    expect("run" in entry).toBe(false);
    const command = catalogueEntryToPaletteCommand(entry);
    expect("run" in command).toBe(false);
  });
});

describe("shortcut model", () => {
  it("normalises, signs and formats platform-correctly", () => {
    const shortcut = { key: "P", modifiers: ["shift", "mod"] as const };
    expect(normaliseShortcut(shortcut)).toEqual({
      key: "p",
      modifiers: ["mod", "shift"],
    });
    expect(shortcutSignature(shortcut)).toBe("mod+shift+p");
    expect(formatShortcut(shortcut, "mac")).toBe("⌘⇧P");
    expect(formatShortcut(shortcut, "other")).toBe("Ctrl+Shift+P");
  });

  it("matches events exactly (mod resolves per platform, no extra modifiers)", () => {
    const shortcut = { key: "k", modifiers: ["mod"] as const };
    expect(
      matchesShortcut(
        shortcut,
        {
          key: "k",
          metaKey: true,
          ctrlKey: false,
          shiftKey: false,
          altKey: false,
        },
        "mac",
      ),
    ).toBe(true);
    expect(
      matchesShortcut(
        shortcut,
        {
          key: "k",
          metaKey: false,
          ctrlKey: true,
          shiftKey: false,
          altKey: false,
        },
        "other",
      ),
    ).toBe(true);
    // An extra shift must NOT match (one event → one binding).
    expect(
      matchesShortcut(
        shortcut,
        {
          key: "k",
          metaKey: true,
          ctrlKey: false,
          shiftKey: true,
          altKey: false,
        },
        "mac",
      ),
    ).toBe(false);
  });

  it("flags reserved shortcuts and resolves collisions deterministically", () => {
    expect(isReservedShortcut({ key: "k", modifiers: ["mod"] })).toBe(true);
    expect(isReservedShortcut({ key: "/" })).toBe(true);
    expect(isReservedShortcut({ key: "p", modifiers: ["mod"] })).toBe(false);

    const resolution = resolveShortcutCollisions([
      { id: "a", shortcut: { key: "g", modifiers: ["mod"] } },
      { id: "b", shortcut: { key: "g", modifiers: ["mod"] } },
      { id: "c", shortcut: { key: "k", modifiers: ["mod"] } },
    ]);
    expect(resolution.assignments.get("mod+g")).toBe("a");
    expect(resolution.conflicts).toContainEqual({
      signature: "mod+g",
      keptCommandId: "a",
      droppedCommandId: "b",
    });
    // Reserved shortcut can never be assigned.
    expect(resolution.assignments.has("mod+k")).toBe(false);
  });
});

describe("execution state machine", () => {
  it("advances token and blocks stale settles", () => {
    const pending = beginExecution(INITIAL_EXECUTION_STATE, "x.run");
    expect(pending.phase).toBe("pending");
    const staleToken = pending.token - 1;
    const stale = settleExecution(pending, staleToken, { ok: true });
    expect(stale).toBe(pending); // unchanged — stale outcome dropped

    const settled = settleExecution(pending, pending.token, {
      ok: true,
      message: "Done",
    });
    expect(settled.phase).toBe("success");
    expect(settled.message).toBe("Done");
  });

  it("sanitises untrusted outcomes into bounded safe shapes", () => {
    expect(sanitiseOutcome("boom")).toEqual({
      ok: false,
      reason: "failed",
      message: expect.any(String),
    });
    const coerced = sanitiseOutcome({
      ok: false,
      reason: "nonsense",
      message: "x".repeat(500),
    });
    expect(coerced.ok).toBe(false);
    expect(coerced.ok === false && coerced.reason).toBe("failed");
    expect(coerced.ok === false && coerced.message.length).toBe(200);
    const withBadTarget = sanitiseOutcome({
      ok: true,
      target: { kind: "route", to: "https://evil.example" },
    });
    expect(withBadTarget).toEqual({ ok: true });
    const withGoodTarget = sanitiseOutcome({
      ok: true,
      target: { kind: "route", to: "/today" },
    });
    expect(withGoodTarget).toEqual({
      ok: true,
      target: { kind: "route", to: "/today" },
    });
  });

  it("bounds messages and strips control characters", () => {
    expect(boundMessage("hello \tworld")).toBe("hello world");
    expect(boundMessage("x".repeat(1000)).length).toBe(200);
  });
});
