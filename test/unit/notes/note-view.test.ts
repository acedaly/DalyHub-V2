/**
 * NOTES-01B — the Notes view-model (pure, React-free).
 *
 * `NoteDetailsRepository` deliberately does not compute a combined "last
 * updated" moment (NOTES_PERSISTENCE.md's content-timestamp contract) — this
 * proves the one small derivation the UI owns instead.
 */

import { describe, expect, it } from "vitest";

import { effectiveNoteUpdatedAt } from "~/modules/notes/note-view";

describe("effectiveNoteUpdatedAt", () => {
  it("reports the entity's own updatedAt when content has never been saved", () => {
    expect(effectiveNoteUpdatedAt("2026-07-20T10:00:00.000Z", null)).toBe(
      "2026-07-20T10:00:00.000Z",
    );
  });

  it("reports the later content-save timestamp when it postdates a rename", () => {
    expect(
      effectiveNoteUpdatedAt(
        "2026-07-20T10:00:00.000Z",
        "2026-07-21T09:00:00.000Z",
      ),
    ).toBe("2026-07-21T09:00:00.000Z");
  });

  it("reports the entity's own updatedAt when a rename postdates the last content save", () => {
    expect(
      effectiveNoteUpdatedAt(
        "2026-07-22T10:00:00.000Z",
        "2026-07-21T09:00:00.000Z",
      ),
    ).toBe("2026-07-22T10:00:00.000Z");
  });
});
