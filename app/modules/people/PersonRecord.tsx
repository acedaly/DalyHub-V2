/**
 * PEOPLE-01 — the canonical Person record, composed through the shared DS-02
 * Record Layout.
 *
 * Presentation + client-side mutation plumbing only: the header (identity, Rename,
 * archive state) and the six tabs (Summary / Contact / Linked / Notes / Activity /
 * Settings — the shared tab vocabulary, with Activity and Settings last). Data loading lives in the route; this component renders it and posts
 * lifecycle intents (`archive` / `restore` / `delete`) to `/person/:id/mutate`,
 * revalidating on success. The Contact/Notes forms own their own saves.
 */

import { useCallback, useState } from "react";
import { useNavigate } from "react-router";

import type { PersonRelationship } from "~/kernel/relationships";
import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import { LinkedItemsTab } from "~/shared/linked-items";
import { StayInTouchIndicator } from "~/shared/relationships";
import {
  RecordLayout,
  type RecordAction,
  type RecordMetaItem,
} from "~/shared/record-layout";
import {
  lifecycleSuccessMessage,
  useRecordLifecycle,
} from "~/shared/record-lifecycle";

import { PersonContactForm } from "./PersonContactForm";
import { PersonNotesForm } from "./PersonNotesForm";
import { PersonSettingsTab } from "./PersonSettingsTab";
import { PersonSummary } from "./PersonSummary";
import { PersonTimelineTab } from "./PersonTimelineTab";
import type { SerializedPerson } from "./person-view";
import type { PersonMutationResult } from "./routes/mutate";

interface PersonRecordProps {
  readonly person: SerializedPerson;
  /** The PEOPLE-03 derived relationship, evaluated server-side on every load. */
  readonly relationship: PersonRelationship;
  readonly activeTabId: string;
  readonly onTabChange: (tabId: string) => void;
  readonly onRename: () => void;
  readonly onSaved: () => void;
}

export function PersonRecord({
  person,
  relationship,
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

  const onArchive = useCallback(async () => {
    setPending(true);
    await post("archive")
      .then((result) => {
        if (result.kind === "archive" && result.ok) {
          feedback.notifySuccess(lifecycleSuccessMessage("archive", "person"));
          onSaved();
        } else {
          feedback.notifyError("Couldn’t archive this person. Try again.");
        }
      })
      .catch(() =>
        feedback.notifyError("Couldn’t archive this person. Try again."),
      )
      .finally(() => setPending(false));
  }, [post, feedback, onSaved]);

  const onRestore = useCallback(async () => {
    setPending(true);
    await post("restore")
      .then((result) => {
        if (result.kind === "restore" && result.ok) {
          feedback.notifySuccess(lifecycleSuccessMessage("restore", "person"));
          onSaved();
        } else {
          feedback.notifyError("Couldn’t restore this person. Try again.");
        }
      })
      .catch(() =>
        feedback.notifyError("Couldn’t restore this person. Try again."),
      )
      .finally(() => setPending(false));
  }, [post, feedback, onSaved]);

  const onDelete = useCallback(async () => {
    const result = await post("delete");
    if (result.kind === "delete" && result.ok) {
      navigate("/people");
      return;
    }
    throw new Error("Couldn’t delete this person.");
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
  // PEOPLE-03 — the derived stay-in-touch state, in the header's existing metadata
  // slot rather than as a new badge or a second card. The label always carries the
  // meaning; the tone only reinforces it.
  headerMetadata.push({
    id: "stay-in-touch",
    label: "Staying in touch",
    value: <StayInTouchIndicator relationship={relationship} />,
  });

  // PX-04: the SAME lifecycle actions, in the SAME shared overflow slot, as every
  // other record. The Settings tab keeps the full explanation and the
  // dependency/blocked detail; `notifyOnSuccess` is off because the handlers
  // above already report through the shared `lifecycleSuccessMessage` wording
  // (they are driven from Settings too).
  const lifecycle = useRecordLifecycle({
    entityType: "person",
    title: person.title,
    archived: person.archived,
    onArchive,
    onRestore,
    onDelete,
    pending,
    notifyOnSuccess: false,
  });

  return (
    <>
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
        overflowActions={lifecycle.overflowActions}
        activeTabId={activeTabId}
        onTabChange={onTabChange}
        tabs={[
          {
            id: "summary",
            label: "Summary",
            content: (
              <PersonSummary
                person={person}
                relationship={relationship}
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
            // PX-06: the person's history is this record's Activity. It used to be
            // named "Timeline" and sat mid-strip, so the one tab vocabulary every
            // other record shares ("Activity" and "Settings" last, in that order)
            // did not hold here. The content is unchanged — the PEOPLE-02
            // relationship timeline — only its name and position.
            id: "activity",
            label: "Activity",
            content: (
              <PersonTimelineTab
                personId={person.id}
                reloadKey={person.updatedAt}
              />
            ),
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
      {lifecycle.dialogs}
    </>
  );
}
