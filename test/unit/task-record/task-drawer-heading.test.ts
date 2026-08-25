/**
 * DEBT-130 — a Task hosted in the Drawer publishes its type ONCE.
 *
 * The shell's header rendered "Task" as the dialog's label and "Task record" as
 * its `aria-describedby` description, above a `RecordLayout` whose title is
 * preceded by the shared task `EntityIcon`. So the first 100px of the panel said
 * the same word three times before the task's own name appeared — and a screen
 * reader read a label and a description carrying the same information.
 *
 * Twelve hosts wrote that pair out independently, which is why it survived: no
 * single place decided what a Task drawer's heading is. This is a SOURCE
 * inventory over those hosts, for the reason `whole-document-autosave.test.ts`
 * gives for its own — the regression is a THIRTEENTH host, and no runtime test
 * can fail for a host nobody has written yet.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { describe, expect, it } from "vitest";

import { TASK_DRAWER_TITLE } from "~/shared/task-record/TaskRecordDrawer";

const MODULES = join(process.cwd(), "app", "modules");

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      tsxFiles(full, out);
      continue;
    }
    if (full.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * The two hosts that title the drawer with the TASK'S OWN NAME.
 *
 * Named rather than pattern-matched, because they are the shape this entry
 * wants everywhere and the exemption is what says so: there the description
 * genuinely carries the type, because the title does not. Anywhere else, a
 * description that restates the label is the defect.
 */
const TITLED_BY_THE_RECORD = [
  "app/modules/plan/PlanDrawer.tsx",
  "app/modules/today/TodayDrawer.tsx",
];

function repoPath(file: string): string {
  return relative(process.cwd(), file).split("\\").join("/");
}

describe("DEBT-130 — the Task drawer's heading", () => {
  it("is one shared constant, not a literal at every host", () => {
    const offenders = tsxFiles(MODULES)
      .filter((file) => /title:\s*"Task"/.test(readFileSync(file, "utf8")))
      .map(repoPath);
    expect(
      offenders,
      "these hosts write the Task drawer's title as a literal instead of " +
        "importing `TASK_DRAWER_TITLE`, which is how twelve of them came to " +
        "disagree with two others about what the heading is (DEBT-130):\n" +
        offenders.join("\n"),
    ).toEqual([]);
    // The constant is the word the header publishes; if this ever stops being
    // the type's name the assertion above stops meaning anything.
    expect(TASK_DRAWER_TITLE).toBe("Task");
  });

  it("does not repeat the type as the dialog's description", () => {
    const offenders = tsxFiles(MODULES)
      .filter((file) => !TITLED_BY_THE_RECORD.includes(repoPath(file)))
      .filter((file) =>
        /description:\s*"Task record"/.test(readFileSync(file, "utf8")),
      )
      .map(repoPath);
    expect(
      offenders,
      "a Task drawer whose LABEL is already the type must not also describe " +
        "itself as one — `aria-describedby` then carries no information a " +
        "screen reader has not just been given (DEBT-130):\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  it("keeps the description exactly where it still carries the type", () => {
    /*
     * The exemption is checked, not assumed. If Plan or Today ever stops
     * titling its drawer with the record's own name, the description becomes a
     * repetition again — and this fails rather than silently permitting it.
     */
    for (const path of TITLED_BY_THE_RECORD) {
      const source = readFileSync(join(process.cwd(), path), "utf8");
      expect(
        source,
        `${path} no longer titles the drawer with the task's own name`,
      ).toMatch(/\?\?\s*TASK_DRAWER_TITLE/);
      expect(
        source,
        `${path} lost the description that carries the type`,
      ).toMatch(/description:\s*"Task record"/);
    }
  });
});
