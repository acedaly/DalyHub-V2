/**
 * DEBT-124 — relationships for a PAGE of records, in a bounded number of reads.
 *
 * `EntityLinkRepository` published `listForEntity(id, …)` and nothing that
 * resolved links for a SET of entities, so every consumer that needed
 * relationships for a collection page had three choices: one query per row, a
 * per-module read projection that answers a kernel-shaped question (which is
 * what Notes did for its `linkCount`), or do without — which is what the
 * Meetings collection did, and why it could not show attendees. The cheap wrong
 * one was the easiest to write.
 *
 * Two properties are asserted here, and the second is the one a naive batched
 * read gets wrong: the statement count does not grow with the page, and the
 * TRUNCATION is per anchor, so one heavily-linked record cannot consume the
 * whole read and leave the rest of the page empty.
 */

import { env } from "cloudflare:test";
import { beforeEach, describe, expect, it } from "vitest";

import { createEntityLinkRepository } from "~/platform/storage/d1";

import {
  FakeClock,
  countingDb,
  makeContext,
  makeLinkRepository,
  makeRepository,
  resetTables,
  sequentialIds,
} from "./support";

const WS = "ws_link_batch";
const OTHER = "ws_link_batch_other";
const LINK_TYPE = "meeting.produced_task";

let clock: FakeClock;
let entities: ReturnType<typeof makeRepository>;
let links: ReturnType<typeof makeLinkRepository>;

function batchRepo(db: D1Database = env.DB) {
  return createEntityLinkRepository(db, makeContext(WS), {
    clock: clock.now,
    idGenerator: sequentialIds("lnkbatch2"),
  });
}

beforeEach(async () => {
  await resetTables([WS, OTHER]);
  clock = new FakeClock("2026-08-25T00:00:00.000Z");
  entities = makeRepository(makeContext(WS), {
    clock: clock.now,
    idGenerator: sequentialIds("ent"),
  });
  links = makeLinkRepository(makeContext(WS), {
    clock: clock.now,
    idGenerator: sequentialIds("lnk"),
  });
});

async function widget(title: string): Promise<string> {
  return (await entities.create({ type: "widget", title })).id;
}

describe("DEBT-124 — the batched relationship read", () => {
  it("costs the same number of statements for 20 anchors as for one", async () => {
    const anchors: string[] = [];
    for (let index = 0; index < 20; index += 1) {
      const anchor = await widget(`Anchor ${index}`);
      const counterpart = await widget(`Counterpart ${index}`);
      await links.create({
        sourceEntityId: anchor,
        targetEntityId: counterpart,
        type: LINK_TYPE,
      });
      anchors.push(anchor);
    }

    const counting = countingDb(env.DB);
    const repo = batchRepo(counting.db);

    counting.reset();
    await repo.listForEntities(anchors.slice(0, 1), { type: LINK_TYPE });
    const one = counting.prepareCount();

    counting.reset();
    const many = await repo.listForEntities(anchors, { type: LINK_TYPE });
    const twenty = counting.prepareCount();

    // The entry, in one line: one read per page, not one per row. Against
    // `listForEntity` this is twenty statements and twenty anchor checks.
    expect(one).toBe(1);
    expect(twenty).toBe(one);
    expect(many.size).toBe(20);
  });

  it("truncates PER ANCHOR, so one busy record cannot starve the page", async () => {
    /*
     * The property a naive batched read gets wrong. A global `LIMIT` over the
     * union would return the first N links across the whole page — so an anchor
     * with fifty counterparts would consume the read and every other row would
     * come back empty, silently and only on real data.
     */
    const busy = await widget("Busy");
    for (let index = 0; index < 12; index += 1) {
      await links.create({
        sourceEntityId: busy,
        targetEntityId: await widget(`Busy counterpart ${index}`),
        type: LINK_TYPE,
      });
    }
    const quiet = await widget("Quiet");
    await links.create({
      sourceEntityId: quiet,
      targetEntityId: await widget("Quiet counterpart"),
      type: LINK_TYPE,
    });

    const page = await batchRepo().listForEntities([busy, quiet], {
      type: LINK_TYPE,
      limitPerEntity: 3,
    });

    expect(page.get(busy)).toHaveLength(3);
    expect(page.get(quiet)).toHaveLength(1);
  });

  it("orders each anchor's links the way `listForEntity` orders them", async () => {
    const anchor = await widget("Anchor");
    const first = await widget("First");
    const second = await widget("Second");
    await links.create({
      sourceEntityId: anchor,
      targetEntityId: first,
      type: LINK_TYPE,
    });
    clock.advance(60_000);
    await links.create({
      sourceEntityId: anchor,
      targetEntityId: second,
      type: LINK_TYPE,
    });

    const batched = await batchRepo().listForEntities([anchor], {
      type: LINK_TYPE,
    });
    const single = await links.listForEntity(anchor, { type: LINK_TYPE });

    expect(batched.get(anchor)?.map((view) => view.link.id)).toEqual(
      single.items.map((view) => view.link.id),
    );
    expect(batched.get(anchor)?.map((view) => view.counterpart.title)).toEqual([
      "First",
      "Second",
    ]);
  });

  it("carries the counterpart and the direction, both ways", async () => {
    const anchor = await widget("Anchor");
    const outgoing = await widget("Outgoing counterpart");
    const incomingSource = await widget("Incoming source");
    await links.create({
      sourceEntityId: anchor,
      targetEntityId: outgoing,
      type: LINK_TYPE,
    });
    await links.create({
      sourceEntityId: incomingSource,
      targetEntityId: anchor,
      type: LINK_TYPE,
    });

    const both = await batchRepo().listForEntities([anchor], {
      type: LINK_TYPE,
    });
    expect(
      both
        .get(anchor)
        ?.map((view) => [view.direction, view.counterpart.title])
        .sort(),
    ).toEqual([
      ["incoming", "Incoming source"],
      ["outgoing", "Outgoing counterpart"],
    ]);

    const outgoingOnly = await batchRepo().listForEntities([anchor], {
      type: LINK_TYPE,
      direction: "outgoing",
    });
    expect(
      outgoingOnly.get(anchor)?.map((view) => view.counterpart.title),
    ).toEqual(["Outgoing counterpart"]);
  });

  it("excludes unlinked links and soft-deleted counterparts", async () => {
    const anchor = await widget("Anchor");
    const unlinkedTarget = await widget("Unlinked");
    const deletedTarget = await widget("Deleted");
    const live = await widget("Live");

    const unlinked = await links.create({
      sourceEntityId: anchor,
      targetEntityId: unlinkedTarget,
      type: LINK_TYPE,
    });
    await links.unlink(unlinked.link.id);
    await links.create({
      sourceEntityId: anchor,
      targetEntityId: deletedTarget,
      type: LINK_TYPE,
    });
    await entities.softDelete(deletedTarget);
    await links.create({
      sourceEntityId: anchor,
      targetEntityId: live,
      type: LINK_TYPE,
    });

    const page = await batchRepo().listForEntities([anchor], {
      type: LINK_TYPE,
    });
    expect(page.get(anchor)?.map((view) => view.counterpart.title)).toEqual([
      "Live",
    ]);
  });

  it("omits an anchor with no links rather than inventing an empty entry", async () => {
    const lonely = await widget("Lonely");
    const page = await batchRepo().listForEntities([lonely], {
      type: LINK_TYPE,
    });
    expect(page.has(lonely)).toBe(false);
  });

  it("omits an unknown anchor instead of failing the whole page", async () => {
    /*
     * The one deliberate difference from `listForEntity`, which refuses. This
     * is handed a PAGE: one row deleted in another tab must not fail the other
     * twenty-nine — nor cost N existence checks to discover, which is the N+1
     * this read exists to remove.
     */
    const live = await widget("Live");
    await links.create({
      sourceEntityId: live,
      targetEntityId: await widget("Counterpart"),
      type: LINK_TYPE,
    });
    const page = await batchRepo().listForEntities(["ent_missing", live], {
      type: LINK_TYPE,
    });
    expect(page.has("ent_missing")).toBe(false);
    expect(page.get(live)).toHaveLength(1);
  });

  it("issues NO statement for an empty anchor list", async () => {
    const counting = countingDb(env.DB);
    counting.reset();
    const page = await batchRepo(counting.db).listForEntities([]);
    expect(page.size).toBe(0);
    expect(counting.prepareCount()).toBe(0);
  });

  it("never sees another workspace's links", async () => {
    const mine = await widget("Mine");
    const otherEntities = makeRepository(makeContext(OTHER), {
      clock: clock.now,
      idGenerator: sequentialIds("oent"),
    });
    const otherLinks = makeLinkRepository(makeContext(OTHER), {
      clock: clock.now,
      idGenerator: sequentialIds("olnk"),
    });
    const theirAnchor = (
      await otherEntities.create({ type: "widget", title: "Theirs" })
    ).id;
    const theirTarget = (
      await otherEntities.create({ type: "widget", title: "Their counterpart" })
    ).id;
    await otherLinks.create({
      sourceEntityId: theirAnchor,
      targetEntityId: theirTarget,
      type: LINK_TYPE,
    });

    const page = await batchRepo().listForEntities([mine, theirAnchor], {
      type: LINK_TYPE,
    });
    expect(page.size).toBe(0);
  });
});
