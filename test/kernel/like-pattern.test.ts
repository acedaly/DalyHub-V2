import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import {
  likeContains,
  likeContainsNeedle,
  likePrefix,
} from "~/platform/storage/d1/like-pattern";

const encoder = new TextEncoder();

async function likeMatches(value: string, pattern: string): Promise<boolean> {
  const result = await env.DB.prepare("SELECT ? LIKE ? ESCAPE '\\' AS matched")
    .bind(value, pattern)
    .first<{ matched: number }>();
  return result?.matched === 1;
}

describe("D1 LIKE pattern helper", () => {
  it("escapes a trailing literal backslash without creating a match-all pattern", async () => {
    const pattern = likeContains("\\");

    expect(pattern).not.toBe("%%");
    expect(encoder.encode(pattern).byteLength).toBeLessThanOrEqual(50);
    await expect(likeMatches("path\\", pattern)).resolves.toBe(true);
    await expect(likeMatches("plain text", pattern)).resolves.toBe(false);
  });

  it("escapes wildcards as literals", async () => {
    const percent = likeContains("%");
    const underscore = likeContains("_");

    await expect(likeMatches("100%", percent)).resolves.toBe(true);
    await expect(likeMatches("1000", percent)).resolves.toBe(false);
    await expect(likeMatches("a_b", underscore)).resolves.toBe(true);
    await expect(likeMatches("axb", underscore)).resolves.toBe(false);
  });

  it("bounds multibyte Unicode patterns without splitting a code point", async () => {
    const pattern = likeContains("😀".repeat(40));

    expect(encoder.encode(pattern).byteLength).toBeLessThanOrEqual(50);
    expect(pattern.endsWith("%")).toBe(true);
    await expect(
      likeMatches(`prefix ${"😀".repeat(40)} suffix`, pattern),
    ).resolves.toBe(true);
  });

  /*
   * RECALL-01 — the bounded needle, and why it has to exist.
   *
   * A pattern longer than the budget is TRUNCATED, so the predicate matches on a
   * prefix of what the owner typed. Anything else in the same statement that
   * reasons about the query — the excerpt `instr()`, the JavaScript match-source
   * checks — must reason about that same prefix, or the statement disagrees with
   * itself and a body hit is reported as a title hit with no excerpt.
   */
  it("returns the RAW text a contains-pattern will actually match on", async () => {
    const short = "ordinary query";
    // Inside the budget: unchanged, so the ordinary case is untouched.
    expect(likeContainsNeedle(short)).toBe(short);

    const long = "quibnarp".repeat(10);
    const needle = likeContainsNeedle(long);
    expect(needle.length).toBeLessThan(long.length);
    // The needle is exactly the pattern's own content, wrappers removed.
    expect(likeContains(long)).toBe(`%${needle}%`);
    // …and it is a real prefix of the query, never a re-encoding of it.
    expect(long.startsWith(needle)).toBe(true);

    // The pattern it corresponds to matches a value containing the needle and
    // NOT the rest of the query — the exact case that used to be mislabelled.
    await expect(
      likeMatches(`body carrying ${needle} and no more`, likeContains(long)),
    ).resolves.toBe(true);
  });

  it("spends the budget on ESCAPED bytes, so the raw and escaped cuts agree", () => {
    // A literal `%` costs two bytes in the pattern; the raw needle must stop at
    // the same code point, or `instr()` would look for characters the pattern
    // never carried.
    const value = `${"%".repeat(30)}tail`;
    const needle = likeContainsNeedle(value);
    expect(likeContains(value)).toBe(`%${needle.replaceAll("%", "\\%")}%`);
    expect(value.startsWith(needle)).toBe(true);
  });

  it("never splits a code point when bounding the raw needle", () => {
    const needle = likeContainsNeedle("😀".repeat(40));
    expect([...needle].every((point) => point === "😀")).toBe(true);
    expect(
      encoder.encode(likeContains("😀".repeat(40))).byteLength,
    ).toBeLessThanOrEqual(50);
  });

  it("keeps prefix patterns bounded and escaped", async () => {
    const pattern = likePrefix("\\");

    expect(pattern).not.toBe("%");
    expect(encoder.encode(pattern).byteLength).toBeLessThanOrEqual(50);
    await expect(likeMatches("\\start", pattern)).resolves.toBe(true);
    await expect(likeMatches("start", pattern)).resolves.toBe(false);
  });
});
