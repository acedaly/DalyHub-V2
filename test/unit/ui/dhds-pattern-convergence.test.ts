/**
 * DHDS-03…07 — shared product patterns are shared in fact, not only in docs.
 *
 * These checks hold the architectural boundary at the consumer level. They do
 * not prescribe pixels; they prevent a module from quietly restoring a private
 * panel heading, progress bar, timeline or writing surface after convergence.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (...parts: string[]) => readFileSync(join(root, ...parts), "utf8");

describe("DHDS-03 — contextual surfaces", () => {
  it("uses one heading, body and footer grammar across every panel host", () => {
    for (const file of [
      ["app", "shared", "drawer", "Drawer.tsx"],
      ["app", "shared", "inspector", "Inspector.tsx"],
      ["app", "shared", "sheet", "Sheet.tsx"],
    ]) {
      const source = read(...file);
      expect(source).toContain("<PanelHeading");
      expect(source).toContain("dh-panel-header");
      expect(source).toContain("dh-panel-body");
    }

    const css = read("app", "styles", "ui.css");
    expect(css).toContain(".dh-panel-heading__title");
    expect(css).toContain(".dh-panel-footer");
  });
});

describe("DHDS-04 — gallery items", () => {
  it("keeps recognition-led collections on the shared gallery family", () => {
    const consumers = new Map([
      ["GoalsCollection.tsx", "<EntityCard"],
      ["ProjectsCollection.tsx", "<ProjectCard"],
      ["AssetsCollection.tsx", "<AssetCard"],
    ]);

    for (const [file, component] of consumers) {
      const module = file.replace("Collection.tsx", "").toLowerCase();
      expect(read("app", "modules", module, file)).toContain(component);
    }
  });

  /*
   * UNTITLED-05 — Areas leads with its GALLERY, and its dense reading is the
   * genuine Untitled table rather than a hand-composed row list.
   *
   * UIX-02 put Areas on rows because "an Area card was a Project card with
   * renamed fields" and "the cards were mostly empty". The first stopped being
   * true when Projects got `ProjectCard`; the second stopped being true when
   * Areas got `AreaCard`, built around what an Area actually has. An Area is
   * the record most often reached by recognition rather than by reading, and
   * that is what a gallery is for.
   */
  it("keeps Areas on their own identity-led card, with the table as the dense reading", () => {
    const source = read("app", "modules", "areas", "AreasCollection.tsx");
    expect(source).toContain('presentation = "grid"');
    expect(source).toContain("<AreaCard");
    expect(source).toContain("<AreasTable");
    // Never the generic gallery card Projects was pulled off in UIX-02: the two
    // most different records in the spine are two different objects.
    expect(source).not.toContain("<EntityCard");
  });
});

describe("DHDS-05 — metric and chart framing", () => {
  it("uses the same progress and chart primitives across spine and reporting", () => {
    // UNTITLED-04 — the Projects table draws its measure with the Untitled
    // progress-bar composition (`LabelledProgressBar`, the `ProgressBarBase`
    // geometry plus the accessible name DalyHub requires) rather than the
    // legacy `ProgressTrack`. Still ONE progress primitive per surface family,
    // which is what this test is defending.
    expect(read("app", "modules", "projects", "ProjectsTable.tsx")).toContain(
      "<LabelledProgressBar",
    );
    expect(
      read("app", "modules", "goals", "GoalMeasurementPanel.tsx"),
    ).toContain("<ProgressTrack");
    expect(
      read("app", "modules", "goals", "GoalMeasurementPanel.tsx"),
    ).toContain("<TrendLine");
    expect(
      read("app", "modules", "analytics", "AnalyticsScreen.tsx"),
    ).toContain("<TrendLine");
  });
});

describe("DHDS-06 — timelines", () => {
  it("keeps record history on the shared Timeline across contrasting modules", () => {
    for (const file of [
      ["areas", "AreaActivityTab.tsx"],
      ["assets", "AssetTimelineTab.tsx"],
      ["goals", "GoalActivityTab.tsx"],
      ["habits", "HabitActivityTab.tsx"],
      ["meetings", "MeetingTimelineTab.tsx"],
      ["notes", "NoteActivityTab.tsx"],
      ["people", "PersonTimelineTab.tsx"],
      ["projects", "ProjectActivityTab.tsx"],
      ["reviews", "ReviewTimelineTab.tsx"],
    ]) {
      expect(read("app", "modules", ...file)).toContain("<Timeline");
    }
  });
});

describe("DHDS-07 — editors", () => {
  it("keeps long-form authorship on one Markdown source surface", () => {
    for (const file of [
      ["notes", "NoteContentForm.tsx"],
      ["meetings", "MeetingMarkdown.tsx"],
      ["reviews", "ReviewRecord.tsx"],
    ]) {
      expect(read("app", "modules", ...file)).toContain("<LiveMarkdownEditor");
    }
    for (const file of [
      ["diary", "DiaryCapture.tsx"],
      ["diary", "DiaryDetailsPanel.tsx"],
    ]) {
      expect(read("app", "modules", ...file)).toContain("<MarkdownEditorField");
    }
  });
});
