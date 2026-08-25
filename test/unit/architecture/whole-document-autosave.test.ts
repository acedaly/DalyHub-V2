/**
 * DEBT-174 / ADR-108 — a whole-document autosaving field MUST carry a base
 * version.
 *
 * ── The failure this exists to make impossible ───────────────────────────────
 * Three modules write a whole authored document with a base-version
 * precondition folded into the write: Review sections (REVIEW-02), the Note
 * body (AUDIT-FIX-06) and a Meeting's agenda and notes (HARDEN-06B). Nothing
 * REQUIRED the third to, and for eleven weeks it did not — F-01, a Meeting's
 * notes silently destroyed by a second writer, with no trace and no recovery.
 * ADR-108 states the rule. A stated rule is what the audit found had already
 * failed once; this file is the mechanism.
 *
 * ── Why a SOURCE inventory rather than a runtime assertion ───────────────────
 * The defect is a surface that does not exist yet. No runtime test can fail for
 * a component nobody has written, so the shape that catches the FOURTH surface
 * at the moment it is authored is an inventory over the tree — the same reason
 * `state-layer.test.ts` and `calendar-day.test.ts` are written this way. It is
 * derived, never pinned: a new file that autosaves a document and omits the
 * precondition fails here without anybody remembering to add it to a list.
 *
 * ── What counts as a "whole-document autosaving field" ───────────────────────
 * A component that composes BOTH the shared Markdown writing surface
 * (`LiveMarkdownEditor` or `MarkdownEditorField`) and the shared autosave
 * coordinator (`useAutosaveField`). That pairing is the definition in ADR-108:
 * a whole document, written without an explicit Save, so a second writer's text
 * is what the next debounce overwrites. A markdown field with an explicit
 * Save/Cancel is NOT in scope — it reconciles at its own save, which the Review
 * section editor and the Task Details tab both do.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

const ROOTS = ["app/modules", "app/shared", "app/routes"];

/**
 * The design FIXTURES under `/design/*`, which are out of scope by definition.
 *
 * They demonstrate the control against local state and post to nothing — there
 * is no document, no repository and no second writer, so there is nothing a
 * base version could be checked against. Excluded by PATH rather than by name
 * so a real product route under `app/routes` is still covered; this is the one
 * exemption, and it is narrow on purpose.
 */
const DESIGN_FIXTURE = /^app\/routes\/design-/;

/** The shared writing surface. Either import is the same document contract. */
const MARKDOWN_SURFACE = /\b(LiveMarkdownEditor|MarkdownEditorField)\b/;

/** The shared autosave coordinator. */
const AUTOSAVE = /\buseAutosaveField\b/;

/**
 * The precondition, in any of the three names the product has given it.
 *
 * Named rather than shaped, deliberately: the point of the rule is that the
 * WRITE carries the version the editor loaded, and every existing spelling ends
 * in the loaded stamp. A fourth spelling is fine — add it here, in the same
 * change that introduces it, which is the conversation this test exists to
 * force.
 */
const PRECONDITION = /expected(Content)?UpdatedAt|expectedVersion/;

/** A refusal the surface can actually show the owner, rather than swallow. */
const CONFLICT = /\b409\b|\bconflict\b/i;

function walk(dir: string, out: string[]): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      walk(full, out);
      continue;
    }
    if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

interface Surface {
  readonly file: string;
  readonly source: string;
}

function wholeDocumentAutosavers(): Surface[] {
  const found: Surface[] = [];
  for (const root of ROOTS) {
    for (const file of walk(join(process.cwd(), root), [])) {
      const source = readFileSync(file, "utf8");
      if (!MARKDOWN_SURFACE.test(source)) continue;
      if (!AUTOSAVE.test(source)) continue;
      const path = relative(process.cwd(), file).split("\\").join("/");
      if (DESIGN_FIXTURE.test(path)) continue;
      found.push({ file: path, source });
    }
  }
  return found.sort((a, b) => a.file.localeCompare(b.file));
}

describe("DEBT-174 — every whole-document autosaving field carries a base version", () => {
  const surfaces = wholeDocumentAutosavers();

  it("finds the surfaces the rule is about", () => {
    /*
     * Not a pinned list — a floor. If this drops to zero the two regexes above
     * have stopped matching the product (a rename, a re-export), and every
     * assertion below would pass vacuously. "A passing test that could never
     * fail is not evidence", so the detector is checked before what it detects.
     */
    expect(
      surfaces.map((surface) => surface.file),
      "the detector found no autosaving Markdown surface at all, which means " +
        "it has stopped matching the product rather than that the product is " +
        "clean",
    ).toContain("app/modules/meetings/MeetingMarkdown.tsx");
    expect(surfaces.length).toBeGreaterThanOrEqual(2);
  });

  it.each(wholeDocumentAutosavers().map((surface) => surface.file))(
    "%s sends a base version with every save",
    (file) => {
      const surface = surfaces.find((candidate) => candidate.file === file)!;
      expect(
        PRECONDITION.test(surface.source),
        `${file} autosaves a whole Markdown document and sends no base ` +
          "version, so a second writer's text is what the next debounce " +
          "overwrites — with no trace and no recovery. That is F-01, and " +
          "ADR-108 forbids it. Send the loaded stamp " +
          "(`expectedUpdatedAt` / `expectedContentUpdatedAt`) on every save " +
          "and handle the refusal.",
      ).toBe(true);
    },
  );

  it.each(wholeDocumentAutosavers().map((surface) => surface.file))(
    "%s handles the refusal rather than swallowing it",
    (file) => {
      const surface = surfaces.find((candidate) => candidate.file === file)!;
      /*
       * A precondition nobody reads the answer to is worse than none: the save
       * fails, the draft is discarded as "saved", and the owner is told
       * nothing. Both existing surfaces keep the draft and OFFER the newer
       * stored text; what is asserted here is only that the refusal is
       * reachable in the source at all.
       */
      expect(
        CONFLICT.test(surface.source),
        `${file} sends a base version but never handles the server's refusal, ` +
          "so a rejected save is indistinguishable from a successful one.",
      ).toBe(true);
    },
  );
});

describe("DEBT-174 — the repositories behind them accept the precondition", () => {
  /*
   * The client half can only be honest if the server half can be told. Each of
   * these is the kernel port a whole-document write goes through; a
   * precondition parameter that quietly disappeared would leave every surface
   * above sending a field nobody checks.
   */
  const PORTS: readonly (readonly [string, RegExp])[] = [
    ["app/kernel/notes/note-details.ts", /expectedContentUpdatedAt\?:/],
    ["app/kernel/meetings/meeting.ts", /expectedUpdatedAt\?:/],
    ["app/kernel/reviews/review.ts", /expectedUpdatedAt\?:/],
  ];

  it.each(PORTS)("%s takes a base version", (file, pattern) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    expect(
      pattern.test(source),
      `${file} no longer accepts a base version, so the precondition the ` +
        "editors send cannot be checked (ADR-108, DEBT-174).",
    ).toBe(true);
  });
});
