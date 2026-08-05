import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type {
  MeetingExtractionResult,
  ActionExtractionResult,
} from "~/kernel/ai";
import { AiExtractionReview } from "~/shared/ai/AiExtractionReview";
import {
  acceptancePayload,
  draftsFromExtraction,
  noteDraftsFromExtraction,
  notePurposeLabel,
  type NoteDraft,
  type TaskDraft,
} from "~/shared/ai/ai-view";

/**
 * AI-02 — the proposal review surface.
 *
 * This is where the product's governing rule is either true or it isn't:
 *
 *   nothing here has happened to DalyHub yet, the owner opts each item IN, and
 *   what is submitted is the owner's edited values — never the model's.
 *
 * So these are behaviour tests, not render tests. Every one of them asks a
 * question the owner would ask: is anything ticked for me? if I change the
 * words, are MY words what gets saved? if I accept a Task, does a note I never
 * ticked come along with it?
 */

const CITATIONS = [
  {
    id: "evidence_01",
    kind: "meeting",
    title: "Weekly sync — notes",
    date: "2026-08-04",
    href: "/meetings/m1",
    excerpt: "We agreed to ship on Friday.",
  },
];

function meetingResult(
  over: Partial<MeetingExtractionResult> = {},
): MeetingExtractionResult {
  return {
    kind: "meeting_extraction",
    summary: "We agreed the schedule.",
    decisions: [],
    proposedTasks: [
      {
        title: "Send the draft to Vaughn",
        description: null,
        dueDate: "2026-08-10",
        scheduledDate: null,
        dateBasis: "explicit",
        suggestedProjectId: null,
        suggestedOwnerPersonId: null,
        evidenceIds: ["evidence_01"],
        confidence: "medium",
      },
    ],
    proposedNotes: [
      {
        title: "Decisions from the sync",
        body: "We agreed to ship on Friday.",
        purpose: "decision_record",
        evidenceIds: ["evidence_01"],
        confidence: "high",
      },
    ],
    unresolvedQuestions: [],
    suggestedLinks: [],
    ...over,
  };
}

function noteResult(): ActionExtractionResult {
  return {
    kind: "action_extraction",
    summary: "A note about the migration.",
    decisions: [],
    proposedTasks: [
      {
        title: "Draft the migration plan",
        description: null,
        dueDate: null,
        scheduledDate: null,
        dateBasis: "none",
        suggestedProjectId: null,
        suggestedOwnerPersonId: null,
        evidenceIds: ["evidence_01"],
        confidence: "low",
      },
    ],
    unresolvedQuestions: [],
    suggestedLinks: [],
  };
}

function renderReview(
  result: MeetingExtractionResult | ActionExtractionResult,
  onAccept = vi.fn(),
) {
  const onReject = vi.fn();
  render(
    <AiExtractionReview
      result={result}
      citations={CITATIONS}
      sourceEntityId="m1"
      projectOptions={[{ id: "project-1", title: "Atlas" }]}
      linkOptions={[]}
      busy={false}
      onAccept={onAccept}
      onReject={onReject}
    />,
  );
  return { onAccept, onReject };
}

describe("AI-02 review surface — proposed Notes", () => {
  it("shows a Proposed Notes section for a Meeting proposal", () => {
    renderReview(meetingResult());
    expect(
      screen.getByRole("heading", { name: "Proposed Notes" }),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Decisions from the sync")).toBeVisible();
    expect(
      screen.getByDisplayValue("We agreed to ship on Friday."),
    ).toBeVisible();
  });

  it("shows NO Proposed Notes section for a Note proposal", () => {
    // Note extraction extracts actions from a Note. It never proposes Notes, so
    // the section is absent rather than empty.
    renderReview(noteResult());
    expect(
      screen.queryByRole("heading", { name: "Proposed Notes" }),
    ).toBeNull();
    expect(
      screen.getByRole("heading", { name: "Proposed Tasks" }),
    ).toBeInTheDocument();
  });

  it("preselects NOTHING — not a Task, not a Note", () => {
    renderReview(meetingResult());
    for (const box of screen.getAllByRole("checkbox")) {
      expect(box).not.toBeChecked();
    }
    // And the primary action says so rather than offering to add anything.
    expect(
      screen.getByRole("button", { name: "Select what to add" }),
    ).toBeDisabled();
  });

  it("labels every field, so the surface is operable without sight", () => {
    renderReview(meetingResult());
    expect(
      screen.getByRole("checkbox", { name: "Add this Note" }),
    ).toBeVisible();
    const notes = screen
      .getByRole("heading", { name: "Proposed Notes" })
      .closest("section") as HTMLElement;
    expect(within(notes).getByLabelText("Title")).toBeVisible();
    expect(within(notes).getByLabelText("Note")).toBeVisible();
    // The purpose is stated in words, not conveyed by styling alone.
    expect(within(notes).getByText(/Decision record/)).toBeVisible();
    expect(within(notes).getByText(/Confidence: high/)).toBeVisible();
  });

  it("cites the evidence a proposed Note was drawn from", () => {
    renderReview(meetingResult());
    expect(screen.getAllByText("Weekly sync — notes").length).toBeGreaterThan(
      0,
    );
  });

  it("sends the owner’s EDITED title and body, not the model’s", () => {
    const { onAccept } = renderReview(meetingResult());

    const notes = screen
      .getByRole("heading", { name: "Proposed Notes" })
      .closest("section") as HTMLElement;
    const title = within(notes).getByLabelText("Title");
    const body = within(notes).getByLabelText("Note");

    fireEvent.change(title, { target: { value: "Friday release decision" } });
    fireEvent.change(body, {
      target: { value: "Ship Friday. Vaughn owns the notes." },
    });
    fireEvent.click(screen.getByRole("checkbox", { name: "Add this Note" }));
    fireEvent.click(screen.getByRole("button", { name: /^Add 1 selected$/ }));

    expect(onAccept).toHaveBeenCalledTimes(1);
    const items = onAccept.mock.calls[0][0] as Record<string, unknown>[];
    expect(items).toEqual([
      {
        kind: "note",
        title: "Friday release decision",
        body: "Ship Friday. Vaughn owns the notes.",
      },
    ]);
  });

  it("does NOT save a Note just because a Task beside it was accepted", () => {
    const { onAccept } = renderReview(meetingResult());

    fireEvent.click(screen.getByRole("checkbox", { name: "Add this Task" }));
    fireEvent.click(screen.getByRole("button", { name: /^Add 1 selected$/ }));

    const items = onAccept.mock.calls[0][0] as Record<string, unknown>[];
    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe("task");
    expect(items.some((item) => item.kind === "note")).toBe(false);
  });

  it("removes one proposed Note without touching the others", () => {
    const result = meetingResult({
      proposedNotes: [
        {
          title: "Keep me",
          body: "Kept.",
          purpose: "meeting_summary",
          evidenceIds: ["evidence_01"],
          confidence: "high",
        },
        {
          title: "Discard me",
          body: "Discarded.",
          purpose: "open_questions",
          evidenceIds: ["evidence_01"],
          confidence: "low",
        },
      ],
    });
    renderReview(result);

    const notes = screen
      .getByRole("heading", { name: "Proposed Notes" })
      .closest("section") as HTMLElement;
    const rows = Array.from(
      notes.querySelectorAll<HTMLElement>(".dh-ai-review__proposal"),
    );
    expect(rows).toHaveLength(2);
    fireEvent.click(
      within(rows[1]).getByRole("button", { name: "Remove this suggestion" }),
    );

    expect(screen.queryByDisplayValue("Discard me")).toBeNull();
    expect(screen.getByDisplayValue("Keep me")).toBeVisible();
  });

  it("still offers rejecting the WHOLE proposal, with nothing selected", () => {
    const { onReject } = renderReview(meetingResult());
    const reject = screen.getByRole("button", {
      name: "Reject the whole proposal",
    });
    expect(reject).toBeEnabled();
    expect(onReject).not.toHaveBeenCalled();
  });

  it("has no hidden Accept-all path", () => {
    renderReview(meetingResult());
    for (const pattern of [/accept all/i, /add all/i, /apply all/i]) {
      expect(screen.queryByRole("button", { name: pattern })).toBeNull();
    }
  });

  it("bounds the editable title and body at DalyHub’s own ceilings", () => {
    renderReview(meetingResult());
    const notes = screen
      .getByRole("heading", { name: "Proposed Notes" })
      .closest("section") as HTMLElement;
    expect(within(notes).getByLabelText("Title")).toHaveAttribute(
      "maxlength",
      "120",
    );
    expect(within(notes).getByLabelText("Note")).toHaveAttribute(
      "maxlength",
      "4000",
    );
  });
});

describe("AI-02 acceptance payload", () => {
  const taskDraft = (over: Partial<TaskDraft> = {}): TaskDraft => ({
    index: 0,
    selected: false,
    title: "Send the draft",
    dueDate: "",
    scheduledDate: "",
    projectId: "",
    dateBasis: "none",
    confidence: "medium",
    evidenceIds: ["evidence_01"],
    suggestedOwnerPersonId: null,
    ...over,
  });

  const noteDraft = (over: Partial<NoteDraft> = {}): NoteDraft => ({
    index: 0,
    selected: false,
    title: "Decisions",
    body: "We agreed.",
    purpose: "decision_record",
    confidence: "high",
    evidenceIds: ["evidence_01"],
    ...over,
  });

  it("carries NOTHING when nothing is selected", () => {
    expect(acceptancePayload([taskDraft()], [noteDraft()], [], "m1")).toEqual(
      [],
    );
  });

  it("carries only the selected items", () => {
    const items = acceptancePayload(
      [taskDraft({ selected: true }), taskDraft({ index: 1, title: "Nope" })],
      [
        noteDraft({ index: 0 }),
        noteDraft({ index: 1, selected: true, title: "Yes" }),
      ],
      [{ selected: true, targetEntityId: "project-1" }],
      "m1",
    );
    expect(items).toEqual([
      {
        kind: "task",
        title: "Send the draft",
        dueDate: null,
        scheduledDate: null,
        projectId: null,
      },
      { kind: "note", title: "Yes", body: "We agreed." },
      { kind: "link", sourceEntityId: "m1", targetEntityId: "project-1" },
    ]);
  });

  it("never carries a workspace, owner, record type or storage instruction", () => {
    const items = acceptancePayload(
      [taskDraft({ selected: true })],
      [noteDraft({ selected: true })],
      [],
      "m1",
    );
    const keys = new Set(items.flatMap((item) => Object.keys(item)));
    for (const forbidden of [
      "workspaceId",
      "ownerId",
      "sourceType",
      "linkType",
      "noteId",
      "store",
      "actor",
    ]) {
      expect(keys.has(forbidden)).toBe(false);
    }
  });
});

describe("AI-02 draft construction", () => {
  it("selects no proposal by default, for either kind", () => {
    const result = meetingResult();
    expect(draftsFromExtraction(result).every((d) => !d.selected)).toBe(true);
    expect(noteDraftsFromExtraction(result).every((d) => !d.selected)).toBe(
      true,
    );
  });

  it("produces no Note drafts from a Note extraction", () => {
    expect(noteDraftsFromExtraction(noteResult())).toEqual([]);
  });

  it("starts each Note draft from the model’s values verbatim", () => {
    const [draft] = noteDraftsFromExtraction(meetingResult());
    expect(draft).toMatchObject({
      index: 0,
      selected: false,
      title: "Decisions from the sync",
      body: "We agreed to ship on Friday.",
      purpose: "decision_record",
      confidence: "high",
    });
  });

  it("names every purpose in plain words", () => {
    expect(notePurposeLabel("meeting_summary")).toBe("Meeting summary");
    expect(notePurposeLabel("decision_record")).toBe("Decision record");
    expect(notePurposeLabel("open_questions")).toBe("Open questions");
    expect(notePurposeLabel("general_note")).toBe("Note");
  });
});
