/**
 * V2.14 — the deterministic half survives the failure, on EVERY grounded
 * surface.
 *
 * The route assembles a `FactBlock` before it contacts a provider and returns
 * it on the failure envelope, precisely so that a timeout, a refusal, an
 * exhausted budget or an answer DalyHub would not verify still leaves the owner
 * with the figures. A surface that renders the calm sentence and drops the
 * block throws that away, and does it silently — nothing crashes, nothing logs,
 * the page just quietly knows less than the server told it.
 *
 * These are behaviour tests over a real failure: `fetch` answers the way the
 * route answers, the owner presses the button, and the question asked is the
 * owner's — *the explanation didn't work, so where are my figures?*
 */

import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";

import type { FactBlock } from "~/kernel/ai";
import { AiWeeklyReviewSurface } from "~/shared/ai/AiWeeklyReviewSurface";

const BLOCK: FactBlock = {
  id: "abc123",
  intent: "weekly_review",
  question: "How did this period go?",
  subject: "This period",
  period: {
    startIso: "2026-08-31",
    endIso: "2026-09-06",
    label: "31 August – 6 September",
  },
  facts: [
    {
      id: "F1",
      label: "Tasks completed in the period",
      value: { kind: "count", count: 14 },
      display: "14",
      period: null,
      reference: null,
      note: null,
    },
    {
      id: "F2",
      label: "Projects with no visible next action",
      value: { kind: "count", count: 2 },
      display: "2",
      period: null,
      reference: null,
      note: null,
    },
  ],
  bounds: [
    { code: "bounded", text: "This reads the Review's own period and no other." },
  ],
  currencies: [],
  categories: ["general"],
  truncated: false,
  consideredCount: 2,
};

const AVAILABLE = {
  enabled: true,
  providerConfigured: true,
  featureAllowed: true,
  budgetExhausted: false,
};

function respondWith(payload: unknown, status = 409) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Promise.resolve(
        new Response(JSON.stringify(payload), {
          status,
          headers: { "content-type": "application/json" },
        }),
      ),
    ),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the Weekly Review assistant keeps this period's figures when the explanation fails", () => {
  it("renders the calm sentence AND the facts the route returned", async () => {
    respondWith({
      ok: false,
      code: "provider_timeout",
      message: "The AI provider took too long to answer. Nothing was changed.",
      facts: BLOCK,
    });

    render(
      <AiWeeklyReviewSurface
        reviewId="r1"
        availability={AVAILABLE}
        onAccept={() => {}}
      />,
    );
    screen.getByRole("button", { name: /Generate assistant summary/i }).click();

    await waitFor(() => {
      expect(screen.getByText(/took too long to answer/i)).toBeTruthy();
    });
    /*
     * The figures, not merely a container: the owner came for "how did this
     * period go", and a count of completed Tasks answers a real part of that
     * whether or not a model ever spoke.
     */
    const facts = screen.getByRole("region", { name: "Facts" });
    expect(facts.textContent).toContain("Tasks completed in the period");
    expect(facts.textContent).toContain("14");
    expect(facts.textContent).toContain("Projects with no visible next action");
    expect(facts.textContent).toContain(
      "This reads the Review's own period and no other.",
    );
  });

  it("says nothing extra when the failure carried no facts", async () => {
    /*
     * A refusal that happened before any facts existed -- AI off, an unknown
     * feature -- must not render an empty "Facts" region with nothing in it.
     * An empty disclosure is worse than none: it implies DalyHub looked and
     * found nothing, when it never looked.
     */
    respondWith({
      ok: false,
      code: "ai_disabled",
      message: "AI is turned off.",
    });

    render(
      <AiWeeklyReviewSurface
        reviewId="r1"
        availability={AVAILABLE}
        onAccept={() => {}}
      />,
    );
    screen.getByRole("button", { name: /Generate assistant summary/i }).click();

    await waitFor(() => {
      expect(screen.getByText(/AI is turned off/i)).toBeTruthy();
    });
    expect(screen.queryByRole("region", { name: "Facts" })).toBeNull();
  });
});
