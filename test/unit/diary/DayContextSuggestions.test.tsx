import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DayContextSuggestions } from "~/modules/diary/DayContextSuggestions";
import { FeedbackProvider } from "~/shared/feedback";
import type { DayContextResponse } from "~/modules/diary/routes/day-context";

/**
 * DIARY-02 — "From this day" as behaviour.
 *
 * The invariant under test is the one that protects DalyHub's relationship model:
 * a same-day record is a SUGGESTION until the reader says otherwise. So the tests
 * assert what the surface must NOT do (write anything on render, or present a
 * candidate as though it were already linked) at least as hard as what it does.
 */

function jsonResponse(data: DayContextResponse): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

function renderSuggestions(onLinked = vi.fn()) {
  render(
    <FeedbackProvider>
      <DayContextSuggestions entryId="entry-1" onLinked={onLinked} />
    </FeedbackProvider>,
  );
  return { onLinked };
}

const twoCandidates: DayContextResponse = {
  dayKey: "2026-05-20",
  candidates: [
    {
      id: "meeting-1",
      type: "meeting",
      title: "Team Catch up",
      detail: "09:30",
    },
    {
      id: "task-1",
      type: "task",
      title: "Submit training brief",
      detail: "Due this day",
    },
  ],
};

afterEach(() => vi.unstubAllGlobals());

describe("Diary day-context suggestions", () => {
  it("renders nothing at all when the day held nothing", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ dayKey: "2026-05-20", candidates: [] }),
        ),
    );
    const { container } = render(
      <FeedbackProvider>
        <DayContextSuggestions entryId="entry-1" />
      </FeedbackProvider>,
    );

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(screen.queryByText("From this day")).toBeNull();
    // A quiet day must not grow an empty panel under the entry.
    expect(container.querySelector(".dh-day-context")).toBeNull();
  });

  it("labels candidates as suggestions in TEXT, not by colour alone", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse(twoCandidates)),
    );
    renderSuggestions();

    expect(await screen.findByText("From this day")).toBeInTheDocument();
    expect(
      screen.getByText(
        "These happened on the same day. Nothing is linked until you choose it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Meeting · 09:30 · Suggested/)).toBeInTheDocument();
    expect(
      screen.getByText(/Task · Due this day · Suggested/),
    ).toBeInTheDocument();
  });

  it("writes NOTHING merely by being rendered", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(twoCandidates));
    vi.stubGlobal("fetch", fetchMock);
    renderSuggestions();

    await screen.findByText("From this day");
    // Exactly one request, and it is the read. No date-derived link is written.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/diary/entry-1/day-context");
    for (const [, init] of fetchMock.mock.calls as [string, RequestInit?][]) {
      expect(init?.method ?? "GET").toBe("GET");
    }
  });

  it("turns a suggestion into a real relationship only when Link is pressed", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(twoCandidates))
      .mockResolvedValue(
        new Response(JSON.stringify({ intent: "link", ok: true }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { onLinked } = renderSuggestions();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Link Team Catch up to this diary entry",
      }),
    );

    await waitFor(() => expect(onLinked).toHaveBeenCalled());
    // It goes through the ONE shared links endpoint — no Diary-only mutation.
    const [url, init] = fetchMock.mock.calls[1] as [string, { body: FormData }];
    expect(url).toBe("/links");
    expect(init.body.get("intent")).toBe("link");
    expect(init.body.get("anchor")).toBe("entry-1");
    expect(init.body.get("targetId")).toBe("meeting-1");

    // It is now persisted, so it leaves the suggestions — the two lists never
    // show the same record.
    await waitFor(() =>
      expect(
        screen.queryByRole("button", {
          name: "Link Team Catch up to this diary entry",
        }),
      ).toBeNull(),
    );
    expect(
      screen.getByRole("button", {
        name: "Link Submit training brief to this diary entry",
      }),
    ).toBeInTheDocument();
  });

  it("keeps the suggestion when linking fails, and says so", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(twoCandidates))
      .mockResolvedValue(
        new Response(
          JSON.stringify({ intent: "link", ok: false, message: "Nope." }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const { onLinked } = renderSuggestions();

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Link Team Catch up to this diary entry",
      }),
    );

    // Announced through the shared feedback surface (live region + toast), so it
    // legitimately appears more than once in the tree.
    expect((await screen.findAllByText("Nope.")).length).toBeGreaterThan(0);
    expect(onLinked).not.toHaveBeenCalled();
    // The offer survives a failure, so a retry is one press rather than a reload.
    expect(
      screen.getByRole("button", {
        name: "Link Team Catch up to this diary entry",
      }),
    ).toBeInTheDocument();
  });

  it("stays silent when the candidates cannot be read", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    renderSuggestions();

    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // An enrichment that cannot be offered is simply not offered; reading a diary
    // entry never becomes an error state because of it.
    expect(screen.queryByText("From this day")).toBeNull();
  });
});
