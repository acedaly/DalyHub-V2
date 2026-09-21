import { describe, expect, it } from "vitest";

import {
  chooseCandidate,
  guardDuplicate,
  normaliseReference,
  PossibleDuplicateError,
  type ReferenceCandidate,
} from "~/platform/chief-of-staff/reference-resolution";

const area = (id: string, title: string): ReferenceCandidate => ({ id, title });

describe("Chief of Staff reference normalisation", () => {
  it("folds case, punctuation, accents and spacing into one name", () => {
    expect(normaliseReference("Career Development")).toBe(
      normaliseReference("career  development"),
    );
    expect(normaliseReference("Career-Development")).toBe(
      normaliseReference("Career Development"),
    );
    expect(normaliseReference("Renée O'Brien")).toBe(
      normaliseReference("renee obrien"),
    );
  });

  it("keeps genuinely different names different", () => {
    // The point of normalising is to forgive formatting, not to blur meaning:
    // an Area called "Career" is not the Area called "Career Development".
    expect(normaliseReference("Career")).not.toBe(
      normaliseReference("Career Development"),
    );
  });
});

describe("Chief of Staff reference resolution rules", () => {
  it("resolves an exact name even when partial matches crowd around it", () => {
    const resolution = chooseCandidate("area", "Career", [
      area("a1", "Career"),
      area("a2", "Career Development"),
      area("a3", "Career Break"),
    ]);
    expect(resolution).toMatchObject({
      status: "resolved",
      match: { id: "a1", matchedOn: "name" },
    });
  });

  it("resolves a single partial match, because there is nothing to confuse it with", () => {
    const resolution = chooseCandidate("project", "OpO", [
      area("p1", "OpO Program"),
    ]);
    expect(resolution).toMatchObject({
      status: "resolved",
      match: { id: "p1", matchedOn: "partial_name" },
    });
  });

  it("refuses to choose between two people with the same name", () => {
    const resolution = chooseCandidate("person", "John", [
      { id: "pe1", title: "John", subtitle: "Finance" },
      { id: "pe2", title: "John", subtitle: "Orana" },
    ]);
    expect(resolution.status).toBe("ambiguous");
    if (resolution.status !== "ambiguous") throw new Error("unreachable");
    expect(resolution.matches.map((match) => match.id)).toEqual(["pe1", "pe2"]);
    // The candidates carry the disambiguating context, so Claude can ask a
    // question the owner can answer without opening DalyHub.
    expect(resolution.matches.map((match) => match.subtitle)).toEqual([
      "Finance",
      "Orana",
    ]);
  });

  it("refuses to choose between several partial matches", () => {
    const resolution = chooseCandidate("project", "Capability", [
      area("p1", "Capability 10/11 Application Preparation"),
      area("p2", "Capability Framework Review"),
    ]);
    expect(resolution.status).toBe("ambiguous");
  });

  it("resolves a Person by an identifying alias such as their email", () => {
    const resolution = chooseCandidate("person", "kate@example.com", [
      {
        id: "pe9",
        title: "Kate Nguyen",
        aliases: ["Kate", "kate@example.com"],
      },
    ]);
    expect(resolution).toMatchObject({
      status: "resolved",
      match: { id: "pe9", matchedOn: "email" },
    });
  });

  it("reports nothing found rather than inventing a record", () => {
    expect(chooseCandidate("area", "Wedding", []).status).toBe("not_found");
    expect(chooseCandidate("area", "   ", [area("a1", "Work")]).status).toBe(
      "not_found",
    );
  });
});

describe("Chief of Staff duplicate protection", () => {
  it("stops a creation that repeats an existing name, and says what matched", () => {
    let thrown: unknown;
    try {
      guardDuplicate("area", "career development", [
        area("a1", "Career Development"),
      ]);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(PossibleDuplicateError);
    const payload = (thrown as PossibleDuplicateError).payload;
    expect(payload.status).toBe("possible_duplicate");
    expect(payload.matches).toEqual([
      expect.objectContaining({ id: "a1", title: "Career Development" }),
    ]);
  });

  it("stops a Person who shares an email, even under a different name", () => {
    expect(() =>
      guardDuplicate(
        "person",
        "K. Nguyen",
        [{ id: "pe9", title: "Kate Nguyen", aliases: ["kate@example.com"] }],
        { aliases: ["kate@example.com"] },
      ),
    ).toThrow(PossibleDuplicateError);
  });

  it("lets a merely similar name through, because blocking it would be useless", () => {
    // "Career Development 2027" is not "Career Development". A duplicate check
    // that refused every near miss would refuse most legitimate creations.
    expect(() =>
      guardDuplicate("area", "Career Development 2027", [
        area("a1", "Career Development"),
      ]),
    ).not.toThrow();
  });

  it("creates anyway once the owner has confirmed a second one is wanted", () => {
    expect(() =>
      guardDuplicate("person", "John", [area("pe1", "John")], {
        allowDuplicate: true,
      }),
    ).not.toThrow();
  });
});
