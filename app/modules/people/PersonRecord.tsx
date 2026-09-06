/**
 * PEOPLE-01 — the canonical Person record, composed through the shared DS-02
 * Record Layout.
 *
 * Presentation + client-side mutation plumbing only: the header (identity,
 * archive state) and the six tabs (Summary / Contact / Linked / Notes / Activity /
 * Settings — the shared tab vocabulary, with Activity and Settings last). Data loading lives in the route; this component renders it and posts
 * lifecycle intents (`archive` / `restore` / `delete`) to `/person/:id/mutate`,
 * revalidating on success. The Contact/Notes forms own their own saves.
 */

import { useCallback, useState } from "react";
import { useNavigate } from "react-router";

import type { SerializedAttachment } from "~/kernel/attachments";
import { TITLE_MAX_LENGTH } from "~/kernel/entities";
import type { PersonRelationship } from "~/kernel/relationships";
import { attachmentsTab } from "~/shared/attachments";
import { useCapture } from "~/shared/capture";
import type { CaptureContextContract } from "~/shared/capture/capture-context";
import { EntityIcon } from "~/shared/entity";
import type { OverflowMenuItem } from "~/shared/overflow-menu";
import { InlineTextField, type InlineSaveOutcome } from "~/shared/inline-edit";
import { useFeedback } from "~/shared/feedback";
import { LinkedItemsTab } from "~/shared/linked-items";
import { StayInTouchIndicator } from "~/shared/relationships";
import { RecordLayout, type RecordMetaItem } from "~/shared/record-layout";
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
  /**
   * DS-16 — rename from the record heading (EDIT-02). A Person's display name
   * is a one-line focused mutation with its own `rename` intent, so it takes
   * the same interaction as an Area's, a Project's or a Note's rather than the
   * only remaining Drawer form in the module.
   */
  readonly onRename: (title: string) => Promise<InlineSaveOutcome>;
  readonly onSaved: () => void;
  /**
   * V2.11 FILE-01 — the shared Evidence tab.
   *
   * A Person is the most sensitive record DalyHub holds (AGENTS.md §5), and a
   * file on one is at least as sensitive as the record. That is a reason to
   * support it PROPERLY rather than a reason to refuse: the bytes never leave
   * an authenticated same-origin route, the filename never reaches Activity,
   * Search or a notification, and the AI platform cannot read an attachment at
   * all — not by filter, but because attachments are not an evidence kind.
   */
  readonly attachments: readonly SerializedAttachment[];
}

export function PersonRecord({
  person,
  relationship,
  attachments,
  activeTabId,
  onTabChange,
  onRename,
  onSaved,
}: PersonRecordProps) {
  const feedback = useFeedback();
  const navigate = useNavigate();
  // The ONE shared capture surface. Null outside the AppShell (an isolated
  // render), where the entries simply do nothing rather than throwing.
  const capture = useCapture();
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

  /*
   * RECORD-01 — the context line, with each fact in exactly one place.
   *
   * Organisation and Role were two labelled header chips AND a "Site foreman ·
   * Whitfield Building Co." line inside the Summary tab's identity block; they
   * are now one unlabelled phrase here, in the same shape the Summary used, and
   * the Summary's copy is gone. Relationship moved the other way — it is a
   * relationship record, and "Builder" belongs beside the person's face, so it
   * stays as the Summary's chip and leaves the header.
   *
   * PEOPLE-03 — the derived stay-in-touch state stays here rather than becoming
   * a badge or a card: it is current state, it is one line, and it persists
   * across every tab. The Summary's panel EXPLAINS it (reasons and cadence
   * facts) and no longer repeats the pill itself. The label always carries the
   * meaning; the tone only reinforces it.
   */
  const contextItems: RecordMetaItem[] = [];
  const roleAndOrg = [person.role, person.organisation]
    .filter(Boolean)
    .join(" · ");
  if (roleAndOrg) {
    contextItems.push({ id: "role-org", label: "", value: roleAndOrg });
  }
  if (person.pronouns) {
    contextItems.push({ id: "pronouns", label: "", value: person.pronouns });
  }
  contextItems.push({
    id: "stay-in-touch",
    label: "Staying in touch",
    value: <StayInTouchIndicator relationship={relationship} />,
  });

  // PX-04: the SAME lifecycle actions, in the SAME shared overflow slot, as every
  // other record. The Settings tab keeps the full explanation and the
  // dependency/blocked detail; `notifyOnSuccess` is off because the handlers
  // above already report through the shared `lifecycleSuccessMessage` wording
  // (they are driven from Settings too).
  /*
   * UIQ-011 — the home for everything the Summary's eight-pill action row gave
   * up.
   *
   * Four of those pills created some OTHER record (a Task, a Diary entry, a
   * Meeting, a Note) and two copied a field to the clipboard. None of them acts
   * on this Person, so none of them belongs in the Person's primary layout —
   * but all of them are useful, so all of them are here, one press away, in the
   * same shared overflow slot every record in the product uses for its
   * secondary actions.
   *
   * The capture entries pass this Person's context to the ONE shared sheet
   * exactly as they did before (ADR-060): a Task is `related` unless the owner
   * explicitly delegates, a Meeting receives an `attendee` link, and Notes and
   * Diary entries use canonical EntityLinks. Copy entries render only where
   * there is something to copy — a disabled "Copy phone" on a person with no
   * number is a control that can never do anything, in a menu as much as in a
   * button row.
   */
  const captureContext: CaptureContextContract = {
    sourceEntityId: person.id,
    sourceEntityType: "person",
    sourceEntityTitle: person.title,
    sourceModule: "people",
    originatingRoute: `/person/${person.id}`,
    mode: "removable",
    relationshipMeaning: "related",
    returnTo: `/person/${person.id}`,
  };
  const phone = person.mobile ?? person.workPhone;

  const copy = useCallback(
    async (value: string, label: string) => {
      try {
        await navigator.clipboard.writeText(value);
        feedback.notifySuccess(`${label} copied`);
      } catch {
        feedback.notifyError(`Couldn’t copy the ${label.toLowerCase()}.`);
      }
    },
    [feedback],
  );

  const leadingItems: OverflowMenuItem[] = person.archived
    ? []
    : [
        {
          id: "capture-task",
          label: "New task",
          description: "Create a Task related to this person.",
          onSelect: () =>
            capture?.openCapture("task", null, {
              ...captureContext,
              relationshipMeaning: "related",
            }),
        },
        {
          id: "capture-meeting",
          label: "New meeting",
          description: "Create a Meeting with this person as an attendee.",
          onSelect: () =>
            capture?.openCapture("meeting", null, {
              ...captureContext,
              relationshipMeaning: "attendee",
            }),
        },
        {
          id: "capture-note",
          label: "New note",
          description: "Create a Note linked to this person.",
          onSelect: () => capture?.openCapture("note", null, captureContext),
        },
        {
          id: "capture-diary",
          label: "New diary entry",
          description: "Create a Diary entry linked to this person.",
          onSelect: () => capture?.openCapture("diary", null, captureContext),
        },
      ];
  if (person.email) {
    leadingItems.push({
      id: "copy-email",
      label: "Copy email",
      separatorBefore: leadingItems.length > 0,
      onSelect: () => void copy(person.email as string, "Email"),
    });
  }
  if (phone) {
    leadingItems.push({
      id: "copy-phone",
      label: "Copy phone",
      separatorBefore: !person.email && leadingItems.length > 0,
      onSelect: () => void copy(phone, "Phone"),
    });
  }

  const lifecycle = useRecordLifecycle({
    entityType: "person",
    title: person.title,
    archived: person.archived,
    leadingItems,
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
        titleSlot={
          <InlineTextField
            label="Person name"
            value={person.title}
            onSave={onRename}
            variant="heading"
            maxLength={TITLE_MAX_LENGTH}
            data-testid="person-title-edit"
          />
        }
        // RECORD-01 — no `typeLabel`: the breadcrumb above says "People".
        icon={<EntityIcon type="person" />}
        breadcrumb={[{ id: "people", label: "People", href: "/people" }]}
        status={
          person.archived ? { label: "Archived", tone: "warning" } : undefined
        }
        metadata={contextItems}
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
          attachmentsTab({
            ownerEntityId: person.id,
            attachments,
            readOnly: person.archived,
            description: "A document about this person, kept privately here.",
            onChanged: onSaved,
          }),
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
