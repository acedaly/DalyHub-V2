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

import { useCallback, useMemo, useState } from "react";

import { LoadMore } from "~/shared/load-more";
import {
  availableReferenceFamilies,
  ReferenceList,
  referenceFamilyOf,
  referencesOfType,
  type RecordReference,
  type ReferencePage,
} from "~/shared/references";

/**
 * The module-agnostic "related to" link type the shared REL-01 picker creates
 * and removes. Declared here as a plain constant rather than imported from the
 * platform layer, which a component must not depend on.
 */
const UNIVERSAL_RELATED_LINK = "link.related";

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

/** The filter value meaning "show every module". */
const ALL_FAMILIES = "all";

export function NoteBacklinksTab({ noteId, page }: NoteBacklinksTabProps) {
  const { items, hasMore, loading, loadFailed, loadMore } = useReferencePages(
    noteId,
    "incoming",
    page,
  );
  const [family, setFamily] = useState<string>(ALL_FAMILIES);

  // The filter's options are derived from what is actually loaded, so it can
  // never offer a module that would empty the list (§6: no empty groups). A
  // family that disappears as pages load — or was only on a later page — simply
  // stops being offered, and the selection falls back to "All".
  const families = useMemo(() => availableReferenceFamilies(items), [items]);
  const activeFamily = families.some((option) => option.id === family)
    ? family
    : ALL_FAMILIES;
  const visible = useMemo(
    () =>
      activeFamily === ALL_FAMILIES
        ? items
        : items.filter(
            (reference) =>
              referenceFamilyOf(reference.record.type) === activeFamily,
          ),
    [items, activeFamily],
  );

  // Honest counting: "N loaded" while a page remains, never a claimed total —
  // the same convention every DalyHub collection subtitle uses, because the
  // bounded read genuinely does not know the total (§6, §26).
  const countLabel = hasMore
    ? `${items.length} loaded`
    : `${items.length} ${items.length === 1 ? "backlink" : "backlinks"}`;

  return (
    <section className="dh-note-references" aria-labelledby="note-backlinks">
      <h2 id="note-backlinks" className="dh-note-references__heading">
        Referenced by
        <span className="dh-note-references__count"> ({countLabel})</span>
      </h2>
      <p className="dh-note-references__help">
        Records that explicitly link to this note — through a{" "}
        <code>[[wiki link]]</code> or a record link in their own text, or a
        relationship someone created. Simply mentioning this note’s title in
        prose is not a link.
      </p>

      {/* A native <select>, matching the NOTES-03 filter bar's deliberate
          choice: a real on-screen picker on a phone, keyboard-complete for
          free, and no custom widget semantics to get wrong. Only offered when
          there is genuinely more than one module to choose between. */}
      {families.length > 1 ? (
        <div className="dh-note-references__filter">
          <label htmlFor="note-backlinks-module">Module</label>
          <select
            id="note-backlinks-module"
            value={activeFamily}
            onChange={(event) => setFamily(event.target.value)}
          >
            <option value={ALL_FAMILIES}>All modules ({items.length})</option>
            {families.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} ({option.count})
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <ReferenceList
        references={visible}
        groupByFamily={activeFamily === ALL_FAMILIES}
        groupHeadingLevel={3}
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
  // The body-derived references — everything EXCEPT the `link.related` links the
  // shared picker below owns. Showing those in both places would put the same
  // relationship on screen twice with two different removal models (one
  // optimistic and editable, one server-rendered and read-only), which is
  // exactly the ambiguity §4 asks these sections to avoid.
  const written = items.filter(
    (reference) => reference.linkType !== UNIVERSAL_RELATED_LINK,
  );

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
          Referenced in this note
        </h2>
        <p className="dh-note-references__help">
          Records this note points at from its own text, grouped by kind. A{" "}
          <code>[[wiki link]]</code> in the body becomes a real relationship,
          and is kept in step with the text every time the note is saved. Links
          you add by hand are managed below.
        </p>
        <ReferenceList
          references={written}
          groupByType
          groupHeadingLevel={3}
          label="Records this note references"
          emptyTitle="This note references nothing yet"
          emptyDescription="Write [[a record title]] in the note to link it, or add a relationship by hand below."
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
