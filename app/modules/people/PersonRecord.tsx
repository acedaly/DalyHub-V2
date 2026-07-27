/**
 * PEOPLE-01 — the canonical Person record, composed through the shared DS-02
 * Record Layout.
 *
 * Presentation + client-side mutation plumbing only: the header (identity, Rename,
 * archive state) and the six tabs (Summary / Contact / Timeline / Linked / Notes /
 * Settings). Data loading lives in the route; this component renders it and posts
 * lifecycle intents (`archive` / `restore` / `delete`) to `/person/:id/mutate`,
 * revalidating on success. The Contact/Notes forms own their own saves.
 */

import { useCallback, useState } from "react";
import { useNavigate } from "react-router";

import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import { LinkedItemsTab } from "~/shared/linked-items";
import {
  RecordLayout,
  type RecordAction,
  type RecordMetaItem,
} from "~/shared/record-layout";

import { PersonContactForm } from "./PersonContactForm";
import { PersonNotesForm } from "./PersonNotesForm";
import { PersonSettingsTab } from "./PersonSettingsTab";
import { PersonSummary } from "./PersonSummary";
import { PersonTimelineTab } from "./PersonTimelineTab";
import type { SerializedPerson } from "./person-view";
import type { PersonMutationResult } from "./routes/mutate";

interface PersonRecordProps {
  readonly person: SerializedPerson;
  readonly activeTabId: string;
  readonly onTabChange: (tabId: string) => void;
  readonly onRename: () => void;
  readonly onSaved: () => void;
}

export function PersonRecord({
  person,
  activeTabId,
  onTabChange,
  onRename,
  onSaved,
}: PersonRecordProps) {
  const feedback = useFeedback();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  const post = useCallback(
    async (intent: string): Promise<PersonMutationResult> => {
      const body = new FormData();
      body.set("intent", intent);
      const response = await fetch(
        `/person/${encodeURIComponent(person.id)}/mutate`,
        { method: "POST", body },
      );
      return (await response.json()) as PersonMutationResult;
    },
    [person.id],
  );

  const onArchive = useCallback(() => {
    setPending(true);
    void post("archive")
      .then((result) => {
        if (result.kind === "archive" && result.ok) {
          feedback.notifySuccess(`"${person.title}" archived`);
          onSaved();
        } else {
          feedback.notifyError("Couldn't archive this person. Try again.");
        }
      })
      .catch(() =>
        feedback.notifyError("Couldn't archive this person. Try again."),
      )
      .finally(() => setPending(false));
  }, [post, feedback, person.title, onSaved]);

  const onRestore = useCallback(() => {
    setPending(true);
    void post("restore")
      .then((result) => {
        if (result.kind === "restore" && result.ok) {
          feedback.notifySuccess(`"${person.title}" restored`);
          onSaved();
        } else {
          feedback.notifyError("Couldn't restore this person. Try again.");
        }
      })
      .catch(() =>
        feedback.notifyError("Couldn't restore this person. Try again."),
      )
      .finally(() => setPending(false));
  }, [post, feedback, person.title, onSaved]);

  const onDelete = useCallback(async () => {
    const result = await post("delete");
    if (result.kind === "delete" && result.ok) {
      navigate("/people");
      return;
    }
    throw new Error("Couldn't delete this person.");
  }, [post, navigate]);

  const renameAction: RecordAction = {
    id: "rename",
    label: "Rename",
    variant: "secondary",
    onSelect: onRename,
  };

  const headerMetadata: RecordMetaItem[] = [];
  if (person.organisation) {
    headerMetadata.push({
      id: "org",
      label: "Organisation",
      value: person.organisation,
    });
  }
  if (person.role) {
    headerMetadata.push({ id: "role", label: "Role", value: person.role });
  }
  if (person.relationshipLabel) {
    headerMetadata.push({
      id: "relationship",
      label: "Relationship",
      value: person.relationshipLabel,
    });
  }

  return (
    <RecordLayout
      title={person.title}
      typeLabel="Person"
      icon={<EntityIcon type="person" />}
      breadcrumb={[{ id: "people", label: "People", href: "/people" }]}
      status={
        person.archived ? { label: "Archived", tone: "warning" } : undefined
      }
      metadata={headerMetadata}
      secondaryActions={[renameAction]}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      tabs={[
        {
          id: "summary",
          label: "Summary",
          content: (
            <PersonSummary
              person={person}
              onEditContact={() => onTabChange("contact")}
            />
          ),
        },
        {
          id: "contact",
          label: "Contact",
          content: <PersonContactForm person={person} onSaved={onSaved} />,
        },
        {
          id: "timeline",
          label: "Timeline",
          content: (
            <PersonTimelineTab
              personId={person.id}
              reloadKey={person.updatedAt}
            />
          ),
        },
        {
          id: "linked",
          label: "Linked",
          content: (
            <LinkedItemsTab
              anchorId={person.id}
              anchorType="person"
              readOnly={person.archived}
              linkCommandTarget={{
                kind: "route",
                to: `/person/${person.id}?tab=linked`,
              }}
            />
          ),
        },
        {
          id: "notes",
          label: "Notes",
          content: <PersonNotesForm person={person} onSaved={onSaved} />,
        },
        {
          id: "settings",
          label: "Settings",
          content: (
            <PersonSettingsTab
              person={person}
              onRename={onRename}
              onArchive={onArchive}
              onRestore={onRestore}
              onDelete={onDelete}
              pending={pending}
            />
          ),
        },
      ]}
    />
  );
}
