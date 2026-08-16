/**
 * REDESIGN-04 — the Projects gallery card's META LINE, and the collection's
 * lifecycle count line.
 *
 * `mockup3.png` puts two facts under a Project's bar ("14 tasks · 4 due this
 * week") and a count line under the page title ("8 active · 2 archived"). §5.5
 * allows both only if every figure is TRUE and CHEAP, so these tests hold the
 * honesty half of that rule: what each derivation says, and — more importantly
 * — what it refuses to say.
 */

import { describe, expect, it } from "vitest";

import {
  projectCardMeta,
  type ProjectCardMetaFact,
} from "~/modules/projects/project-view";
import { projectLifecycleCountLabel } from "~/modules/projects/ProjectsCollection";
import type { ProjectHealth } from "~/shared/project-health";

function health(over: Partial<ProjectHealth["summary"]> = {}): ProjectHealth {
  return {
    state: "on_track",
    label: "On track",
    tone: "success",
    reasons: [
      {
        code: "on_track",
        tone: "success",
        summary: "Progressing with no attention signals.",
      },
    ],
    summary: {
      taskTotal: 0,
      taskCompleted: 0,
      openTotal: 0,
      actionableOpen: 0,
      waitingOpen: 0,
      overdueOpen: 0,
      slippedOpen: 0,
      upcomingDueOpen: 0,
      upcomingScheduledOpen: 0,
      longestWaitingDays: null,
      lastActivityIso: null,
      lastActivityDate: null,
      daysSinceActivity: null,
      progressPercent: null,
      ...over,
    },
    evaluatedAtIso: "2026-08-16T00:00:00.000Z",
  };
}

const text = (facts: readonly ProjectCardMetaFact[]) =>
  facts.map((fact) => fact.text);

describe("the Project card's meta line", () => {
  it("states the task total and the due-this-week count, in the reference's order", () => {
    expect(
      text(
        projectCardMeta({
          taskTotal: 14,
          healthVisible: true,
          health: health({ upcomingDueOpen: 4 }),
        }),
      ),
    ).toEqual(["14 tasks", "4 due this week"]);
  });

  it("says nothing about due work when nothing is due — never a zero", () => {
    /*
     * "0 due this week" reads as a warning about the zero. A Project with
     * nothing due this week has nothing to say on that fragment, so it says
     * nothing.
     */
    expect(
      text(
        projectCardMeta({
          taskTotal: 8,
          healthVisible: true,
          health: health(),
        }),
      ),
    ).toEqual(["8 tasks"]);
  });

  it("singularises one task", () => {
    expect(
      text(
        projectCardMeta({
          taskTotal: 1,
          healthVisible: true,
          health: health(),
        }),
      ),
    ).toEqual(["1 task"]);
  });

  it("says a Project with no tasks has none, rather than printing a proportion", () => {
    /*
     * The rule the bar already follows: an empty track at 0% says "nothing
     * done" when the truth is "nothing planned", and the two are different
     * facts. With no tasks there is no proportion and no due count, so the one
     * honest thing left to say is the whole line.
     */
    expect(
      text(
        projectCardMeta({
          taskTotal: 0,
          healthVisible: true,
          health: health(),
        }),
      ),
    ).toEqual(["No tasks yet"]);
  });

  it("tints the due fragment only when the evaluator reports overdue work", () => {
    const tinted = projectCardMeta({
      taskTotal: 14,
      healthVisible: true,
      health: health({ upcomingDueOpen: 4, overdueOpen: 2 }),
    });
    expect(tinted[1]?.tone).toBe("danger");
    // The words are unchanged by the tone: nothing on the card is carried by
    // colour alone (§5.6).
    expect(tinted[1]?.text).toBe("4 due this week");
  });

  it("does not tint a Project whose health is deliberately not evaluated", () => {
    /*
     * The SHARED `healthVisible` rule. A Planned or On-hold Project is not
     * being worked, so tinting its due count would be the product inventing a
     * problem — the same reasoning `projectAttention` branches on.
     */
    const facts = projectCardMeta({
      taskTotal: 14,
      healthVisible: false,
      health: health({ upcomingDueOpen: 4, overdueOpen: 2 }),
    });
    expect(facts[1]?.tone).toBeUndefined();
  });
});

describe("the Projects collection's lifecycle count line", () => {
  /*
   * POLISH-01 — the segments are joined by the SHARED breakdown grammar, whose
   * separator carries a NO-BREAK SPACE before it (`collectionStateBreakdown`).
   * At 393px the plain-space version broke "· 1 archived" onto a second line
   * with the separator orphaned at its start; the non-breaking half is what
   * keeps a separator attached to the segment it follows.
   *
   * The expectations spell the character out rather than pasting an invisible
   * one, so a future edit cannot delete it by accident and still look right.
   */
  const SEP = "\u00a0· ";

  it("reads as the reference draws it", () => {
    expect(
      projectLifecycleCountLabel({ active: 8, completed: 0, archived: 2 }),
    ).toBe(`8\u00a0active${SEP}2\u00a0archived`);
  });

  it("drops a bucket that is empty rather than printing a zero", () => {
    expect(
      projectLifecycleCountLabel({ active: 8, completed: 0, archived: 0 }),
    ).toBe("8\u00a0active");
  });

  it("folds completed in only when there is some", () => {
    expect(
      projectLifecycleCountLabel({ active: 8, completed: 3, archived: 2 }),
    ).toBe(`8\u00a0active${SEP}3\u00a0completed${SEP}2\u00a0archived`);
  });

  it("yields null when the count read failed, so the caller can fall back", () => {
    // Never "0 active" from a failed read: the loaded-row wording is honest
    // about what it knows, and a fabricated zero is not.
    expect(projectLifecycleCountLabel(null)).toBeNull();
  });

  it("yields null for a genuinely empty workspace, so the empty state speaks", () => {
    expect(
      projectLifecycleCountLabel({ active: 0, completed: 0, archived: 0 }),
    ).toBeNull();
  });
});
