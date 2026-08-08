/**
 * X-02 — the URL is the configuration.
 *
 * A saved view and a copied link must mean the same thing, so the codec has to
 * round-trip exactly, refuse anything it does not recognise, and keep defaults out
 * of the address bar. The REVIEW-03 evidence links are checked here too: a link
 * whose label promises "Projects whose health moved" must still DECODE to that
 * configuration, or the Review would be pointing at the wrong question.
 */

import { describe, expect, it } from "vitest";

import { REVIEW_INSIGHT_VIEW_QUERIES } from "~/kernel/review-insights";
import {
  CROSS_VIEW_SYSTEM_VIEWS,
  DEFAULT_CROSS_VIEW_CONFIG,
  crossViewConfigsEqual,
  findCrossViewSystemView,
  parseCrossViewConfig,
  serialiseCrossViewConfig,
} from "~/kernel/views";

import {
  configFromParams,
  isModified,
  paramsFromConfig,
  viewQuery,
} from "~/modules/views/views-url-state";

const decode = (query: string) => configFromParams(new URLSearchParams(query));

describe("cross-module view URL codec", () => {
  it("round-trips a rich configuration", () => {
    const config = parseCrossViewConfig({
      scopes: ["task", "project", "meeting"],
      shared: {
        areaId: "area-1",
        attention: true,
        dueWithin: "overdue",
        archived: "include",
      },
      modules: {
        task: { priority: "p1", waiting: true },
        project: { health: "at_risk", healthMovedSinceLastReview: true },
        meeting: { when: "past" },
      },
      sort: "due",
      direction: "asc",
      groupBy: "none",
    });
    const round = configFromParams(paramsFromConfig(config));
    expect(serialiseCrossViewConfig(round)).toBe(
      serialiseCrossViewConfig(config),
    );
  });

  it("keeps defaults out of the address bar", () => {
    const params = paramsFromConfig(DEFAULT_CROSS_VIEW_CONFIG);
    expect([...params.keys()]).toEqual(["show"]);
    expect(params.get("show")).toBe("task,project");
  });

  it("drops a hand-edited parameter it does not recognise", () => {
    const config = decode("show=task&t.priority=p11&sort=chaos&nonsense=1");
    expect(config.scopes).toEqual(["task"]);
    expect(config.modules.task).toBeUndefined();
    expect(config.sort).toBe(DEFAULT_CROSS_VIEW_CONFIG.sort);
  });

  it("falls back to the default scopes when `show` names nothing real", () => {
    expect(decode("show=elephant").scopes).toEqual(
      DEFAULT_CROSS_VIEW_CONFIG.scopes,
    );
  });

  it("carries the view identity in `viewQuery` without changing the query", () => {
    const attention = CROSS_VIEW_SYSTEM_VIEWS[0];
    const query = viewQuery(attention.id, attention.config);
    const params = new URLSearchParams(query);
    expect(params.get("view")).toBe(attention.id);
    expect(
      crossViewConfigsEqual(configFromParams(params), attention.config),
    ).toBe(true);
  });

  it("reports a modified view only when the query actually differs", () => {
    const stored = CROSS_VIEW_SYSTEM_VIEWS[0].config;
    expect(isModified(stored, stored)).toBe(false);
    expect(isModified({ ...stored, scopes: ["task"] }, stored)).toBe(true);
    expect(isModified(stored, null)).toBe(false);
  });
});

describe("built-in views round-trip through the URL", () => {
  for (const definition of CROSS_VIEW_SYSTEM_VIEWS) {
    it(`${definition.id} survives a URL round trip`, () => {
      const decoded = configFromParams(paramsFromConfig(definition.config));
      expect(serialiseCrossViewConfig(decoded)).toBe(
        serialiseCrossViewConfig(definition.config),
      );
      expect(findCrossViewSystemView(definition.id)).toBe(definition);
    });
  }
});

describe("REVIEW-03 evidence links point where their labels say", () => {
  it("the attention link opens the built-in Needs attention view", () => {
    const attention = findCrossViewSystemView("attention");
    expect(attention).not.toBeNull();
    expect(
      crossViewConfigsEqual(
        decode(REVIEW_INSIGHT_VIEW_QUERIES.attention),
        attention!.config,
      ),
    ).toBe(true);
  });

  it("the health-movement link asks exactly for moved Projects", () => {
    const config = decode(REVIEW_INSIGHT_VIEW_QUERIES.healthMoved);
    expect(config.scopes).toEqual(["project"]);
    expect(config.modules.project).toEqual({
      healthMovedSinceLastReview: true,
    });
  });

  it("the changed-since link uses the Review boundary, not a date window", () => {
    const config = decode(REVIEW_INSIGHT_VIEW_QUERIES.changedSinceReview);
    expect(config.shared.changedSince).toBe("last_review");
    expect(config.shared.updatedWithin).toBeUndefined();
    expect(config.scopes).toEqual([
      "task",
      "project",
      "goal",
      "note",
      "meeting",
    ]);
  });
});
