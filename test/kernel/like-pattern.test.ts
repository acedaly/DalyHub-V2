import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";

import { likeContains, likePrefix } from "~/platform/storage/d1/like-pattern";

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

  it("keeps prefix patterns bounded and escaped", async () => {
    const pattern = likePrefix("\\");

    expect(pattern).not.toBe("%");
    expect(encoder.encode(pattern).byteLength).toBeLessThanOrEqual(50);
    await expect(likeMatches("\\start", pattern)).resolves.toBe(true);
    await expect(likeMatches("start", pattern)).resolves.toBe(false);
  });
});
