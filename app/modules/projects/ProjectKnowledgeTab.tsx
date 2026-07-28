/**
 * PROJ-03 — the Project Knowledge tab.
 *
 * A Project's notes, gathered in the Project. Composed entirely from shared
 * surfaces — the DS-04 `Card`/`CardCollection` the rest of the app uses for
 * record rows, the DS-06 `EntityLinkPicker` for search-to-add, the DS-06 `Form`
 * primitives for "New note", `LoadMore` for pagination and the DS-10 Feedback
 * platform for outcomes. There is no Projects-local note store, no second note
 * card and no bespoke picker.
 *
 * The three affordances map exactly onto the relationship model (see
 * `project-knowledge.ts`):
 *   - **Add an existing note** creates one `link.related` EntityLink;
 *   - **New note** creates the Note AND the link in one server request, so the
 *     Project relationship is preserved automatically;
 *   - **Remove** unlinks — the wording says so, and the Note is untouched.
 */

import { useCallback, useEffect, useState } from "react";

import { Card, CardCollection, type CardProps } from "~/shared/card";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import {
  EntityLinkPicker,
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  TextField,
  required,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";
import type { EntityLinkTargetOption } from "~/shared/forms/model";
import { LoadMore } from "~/shared/load-more";

import type { ProjectKnowledgeResult } from "./routes/knowledge";

/** The JSON-safe shape the Knowledge endpoint and the record loader both return. */
export interface SerializedKnowledgeNote {
  readonly id: string;
  readonly title: string;
  readonly archived: boolean;
  readonly excerpt: string;
  readonly linkedAt: string;
}

export interface SerializedKnowledgePage {
  readonly notes: readonly SerializedKnowledgeNote[];
  readonly nextCursor: string | null;
}

export interface ProjectKnowledgeTabProps {
  readonly projectId: string;
  readonly page: SerializedKnowledgePage;
  /** Archived projects are read-only everywhere; Knowledge is no exception. */
  readonly readOnly?: boolean;
  /** Open a note's canonical record (SPA navigation). */
  readonly onOpenNote: (noteId: string) => void;
}

async function post(
  projectId: string,
  body: FormData,
): Promise<ProjectKnowledgeResult> {
  const response = await fetch(
    `/projects/${encodeURIComponent(projectId)}/knowledge`,
    { method: "POST", body },
  );
  return (await response.json()) as ProjectKnowledgeResult;
}

function toCardProps(
  note: SerializedKnowledgeNote,
  onOpenNote: (id: string) => void,
  onRemove: (note: SerializedKnowledgeNote) => void,
  removing: boolean,
  readOnly: boolean,
): CardProps {
  return {
    id: note.id,
    title: note.title,
    typeLabel: "Note",
    icon: <EntityIcon type="note" />,
    headingLevel: 3,
    ...(note.excerpt ? { subtitle: note.excerpt } : {}),
    metadata: note.archived
      ? // Archive state is stated in WORDS, never colour or a glyph alone.
        [{ id: "state", label: "State", value: "Archived" }]
      : [],
    density: "compact",
    presentation: "list",
    href: `/notes/${encodeURIComponent(note.id)}`,
    onOpen: () => onOpenNote(note.id),
    openAriaLabel: `Open ${note.title}`,
    quickActions: readOnly
      ? []
      : [
          {
            id: "remove",
            label: "Remove from project",
            pending: removing,
            onSelect: () => onRemove(note),
          },
        ],
  };
}

export function ProjectKnowledgeTab({
  projectId,
  page,
  readOnly = false,
  onOpenNote,
}: ProjectKnowledgeTabProps) {
  const feedback = useFeedback();
  const [notes, setNotes] = useState<readonly SerializedKnowledgeNote[]>(
    page.notes,
  );
  const [cursor, setCursor] = useState<string | null>(page.nextCursor);
  const [loading, setLoading] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // A server revalidation (a note renamed, a link added elsewhere) must win over
  // local state, so the tab never drifts from the record loader's truth.
  useEffect(() => {
    setNotes(page.notes);
    setCursor(page.nextCursor);
  }, [page]);

  const refresh = useCallback(async () => {
    const response = await fetch(
      `/projects/${encodeURIComponent(projectId)}/knowledge`,
    );
    if (!response.ok) return;
    const fresh = (await response.json()) as SerializedKnowledgePage;
    setNotes(fresh.notes);
    setCursor(fresh.nextCursor);
  }, [projectId]);

  const loadMore = useCallback(async () => {
    if (cursor === null) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const response = await fetch(
        `/projects/${encodeURIComponent(projectId)}/knowledge?cursor=${encodeURIComponent(cursor)}`,
      );
      if (!response.ok) throw new Error("Failed to load knowledge");
      const next = (await response.json()) as SerializedKnowledgePage;
      setNotes((prev) => {
        const seen = new Set(prev.map((note) => note.id));
        return [...prev, ...next.notes.filter((note) => !seen.has(note.id))];
      });
      setCursor(next.nextCursor);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [cursor, projectId]);

  const searchNotes = useCallback(
    async (
      query: string,
      signal: AbortSignal,
    ): Promise<readonly EntityLinkTargetOption[]> => {
      const response = await fetch(
        `/projects/${encodeURIComponent(projectId)}/knowledge?op=search&q=${encodeURIComponent(query)}`,
        { signal },
      );
      if (!response.ok) return [];
      const data = (await response.json()) as {
        options: readonly EntityLinkTargetOption[];
      };
      return data.options;
    },
    [projectId],
  );

  const addNote = useCallback(
    async (target: EntityLinkTargetOption) => {
      const body = new FormData();
      body.set("intent", "add");
      body.set("noteId", target.id);
      const result = await post(projectId, body);
      if (result.kind !== "add" || !result.ok) {
        throw new Error("Could not add that note to this project.");
      }
      await refresh();
      feedback.notifySuccess(`“${target.title}” added to this project.`);
    },
    [feedback, projectId, refresh],
  );

  const removeNote = useCallback(
    async (note: SerializedKnowledgeNote) => {
      setRemovingId(note.id);
      try {
        const body = new FormData();
        body.set("intent", "remove");
        body.set("noteId", note.id);
        const result = await post(projectId, body);
        if (result.kind !== "remove" || !result.ok) {
          feedback.notifyError(
            `We couldn’t remove “${note.title}” from this project.`,
          );
          return;
        }
        setNotes((prev) => prev.filter((item) => item.id !== note.id));
        // The wording is the guarantee: the note itself is untouched.
        feedback.notifySuccess(
          `“${note.title}” removed from this project. The note itself is unchanged.`,
        );
      } finally {
        setRemovingId(null);
      }
    },
    [feedback, projectId],
  );

  return (
    <div className="dh-project-knowledge">
      {/* A real section heading keeps the record's outline valid: the record
          title is the page's h1, so this tab's rows and empty state sit at h3
          under this h2 rather than skipping a level (WCAG 2.2 — no skipped
          heading levels; proven by the axe gate in `notes-knowledge.spec.ts`). */}
      <h2 className="dh-project-knowledge__heading">Linked notes</h2>
      <p className="dh-project-knowledge__help">
        Notes linked to this project. Adding or removing a note here only
        changes the link — the note itself is never deleted or archived.
      </p>

      {readOnly ? null : (
        <div className="dh-project-knowledge__actions">
          <EntityLinkPicker
            label="Add an existing note"
            help="Search your notes by title or content."
            anchorId={projectId}
            linkTypes={[{ type: "link.related", label: "Related" }]}
            existingLinks={notes.map((note) => ({
              linkId: note.id,
              linkType: "link.related",
              direction: "outgoing" as const,
              target: { id: note.id, type: "note", title: note.title },
            }))}
            hideExistingList
            searchTargets={searchNotes}
            onLink={({ target }) => addNote(target)}
            onUnlink={async () => {
              /* Removal is offered on each row, not in the picker. */
            }}
            renderTargetIcon={() => <EntityIcon type="note" />}
            placeholder="Search notes…"
          />
          <NewKnowledgeNoteForm
            projectId={projectId}
            onCreated={(noteId) => onOpenNote(noteId)}
          />
        </div>
      )}

      {notes.length === 0 ? (
        <EmptyState
          icon={<EntityIcon type="note" />}
          title="No knowledge linked yet"
          description="Link the notes that document this project — research, decisions, references — so they live where the work does."
          headingLevel={3}
          size="compact"
        />
      ) : (
        <CardCollection
          items={notes}
          getItemId={(note) => note.id}
          ariaLabel="Notes linked to this project"
          presentation="list"
          density="compact"
          renderCard={(note) => (
            <Card
              {...toCardProps(
                note,
                onOpenNote,
                (target) => void removeNote(target),
                removingId === note.id,
                readOnly,
              )}
            />
          )}
        />
      )}

      {cursor !== null ? (
        <LoadMore
          loading={loading}
          loadFailed={loadFailed}
          onLoadMore={() => void loadMore()}
          label="Load more notes"
        />
      ) : null}
    </div>
  );
}

type NewNoteValues = { readonly title: string };

const FIELD_LABELS: Record<string, string> = { title: "Title" };

/**
 * Create a Note that is linked to this Project from the moment it exists — the
 * link is written in the SAME server request as the note, so a failure after
 * creation can never leave an orphaned note the user has to re-attach.
 */
function NewKnowledgeNoteForm({
  projectId,
  onCreated,
}: {
  readonly projectId: string;
  readonly onCreated: (noteId: string) => void;
}) {
  const form = useForm<NewNoteValues>({
    initialValues: { title: "" },
    fields: { title: { validate: required("A title is required") } },
    fieldOrder: ["title"],
    onSubmit: async (values): Promise<SubmitOutcome<NewNoteValues>> => {
      const body = new FormData();
      body.set("intent", "create");
      body.set("title", values.title);
      let data: ProjectKnowledgeResult;
      try {
        data = await post(projectId, body);
      } catch {
        return {
          status: "error",
          formError: "That couldn’t be saved. Please try again.",
        };
      }
      if (data.kind === "create" && data.ok) {
        onCreated(data.noteId);
        return { status: "success" };
      }
      return {
        status: "error",
        formError: data.kind === "create" ? data.formError : undefined,
        fieldErrors:
          data.kind === "create"
            ? (data.fieldErrors as
                | Partial<Record<keyof NewNoteValues & string, string>>
                | undefined)
            : undefined,
      };
    },
  });

  const titleField = form.field("title");

  return (
    <Form
      aria-label="Create a note in this project"
      busy={form.isSubmitting}
      onSubmit={form.handleSubmit}
    >
      <FormErrorSummary
        formError={form.formError}
        fieldErrors={form.fieldErrors}
        order={form.fieldOrder as string[]}
        labels={FIELD_LABELS}
        onFocusField={form.focusField}
      />
      <TextField
        label="New note title"
        required
        maxLength={512}
        {...titleField}
      />
      <FormActions>
        <FormButton
          type="submit"
          variant="secondary"
          pending={form.isSubmitting}
        >
          Create note
        </FormButton>
      </FormActions>
    </Form>
  );
}
