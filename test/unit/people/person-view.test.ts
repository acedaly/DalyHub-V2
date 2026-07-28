import { describe, expect, it } from "vitest";

import type { Person } from "~/kernel/people";
import { parseWorkspaceId } from "~/kernel/workspaces";
import {
  contactMethodLabel,
  followUpFrequencyLabel,
  formatBirthday,
  formatPersonDate,
  personInitials,
  relationshipLabel,
  serializePerson,
  serializePersonListItem,
} from "~/modules/people/person-view";

function person(overrides: Partial<Person> = {}): Person {
  return {
    id: "p1",
    workspaceId: parseWorkspaceId("ws"),
    title: "Ada Lovelace",
    preferredName: null,
    firstName: null,
    middleName: null,
    lastName: null,
    pronouns: null,
    organisation: null,
    role: null,
    department: null,
    email: null,
    secondaryEmail: null,
    mobile: null,
    workPhone: null,
    address: null,
    website: null,
    birthday: null,
    relationship: null,
    tags: [],
    notes: null,
    favouriteContactMethod: null,
    followUpFrequency: null,
    nextFollowUp: null,
    lastInteraction: null,
    photoUrl: null,
    createdAt: new Date("2026-07-01T00:00:00.000Z"),
    updatedAt: new Date("2026-07-02T00:00:00.000Z"),
    deletedAt: null,
    archivedAt: null,
    ...overrides,
  };
}

describe("personInitials", () => {
  it("uses first + last name when available", () => {
    expect(
      personInitials({ title: "x", firstName: "Ada", lastName: "Lovelace" }),
    ).toBe("AL");
  });
  it("falls back to the display name’s words", () => {
    expect(personInitials({ title: "Grace Hopper" })).toBe("GH");
  });
  it("uses a single letter for a one-word name", () => {
    expect(personInitials({ title: "Prince" })).toBe("P");
  });
  it("prefers the preferred name over the first name", () => {
    expect(
      personInitials({ title: "x", preferredName: "Bee", lastName: "Carter" }),
    ).toBe("BC");
  });
});

describe("vocabulary labels", () => {
  it("maps relationship, contact method and frequency to human labels", () => {
    expect(relationshipLabel("direct_report")).toBe("Direct Report");
    expect(contactMethodLabel("work_phone")).toBe("Work phone");
    expect(followUpFrequencyLabel("biannually")).toBe("Every 6 months");
    expect(relationshipLabel(null)).toBeNull();
    expect(relationshipLabel("unknown")).toBeNull();
  });
});

describe("date formatting", () => {
  it("formats a calendar date and a birthday without the year", () => {
    expect(formatPersonDate("2026-12-25")).toContain("2026");
    expect(formatBirthday("2026-12-25")).not.toContain("2026");
    expect(formatPersonDate(null)).toBeNull();
    expect(formatPersonDate("not-a-date")).toBeNull();
  });
});

describe("serialization", () => {
  it("projects a list item with derived labels and archived flag", () => {
    const item = serializePersonListItem(
      person({ relationship: "friend", archivedAt: new Date() }),
    );
    expect(item.relationshipLabel).toBe("Friend");
    expect(item.archived).toBe(true);
    expect(item.initials).toBe("AL");
  });

  it("projects a full record as JSON-safe strings", () => {
    const full = serializePerson(person({ email: "ada@example.com" }));
    expect(full.email).toBe("ada@example.com");
    expect(typeof full.createdAt).toBe("string");
    expect(full.archived).toBe(false);
  });
});
