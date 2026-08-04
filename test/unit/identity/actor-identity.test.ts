/**
 * IDENT-01 — the canonical actor-resolution rule.
 *
 * These tests pin the DOCUMENTED product order (person → member → provider name
 * → email → System → Unknown user) and the hard rule that `Someone` is never
 * produced for anything.
 */

import { describe, expect, it } from "vitest";

import {
  SYSTEM_ACTOR_LABEL,
  UNKNOWN_ACTOR_LABEL,
  actorInitials,
  actorKey,
  resolveActorIdentity,
  type WorkspaceMember,
} from "~/kernel/identity";
import { parseWorkspaceId } from "~/kernel/workspaces";

const WS = parseWorkspaceId("ws-identity");

function member(overrides: Partial<WorkspaceMember> = {}): WorkspaceMember {
  return {
    workspaceId: WS,
    subject: "access-sub-1",
    email: null,
    displayName: null,
    authDisplayName: null,
    personEntityId: null,
    personDisplayName: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    lastSeenAt: new Date(0),
    ...overrides,
  };
}

const USER = { type: "user", id: "access-sub-1" };

describe("the canonical actor-resolution order", () => {
  it("prefers the linked Person/profile display name", () => {
    const identity = resolveActorIdentity(
      USER,
      member({
        personEntityId: "person-1",
        personDisplayName: "Aidan Daly",
        displayName: "curated",
        authDisplayName: "provider",
        email: "aidan@daly.id.au",
      }),
    );
    expect(identity).toEqual({
      displayName: "Aidan Daly",
      initials: "AD",
      kind: "person",
      source: "person",
    });
  });

  it("falls to the workspace member's curated display name", () => {
    const identity = resolveActorIdentity(
      USER,
      member({
        displayName: "Aidan Daly",
        authDisplayName: "provider",
        email: "aidan@daly.id.au",
      }),
    );
    expect(identity.displayName).toBe("Aidan Daly");
    expect(identity.source).toBe("member");
  });

  it("falls to the authenticated provider display name", () => {
    const identity = resolveActorIdentity(
      USER,
      member({ authDisplayName: "Aidan Daly", email: "aidan@daly.id.au" }),
    );
    expect(identity.displayName).toBe("Aidan Daly");
    expect(identity.source).toBe("auth_name");
  });

  it("falls to the verified email address", () => {
    const identity = resolveActorIdentity(
      USER,
      member({ email: "aidan@daly.id.au" }),
    );
    expect(identity.displayName).toBe("aidan@daly.id.au");
    expect(identity.source).toBe("email");
    // Initials come from the local part, so an email actor still gets a chip —
    // and the domain never leaks into it.
    expect(identity.initials).toBe("A");
    expect(
      resolveActorIdentity(USER, member({ email: "aidan.daly@example.com" }))
        .initials,
    ).toBe("AD");
  });

  it("uses System only for genuine automated system activity", () => {
    const identity = resolveActorIdentity({ type: "system", id: null }, null);
    expect(identity.displayName).toBe(SYSTEM_ACTOR_LABEL);
    expect(identity.kind).toBe("system");
    // No initials: a system actor must never read as a person.
    expect(identity.initials).toBe("");
  });

  it("names the other non-human actor kinds explicitly", () => {
    expect(
      resolveActorIdentity({ type: "ai", id: null }, null).displayName,
    ).toBe("Assistant");
    expect(
      resolveActorIdentity({ type: "import", id: "job-1" }, null).displayName,
    ).toBe("Import");
    expect(
      resolveActorIdentity({ type: "integration", id: null }, null).displayName,
    ).toBe("Integration");
  });

  it("uses Unknown user only when an identified actor cannot be resolved", () => {
    for (const candidate of [null, member(), member({ email: "   " })]) {
      const identity = resolveActorIdentity(USER, candidate);
      expect(identity.displayName).toBe(UNKNOWN_ACTOR_LABEL);
      expect(identity.kind).toBe("unknown");
    }
  });

  it("REGRESSION: never produces the anonymous “Someone” placeholder", () => {
    const actors = [
      { type: "user", id: "s" },
      { type: "user", id: null },
      { type: "system", id: null },
      { type: "ai", id: null },
      { type: "import", id: "i" },
      { type: "integration", id: null },
      { type: "", id: null },
      { type: "future_actor_kind", id: "x" },
    ];
    for (const actor of actors) {
      for (const candidate of [null, member(), member({ email: "a@b.co" })]) {
        expect(resolveActorIdentity(actor, candidate).displayName).not.toBe(
          "Someone",
        );
      }
    }
  });

  it("is total — no member shape can make it throw", () => {
    const broken = {
      email: undefined,
      displayName: 12 as unknown as string,
    } as unknown as WorkspaceMember;
    expect(() => resolveActorIdentity(USER, broken)).not.toThrow();
    expect(resolveActorIdentity(USER, broken).displayName).toBe(
      UNKNOWN_ACTOR_LABEL,
    );
  });
});

describe("initials", () => {
  it("derives 1–2 letters from real names and addresses", () => {
    expect(actorInitials("Aidan Daly")).toBe("AD");
    expect(actorInitials("Aidan")).toBe("A");
    expect(actorInitials("aidan.daly@example.com")).toBe("AD");
    expect(actorInitials("Ada Byron King")).toBe("AK");
    expect(actorInitials("   ")).toBe("");
    expect(actorInitials("李雷")).toBe("李");
  });
});

describe("actor keys", () => {
  it("distinguishes actors by type AND id, and is stable", () => {
    expect(actorKey({ type: "user", id: "a" })).toBe(
      actorKey({ type: "user", id: "a" }),
    );
    expect(actorKey({ type: "user", id: "a" })).not.toBe(
      actorKey({ type: "user", id: "b" }),
    );
    expect(actorKey({ type: "system", id: null })).not.toBe(
      actorKey({ type: "user", id: null }),
    );
  });
});
