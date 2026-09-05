/**
 * HARDEN-06B (F-01) — concurrent Meeting saves, and the regression proof that a
 * stale one can no longer destroy newer writing.
 *
 * The original defect, reproduced as the first test here: `update` replaced the
 * whole `agenda_markdown` / `notes_markdown` column with no precondition at all.
 * Two writers on one meeting — a laptop and a phone, two tabs, the phone capture
 * bar and an open Notebook tab — each held the same document, each edited it, and
 * whichever saved second silently replaced the other's paragraphs. Nothing
 * failed, nothing was announced, and the lost text existed NOWHERE: there is no
 * revision history and `meeting.updated` is appended with an empty payload.
 *
 * The fix copies, verbatim, the shape `NoteDetailsRepository.update` has shipped
 * since AUDIT-08: a base-version precondition folded into the same statements as
 * the write, so the check cannot be raced. A save quotes the `detailsUpdatedAt`
 * it was written against, and the write commits only while that is still the
 * stored version. A stale save matches zero rows and is reported as a typed
 * `MeetingConflictError` — never a silent success, never a 500 — with the newer
 * stored text intact.
 *
 * These run against real D1 through both the repository and the actual mutation
 * route, because the route's `409` body is what the editor's conflict UI is
 * built on.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { MEETING_UPDATED, MeetingConflictError } from "~/kernel/meetings";
import { setAuthenticatedSession } from "~/platform/request";
import { action as meetingMutate } from "~/modules/meetings/routes/mutate";

import {
  FakeClock,
  makeActivityRepository,
  makeContext,
  makeMeetingRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const START = "2026-08-20T09:00:00.000Z";
// ONE activity-id generator across every "writer": separate instances writing
// their own sequence would collide on the activities primary key.
const nextActivityId = sequentialIds("meetconc");

function authedContext(): RouterContextProvider {
  const session: AuthenticatedSession = {
    user: {
      subject: "owner-subject",
      email: "owner@example.com",
      displayName: null,
    },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, session);
  return context;
}

/**
 * One writer. Each is its own repository instance, and the clock is advanced per
 * instance so successive writes carry distinct, ordered versions — which is what
 * a base-version precondition needs to be meaningful.
 */
function writer(atIso = "2026-08-20T00:00:00.000Z") {
  return makeMeetingRepository(makeContext(WS), {
    clock: new FakeClock(atIso).now,
    activityIdGenerator: nextActivityId,
  });
}

async function updatedEventCount(meetingId: string): Promise<number> {
  const page = await makeActivityRepository(makeContext(WS)).listForEntity(
    meetingId,
  );
  return page.items.filter((item) => item.type === MEETING_UPDATED).length;
}

async function newMeeting(): Promise<{ id: string; version: string }> {
  const meeting = await writer().create({
    title: "Board sync",
    startsAt: START,
    timezone: "Australia/Sydney",
  });
  return { id: meeting.id, version: meeting.detailsUpdatedAt.toISOString() };
}

async function mutate(
  meetingId: string,
  fields: Record<string, string>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  const response = (await meetingMutate({
    request: new Request(`https://app.test/meeting/${meetingId}/mutate`, {
      method: "POST",
      body,
    }),
    context: authedContext(),
    params: { meetingId },
  } as unknown as Parameters<typeof meetingMutate>[0])) as Response;
  return {
    status: response.status,
    body: (await response.json()) as Record<string, unknown>,
  };
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("HARDEN-06B — the repository refuses a stale Meeting document save", () => {
  it("keeps the newer notes when a second writer saves from a stale base", async () => {
    const meeting = await newMeeting();

    // Both tabs loaded the same (empty) notes.
    const first = await writer("2026-08-20T01:00:00.000Z").update(meeting.id, {
      notesMarkdown: "Ada: the budget is approved.",
      expectedUpdatedAt: meeting.version,
    });
    expect(first.changed).toBe(true);

    // The phone, still holding the version it loaded, saves its whole document.
    await expect(
      writer("2026-08-20T02:00:00.000Z").update(meeting.id, {
        notesMarkdown: "Grace: we ship on Friday.",
        expectedUpdatedAt: meeting.version,
      }),
    ).rejects.toBeInstanceOf(MeetingConflictError);

    // Ada's paragraph is exactly as she left it. Nothing merged, nothing replaced.
    const stored = await writer().get(meeting.id);
    expect(stored?.notesMarkdown).toBe("Ada: the budget is approved.");
    // And the refused save recorded no Activity: one create, one real update.
    expect(await updatedEventCount(meeting.id)).toBe(1);
  });

  it("refuses a stale agenda save without touching the title either", async () => {
    const meeting = await newMeeting();
    await writer("2026-08-20T01:00:00.000Z").update(meeting.id, {
      agendaMarkdown: "1. Budget",
      expectedUpdatedAt: meeting.version,
    });

    await expect(
      writer("2026-08-20T02:00:00.000Z").update(meeting.id, {
        title: "Renamed by the stale tab",
        agendaMarkdown: "1. Something else entirely",
        expectedUpdatedAt: meeting.version,
      }),
    ).rejects.toBeInstanceOf(MeetingConflictError);

    // The title lives in `entities` and the agenda in `meeting_details`. A
    // refused save must change NEITHER — both statements carry the precondition.
    const stored = await writer().get(meeting.id);
    expect(stored?.title).toBe("Board sync");
    expect(stored?.agendaMarkdown).toBe("1. Budget");
  });

  it("lets the stale writer succeed once it refreshes to the current version", async () => {
    const meeting = await newMeeting();
    const winner = await writer("2026-08-20T01:00:00.000Z").update(meeting.id, {
      notesMarkdown: "One.",
      expectedUpdatedAt: meeting.version,
    });
    await expect(
      writer("2026-08-20T02:00:00.000Z").update(meeting.id, {
        notesMarkdown: "Two.",
        expectedUpdatedAt: meeting.version,
      }),
    ).rejects.toBeInstanceOf(MeetingConflictError);

    // Refresh, reconcile, save again — the ordinary recovery.
    const retried = await writer("2026-08-20T03:00:00.000Z").update(
      meeting.id,
      {
        notesMarkdown: "One.\n\nTwo.",
        expectedUpdatedAt: winner.meeting.detailsUpdatedAt.toISOString(),
      },
    );
    expect(retried.changed).toBe(true);
    expect((await writer().get(meeting.id))?.notesMarkdown).toBe(
      "One.\n\nTwo.",
    );
  });

  it("does not conflict when the stale save asks for exactly the stored state", async () => {
    const meeting = await newMeeting();
    await writer("2026-08-20T01:00:00.000Z").update(meeting.id, {
      notesMarkdown: "Agreed text.",
      expectedUpdatedAt: meeting.version,
    });

    // A duplicate submission of the SAME text is idempotent, not a conflict:
    // nobody's writing can be lost by agreeing with what is already stored.
    const again = await writer("2026-08-20T02:00:00.000Z").update(meeting.id, {
      notesMarkdown: "Agreed text.",
      expectedUpdatedAt: meeting.version,
    });
    expect(again.changed).toBe(false);
    expect(again.meeting.notesMarkdown).toBe("Agreed text.");
    expect(await updatedEventCount(meeting.id)).toBe(1);
  });

  it("leaves an unquoted field patch exactly as it was — last-write-wins by omission", async () => {
    const meeting = await newMeeting();
    await writer("2026-08-20T01:00:00.000Z").update(meeting.id, {
      notesMarkdown: "Notes.",
    });
    // No precondition supplied: a field-scoped patch has no whole document to
    // destroy, so `mark_held`, `complete`/`reopen` and the scheduling form keep
    // behaving exactly as they did.
    const later = await writer("2026-08-20T02:00:00.000Z").update(meeting.id, {
      status: "completed",
    });
    expect(later.changed).toBe(true);
    expect(later.meeting.notesMarkdown).toBe("Notes.");
  });

  it("moves detailsUpdatedAt on every write, so the next save quotes a current base", async () => {
    const meeting = await newMeeting();
    const first = await writer("2026-08-20T01:00:00.000Z").update(meeting.id, {
      notesMarkdown: "One.",
      expectedUpdatedAt: meeting.version,
    });
    expect(first.meeting.detailsUpdatedAt.toISOString()).not.toBe(
      meeting.version,
    );
    const second = await writer("2026-08-20T02:00:00.000Z").update(meeting.id, {
      notesMarkdown: "One. Two.",
      expectedUpdatedAt: first.meeting.detailsUpdatedAt.toISOString(),
    });
    expect(second.changed).toBe(true);
  });
});

describe("HARDEN-06B — clearing an authored document to empty", () => {
  it("empties the notes when the owner deletes everything they wrote", async () => {
    const meeting = await newMeeting();
    const written = await writer("2026-08-20T01:00:00.000Z").update(
      meeting.id,
      { notesMarkdown: "Some text." },
    );

    // The route used to coerce an empty submission to `null`, which the merge
    // reads as "not supplied" — so select-all-delete-save reported success and
    // changed nothing, and the old text came back on the next reload.
    const cleared = await mutate(meeting.id, {
      intent: "update",
      notesMarkdown: "",
      expectedUpdatedAt: written.meeting.detailsUpdatedAt.toISOString(),
    });
    expect(cleared.status).toBe(200);
    expect((await writer().get(meeting.id))?.notesMarkdown).toBe("");
  });
});

describe("POST /meeting/:meetingId/mutate — the accepted save's version", () => {
  it("answers with the version the write produced, and accepts a save quoting it", async () => {
    /*
     * The other half of F-01's precondition. Quoting a version is only workable
     * if the writer can learn the version its own write produced; until this
     * was returned, the only source was a loader revalidation, and a second
     * save started before that landed quoted a version its own predecessor had
     * already superseded — refused as a conflict with itself.
     */
    const meeting = await newMeeting();
    const first = await mutate(meeting.id, {
      intent: "update",
      notesMarkdown: "Ada: the budget is approved.",
      expectedUpdatedAt: meeting.version,
    });
    expect(first.status).toBe(200);
    const produced = first.body.detailsUpdatedAt;
    expect(typeof produced).toBe("string");
    // It is the version the write PRODUCED, not the one it was written against.
    expect(produced).not.toBe(meeting.version);

    const second = await mutate(meeting.id, {
      intent: "update",
      notesMarkdown: "Ada: the budget is approved, and dated.",
      expectedUpdatedAt: produced as string,
    });
    expect(second.status).toBe(200);
    expect(second.body.detailsUpdatedAt).not.toBe(produced);

    // Nothing was weakened: the version the SECOND save superseded is still
    // refused, so the precondition is a precondition.
    const refused = await mutate(meeting.id, {
      intent: "update",
      notesMarkdown: "Grace: we ship on Friday.",
      expectedUpdatedAt: produced as string,
    });
    expect(refused.status).toBe(409);
  });
});

describe("POST /meeting/:meetingId/mutate — the refused save's 409", () => {
  it("answers 409 with the newer stored text, and never a 500", async () => {
    const meeting = await newMeeting();
    const first = await mutate(meeting.id, {
      intent: "update",
      notesMarkdown: "Ada: the budget is approved.",
      expectedUpdatedAt: meeting.version,
    });
    expect(first.status).toBe(200);

    const refused = await mutate(meeting.id, {
      intent: "update",
      notesMarkdown: "Grace: we ship on Friday.",
      expectedUpdatedAt: meeting.version,
    });
    expect(refused.status).toBe(409);
    expect(refused.body.conflict).toBe(true);
    expect(refused.body.serverNotesMarkdown).toBe(
      "Ada: the budget is approved.",
    );
    expect(typeof refused.body.detailsUpdatedAt).toBe("string");
    // The response never echoes the submitted draft: that text never left the
    // editor, and the stored text was never touched.
    expect(JSON.stringify(refused.body)).not.toContain("Grace");
  });

  it("refuses an unparseable version rather than degrading to no precondition", async () => {
    const meeting = await newMeeting();
    await mutate(meeting.id, {
      intent: "update",
      notesMarkdown: "Ada's paragraph.",
      expectedUpdatedAt: meeting.version,
    });

    const refused = await mutate(meeting.id, {
      intent: "update",
      notesMarkdown: "Overwritten by a stale client.",
      expectedUpdatedAt: "not-a-version",
    });
    expect(refused.status).toBe(400);
    expect((await writer().get(meeting.id))?.notesMarkdown).toBe(
      "Ada's paragraph.",
    );
  });

  it("still accepts a submission that quotes no version at all", async () => {
    const meeting = await newMeeting();
    const response = await mutate(meeting.id, {
      intent: "update",
      status: "completed",
    });
    expect(response.status).toBe(200);
    expect((await writer().get(meeting.id))?.status).toBe("completed");
  });
});
