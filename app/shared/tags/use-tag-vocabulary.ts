/**
 * V2.6 FIND-02 — the client's one read of the workspace tag vocabulary.
 *
 * A tagging FORM calls this and hands the result to `TagsField`. That is the
 * whole contract, and it is deliberately a hook rather than a prop threaded
 * through seven loaders: the vocabulary is needed wherever a tag is edited, and
 * a page that never edits a tag should not pay a query for it.
 *
 * `TagsField` itself stays pure — it renders the vocabulary it is given and
 * fetches nothing — so it remains testable without a router and reusable by a
 * surface (the Tasks collection) that already has the list from its own loader.
 *
 * The read is idempotent, bounded and cache-free: one `GET /tags` per mounted
 * tagging form. It is deliberately NOT memoised across mounts. A stale
 * vocabulary is a picker that cannot offer a word the owner created a minute ago
 * on another surface, and re-reading a bounded list is cheaper than being wrong
 * about what the workspace contains.
 *
 * A failed read yields an empty vocabulary, never an error state: the field
 * still lets the owner type a tag, and the record's own mutate route is the
 * authority for what is written either way.
 */

import { useEffect, useState } from "react";

import type { WorkspaceTag } from "~/kernel/tags";

/** The endpoint every tagging surface reads. */
export const TAG_VOCABULARY_PATH = "/tags";

export function useTagVocabulary(): readonly WorkspaceTag[] {
  const [tags, setTags] = useState<readonly WorkspaceTag[]>([]);

  useEffect(() => {
    let live = true;
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch(TAG_VOCABULARY_PATH, {
          credentials: "same-origin",
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) return;
        const body: unknown = await response.json();
        const list = (body as { tags?: unknown })?.tags;
        if (!live || !Array.isArray(list)) return;
        setTags(
          list.filter(
            (entry): entry is WorkspaceTag =>
              typeof entry === "object" &&
              entry !== null &&
              typeof (entry as WorkspaceTag).key === "string" &&
              typeof (entry as WorkspaceTag).label === "string",
          ),
        );
      } catch {
        // Calm by design: no vocabulary is a narrower picker, never an error.
      }
    })();
    return () => {
      live = false;
      controller.abort();
    };
  }, []);

  return tags;
}
