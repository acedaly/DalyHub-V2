/**
 * V2.16 CONSOL-04 — the trust boundary between the two buckets is a CHECK.
 *
 * `PRODUCT_MAP.md` says the backups bucket sits "in a separate trust boundary"
 * and that "the application Worker deliberately **cannot reach it**", and
 * ADR-124 gives that as one of the two measured reasons DalyHub has no
 * delete-workspace button: the button could not honour its own promise, because
 * the code behind it cannot touch the copies.
 *
 * V2.16's independent review pointed out that the only artefact behind either
 * claim was a COMMENT in `wrangler.jsonc`. `backup-configuration.test.ts`
 * asserts over `infra/backup/wrangler.jsonc` — the backup Worker's own config —
 * and nothing read the application's. Adding
 * `{"binding": "BACKUPS", "bucket_name": "dalyhub-v2-backups"}` to the app
 * would have collapsed the boundary with a green suite and a one-line diff.
 *
 * So: the application Worker's bucket bindings are enumerated, in every
 * environment, and the backups bucket is asserted absent by name.
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const ROOT = process.cwd();
const RAW = readFileSync(path.join(ROOT, "wrangler.jsonc"), "utf8");

/** JSONC → JSON. Comments only; this file has no other JSON5 syntax. */
function parseJsonc(source: string): Record<string, unknown> {
  const withoutComments = source
    .split("\n")
    .map((line) => (/^\s*\/\//.test(line) ? "" : line))
    .join("\n")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  // Trailing commas, which the schema allows and JSON does not.
  return JSON.parse(withoutComments.replace(/,(\s*[}\]])/g, "$1")) as Record<
    string,
    unknown
  >;
}

type Bucket = { binding: string; bucket_name: string };

/** Every `r2_buckets` block in the file: the top level and each environment. */
function bucketBlocks(): { where: string; buckets: Bucket[] }[] {
  const config = parseJsonc(RAW);
  const blocks: { where: string; buckets: Bucket[] }[] = [
    { where: "top level", buckets: (config.r2_buckets as Bucket[]) ?? [] },
  ];
  const env = (config.env ?? {}) as Record<string, { r2_buckets?: Bucket[] }>;
  for (const [name, value] of Object.entries(env)) {
    blocks.push({ where: `env.${name}`, buckets: value.r2_buckets ?? [] });
  }
  return blocks;
}

describe("the application Worker's object storage", () => {
  it("binds exactly one bucket, everywhere", () => {
    const blocks = bucketBlocks();
    // If this reaches zero the parse has rotted and the file proves nothing.
    expect(blocks.length).toBeGreaterThan(1);
    for (const block of blocks) {
      expect(
        block.buckets.map((bucket) => bucket.binding),
        `${block.where} binds more than the attachments bucket`,
      ).toEqual(["ATTACHMENTS"]);
    }
  });

  it("never names the BACKUPS bucket as a binding", () => {
    for (const block of bucketBlocks()) {
      for (const bucket of block.buckets) {
        expect(
          bucket.bucket_name,
          `${block.where} binds ${bucket.bucket_name} into the application Worker`,
        ).not.toMatch(/backup/i);
      }
    }
  });

  it("reaches backup health through a SERVICE binding, not through the bytes", () => {
    /*
     * The positive half. Settings → Backups genuinely shows backup health, and
     * the way it does that is the whole point of the boundary: a service
     * binding to the backup Worker, which answers questions about the copies
     * without handing over access to them.
     */
    expect(RAW).toContain("dalyhub-v2-backup");
    expect(RAW).toContain("services");
  });
});
