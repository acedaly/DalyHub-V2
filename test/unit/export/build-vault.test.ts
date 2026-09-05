/**
 * X-04 — the Obsidian vault generator.
 *
 * The properties under test are the ones a person would notice if they broke:
 * every record has a file, the owner's Markdown is untouched, every internal
 * link either lands on a real file or is reported, deleted and archived records
 * are present and honest, and two exports of the same data are identical.
 */

import { describe, expect, it } from "vitest";

import {
  buildObsidianVault,
  describeRecurrence,
  VAULT_META_FOLDER,
  type VaultFile,
} from "~/platform/export";

import { IDS, LINKED_NOTE_BODY, makeSnapshot } from "./snapshot-fixture";

const vault = buildObsidianVault(makeSnapshot());

function file(pathFragment: string): VaultFile {
  const match = vault.files.find((entry) => entry.path.includes(pathFragment));
  if (!match) {
    throw new Error(
      `No vault file matching ${pathFragment}. Have: ${vault.files
        .map((entry) => entry.path)
        .join(", ")}`,
    );
  }
  return match;
}

/** Extract every Markdown link destination from a document. */
function linkDestinations(contents: string): string[] {
  const out: string[] = [];
  for (const match of contents.matchAll(/\]\((<[^>]+>|[^)\s]+)\)/g)) {
    const raw = match[1] ?? "";
    out.push(raw.startsWith("<") ? raw.slice(1, -1) : raw);
  }
  return out;
}

/** Resolve a relative link from a file's own path to a vault path. */
function resolveFrom(fromPath: string, destination: string): string {
  const segments = fromPath.split("/").slice(0, -1);
  for (const part of destination.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") segments.pop();
    else segments.push(part);
  }
  return segments.join("/");
}

describe("vault structure", () => {
  it("writes one file per exported record, in the right folder", () => {
    const paths = vault.files.map((entry) => entry.path);
    expect(paths).toContain("Areas/Health.md");
    expect(paths).toContain("Goals/Run a half marathon.md");
    expect(paths).toContain("Projects/12-week training block.md");
    expect(paths).toContain("Tasks/Monday- 5km easy run.md");
    expect(paths).toContain("Diary/2026-07-01 Morning reflection.md");
    expect(paths).toContain("Meetings/Coaching catch-up.md");
    expect(paths).toContain("People/Jamie Rivers.md");
    expect(paths).toContain("Assets/Road bike.md");
    expect(paths).toContain("Reviews/Week 27 review.md");
    // A record whose type this build does not know still gets a file.
    expect(paths).toContain("Other/A type this build does not know.md");
  });

  it("writes the vault-level files", () => {
    const paths = vault.files.map((entry) => entry.path);
    expect(paths).toContain("Home.md");
    expect(paths).toContain(`${VAULT_META_FOLDER}/Export Information.md`);
    expect(paths).toContain(`${VAULT_META_FOLDER}/Settings.md`);
    expect(paths).toContain(`${VAULT_META_FOLDER}/Unresolved Links.md`);
    expect(paths.some((path) => path.startsWith("Activity/"))).toBe(true);
  });

  it("groups Activity chronologically by month and links its subjects", () => {
    const activity = file("Activity/2026-07.md");
    expect(activity.contents).toContain("# Activity — 2026-07");
    expect(activity.contents).toContain("Meeting held");
    // Subjects are links to the records the event is about.
    expect(activity.contents).toContain("Coaching catch-up");
    expect(activity.contents).toContain("Jamie Rivers");
  });

  it("has no duplicate or case-colliding paths", () => {
    const lower = vault.files.map((entry) => entry.path.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });

  it("is deterministic — the same snapshot produces identical files", () => {
    const again = buildObsidianVault(makeSnapshot());
    expect(again.files).toEqual(vault.files);
  });
});

describe("frontmatter", () => {
  it("carries identity, lifecycle, timestamps and parents", () => {
    const task = file("Tasks/Monday- 5km easy run.md");
    expect(task.contents).toContain(`dalyhub_id: "${IDS.task}"`);
    expect(task.contents).toContain('dalyhub_type: "task"');
    expect(task.contents).toContain('lifecycle: "completed"');
    expect(task.contents).toContain('priority: "p2"');
    expect(task.contents).toContain('due: "2026-07-06"');
    expect(task.contents).toContain('parent_project: "12-week training block"');
    expect(task.contents).toContain(`parent_project_id: "${IDS.project}"`);
    expect(task.contents).toContain("dalyhub_export_schema_version: 2");
  });

  it("carries recurrence for a recurring task", () => {
    const task = file("Tasks/Weekly long run.md");
    expect(task.contents).toContain(
      'recurrence: "Every week on sun (scheduled date)"',
    );
    expect(task.contents).toContain('recurrence_series_id: "series-long-run"');
    expect(task.contents).toContain("recurrence_sequence: 3");
  });

  it("carries tags as a quoted flow sequence", () => {
    expect(file("Notes/Knowledge hub.md").contents).toContain(
      'tags: ["index", "knowledge"]',
    );
  });

  it("carries a TASK's tags, which have no detail column to live in", () => {
    /*
     * Found in review on PR #238. FIND-03 gave Tasks tags in the structured
     * snapshot, but the vault writer built Task files from `taskDetails` alone —
     * which has no `tags` column, because a tag is an attachment now. So a
     * tagged Task restored perfectly from the JSON and showed nothing at all in
     * the readable copy. The vault reads the tag collections directly.
     */
    expect(file("Tasks/").contents).toContain('tags: ["running"]');
  });

  it("still carries tags from an archive written BEFORE the migration", () => {
    // A legacy archive has no tag collections and keeps its tags on the record
    // rows. Stripping them must not empty `tags:` on every Note, Person and
    // Asset in the vault it builds.
    const base = makeSnapshot();
    const legacy = buildObsidianVault({
      ...base,
      records: { ...base.records, workspaceTags: [], entityTags: [] },
    });
    const note = legacy.files.find(
      (entry) => entry.path === "Notes/Knowledge hub.md",
    );
    expect(note?.contents).toContain('tags: ["index", "knowledge"]');
  });

  it("carries the linked record ids", () => {
    const project = file("Projects/12-week training block.md");
    expect(project.contents).toMatch(
      /linked_ids: \[.*e-08-note-duplicate-a.*\]/,
    );
  });
});

describe("readability", () => {
  it("separates frontmatter and body with exactly one blank line", () => {
    for (const entry of vault.files) {
      if (!entry.contents.startsWith("---\n")) continue;
      const end = entry.contents.indexOf("\n---\n");
      const after = entry.contents.slice(end + "\n---\n".length);
      expect(after.startsWith("\n\n"), `${entry.path} has a double gap`).toBe(
        false,
      );
      expect(after.startsWith("\n"), `${entry.path} has no gap`).toBe(true);
    }
  });

  it("does not repeat a title the note body already carries as its own H1", () => {
    // The fixture note's body opens with `# Knowledge hub`, matching its title.
    const note = file("Notes/Knowledge hub.md");
    const headings = [...note.contents.matchAll(/^# .*/gm)].map((m) => m[0]);
    expect(headings).toEqual(["# Knowledge hub"]);
  });

  it("keeps both when the body's first heading says something different", () => {
    const built = buildObsidianVault(
      makeSnapshot({
        records: {
          ...makeSnapshot().records,
          noteDetails: makeSnapshot().records.noteDetails.map((note) =>
            note.entityId === IDS.noteLinks
              ? { ...note, content: "# A different heading\n\nBody.\n" }
              : note,
          ),
        },
      }),
    );
    const note = built.files.find((f) => f.path === "Notes/Knowledge hub.md")!;
    expect(note.contents).toContain("# Knowledge hub");
    expect(note.contents).toContain("# A different heading");
  });

  it("emits parent fields only for records that can have a parent", () => {
    // An Area is a root: `parent_project: null` on it would be noise, not data.
    expect(file("Areas/Health.md").contents).not.toContain("parent_area");
    expect(file("Notes/Knowledge hub.md").contents).not.toContain(
      "parent_goal",
    );
    // A Task can have one, so it carries the fields — including explicit nulls.
    const task = file("Tasks/Monday- 5km easy run.md");
    expect(task.contents).toContain('parent_project: "12-week training block"');
    expect(task.contents).toContain("parent_area: null");
  });

  /*
   * V2.10 LIFE-01 — an obligation is a record of its own, so its recurrence is
   * read on its own page and the Asset links to it. Two renderings of one thing
   * is how a vault comes to disagree with the workspace it came from.
   */
  it("reads an obligation's recurrence as English, on its own page", () => {
    expect(file("Life Admin/Next service.md").contents).toContain(
      "every 6 months",
    );
  });

  it("links an Asset to its obligations rather than restating them", () => {
    const asset = file("Assets/Road bike.md").contents;
    expect(asset).toContain("## Obligations");
    expect(asset).toContain("Next service");
    expect(asset).toContain("due 2026-08-01");
  });

  it("writes the expected amount on the obligation, and nowhere else", () => {
    const obligation = file("Life Admin/Next service.md").contents;
    expect(obligation).toContain("Expected");
    expect(file("Assets/Road bike.md").contents).not.toContain("240.00");
  });
});

describe("lifecycle honesty", () => {
  it("includes a soft-deleted record, marked in frontmatter and in the body", () => {
    const deleted = file("Notes/Deleted note.md");
    expect(deleted.contents).toContain('lifecycle: "deleted"');
    expect(deleted.contents).toContain("Deleted in DalyHub");
    // The body is still there — an export that drops content is not a backup.
    expect(deleted.contents).toContain("Deleted body.");
  });

  it("includes an archived record, marked", () => {
    const archived = file("Notes/Put away.md");
    expect(archived.contents).toContain('lifecycle: "archived"');
    expect(archived.contents).toContain("Archived in DalyHub");
  });

  it("marks a completed record", () => {
    expect(file("Tasks/Monday- 5km easy run.md").contents).toContain(
      "Completed in DalyHub",
    );
  });
});

describe("Markdown preservation", () => {
  it("emits a note body byte-for-byte apart from internal links", () => {
    const note = file("Notes/Knowledge hub.md");
    // The code fence — which contains link-like text — is untouched.
    expect(note.contents).toContain(
      "```md\n[[Not a link]] and [nor this](dalyhub://note/e-08-note-duplicate-a)\n```",
    );
    // Trailing significant whitespace survives.
    expect(note.contents).toContain("Trailing text.  ");
    // Nothing was rendered to HTML.
    expect(note.contents).not.toContain("<p>");
    expect(note.contents).not.toContain("<a href");
  });

  it("rewrites a wiki link into a working relative path", () => {
    const note = file("Notes/Knowledge hub.md");
    expect(note.contents).toContain(
      "[12-week training block](<../Projects/12-week training block.md>)",
    );
  });

  it("rewrites a dalyhub:// record link into a working relative path", () => {
    const note = file("Notes/Knowledge hub.md");
    expect(note.contents).toContain(
      "[the half](<../Goals/Run a half marathon.md>)",
    );
  });

  it("resolves a record link to a DELETED record, because the file exists", () => {
    const note = file("Notes/Knowledge hub.md");
    expect(note.contents).toContain("[gone](<./Deleted note.md>)");
  });

  it("marks a record link whose target was never exported", () => {
    const note = file("Notes/Knowledge hub.md");
    expect(note.contents).toContain("missing *(unresolved DalyHub link)*");
  });

  it("marks a wiki link that matches no title", () => {
    const note = file("Notes/Knowledge hub.md");
    expect(note.contents).toContain(
      "No such record *(unresolved DalyHub link)*",
    );
  });

  it("never leaves DalyHub-only syntax in an exported body", () => {
    const note = file("Notes/Knowledge hub.md");
    const body = note.contents.slice(note.contents.indexOf("# Knowledge hub"));
    // The only surviving occurrences are inside the fenced code sample.
    const outsideFence = body
      .split("```md")[0]!
      .concat(body.split("```").slice(2).join("```"));
    expect(outsideFence).not.toContain("[[");
    expect(outsideFence).not.toContain("dalyhub://");
    // The source note really did contain both forms.
    expect(LINKED_NOTE_BODY).toContain("[[");
    expect(LINKED_NOTE_BODY).toContain("dalyhub://");
  });
});

describe("filename collisions", () => {
  it("disambiguates duplicate and case-colliding titles with a stable suffix", () => {
    const paths = vault.files
      .map((entry) => entry.path)
      .filter((path) => path.toLowerCase().includes("training notes"));
    expect(paths).toHaveLength(3);
    expect(new Set(paths.map((p) => p.toLowerCase())).size).toBe(3);
    for (const path of paths) {
      expect(path).toMatch(/\([a-z0-9]{6}\)\.md$/);
    }
  });

  it("gives an unusable title a readable fallback name", () => {
    expect(vault.files.map((entry) => entry.path)).toContain(
      "Notes/Untitled.md",
    );
  });

  it("keeps a Unicode title readable", () => {
    expect(vault.files.map((entry) => entry.path)).toContain(
      "Notes/Café résumé — 日本語 🌱.md",
    );
  });

  it("bounds a very long title", () => {
    const long = vault.files.find((entry) =>
      entry.path.startsWith("Notes/Reading list very"),
    );
    expect(long).toBeDefined();
    expect(long!.path.length).toBeLessThan(120);
  });
});

describe("link integrity", () => {
  it("every internal link resolves to a file in the vault", () => {
    const known = new Set(vault.files.map((entry) => entry.path));
    const broken: string[] = [];
    for (const entry of vault.files) {
      for (const destination of linkDestinations(entry.contents)) {
        // External and absolute destinations are not vault links.
        if (/^[a-z][a-z0-9+.-]*:/i.test(destination)) continue;
        const resolved = resolveFrom(entry.path, destination);
        if (!known.has(resolved)) broken.push(`${entry.path} → ${destination}`);
      }
    }
    expect(broken).toEqual([]);
  });

  it("every unresolved link is reported in the report file", () => {
    const report = file(`${VAULT_META_FOLDER}/Unresolved Links.md`);
    expect(vault.unresolved.length).toBeGreaterThan(0);
    for (const link of vault.unresolved) {
      expect(report.contents).toContain(link.reference);
      expect(report.contents).toContain(link.sourcePath);
    }
    expect(report.contents).toContain(
      `unresolved_count: ${vault.unresolved.length}`,
    );
  });

  it("reports zero unresolved links honestly when there are none", () => {
    const clean = buildObsidianVault(
      makeSnapshot({
        records: {
          ...makeSnapshot().records,
          noteDetails: makeSnapshot().records.noteDetails.map((note) =>
            note.entityId === IDS.noteLinks
              ? { ...note, content: "No links here.\n" }
              : note,
          ),
          taskDetails: makeSnapshot().records.taskDetails.map((task) => ({
            ...task,
            description: null,
          })),
          meetingDetails: makeSnapshot().records.meetingDetails.map(
            (meeting) => ({ ...meeting, notesMarkdown: "" }),
          ),
          reviewSections: makeSnapshot().records.reviewSections.map(
            (section) => ({ ...section, bodyMarkdown: "" }),
          ),
        },
      }),
    );
    expect(clean.unresolved).toEqual([]);
    const report = clean.files.find((entry) =>
      entry.path.endsWith("Unresolved Links.md"),
    )!;
    expect(report.contents).toContain("Every internal DalyHub link");
  });
});

describe("module presentation", () => {
  it("shows an Area's goals, projects and tasks", () => {
    const area = file("Areas/Health.md");
    expect(area.contents).toContain("## Goals");
    expect(area.contents).toContain("Run a half marathon");
    expect(area.contents).toContain("## Projects");
    expect(area.contents).toContain("12-week training block");
    expect(area.contents).toContain("## Tasks held directly in this area");
    expect(area.contents).toContain("Weekly long run");
  });

  it("shows a Goal's definition of done and aligned projects", () => {
    const goal = file("Goals/Run a half marathon.md");
    expect(goal.contents).toContain("Finish under two hours.");
    expect(goal.contents).toContain("## Aligned projects");
    expect(goal.contents).toContain(
      "Aligned projects completed:** 0 of 1 (counted from the records in this export)",
    );
  });

  it("shows a Project's status and tasks", () => {
    const project = file("Projects/12-week training block.md");
    expect(project.contents).toContain("**Status:** Active");
    expect(project.contents).toContain("## Tasks");
    expect(project.contents).toContain("Monday- 5km easy run");
  });

  it("shows a Meeting's attendees, agenda, decisions, actions and follow-ups", () => {
    const meeting = file("Meetings/Coaching catch-up.md");
    expect(meeting.contents).toContain("## Attendees");
    expect(meeting.contents).toContain("Jamie Rivers");
    expect(meeting.contents).toContain("## Decisions");
    expect(meeting.contents).toContain("Move the long run to Sunday.");
    expect(meeting.contents).toContain("## Actions");
    expect(meeting.contents).toContain("Book a gait analysis.");
    expect(meeting.contents).toContain("## Follow-up tasks");
    expect(meeting.contents).toContain('held_at: "');
  });

  it("shows a Person's contact details, relationship and interactions", () => {
    const person = file("People/Jamie Rivers.md");
    expect(person.contents).toContain("**Email:** jamie@example.test");
    expect(person.contents).toContain("**Pronouns:** they/them");
    expect(person.contents).toContain("**Stay in touch every:** monthly");
    expect(person.contents).toContain("## Interactions");
    expect(person.contents).toContain("Meeting held");
  });

  it("shows an Asset's details, obligations, history and recorded cost", () => {
    const asset = file("Assets/Road bike.md");
    expect(asset.contents).toContain("**Purchase price:** 4500.00 AUD");
    expect(asset.contents).toContain("**Current meter:** 4200 km");
    expect(asset.contents).toContain("## Obligations");
    expect(asset.contents).toContain("Next service");
    expect(asset.contents).toContain("## History");
    expect(asset.contents).toContain("Annual service");
    expect(asset.contents).toContain("**Recorded costs:** 180.00 AUD");
  });

  it("shows a Review's period, status, responses and source records", () => {
    const review = file("Reviews/Week 27 review.md");
    expect(review.contents).toContain("**Period:** 2026-06-29 → 2026-07-05");
    expect(review.contents).toContain("### Summary overall");
    expect(review.contents).toContain("A steady week.");
    // An unanswered prompt says so rather than being omitted.
    expect(review.contents).toContain("_No response recorded._");
    expect(review.contents).toContain("## Source records");
  });

  it("files Diary entries under their own calendar day, so the folder is chronological", () => {
    const paths = vault.files
      .map((entry) => entry.path)
      .filter((path) => path.startsWith("Diary/"));
    expect(paths).toHaveLength(1);
    for (const path of paths) {
      expect(path).toMatch(/^Diary\/\d{4}-\d{2}-\d{2} /);
    }
  });

  it("shows a Diary entry's occurrence time and type", () => {
    const diary = file("Diary/2026-07-01 Morning reflection.md");
    expect(diary.contents).toContain("**Type:** Reflection");
    expect(diary.contents).toContain("**Timezone:** Australia/Sydney");
    expect(diary.contents).toContain("Slept badly, ran anyway.");
  });

  it("shows a Note's outgoing links and backlinks", () => {
    const note = file("Notes/Knowledge hub.md");
    expect(note.contents).toContain("## Outgoing links");
    expect(note.contents).toContain("## Backlinks");
  });

  it("shows owner preferences in the meta folder, with no credentials", () => {
    const settings = file(`${VAULT_META_FOLDER}/Settings.md`);
    expect(settings.contents).toContain("**Timezone:** Australia/Sydney");
    expect(settings.contents).toContain("This week");
    expect(settings.contents).toContain(
      "No credential, token or session value",
    );
  });

  it("states the consistency guarantee honestly in Export Information", () => {
    const info = file(`${VAULT_META_FOLDER}/Export Information.md`);
    expect(info.contents).toContain("not** an atomic point-in-time snapshot");
    expect(info.contents).toContain("## Record counts");
  });

  it("does not fabricate a summary or an insight", () => {
    for (const entry of vault.files) {
      expect(entry.contents).not.toMatch(/AI summary|Suggested|Insight:/i);
    }
  });
});

describe("describeRecurrence", () => {
  const base = {
    entityId: "t1",
    dateKind: "due",
    frequency: "day",
    interval: 1,
    weekdays: null,
    anchorDay: null,
    anchorMonth: null,
    mode: "fixed",
    seriesAnchorDate: null,
    ordinal: null,
    weekendRule: "allow",
    endsAfterCount: null,
    endsOnDate: null,
    seriesId: "s",
    sequence: 0,
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-07-01T00:00:00.000Z",
  };

  it("reads a rule back in words without projecting a future date", () => {
    expect(describeRecurrence(base)).toBe("Every day (due date)");
    expect(describeRecurrence({ ...base, interval: 3 })).toBe(
      "Every 3 days (due date)",
    );
    expect(
      describeRecurrence({ ...base, frequency: "month", anchorDay: 15 }),
    ).toBe("Every month on day 15 (due date)");
    expect(
      describeRecurrence({
        ...base,
        frequency: "year",
        anchorDay: 4,
        anchorMonth: 3,
      }),
    ).toBe("Every year on 4/3 (due date)");
    expect(describeRecurrence({ ...base, frequency: "weekday" })).toBe(
      "Every weekday (due date)",
    );
  });
});

describe("IDENT-01 — activity lines name a person, never an Access subject", () => {
  const activityFiles = (
    files: readonly { path: string; contents: string }[],
  ) => files.filter((file) => file.path.startsWith("Activity/"));

  it("never writes the raw actor id, with or without a resolver", () => {
    const built = buildObsidianVault(makeSnapshot());
    for (const file of built.files) {
      expect(file.contents, file.path).not.toContain("owner-subject");
    }
    // Unresolvable actors are named honestly; system activity says System.
    const activity = activityFiles(built.files)
      .map((f) => f.contents)
      .join("\n");
    expect(activity).toContain("Unknown user");
    expect(activity).toContain("System");
    expect(activity).not.toContain("Someone");
  });

  it("uses the resolved display name when the route supplies the directory", () => {
    const built = buildObsidianVault(makeSnapshot(), {
      resolveActorName: (actorType, actorId) =>
        actorType === "user" && actorId === "owner-subject"
          ? "Aidan Daly"
          : "System",
    });
    const activity = activityFiles(built.files)
      .map((f) => f.contents)
      .join("\n");
    expect(activity).toContain("(Aidan Daly)");
    expect(activity).not.toContain("owner-subject");

    // A record's inline "Recent activity" excerpt uses the same names.
    const record = built.files.find((file) =>
      file.contents.includes("## Recent activity"),
    );
    expect(record).toBeDefined();
    expect(record!.contents).not.toContain("owner-subject");
  });
});
