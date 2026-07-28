/**
 * NOTES-02 — the Note record's Backlinks and Links tabs.
 *
 * These are two DIFFERENT questions, so they are two different surfaces — never
 * one ambiguous "related" list (§4):
 *
 *   - **Backlinks** — every record that explicitly links TO this note, whatever
 *     module it lives in. A backlink is an explicit typed relationship, never a
 *     text coincidence: writing this note's title in a sentence does not create
 *     one; writing `[[This note]]`, or linking the records, does.
 *   - **Links** — what this note points AT: the Projects it documents, the
 *     records its body references, and the relationships the user manages by
 *     hand through the shared REL-01 Linked Items picker. Each is its own
 *     labelled section with its own heading, so "who points at me", "what I
 *     point at" and "what I can edit here" never blur together.
 *
 * Both compose the shared `~/shared/references` list; neither introduces a
 * Notes-only relationship representation.
 */

import { useCallback, useState } from "react";

import { LoadMore } from "~/shared/load-more";
import {
  ReferenceList,
  referencesOfType,
  type RecordReference,
  type ReferencePage,
} from "~/shared/references";

/** Fetch a further page of references for the shared "Load more" affordance. */
function useReferencePages(
  noteId: string,
  direction: "incoming" | "outgoing",
  first: ReferencePage,
) {
  const [items, setItems] = useState<readonly RecordReference[]>(first.items);
  const [cursor, setCursor] = useState<string | null>(first.nextCursor);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  const loadMore = useCallback(async () => {
    if (cursor === null) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const response = await fetch(
        `/notes/${encodeURIComponent(noteId)}/references?direction=${direction}&cursor=${encodeURIComponent(cursor)}`,
      );
      if (!response.ok) throw new Error("Failed to load references");
      const page = (await response.json()) as ReferencePage;
      setItems((prev) => {
        const seen = new Set(prev.map((item) => item.linkId));
        return [
          ...prev,
          ...page.items.filter((item) => !seen.has(item.linkId)),
        ];
      });
      setCursor(page.nextCursor);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [cursor, direction, noteId]);

  return { items, hasMore: cursor !== null, loading, loadFailed, loadMore };
}

export interface NoteBacklinksTabProps {
  readonly noteId: string;
  readonly page: ReferencePage;
}

export function NoteBacklinksTab({ noteId, page }: NoteBacklinksTabProps) {
  const { items, hasMore, loading, loadFailed, loadMore } = useReferencePages(
    noteId,
    "incoming",
    page,
  );

  return (
    <section className="dh-note-references" aria-labelledby="note-backlinks">
      <h2 id="note-backlinks" className="dh-note-references__heading">
        Referenced by
      </h2>
      <p className="dh-note-references__help">
        Records that explicitly link to this note — through a{" "}
        <code>[[wiki link]]</code> in their own text, or a relationship someone
        created. Simply mentioning this note’s title in prose is not a link.
      </p>
      <ReferenceList
        references={items}
        label="Records linking to this note"
        emptyTitle="Nothing links here yet"
        emptyDescription="When another record links to this note — a project, a task, a meeting or another note — it will appear here."
      />
      {hasMore ? (
        <LoadMore
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={() => void loadMore()}
          label="Load more backlinks"
        />
      ) : null}
    </section>
  );
}

export interface NoteLinksTabProps {
  readonly noteId: string;
  readonly page: ReferencePage;
  /** The shared REL-01 Linked Items surface — where relationships are edited. */
  readonly linkedItems: React.ReactNode;
}

export function NoteLinksTab({ noteId, page, linkedItems }: NoteLinksTabProps) {
  const { items, hasMore, loading, loadFailed, loadMore } = useReferencePages(
    noteId,
    "outgoing",
    page,
  );
  const projects = referencesOfType(items, "project");

  return (
    <div className="dh-note-references">
      <section aria-labelledby="note-projects">
        <h2 id="note-projects" className="dh-note-references__heading">
          Projects this note documents
        </h2>
        <ReferenceList
          references={projects}
          label="Projects linked from this note"
          emptyTitle="Not linked to a project"
          emptyDescription="Link this note to a project to make it part of that project’s knowledge."
        />
      </section>

      <section aria-labelledby="note-outgoing">
        <h2 id="note-outgoing" className="dh-note-references__heading">
          Links from this note
        </h2>
        <p className="dh-note-references__help">
          Records this note points at, grouped by kind. References written as{" "}
          <code>[[wiki links]]</code> in the body are kept in step with the text
          every time the note is saved.
        </p>
        <ReferenceList
          references={items}
          groupByType
          groupHeadingLevel={3}
          label="Records this note links to"
          emptyTitle="This note links to nothing yet"
          emptyDescription="Write [[a record title]] in the note, or add a relationship below."
        />
        {hasMore ? (
          <LoadMore
            loading={loading}
            loadFailed={loadFailed}
            onLoadMore={() => void loadMore()}
            label="Load more links"
          />
        ) : null}
      </section>

      <section aria-labelledby="note-managed-links">
        <h2 id="note-managed-links" className="dh-note-references__heading">
          Manage relationships
        </h2>
        {linkedItems}
      </section>
    </div>
  );
}
