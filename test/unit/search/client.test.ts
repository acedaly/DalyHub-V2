/**
 * DS-08 Search — the browser transport serialises the record anchor.
 *
 * Regression for Codex thread PRRT_kwDOTbatJs6T6Oym: the boosting branch on the
 * server was unreachable because `fetchSearch` never sent `boostLinkedTo`. These
 * assert the query is always sent and the anchor is sent only when supplied.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchSearch,
  SEARCH_BOOST_PARAM,
  SEARCH_QUERY_PARAM,
} from "~/shared/search/client";
import { emptyOutcome } from "~/shared/search/model";

function stubFetchCapturingUrl(): { urls: string[] } {
  const urls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      urls.push(String(input));
      return new Response(JSON.stringify(emptyOutcome("q")), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
  return { urls };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchSearch", () => {
  it("sends only the query when no record anchor is supplied", async () => {
    const { urls } = stubFetchCapturingUrl();
    await fetchSearch("hello world", new AbortController().signal);
    const url = new URL(urls[0]!, "https://app.test");
    expect(url.searchParams.get(SEARCH_QUERY_PARAM)).toBe("hello world");
    expect(url.searchParams.has(SEARCH_BOOST_PARAM)).toBe(false);
  });

  it("serialises the record anchor as boostLinkedTo when supplied", async () => {
    const { urls } = stubFetchCapturingUrl();
    await fetchSearch("q", new AbortController().signal, {
      boostLinkedTo: "note-123",
    });
    const url = new URL(urls[0]!, "https://app.test");
    expect(url.searchParams.get(SEARCH_QUERY_PARAM)).toBe("q");
    expect(url.searchParams.get(SEARCH_BOOST_PARAM)).toBe("note-123");
  });

  it("omits a blank/whitespace anchor", async () => {
    const { urls } = stubFetchCapturingUrl();
    await fetchSearch("q", new AbortController().signal, {
      boostLinkedTo: "   ",
    });
    const url = new URL(urls[0]!, "https://app.test");
    expect(url.searchParams.has(SEARCH_BOOST_PARAM)).toBe(false);
  });
});
