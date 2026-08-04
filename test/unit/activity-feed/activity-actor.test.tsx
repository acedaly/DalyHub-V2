/**
 * IDENT-01 — the shared actor presentation, and the regression guard.
 *
 * The bug this file exists for: authenticated activity rendered as `Someone`
 * everywhere in production. The last test fails if that placeholder is ever
 * reintroduced anywhere in the application source.
 */

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { parseActivityType, type ActivityRecord } from "~/kernel/activity";
import { resolveActorIdentity, type WorkspaceMember } from "~/kernel/identity";
import { parseWorkspaceId } from "~/kernel/workspaces";
import { ActivityEventItem } from "~/shared/activity-feed";
import {
  createActivityDateFormatter,
  toActivityItem,
} from "~/shared/activity-feed/model";

const WS = parseWorkspaceId("ws-actor");
const formatter = createActivityDateFormatter({
  now: new Date("2026-08-04T10:00:00.000Z"),
});

function record(actor: ActivityRecord["actor"]): ActivityRecord {
  return {
    id: "act-1",
    workspaceId: WS,
    type: parseActivityType("entity.created"),
    actor,
    occurredAt: new Date("2026-08-04T09:00:00.000Z"),
    payload: {},
    subjects: [{ entityId: "e-1", role: "subject" }],
  };
}

function memberNamed(displayName: string): WorkspaceMember {
  return {
    workspaceId: WS,
    subject: "sub-1",
    email: "aidan@daly.id.au",
    displayName,
    authDisplayName: null,
    personEntityId: null,
    personDisplayName: null,
    createdAt: new Date(0),
    updatedAt: new Date(0),
    lastSeenAt: new Date(0),
  };
}

function renderActor(
  actor: ActivityRecord["actor"],
  member: WorkspaceMember | null,
) {
  const item = toActivityItem(record(actor), {
    resolveActor: (a) => resolveActorIdentity(a, member),
    resolveEntity: () => ({ entityId: "e-1", label: "Handover notes" }),
  });
  render(<ActivityEventItem item={item} formatter={formatter} />);
  return screen.getByRole("article");
}

describe("the shared actor presentation", () => {
  it("shows the resolved person's real name and initials", () => {
    const article = renderActor(
      { type: "user", id: "sub-1" },
      memberNamed("Aidan Daly"),
    );
    expect(within(article).getByText("Aidan Daly")).toBeInTheDocument();
    expect(within(article).getByText("AD")).toBeInTheDocument();
    // The name reaches the article's accessible name, so screen readers hear it.
    expect(article.getAttribute("aria-label")).toContain("Aidan Daly");
  });

  it("never renders the actor's database or Access identifier", () => {
    const article = renderActor(
      { type: "user", id: "access-sub-secret-id" },
      memberNamed("Aidan Daly"),
    );
    expect(article.outerHTML).not.toContain("access-sub-secret-id");
  });

  it("shows System for genuine system activity, with no initials chip", () => {
    const article = renderActor({ type: "system", id: null }, null);
    expect(within(article).getByText("System")).toBeInTheDocument();
    expect(article.querySelector(".dh-activity-actor__avatar")).toBeNull();
  });

  it("shows Unknown user — never Someone — for an unresolvable actor", () => {
    const article = renderActor({ type: "user", id: "sub-999" }, null);
    expect(within(article).getByText("Unknown user")).toBeInTheDocument();
    expect(within(article).queryByText("Someone")).toBeNull();
    expect(article.querySelector('[data-actor-kind="unknown"]')).not.toBeNull();
  });

  it("keeps a historic actor's identity, not the current viewer's", () => {
    // Two events by DIFFERENT subjects resolve independently: rendering never
    // substitutes "you" for whoever actually performed the action.
    const other: WorkspaceMember = {
      ...memberNamed("Vaughn Reed"),
      subject: "sub-2",
    };
    const directory = new Map([
      ["sub-1", memberNamed("Aidan Daly")],
      ["sub-2", other],
    ]);
    const items = [
      { type: "user", id: "sub-1" },
      { type: "user", id: "sub-2" },
    ].map((actor) =>
      toActivityItem(record(actor), {
        resolveActor: (a) =>
          resolveActorIdentity(a, a.id ? (directory.get(a.id) ?? null) : null),
      }),
    );
    expect(items.map((item) => item.actor.label)).toEqual([
      "Aidan Daly",
      "Vaughn Reed",
    ]);
  });
});

describe("REGRESSION: the “Someone” placeholder is gone from the product", () => {
  it("appears in no application source file", () => {
    const root = join(process.cwd(), "app");
    const files: string[] = [];
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(path);
        } else if (/\.(ts|tsx|css)$/.test(entry.name)) {
          files.push(path);
        }
      }
    };
    walk(root);
    expect(files.length).toBeGreaterThan(0);

    // Comments are stripped first: the architecture notes legitimately explain
    // WHY the placeholder is banned, and the ban is about what ships to the
    // screen. What must not exist is the word in code or copy.
    const stripComments = (source: string): string =>
      source
        .replace(/\/\*[\s\S]*?\*\//g, " ")
        .replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");

    const offenders = files.filter((file) =>
      /(^|[^A-Za-z])Someone([^A-Za-z]|$)/.test(
        stripComments(readFileSync(file, "utf8")),
      ),
    );

    expect(
      offenders.map((file) => file.replace(`${process.cwd()}/`, "")),
    ).toEqual([]);
  });
});
