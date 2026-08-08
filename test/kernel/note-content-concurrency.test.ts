/**
 * AUDIT-08 — concurrent Note saves, and the regression proof that a stale one
 * can no longer overwrite newer writing.
 *
 * The original defect, reproduced as the first test in each half: `update`
 * replaced the whole `content` column guarded only against writing *identical*
 * text. Two tabs (or a laptop and a phone) each held the same document, each
 * edited it, and whichever saved second silently replaced the other's
 * paragraphs. Nothing failed, nothing was announced, and the lost text existed
 * nowhere.
 *
 * The fix is a base-version precondition folded into the same statement as the
 * write, so the check cannot be raced: a save quotes the `contentUpdatedAt` it
 * was written against, and the upsert commits only while that is still the
 * stored version. A stale save matches zero rows and is reported as a typed
 * `NoteDetailsConflictError` — never a silent success, never a 500 — with the
 * newer stored content intact.
 *
 * These run against real D1 through both the repository and the actual mutation
 * route, because the route's `409` body is what the editor's conflict UI is
 * built on.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { NoteDetailsConflictError } from "~/kernel/notes";
import { setAuthenticatedSession } from "~/platform/request";
import { action as mutateAction } from "~/modules/notes/routes/mutate";
import type { NoteMutationResult } from "~/modules/notes/routes/mutate";

import {
  FakeClock,
  makeActivityRepository,
  makeContext,
  makeNoteDetailsRepository,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "test-default-workspace";
const OTHER_WS = "ws_note_conc_other";
const nextEntityId = sequentialIds("noteconc");
// ONE activity-id generator across every "editor": separate instances writing
// their own sequence would collide on the activities primary key.
const nextActivityId = sequentialIds("noteact");

function sessionFor(subject = "owner-subject"): AuthenticatedSession {
  return {
    user: { subject, email: "owner@example.com", displayName: null },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
}

function authedContext(): RouterContextProvider {
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, sessionFor());
  return context;
}

function entities(ws = WS) {
  return makeRepository(makeContext(ws), {
    clock: new FakeClock().now,
    idGenerator: nextEntityId,
  });
}

/**
 * One editor session. Each is its own repository instance, and the clock is
 * advanced per instance so successive writes carry distinct, ordered content
 * versions — which is what a base-version precondition needs to be meaningful.
 */
function editor(ws = WS, startIso = "2026-08-08T00:00:00.000Z") {
  return makeNoteDetailsRepository(makeContext(ws), {
    clock: new FakeClock(startIso).now,
    idGenerator: nextActivityId,
  });
}

async function runMutate(noteId: string, form: FormData): Promise<Response> {
  return mutateAction({
    request: new Request(`https://app.test/notes/${noteId}/mutate`, {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: { noteId },
  } as unknown as Parameters<typeof mutateAction>[0]) as Promise<Response>;
}

function saveForm(content: string, expected: string | null): FormData {
  const form = new FormData();
  form.set("intent", "update_content");
  form.set("content", content);
  form.set("expectedContentUpdatedAt", expected ?? "");
  return form;
}

async function contentEventCount(noteId: string): Promise<number> {
  const page = await makeActivityRepository(makeContext(WS)).listForEntity(
    noteId,
  );
  return page.items.filter((item) => item.type === "note.content_updated")
    .length;
}

beforeEach(async () => {
  await resetTables([WS, OTHER_WS]);
});

describe("AUDIT-08 — the repository refuses a stale content save", () => {
  it("keeps the newer text when a second editor saves from a stale base", async () => {
    const note = await entities().create({ type: "note", title: "Essay" });

    // Both tabs open the note and read the same version.
    const seed = await editor().update(note.id, "Opening paragraph.");
    const base = seed.details.contentUpdatedAt;
    expect(base).not.toBeNull();

    // Tab A saves first.
    const first = await editor(WS, "2026-08-08T01:00:00.000Z").update(
      note.id,
      "Opening paragraph.\n\nTab A's second paragraph.",
      { expectedContentUpdatedAt: base },
    );
    expect(first.changed).toBe(true);

    // Tab B, still holding the version it loaded, saves its own whole document.
    await expect(
      editor(WS, "2026-08-08T02:00:00.000Z").update(
        note.id,
        "Opening paragraph.\n\nTab B's second paragraph.",
        { expectedContentUpdatedAt: base },
      ),
    ).rejects.toBeInstanceOf(NoteDetailsConflictError);

    // Tab A's writing is exactly as it left it. Nothing was merged or replaced.
    const stored = await editor().get(note.id);
    expect(stored?.content).toBe(
      "Opening paragraph.\n\nTab A's second paragraph.",
    );
    // And the refused save recorded no Activity: one seed + one real save.
    expect(await contentEventCount(note.id)).toBe(2);
  });

  it("lets the stale editor succeed once it refreshes to the current version", async () => {
    const note = await entities().create({ type: "note", title: "Essay" });
    const seed = await editor().update(note.id, "One.");
    const base = seed.details.contentUpdatedAt;

    const winner = await editor(WS, "2026-08-08T01:00:00.000Z").update(
      note.id,
      "One.\n\nTwo.",
      { expectedContentUpdatedAt: base },
    );
    await expect(
      editor(WS, "2026-08-08T02:00:00.000Z").update(note.id, "One.\n\nThree.", {
        expectedContentUpdatedAt: base,
      }),
    ).rejects.toBeInstanceOf(NoteDetailsConflictError);

    // Refresh, reconcile, save again — the ordinary recovery.
    const refreshed = winner.details.contentUpdatedAt;
    const retried = await editor(WS, "2026-08-08T03:00:00.000Z").update(
      note.id,
      "One.\n\nTwo.\n\nThree.",
      { expectedContentUpdatedAt: refreshed },
    );
    expect(retried.changed).toBe(true);
    expect((await editor().get(note.id))?.content).toBe(
      "One.\n\nTwo.\n\nThree.",
    );
  });

  it("treats an unwritten note as its own base version, and refuses a stale claim to it", async () => {
    const note = await entities().create({ type: "note", title: "Blank" });

    // `null` is a real base version: "there was no saved content when I opened
    // this". Writing the first content against it must succeed.
    const first = await editor().update(note.id, "First words.", {
      expectedContentUpdatedAt: null,
    });
    expect(first.changed).toBe(true);

    // A second tab that also opened it blank must NOT be able to replace those
    // first words on the strength of the same "it was empty" claim.
    await expect(
      editor(WS, "2026-08-08T01:00:00.000Z").update(
        note.id,
        "Completely different words.",
        { expectedContentUpdatedAt: null },
      ),
    ).rejects.toBeInstanceOf(NoteDetailsConflictError);
    expect((await editor().get(note.id))?.content).toBe("First words.");
  });

  it("does not conflict when the stale save asks for exactly the stored text", async () => {
    const note = await entities().create({ type: "note", title: "Essay" });
    const seed = await editor().update(note.id, "One.");
    const base = seed.details.contentUpdatedAt;
    await editor(WS, "2026-08-08T01:00:00.000Z").update(note.id, "Two.", {
      expectedContentUpdatedAt: base,
    });

    // Nothing can be lost by agreeing with what is already there, so this is an
    // idempotent no-op — and it appends no second Activity event.
    const result = await editor(WS, "2026-08-08T02:00:00.000Z").update(
      note.id,
      "Two.",
      { expectedContentUpdatedAt: base },
    );
    expect(result.changed).toBe(false);
    expect(await contentEventCount(note.id)).toBe(2);
  });

  it("leaves callers that quote no base version behaving exactly as before", async () => {
    const note = await entities().create({ type: "note", title: "Essay" });
    await editor().update(note.id, "One.");
    // The capture panel writes a brand-new note's first body with nothing to be
    // stale about; omitting the option keeps the original last-write-wins.
    const result = await editor(WS, "2026-08-08T01:00:00.000Z").update(
      note.id,
      "Two.",
    );
    expect(result.changed).toBe(true);
    expect((await editor().get(note.id))?.content).toBe("Two.");
  });

  it("keeps the precondition workspace-scoped", async () => {
    const note = await entities().create({ type: "note", title: "Private" });
    const seed = await editor().update(note.id, "Owner's words.");

    // The other workspace cannot see this note at all, so its version can
    // neither read nor authorise anything there.
    expect(await editor(OTHER_WS).get(note.id)).toBeNull();
    await expect(
      editor(OTHER_WS).update(note.id, "Injected.", {
        expectedContentUpdatedAt: seed.details.contentUpdatedAt,
      }),
    ).rejects.toThrow();
    expect((await editor().get(note.id))?.content).toBe("Owner's words.");
  });
});

describe("AUDIT-08 — the mutation route answers a conflict, not a failure", () => {
  it("returns 409 with the newer content, and never a 500", async () => {
    const note = await entities().create({ type: "note", title: "Essay" });

    const seedResponse = await runMutate(note.id, saveForm("Draft one.", null));
    const seed = (await seedResponse.json()) as NoteMutationResult;
    expect(seed.kind).toBe("update_content");
    expect(seed.ok).toBe(true);
    const base =
      seed.kind === "update_content" && seed.ok ? seed.contentUpdatedAt : null;
    expect(base).not.toBeNull();

    // Another device saves against the same base and wins.
    const firstResponse = await runMutate(
      note.id,
      saveForm("Draft one, revised on the phone.", base),
    );
    expect(firstResponse.status).toBe(200);

    // This tab's save is refused.
    const staleResponse = await runMutate(
      note.id,
      saveForm("Draft one, revised on the laptop.", base),
    );
    expect(staleResponse.status).toBe(409);
    const stale = (await staleResponse.json()) as NoteMutationResult;
    expect(stale.kind).toBe("update_content");
    expect(stale.ok).toBe(false);
    if (stale.kind === "update_content" && !stale.ok) {
      expect(stale.conflict).toBe(true);
      // The newer text travels with the refusal so the editor can offer it.
      expect(stale.serverContent).toBe("Draft one, revised on the phone.");
      expect(stale.contentUpdatedAt).toEqual(expect.any(String));
      expect(stale.formError).toBeTruthy();
      // The refusal never echoes the submitted draft: that text never left the
      // editor, which is the whole point.
      expect(stale.serverContent).not.toContain("laptop");
    }

    // Storage is untouched by the refused save.
    expect((await editor().get(note.id))?.content).toBe(
      "Draft one, revised on the phone.",
    );
  });

  it("lets the refreshed save succeed, and records exactly one event per real save", async () => {
    const note = await entities().create({ type: "note", title: "Essay" });
    const seed = (await (
      await runMutate(note.id, saveForm("A.", null))
    ).json()) as NoteMutationResult;
    const base =
      seed.kind === "update_content" && seed.ok ? seed.contentUpdatedAt : null;

    await runMutate(note.id, saveForm("A. B.", base));
    const refused = (await (
      await runMutate(note.id, saveForm("A. C.", base))
    ).json()) as NoteMutationResult;
    const refreshed =
      refused.kind === "update_content" && !refused.ok
        ? (refused.contentUpdatedAt ?? null)
        : null;

    const retryResponse = await runMutate(
      note.id,
      saveForm("A. B. C.", refreshed),
    );
    expect(retryResponse.status).toBe(200);
    expect((await editor().get(note.id))?.content).toBe("A. B. C.");

    // Three real content changes, three events — the refused one added none.
    expect(await contentEventCount(note.id)).toBe(3);
  });

  it("keeps saving without a precondition working, for callers that send none", async () => {
    const note = await entities().create({ type: "note", title: "Essay" });
    const form = new FormData();
    form.set("intent", "update_content");
    form.set("content", "Written by the capture panel.");
    const response = await runMutate(note.id, form);
    expect(response.status).toBe(200);
    expect((await editor().get(note.id))?.content).toBe(
      "Written by the capture panel.",
    );
  });

  it("refuses a MALFORMED precondition instead of falling back to last-write-wins", async () => {
    /*
     * The escape hatch this closes: an unparseable `expectedContentUpdatedAt`
     * used to degrade to "no precondition", which is indistinguishable at the
     * repository from a caller that never sent one — so a stale client could
     * skip the compare-and-set entirely and overwrite newer stored content.
     *
     * A `400` costs the owner nothing: their draft never left the editor and
     * comes back with the error. Dropping the guard could cost them the OTHER
     * version, which no longer exists anywhere once it is overwritten.
     */
    const note = await entities().create({ type: "note", title: "Essay" });
    await runMutate(note.id, saveForm("Written on the other device.", null));
    const before = await editor().get(note.id);
    const eventsBefore = await contentEventCount(note.id);

    // Unparseable — no version could be read at all.
    for (const malformed of [
      "not-a-timestamp",
      "2026-13-45T99:99:99.000Z",
      "   ",
      "1786170000",
    ]) {
      const response = await runMutate(
        note.id,
        saveForm("Written by a stale client.", malformed),
      );
      expect(response.status).toBe(400);
      const body = (await response.json()) as NoteMutationResult;
      expect(body.kind).toBe("update_content");
      expect(body.ok).toBe(false);
      if (body.kind === "update_content" && !body.ok) {
        // Not reported as a conflict: nothing was compared, so there is no
        // newer version to offer — the request itself was unusable.
        expect(body.conflict).toBeUndefined();
        expect(body.formError).toBeTruthy();
      }

      // The stored content is byte-identical and its version has not moved.
      const after = await editor().get(note.id);
      expect(after?.content).toBe("Written on the other device.");
      expect(after?.contentUpdatedAt?.toISOString()).toBe(
        before?.contentUpdatedAt?.toISOString(),
      );
    }

    // And nothing was written to the Note's timeline by the refused attempts.
    expect(await contentEventCount(note.id)).toBe(eventsBefore);

    // The boundary, stated precisely: a value that PARSES is a version, and a
    // wrong one is a CONFLICT (409) — the newer text is offered back — not a
    // validation error. Only an unreadable value is a `400`. The two failures
    // mean different things and must not be collapsed.
    const wrongButValid = await runMutate(
      note.id,
      saveForm("Written by a stale client.", "2000-01-01T00:00:00.000Z"),
    );
    expect(wrongButValid.status).toBe(409);
    expect((await editor().get(note.id))?.content).toBe(
      "Written on the other device.",
    );

    // The same client, once it quotes the version it actually holds, saves.
    const ok = await runMutate(
      note.id,
      saveForm(
        "Written on the other device, then continued.",
        before?.contentUpdatedAt?.toISOString() ?? null,
      ),
    );
    expect(ok.status).toBe(200);
    expect((await editor().get(note.id))?.content).toBe(
      "Written on the other device, then continued.",
    );
  });
});
