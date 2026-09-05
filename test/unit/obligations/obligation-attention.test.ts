/**
 * V2.10 LIFE-03 — the Today attention projection and its deduplication rule.
 *
 * The rule decides whether Today states the same job twice: an OPEN linked Task
 * wins, the obligation is suppressed, and the suppressed count is reported so
 * nothing vanishes silently.
 *
 * These assertions moved from `test/unit/assets/asset-history-view.test.ts`
 * with the domain. What is new is the row that could not exist before: an
 * obligation about NOTHING, which is the ordinary case for a tax return and was
 * filtered out of Today entirely until this item.
 */

import { describe, expect, it } from "vitest";

import { dedupeAttention, type AttentionInput } from "~/kernel/obligations";

const item = (
  id: string,
  overrides: Partial<AttentionInput> = {},
): AttentionInput => ({
  obligationId: id,
  title: `Obligation ${id}`,
  subject: { id: `asset-${id}`, type: "asset", title: `Asset ${id}` },
  category: "registration",
  state: "due",
  text: "Due in 9 days",
  hasOpenTask: false,
  ...overrides,
});

describe("dedupeAttention — the Today rule", () => {
  it("shows obligations with no linked Task", () => {
    const result = dedupeAttention([item("a"), item("b")]);
    expect(result.items).toHaveLength(2);
    expect(result.trackedAsTasksCount).toBe(0);
  });

  it("suppresses an obligation whose OPEN linked Task already carries it", () => {
    const result = dedupeAttention([
      item("a"),
      item("b", { hasOpenTask: true }),
    ]);
    expect(result.items.map((i) => i.obligationId)).toEqual(["a"]);
    // Suppressed, but STATED — nothing vanishes silently.
    expect(result.trackedAsTasksCount).toBe(1);
  });

  it("brings the obligation back the moment its Task is closed", () => {
    const withOpenTask = dedupeAttention([item("a", { hasOpenTask: true })]);
    expect(withOpenTask.items).toHaveLength(0);
    // Exactly the "you ticked the task, now record what happened" moment (§7).
    const afterTaskDone = dedupeAttention([item("a", { hasOpenTask: false })]);
    expect(afterTaskDone.items).toHaveLength(1);
  });

  it("orders overdue first, then due, then everything else", () => {
    const result = dedupeAttention([
      item("upcoming", { state: "upcoming" }),
      item("due", { state: "due" }),
      item("unknown", { state: "unknown" }),
      item("overdue", { state: "overdue" }),
    ]);
    expect(result.items.map((i) => i.obligationId)).toEqual([
      "overdue",
      "due",
      "unknown",
      "upcoming",
    ]);
  });

  /*
   * The cap is on the ROWS, not on the count. Today says "N obligations need
   * attention" from `visibleCount`, and the daily digest states the same
   * number — so reading `items.length` instead would tell an owner with twelve
   * obligations that five need attention, which is the one figure they act on.
   */
  it("counts every visible obligation, not the five it draws", () => {
    const many = Array.from({ length: 12 }, (_, index) =>
      item(`o${index}`, { state: "due" }),
    );
    const result = dedupeAttention([
      ...many,
      item("tracked", { hasOpenTask: true }),
    ]);
    expect(result.items).toHaveLength(5);
    expect(result.visibleCount).toBe(12);
    expect(result.trackedAsTasksCount).toBe(1);
  });

  it("caps the rows Today shows — it previews, it never lists", () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      item(`o${index}`, { state: "overdue" }),
    );
    const result = dedupeAttention(many);
    expect(result.items).toHaveLength(5);
    // The overdue COUNT still reflects everything, not just what is shown.
    expect(result.overdueCount).toBe(20);
  });

  it("labels each row with its state word and links to the OBLIGATION", () => {
    const result = dedupeAttention([item("a", { state: "overdue" })]);
    expect(result.items[0].stateLabel).toBe("Overdue");
    expect(result.items[0].categoryLabel).toBe("Registration renewal");
    /*
     * The obligation's own record, not the Asset tab it used to point at. That
     * is where the completion form is — and a row about nothing at all could
     * not have had the old destination in any case.
     */
    expect(result.items[0].href).toBe("/obligations/a");
  });

  it("counts overdue over VISIBLE items only, so a tracked one is not double-counted", () => {
    const result = dedupeAttention([
      item("a", { state: "overdue" }),
      item("b", { state: "overdue", hasOpenTask: true }),
    ]);
    expect(result.overdueCount).toBe(1);
    expect(result.trackedAsTasksCount).toBe(1);
  });
});

describe("an obligation about nothing", () => {
  /*
   * The row V2.10 exists for. Before LIFE-03 the projection REQUIRED an Asset
   * id, an Asset title and an Asset type, so Today's read filtered every
   * subject-less obligation out before it could reach the rail.
   */
  it("reaches Today with no subject at all, and keeps its own name", () => {
    const result = dedupeAttention([
      item("tax", {
        title: "Lodge the tax return",
        subject: null,
        category: "tax",
        state: "overdue",
      }),
    ]);
    expect(result.items).toEqual([
      {
        obligationId: "tax",
        title: "Lodge the tax return",
        subject: null,
        categoryLabel: "Tax or lodgement",
        state: "overdue",
        stateLabel: "Overdue",
        text: "Due in 9 days",
        href: "/obligations/tax",
      },
    ]);
  });

  it("ranks beside a subject's obligation rather than behind it", () => {
    const result = dedupeAttention([
      item("rego", { state: "due" }),
      item("passport", { subject: null, state: "overdue" }),
    ]);
    // Urgency decides the order. Having a subject is not a claim to the top.
    expect(result.items.map((i) => i.obligationId)).toEqual([
      "passport",
      "rego",
    ]);
  });

  it("escapes an id that would otherwise break its own href", () => {
    const result = dedupeAttention([item("a b/c")]);
    expect(result.items[0].href).toBe("/obligations/a%20b%2Fc");
  });
});
