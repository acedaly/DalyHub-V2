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

  it("keeps Areas on quiet rows by default while retaining optional gallery", () => {
    const source = read("app", "modules", "areas", "AreasCollection.tsx");
    expect(source).toContain('presentation = "list"');
    expect(source).toContain("<EntityRow");
    expect(source).toContain("<EntityCard");
  });
});

describe("DHDS-05 — metric and chart framing", () => {
  it("uses the same progress and chart primitives across spine and reporting", () => {
    expect(read("app", "modules", "projects", "ProjectsTable.tsx")).toContain(
      "<ProgressTrack",
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
