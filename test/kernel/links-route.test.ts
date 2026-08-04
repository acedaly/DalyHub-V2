/**
 * Integration tests for the shared Universal Relationship System endpoint
 * (`/links`) against the real Workers runtime + D1 (no mocks). Exercises the
 * production composition boundary: authenticated session → trusted workspace
 * scope → policy-enforced link/unlink over the FND-04 kernel.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { RouterContextProvider } from "react-router";

import type { AuthenticatedSession } from "~/kernel/auth";
import { setAuthenticatedSession } from "~/platform/request";
import { loader as linksLoader, action as linksAction } from "~/routes/links";
import type { LinksActionData, LinksLoaderData } from "~/routes/links";

import { makeContext, makeRepository, resetTables } from "./support";

const WS = "test-default-workspace";

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

async function seedNote(title: string): Promise<string> {
  const entities = makeRepository(makeContext(WS));
  const record = await entities.create({ type: "note", title });
  return record.id;
}

async function runLoader(
  params: Record<string, string>,
): Promise<{ status: number; data: unknown }> {
  const url = new URL("https://app.test/links");
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  const response = (await linksLoader({
    request: new Request(url),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof linksLoader>[0])) as Response;
  return { status: response.status, data: await response.json() };
}

async function runAction(
  fields: Record<string, string>,
): Promise<{ status: number; data: LinksActionData | { error: string } }> {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  const response = (await linksAction({
    request: new Request("https://app.test/links", {
      method: "POST",
      body: form,
    }),
    context: authedContext(),
    params: {},
  } as unknown as Parameters<typeof linksAction>[0])) as Response;
  return {
    status: response.status,
    data: (await response.json()) as LinksActionData | { error: string },
  };
}

describe("/links endpoint", () => {
  beforeEach(async () => {
    await resetTables([WS]);
  });

  it("links, lists, searches, summarises and unlinks a related record", async () => {
    const anchor = await seedNote("Anchor note");
    const target = await seedNote("Target note");

    // Link
    const linked = await runAction({
      intent: "link",
      anchor,
      targetId: target,
      direction: "outgoing",
    });
    expect(linked.data).toMatchObject({ intent: "link", ok: true });

    // List — the target appears, removable, as link.related
    const listed = await runLoader({ op: "list", anchor });
    const listData = listed.data as Extract<LinksLoaderData, { op: "list" }>;
    expect(listData.items).toHaveLength(1);
    expect(listData.items[0]!.target.id).toBe(target);
    expect(listData.items[0]!.linkType).toBe("link.related");
    expect(listData.items[0]!.removable).toBe(true);
    const linkId = listData.items[0]!.linkId;

    // Search — the target is a candidate; the anchor is excluded from its own
    const found = await runLoader({ op: "search", anchor, q: "note" });
    const searchData = found.data as Extract<LinksLoaderData, { op: "search" }>;
    const ids = searchData.options.map((o) => o.id);
    expect(ids).toContain(target);
    expect(ids).not.toContain(anchor);

    // Summary — safe structural metadata only
    const summary = await runLoader({ op: "summary", anchor, target });
    const summaryData = summary.data as Extract<
      LinksLoaderData,
      { op: "summary" }
    >;
    expect(summaryData.summary?.title).toBe("Target note");
    expect(summaryData.summary?.type).toBe("note");

    // Unlink
    const unlinked = await runAction({ intent: "unlink", anchor, linkId });
    expect(unlinked.data).toMatchObject({ intent: "unlink", ok: true });

    const afterUnlink = await runLoader({ op: "list", anchor });
    expect(
      (afterUnlink.data as Extract<LinksLoaderData, { op: "list" }>).items,
    ).toHaveLength(0);
  });

  it("refuses a self-link", async () => {
    const anchor = await seedNote("Solo note");
    const result = await runAction({
      intent: "link",
      anchor,
      targetId: anchor,
      direction: "outgoing",
    });
    expect(result.data).toMatchObject({ intent: "link", ok: false });
  });

  it("fails closed for a missing anchor (404)", async () => {
    const result = await runLoader({ op: "list", anchor: "does-not-exist" });
    expect(result.status).toBe(404);
  });

  it("rejects a request with no anchor (400)", async () => {
    const result = await runLoader({ op: "list" });
    expect(result.status).toBe(400);
  });

  it("rejects an unknown POST intent (400)", async () => {
    const anchor = await seedNote("Anchor");
    const result = await runAction({ intent: "frobnicate", anchor });
    expect(result.status).toBe(400);
  });
});
