/**
 * HELP-01 — the Help content contract.
 *
 * Help is only useful if it is trustworthy, so these tests are about honesty and
 * navigability rather than prose: every topic the milestone requires is present,
 * ids are unique and stable (empty states deep-link to them), deep links are
 * validated rather than trusted, and the content does not leak implementation
 * language at the owner.
 */

import { describe, expect, it } from "vitest";

import {
  HELP_SECTIONS,
  HELP_TOPICS,
  resolveHelpTopicId,
} from "~/modules/help/help-content";
import { LINKABLE_HELP_TOPICS, helpTopicHref } from "~/shared/help";

/** The subjects the milestone requires Help to cover, by topic id. */
const REQUIRED_TOPICS = [
  "what-is-dalyhub",
  "spine",
  "today",
  "tasks",
  "scheduled-vs-due",
  "priority",
  "time-sectors",
  "recurrence",
  "inbox",
  "projects",
  "areas-goals",
  "meetings",
  "people",
  "diary",
  "notes",
  "assets",
  "reviews",
  "review-inbox",
  "search",
  "command-palette",
  // UX-01 — `?` now shows the keyboard reference on every screen, so Help must
  // say so; before UX-01 it only worked on Today and Help documented neither.
  "keyboard",
  "mobile",
  "archive-delete",
  "themes",
  "privacy",
  "not-yet",
];

describe("HELP-01 coverage", () => {
  it("covers every subject this milestone requires", () => {
    const ids = new Set(HELP_TOPICS.map((topic) => topic.id));
    for (const required of REQUIRED_TOPICS) {
      expect(ids.has(required), `Help has no "${required}" topic`).toBe(true);
    }
  });

  it("gives every topic a heading, a one-sentence lead and a body", () => {
    for (const topic of HELP_TOPICS) {
      expect(topic.title.length, topic.id).toBeGreaterThan(0);
      expect(topic.lead.length, topic.id).toBeGreaterThan(0);
      expect(topic.blocks.length, topic.id).toBeGreaterThan(0);
      for (const block of topic.blocks) {
        if (block.kind === "list") {
          expect(block.items.length, topic.id).toBeGreaterThan(0);
        } else {
          expect(block.text.length, topic.id).toBeGreaterThan(0);
        }
      }
    }
  });

  it("keeps topic ids unique, so a deep link is unambiguous", () => {
    expect(new Set(HELP_TOPICS.map((t) => t.id)).size).toBe(HELP_TOPICS.length);
    expect(new Set(HELP_SECTIONS.map((s) => s.id)).size).toBe(
      HELP_SECTIONS.length,
    );
  });

  it("uses ids that are safe in a URL fragment and a query value", () => {
    for (const topic of HELP_TOPICS) {
      expect(topic.id, topic.id).toMatch(/^[a-z][a-z0-9-]*$/);
    }
  });
});

describe("HELP-01 honesty", () => {
  it("describes the three appearance choices, and names no theme", () => {
    // APPEARANCE-01 — DalyHub has one light appearance and one dark one, and the
    // owner picks System / Light / Dark over that pair (ADR-075). Help must name
    // all three, say where the setting lives, and still name no PALETTE — M3-01
    // retired those and they are not coming back (ADR-074).
    const themes = HELP_TOPICS.find((t) => t.id === "themes");
    const text = JSON.stringify(themes);
    for (const required of [
      "System",
      "Light",
      "Dark",
      "follows your phone or computer",
      "account menu",
      "Settings",
    ]) {
      expect(text, `Help no longer mentions "${required}"`).toContain(required);
    }
    for (const retired of [
      "Daly Light",
      "Daly Dark",
      "Modern Light",
      "Modern Dark",
      "Eucalypt",
      "Coastal",
      "Ember",
      "Match system",
    ]) {
      expect(text, `Help still names the retired "${retired}"`).not.toContain(
        retired,
      );
    }
  });

  it("states plainly what is deliberately not built", () => {
    const notYet = HELP_TOPICS.find((t) => t.id === "not-yet");
    const text = JSON.stringify(notYet);
    // The weather decision in particular must be visible to the owner, not just
    // recorded in the roadmap.
    for (const subject of ["Weather", "AI", "Notifications", "Import"]) {
      expect(text, `"${subject}" is not named as missing`).toContain(subject);
    }
    // X-04 shipped export and SET-02 shipped restore, so "backup and restore"
    // has LEFT this list. What has not shipped is a restore point the owner can
    // reach without doing anything, and that distinction is what this assertion
    // protects: being able to restore a file you hold is not the same as being
    // backed up.
    expect(text).not.toContain("cannot read one back in");
    expect(text).toContain(
      "A backup you can restore from without doing anything",
    );
    expect(text).toContain("not a restore point you can reach from inside");
    // AUDIT-FIX-05 — the entry said "DalyHub does not keep copies for you or
    // take one on a schedule", which the nightly encrypted production D1 export
    // contradicts. Help now names that copy and says what it is NOT.
    expect(text).not.toContain("does not keep copies for you");
    expect(text).toContain("nightly encrypted copy");
  });

  it("does not deny a feature it documents two topics earlier", () => {
    // AUDIT-FIX-05 — the "not here yet" list carried "There is no AI in DalyHub
    // yet" for the whole of the AI programme, directly below Help's own "AI
    // assistance" topic; and it offered a choice of five themes in a product
    // that has had no theme feature since M3-01. A help page that documents a
    // feature the product does not have is worse than no help page, and the
    // reverse — denying one it does have, on the same page — is worse still.
    const notYet = JSON.stringify(HELP_TOPICS.find((t) => t.id === "not-yet"));
    expect(notYet).not.toContain("There is no AI in DalyHub yet");
    expect(notYet).not.toContain("choose from the five");
    expect(
      HELP_TOPICS.some((t) => t.id === "ai"),
      "Help documents AI assistance, so the not-yet list must not deny it",
    ).toBe(true);
  });

  it("documents the export, and now the restore that reads it back", () => {
    const exportTopic = HELP_TOPICS.find((t) => t.id === "export");
    expect(exportTopic, "Help has no export topic").toBeDefined();
    const text = JSON.stringify(exportTopic);

    // Both downloads are named in the owner's words.
    expect(text).toContain("Download full DalyHub export");
    expect(text).toContain("Download Obsidian vault");
    // The two honesty claims X-04 owes the owner.
    expect(text).toContain("archived or deleted");
    expect(text).toContain("never sends it anywhere");
    // SET-02: the export IS the backup format, and Help says how to use it —
    // including the one consequence the owner must understand before they do.
    expect(text).toContain("also your backup");
    expect(text).toContain("Restore");
    expect(text).toContain("changes nothing until you confirm");
    expect(text).toContain("restoring replaces them");
  });

  it("avoids developer-only implementation language", () => {
    const text = JSON.stringify(HELP_SECTIONS);
    for (const jargon of [
      "kernel",
      "EntityLink",
      "ADR-",
      "loader",
      "workspace_id",
      "D1",
      "React",
    ]) {
      expect(
        text,
        `Help uses implementation language: "${jargon}"`,
      ).not.toContain(jargon);
    }
  });
});

describe("HELP-01 deep links", () => {
  it("resolves a real topic", () => {
    expect(resolveHelpTopicId("priority")).toBe("priority");
  });

  it("rejects anything that is not a topic, rather than trusting the URL", () => {
    expect(resolveHelpTopicId("does-not-exist")).toBeNull();
    expect(resolveHelpTopicId("")).toBeNull();
    expect(resolveHelpTopicId(null)).toBeNull();
    expect(resolveHelpTopicId(42)).toBeNull();
    expect(resolveHelpTopicId("<script>")).toBeNull();
  });

  it("builds a link an empty state can point at", () => {
    expect(helpTopicHref("inbox")).toBe("/help?topic=inbox");
  });

  it("resolves every topic other surfaces are allowed to link to", () => {
    // The closed list in `app/shared/help` is what stops a module importing Help's
    // internals to build a URL. If a topic is renamed without updating that list,
    // the link would silently rot — this is what catches it.
    const ids = new Set(HELP_TOPICS.map((topic) => topic.id));
    for (const topic of LINKABLE_HELP_TOPICS) {
      expect(
        ids.has(topic),
        `linkable topic "${topic}" is not a Help topic`,
      ).toBe(true);
      expect(resolveHelpTopicId(topic)).toBe(topic);
    }
  });
});
