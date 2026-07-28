import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as indexLoader } from "~/modules/people/routes/index";
import { loader as archivedLoader } from "~/modules/people/routes/archived";
import { action as newAction } from "~/modules/people/routes/create";
import { loader as detailLoader } from "~/modules/people/routes/detail";
import { action as mutateAction } from "~/modules/people/routes/mutate";
import { loader as activityLoader } from "~/modules/people/routes/activity";
import type { CreatePersonResult } from "~/modules/people/routes/create";
import type { PersonMutationResult } from "~/modules/people/routes/mutate";

import { countPersonRows, resetTables } from "./support";

const WS = "test-default-workspace";

function sessionFor(subject = "owner-subject"): AuthenticatedSession {
  return {
    user: { subject, email: "owner@example.com" },
    issuedAt: new Date(0),
    expiresAt: new Date(Date.parse("2999-01-01")),
  };
}

function authedContext(): RouterContextProvider {
  const context = new RouterContextProvider();
  setAuthenticatedSession(context, sessionFor());
  return context;
}

function formData(entries: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(entries)) form.set(key, value);
  return form;
}

async function createPerson(entries: Record<string, string>): Promise<string> {
  const response = (await newAction({
    request: new Request("https://app.test/people/create", {
      method: "POST",
      body: formData(entries),
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof newAction>[0])) as Response;
  const data = (await response.json()) as CreatePersonResult;
  if (!data.ok) throw new Error("create failed");
  return data.personId;
}

async function runMutate(
  personId: string,
  entries: Record<string, string>,
): Promise<PersonMutationResult> {
  const response = (await mutateAction({
    request: new Request(`https://app.test/person/${personId}/mutate`, {
      method: "POST",
      body: formData(entries),
    }),
    context: authedContext(),
    params: { personId },
  } as unknown as Parameters<typeof mutateAction>[0])) as Response;
  return (await response.json()) as PersonMutationResult;
}

async function runDetail(personId: string) {
  return detailLoader({
    request: new Request(`https://app.test/person/${personId}`),
    context: authedContext(),
    params: { personId },
  } as unknown as Parameters<typeof detailLoader>[0]);
}

beforeEach(async () => {
  await resetTables([WS]);
});

describe("POST /people/create", () => {
  it("creates a person and returns its id", async () => {
    const id = await createPerson({
      title: "Ada Lovelace",
      organisation: "Analytical Engines",
    });
    expect(id).toBeTruthy();
    expect(await countPersonRows()).toBe(1);
  });

  it("returns a field error for an invalid email", async () => {
    const response = (await newAction({
      request: new Request("https://app.test/people/create", {
        method: "POST",
        body: formData({ title: "X", email: "nope" }),
      }),
      context: authedContext(),
      params: {},
    } as unknown as Parameters<typeof newAction>[0])) as Response;
    const data = (await response.json()) as CreatePersonResult;
    expect(data.ok).toBe(false);
    if (!data.ok) {
      expect(data.fieldErrors?.email).toBeTruthy();
    }
    expect(await countPersonRows()).toBe(0);
  });

  it("rejects a non-POST method with 405", async () => {
    await expect(
      newAction({
        request: new Request("https://app.test/people/create", {
          method: "GET",
        }),
        context: authedContext(),
        params: {},
      } as unknown as Parameters<typeof newAction>[0]),
    ).rejects.toMatchObject({ status: 405 });
  });
});

describe("GET /person/:id", () => {
  it("loads a created person", async () => {
    const id = await createPerson({ title: "Grace Hopper", role: "Admiral" });
    const data = await runDetail(id);
    expect(data.person.title).toBe("Grace Hopper");
    expect(data.person.role).toBe("Admiral");
    // Linked records are now loaded client-side by the shared Linked Items
    // section (the universal `/links` endpoint), so the detail loader no longer
    // returns a `linked` array.
  });

  it("404s for a missing id", async () => {
    await expect(runDetail("nonexistent")).rejects.toMatchObject({
      status: 404,
    });
  });
});

describe("POST /person/:id/mutate", () => {
  it("renames, updates details, archives, restores and deletes", async () => {
    const id = await createPerson({ title: "Alan Turing" });

    const renamed = await runMutate(id, {
      intent: "rename",
      title: "A. Turing",
    });
    expect(renamed).toMatchObject({ kind: "rename", ok: true });
    expect((await runDetail(id)).person.title).toBe("A. Turing");

    const updated = await runMutate(id, {
      intent: "update",
      role: "Cryptanalyst",
      email: "alan@example.com",
    });
    expect(updated).toMatchObject({ kind: "update", ok: true });
    expect((await runDetail(id)).person.role).toBe("Cryptanalyst");

    const archived = await runMutate(id, { intent: "archive" });
    expect(archived).toMatchObject({ kind: "archive", ok: true });
    expect((await runDetail(id)).person.archived).toBe(true);

    const restored = await runMutate(id, { intent: "restore" });
    expect(restored).toMatchObject({ kind: "restore", ok: true });
    expect((await runDetail(id)).person.archived).toBe(false);

    const deleted = await runMutate(id, { intent: "delete" });
    expect(deleted).toMatchObject({ kind: "delete", ok: true });
    await expect(runDetail(id)).rejects.toMatchObject({ status: 404 });
  });

  it("returns a field error for an invalid update and 404s an unknown id", async () => {
    const id = await createPerson({ title: "Test" });
    const bad = await runMutate(id, { intent: "update", email: "bad" });
    expect(bad).toMatchObject({ kind: "update", ok: false });

    await expect(
      runMutate("ghost", { intent: "rename", title: "x" }),
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe("collection loaders", () => {
  it("lists active people on /people and archived people on /people/archived", async () => {
    const a = await createPerson({ title: "Active" });
    const b = await createPerson({ title: "Archived Soon" });
    await runMutate(b, { intent: "archive" });

    const active = await indexLoader({
      request: new Request("https://app.test/people"),
      context: authedContext(),
      params: {},
    } as unknown as Parameters<typeof indexLoader>[0]);
    expect(active.people.map((p) => p.id)).toEqual([a]);
    expect(active.view).toBe("all");

    const archived = await archivedLoader({
      request: new Request("https://app.test/people/archived"),
      context: authedContext(),
      params: {},
    } as unknown as Parameters<typeof archivedLoader>[0]);
    expect(archived.people.map((p) => p.id)).toEqual([b]);
    expect(archived.view).toBe("archived");
  });
});

describe("GET /person/:id/activity", () => {
  it("returns the person’s timeline including the create event", async () => {
    const id = await createPerson({ title: "Timeline" });
    const response = (await activityLoader({
      request: new Request(`https://app.test/person/${id}/activity`),
      context: authedContext(),
      params: { personId: id },
    } as unknown as Parameters<typeof activityLoader>[0])) as Response;
    const data = (await response.json()) as {
      items: { type: string }[];
    };
    expect(data.items.some((item) => item.type === "person.created")).toBe(
      true,
    );
  });
});
