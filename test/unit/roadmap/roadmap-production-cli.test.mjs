import { describe, expect, it } from "vitest";

import {
  buildWranglerConfig,
  parseRoadmap,
} from "../../../scripts/roadmap-production.mjs";

const ROADMAP_FIXTURE = `# Roadmap

## Phase 4 — Areas & Goals (\`AREA\`)

### ☑ AREA-03 — Alignment view
- **Purpose.** Completed work.
- **Dependencies.** AREA-02.
- **Expected outcome.** Alignment exists. **P2.**

### ☐ AREA-04 — Mobile
- **Purpose.** Mobile-complete Areas & Goals.
- **Dependencies.** DS-11, AREA-01.
- **Expected outcome.** Areas/Goals usable on a phone. **P3.**

## Phase 5 — Notes (\`NOTES\`)

### ◐ NOTES-01 — Note record & Markdown editor
- **Purpose.** Notes as first-class Markdown records.
- **Dependencies.** FND-08, DS-02, DS-06.
- **Expected outcome.** Create/edit/read Markdown notes. **P1.**

### ⊘ NOTES-99 — Deferred experiment
- **Purpose.** Deliberately deferred.
- **Dependencies.** None.
- **Expected outcome.** No production task. **P3.**
`;

describe("roadmap production CLI", () => {
  it("derives only outstanding items from the current roadmap status markers", () => {
    const parsed = parseRoadmap(ROADMAP_FIXTURE);

    expect(parsed.openItems).toEqual([
      expect.objectContaining({
        id: "AREA-04",
        title: "Mobile",
        operationalBucket: "Current / Next",
        priority: "P3",
      }),
      expect.objectContaining({
        id: "NOTES-01",
        title: "Note record & Markdown editor",
        operationalBucket: "Current / Next",
        priority: "P1",
      }),
    ]);
    expect(parsed.completedIds).toEqual(["AREA-03"]);
    expect(parsed.openItems.map((item) => item.id)).not.toContain("NOTES-99");
  });

  it("builds a production-only remote D1 runner without a deploy route", () => {
    const config = buildWranglerConfig({
      databaseId: "11111111-1111-4111-8111-111111111111",
      workspaceId: "22222222-2222-4222-8222-222222222222",
      runToken: "secret-run-token",
    });

    expect(config.name).toBe("dalyhub-v2-roadmap-production-runner");
    expect(config.main).toBe("scripts/roadmap-production-worker.ts");
    expect(config.vars).toEqual({
      DEFAULT_WORKSPACE_ID: "22222222-2222-4222-8222-222222222222",
      ROADMAP_RUN_TOKEN: "secret-run-token",
      ROADMAP_TARGET: "production",
    });
    expect(config.d1_databases).toEqual([
      expect.objectContaining({
        binding: "DB",
        database_name: "dalyhub-v2",
        database_id: "11111111-1111-4111-8111-111111111111",
        remote: true,
      }),
    ]);
    expect(config).not.toHaveProperty("routes");
  });
});
