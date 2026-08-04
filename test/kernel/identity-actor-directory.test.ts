import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import {
  IdentityValidationError,
  SYSTEM_ACTOR_LABEL,
  UNKNOWN_ACTOR_LABEL,
  actorKey,
} from "~/kernel/identity";
import { parseWorkspaceId } from "~/kernel/workspaces";
import { provisionMemberSafely } from "~/platform/request";
import {
  createActorDirectory,
  createWorkspaceMemberRepository,
} from "~/platform/storage/d1";
import { resolveAuthenticatedWorkspaceScope } from "~/platform/workspaces";

import {
  makeContext,
  makePersonRepository,
  makeWorkspaceRepository,
  resetTables,
} from "./support";

/**
 * IDENT-01 — workspace membership and the actor directory, against real D1 in the
 * Workers runtime. This is the seam that turns the stable actor id the Activity
 * stream already stores into a real name.
 */

const WS = "test-default-workspace";
const OTHER = "ws_identity_other";
const SUB = "access-sub-aidan";

function session(subject = SUB, displayName: string | null = null) {
  return {
    user: { subject, email: "aidan@daly.id.au", displayName },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
}

function members(workspaceId = WS) {
  return createWorkspaceMemberRepository(env.DB, makeContext(workspaceId));
}

async function provisionWorkspaces() {
  const repository = makeWorkspaceRepository();
  await repository.create({ id: parseWorkspaceId(WS) });
  await repository.create({ id: parseWorkspaceId(OTHER) });
}

describe("workspace membership", () => {
  beforeEach(async () => {
    await resetTables();
    await provisionWorkspaces();
  });

  it("provisions a member from an authenticated session", async () => {
    const member = await members().ensureMember({
      subject: SUB,
      email: "Aidan@Daly.ID.au",
      displayName: "  Aidan   Daly  ",
    });
    expect(member.subject).toBe(SUB);
    // The email is canonicalised and the provider name collapsed on the way in.
    expect(member.email).toBe("aidan@daly.id.au");
    expect(member.authDisplayName).toBe("Aidan Daly");
    expect(member.displayName).toBeNull();
    expect(member.personEntityId).toBeNull();
  });

  it("is idempotent, and never overwrites owner-curated identity", async () => {
    const repository = members();
    await repository.ensureMember({ subject: SUB, email: "aidan@daly.id.au" });
    await repository.setDisplayName(SUB, "Aidan Daly");

    // A later sign-in with a provider name must not clobber the curated name.
    await repository.ensureMember({
      subject: SUB,
      email: "aidan@daly.id.au",
      displayName: "A. Daly (Work)",
    });
    const member = await repository.getBySubject(SUB);
    expect(member?.displayName).toBe("Aidan Daly");
    expect(member?.authDisplayName).toBe("A. Daly (Work)");

    // And there is still exactly one row.
    expect(await repository.list()).toHaveLength(1);
  });

  it("keeps a previously-known provider name when a token carries none", async () => {
    const repository = members();
    await repository.ensureMember({
      subject: SUB,
      email: "aidan@daly.id.au",
      displayName: "Aidan Daly",
    });
    await repository.ensureMember({ subject: SUB, email: "aidan@daly.id.au" });
    expect((await repository.getBySubject(SUB))?.authDisplayName).toBe(
      "Aidan Daly",
    );
  });

  it("links the member to a Person record and resolves that name", async () => {
    const people = makePersonRepository(makeContext(WS));
    const person = await people.create({ title: "Aidan Daly" });

    const repository = members();
    await repository.ensureMember({ subject: SUB, email: "aidan@daly.id.au" });
    const linked = await repository.linkPerson(SUB, person.id);
    expect(linked.personEntityId).toBe(person.id);
    expect(linked.personDisplayName).toBe("Aidan Daly");

    const identities = await createActorDirectory(
      env.DB,
      makeContext(WS),
    ).resolveActors([{ type: "user", id: SUB }]);
    const identity = identities.get(actorKey({ type: "user", id: SUB }));
    expect(identity?.displayName).toBe("Aidan Daly");
    expect(identity?.source).toBe("person");
  });

  it("follows the Person's CURRENT name after a rename (documented model)", async () => {
    const people = makePersonRepository(makeContext(WS));
    const person = await people.create({ title: "Aidan D" });
    const repository = members();
    await repository.ensureMember({ subject: SUB, email: "aidan@daly.id.au" });
    await repository.linkPerson(SUB, person.id);

    // ADR-071: the display name is resolved at read time from the stable actor
    // id, so a rename applies to history too — there is no event-time snapshot.
    await env.DB.prepare(
      "UPDATE entities SET title = ? WHERE workspace_id = ? AND id = ?",
    )
      .bind("Aidan Daly", WS, person.id)
      .run();

    const identities = await createActorDirectory(
      env.DB,
      makeContext(WS),
    ).resolveActors([{ type: "user", id: SUB }]);
    expect(
      identities.get(actorKey({ type: "user", id: SUB }))?.displayName,
    ).toBe("Aidan Daly");
  });

  it("refuses to link anything that is not a Person in this workspace", async () => {
    const repository = members();
    await repository.ensureMember({ subject: SUB, email: "aidan@daly.id.au" });

    await expect(repository.linkPerson(SUB, "no-such-entity")).rejects.toThrow(
      IdentityValidationError,
    );

    // A Person in ANOTHER workspace is equally refused — identity is isolated.
    const other = makePersonRepository(makeContext(OTHER));
    const foreign = await other.create({ title: "A Different Person" });
    await expect(repository.linkPerson(SUB, foreign.id)).rejects.toThrow(
      IdentityValidationError,
    );
  });

  it("keeps membership workspace-isolated", async () => {
    await members(WS).ensureMember({ subject: SUB, email: "aidan@daly.id.au" });
    expect(await members(OTHER).getBySubject(SUB)).toBeNull();

    const identities = await createActorDirectory(
      env.DB,
      makeContext(OTHER),
    ).resolveActors([{ type: "user", id: SUB }]);
    expect(
      identities.get(actorKey({ type: "user", id: SUB }))?.displayName,
    ).toBe(UNKNOWN_ACTOR_LABEL);
  });
});

describe("the actor directory", () => {
  beforeEach(async () => {
    await resetTables();
    await provisionWorkspaces();
  });

  it("resolves a batch of actors in ONE bounded query (no N+1)", async () => {
    const repository = members();
    for (const subject of ["s1", "s2", "s3"]) {
      await repository.ensureMember({
        subject,
        email: `${subject}@example.com`,
      });
    }

    let prepared = 0;
    const counting = new Proxy(env.DB, {
      get(target, prop, receiver) {
        if (prop === "prepare") {
          return (query: string) => {
            prepared += 1;
            return target.prepare(query);
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as D1Database;

    const identities = await createActorDirectory(
      counting,
      makeContext(WS),
    ).resolveActors([
      { type: "user", id: "s1" },
      { type: "user", id: "s2" },
      { type: "user", id: "s3" },
      { type: "user", id: "s1" },
      { type: "system", id: null },
    ]);

    expect(prepared).toBe(1);
    expect(identities.size).toBe(4);
    expect(
      identities.get(actorKey({ type: "system", id: null }))?.displayName,
    ).toBe(SYSTEM_ACTOR_LABEL);
    expect(
      identities.get(actorKey({ type: "user", id: "s2" }))?.displayName,
    ).toBe("s2@example.com");
  });

  it("resolves EVERY actor when there are more than one statement's worth", async () => {
    // Regression: the directory used to cap the lookup and silently render the
    // overflow as "Unknown user" even when a membership row existed. The vault
    // export passes an unpaginated actor set, so the cap was reachable.
    const repository = members();
    const subjects = Array.from({ length: 250 }, (_, i) => `sub-${i}`);
    for (const subject of subjects) {
      await repository.ensureMember({
        subject,
        email: `${subject}@example.com`,
      });
    }

    const identities = await createActorDirectory(
      env.DB,
      makeContext(WS),
    ).resolveActors(subjects.map((id) => ({ type: "user", id })));

    for (const subject of subjects) {
      expect(
        identities.get(actorKey({ type: "user", id: subject }))?.displayName,
      ).toBe(`${subject}@example.com`);
    }
  });

  it("does not spend lookup slots on actors a membership row cannot name", async () => {
    let prepared = 0;
    const counting = new Proxy(env.DB, {
      get(target, prop, receiver) {
        if (prop === "prepare") {
          return (query: string) => {
            prepared += 1;
            return target.prepare(query);
          };
        }
        const value = Reflect.get(target, prop, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }) as D1Database;

    // Every actor here is answered by the canonical rule from its type alone.
    const identities = await createActorDirectory(
      counting,
      makeContext(WS),
    ).resolveActors([
      { type: "system", id: null },
      { type: "ai", id: "assistant-1" },
      { type: "import", id: "job-1" },
      { type: "integration", id: "calendar-1" },
    ]);

    expect(prepared).toBe(0);
    expect(identities.size).toBe(4);
    expect(
      identities.get(actorKey({ type: "ai", id: "assistant-1" }))?.displayName,
    ).toBe("Assistant");
  });

  it("resolves an actor with no membership row to Unknown user", async () => {
    const identities = await createActorDirectory(
      env.DB,
      makeContext(WS),
    ).resolveActors([{ type: "user", id: "never-seen" }]);
    const identity = identities.get(
      actorKey({ type: "user", id: "never-seen" }),
    );
    expect(identity?.displayName).toBe(UNKNOWN_ACTOR_LABEL);
    expect(identity?.displayName).not.toBe("Someone");
  });
});

describe("request-boundary provisioning", () => {
  beforeEach(async () => {
    await resetTables();
    await provisionWorkspaces();
  });

  it("records membership once per authenticated request, and resolves the actor", async () => {
    const boundaryEnv = { DB: env.DB, DEFAULT_WORKSPACE_ID: WS };
    await provisionMemberSafely(boundaryEnv, session(SUB, "Aidan Daly"));
    await provisionMemberSafely(boundaryEnv, session(SUB, "Aidan Daly"));

    expect(await members().list()).toHaveLength(1);

    // An event recorded by that same session now resolves to the real name.
    const scope = await resolveAuthenticatedWorkspaceScope(
      boundaryEnv,
      session(SUB, "Aidan Daly"),
    );
    await scope.entities.create({ type: "widget", title: "a thing" });
    const feed = await scope.activity.listForWorkspace();
    const identities = await scope.actors.resolveActors(
      feed.items.map((item) => item.actor),
    );
    expect(identities.get(actorKey(feed.items[0]!.actor))?.displayName).toBe(
      "Aidan Daly",
    );
  });

  it("never fails a request when identity storage is unavailable", async () => {
    const broken = {
      DB: {
        prepare() {
          throw new Error("database is down");
        },
      } as unknown as D1Database,
      DEFAULT_WORKSPACE_ID: WS,
    };
    await expect(
      provisionMemberSafely(broken, session()),
    ).resolves.toBeUndefined();

    // Nor when the workspace is not configured at all.
    await expect(
      provisionMemberSafely({ DB: env.DB }, session()),
    ).resolves.toBeUndefined();
  });
});
