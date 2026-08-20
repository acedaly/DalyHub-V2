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

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { MEETING_UPDATED, MeetingConflictError } from "~/kernel/meetings";
import { setAuthenticatedSession } from "~/platform/request";
import { createMeetingRepository } from "~/platform/storage/d1";
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

/**
 * HARDEN-06F — a continuous writing session must not conflict with ITSELF.
 *
 * Raised by an automated review of #208 and confirmed here before it was fixed.
 *
 * `useAutosaveField` coalesces edits made while a save is in flight and
 * dispatches the coalesced draft the moment that save RESOLVES. So the second
 * save leaves before any route revalidation can land, and it quotes whatever
 * base version the editor is still holding. If the success response does not
 * carry the version the write just produced, that base is stale by
 * construction — and the owner is shown "Changed elsewhere" for a change THIS
 * editor made, in the ordinary single-writer case.
 *
 * `NoteContentForm` had this right and says why: "keep quoting a current base
 * so a long writing session does not conflict with its own previous save." The
 * Meetings route returned a bare `{ ok: true }`, so there was nothing to keep.
 */
describe("HARDEN-06F — the success response carries the version it produced", () => {
  it("lets a second save quote the version the FIRST response returned", async () => {
    const meeting = await newMeeting();

    const first = await mutate(meeting.id, {
      intent: "update",
      notesMarkdown: "Typing…",
      expectedUpdatedAt: meeting.version,
    });
    expect(first.status).toBe(200);
    // Without this the editor has no current base to quote, and the sentence
    // below is the whole defect: it cannot save again without a round trip it
    // has no way to wait for.
    expect(typeof first.body.detailsUpdatedAt).toBe("string");
    expect(first.body.detailsUpdatedAt).not.toBe(meeting.version);

    const second = await mutate(meeting.id, {
      intent: "update",
      notesMarkdown: "Typing… and still typing.",
      expectedUpdatedAt: String(first.body.detailsUpdatedAt),
    });
    expect(second.status).toBe(200);
    expect((await writer().get(meeting.id))?.notesMarkdown).toBe(
      "Typing… and still typing.",
    );
  });
});

/**
 * HARDEN-06G — the version handed back must be the version THIS write produced.
 *
 * Raised by an automated review of #212 and confirmed here before it was fixed,
 * because HARDEN-06F's own answer created it: `update` reads the meeting back
 * after its batch, and that read is a SEPARATE statement. A second writer that
 * commits in the window between them is read as though it were us.
 *
 * Handing that version to the editor is worse than handing back nothing. The
 * editor advances its base to the other writer's version; its next
 * compare-and-set then passes against a document it never saw; and the other
 * writer's paragraphs are replaced with no conflict, no banner and no trace —
 * exactly the lost update F-01 exists to prevent, reintroduced by the answer to
 * it, and reachable in the ordinary case of typing straight through a save.
 *
 * The interleave below is injected rather than raced, so the window is a fact
 * and not a timing accident: the D1 handle this writer uses runs the OTHER
 * writer's whole save at the moment the read-back begins.
 */
describe("HARDEN-06G — the returned version is this write's, not a later one's", () => {
  /**
   * `env.DB` with one hook: the first read issued AFTER a `batch()` commits runs
   * `during()` to completion first. Statements are unwrapped again before they
   * reach the real `batch`, so D1 only ever sees its own objects.
   */
  function interleavingDb(during: () => Promise<void>): typeof env.DB {
    type Statement = ReturnType<typeof env.DB.prepare>;
    const originals = new WeakMap<Statement, Statement>();
    let armed = false;
    let fired = false;
    const wrap = (statement: Statement): Statement => {
      const proxy = new Proxy(statement, {
        get(target, property) {
          if (property === "bind") {
            return (...args: unknown[]) =>
              wrap((target.bind as (...a: unknown[]) => Statement)(...args));
          }
          const value = Reflect.get(target, property, target);
          if (typeof value !== "function") return value;
          if (
            property === "first" ||
            property === "all" ||
            property === "raw"
          ) {
            return async (...args: unknown[]) => {
              if (armed && !fired) {
                fired = true;
                await during();
              }
              return (value as (...a: unknown[]) => unknown).apply(
                target,
                args,
              );
            };
          }
          return (value as (...a: unknown[]) => unknown).bind(target);
        },
      }) as Statement;
      originals.set(proxy, statement);
      return proxy;
    };
    return new Proxy(env.DB, {
      get(target, property) {
        if (property === "prepare") {
          return (sql: string) => wrap(target.prepare(sql));
        }
        if (property === "batch") {
          return async (statements: Statement[]) => {
            const result = await target.batch(
              statements.map((s) => originals.get(s) ?? s),
            );
            armed = true;
            return result;
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function"
          ? (value as (...a: unknown[]) => unknown).bind(target)
          : value;
      },
    }) as typeof env.DB;
  }

  it("refuses the next save instead of overwriting the writer who got in between", async () => {
    const meeting = await newMeeting();

    // Bob revalidates AFTER Ada's write has committed — so he quotes Ada's
    // version and his own save is entirely legitimate. He is not racing Ada;
    // he is the next writer in line.
    const interleave = async () => {
      const seen = await writer("2026-08-20T00:00:01.000Z").get(meeting.id);
      expect(seen?.notesMarkdown).toBe("Ada's paragraph.");
      await writer("2026-08-20T00:00:02.000Z").update(meeting.id, {
        notesMarkdown: "Ada's paragraph.\n\nBob's paragraph.",
        expectedUpdatedAt: seen!.detailsUpdatedAt.toISOString(),
      });
    };

    const ada = createMeetingRepository(
      interleavingDb(interleave),
      makeContext(WS),
      {
        clock: new FakeClock("2026-08-20T00:00:00.000Z").now,
        activityIdGenerator: nextActivityId,
      },
    );
    const written = await ada.update(meeting.id, {
      notesMarkdown: "Ada's paragraph.",
      expectedUpdatedAt: meeting.version,
    });

    // The read-back saw Bob's document. That is honest — it IS the stored state.
    expect(written.meeting.notesMarkdown).toBe(
      "Ada's paragraph.\n\nBob's paragraph.",
    );
    // …but the version Ada may quote next is Ada's own, not Bob's.
    expect(written.version).toBe("2026-08-20T00:00:00.000Z");
    expect(written.version).not.toBe(
      written.meeting.detailsUpdatedAt.toISOString(),
    );

    // The whole point: Ada's coalesced next save is REFUSED, so Bob's paragraph
    // survives. Quoting the read-back's version instead would have let this
    // through and destroyed it.
    await expect(
      writer("2026-08-20T00:00:03.000Z").update(meeting.id, {
        notesMarkdown: "Ada's paragraph, continued.",
        expectedUpdatedAt: written.version,
      }),
    ).rejects.toBeInstanceOf(MeetingConflictError);
    expect((await writer().get(meeting.id))?.notesMarkdown).toBe(
      "Ada's paragraph.\n\nBob's paragraph.",
    );
  });
});
