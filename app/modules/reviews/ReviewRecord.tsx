import { useCallback, useState } from "react";
import { Link, useNavigate } from "react-router";

import {
  REVIEW_STATUSES,
  type ReviewSectionId,
  type ReviewStatus,
} from "~/kernel/reviews";
import { useDrawer } from "~/shared/drawer";
import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import { LinkedItemsTab } from "~/shared/linked-items";
import { LiveMarkdownEditor } from "~/shared/markdown-editor";
import {
  RecordLayout,
  type RecordAction,
  type RecordMetaItem,
} from "~/shared/record-layout";
import {
  lifecycleSuccessMessage,
  useRecordLifecycle,
} from "~/shared/record-lifecycle";
import {
  DangerousAction,
  SettingsGroup,
  SettingsLayout,
  SettingsRow,
} from "~/shared/settings";

import type {
  ReviewPeriodContext,
  ReviewContextItem,
} from "./review-period-context";
import { ReviewTimelineTab } from "./ReviewTimelineTab";
import type { SerializedReview, SerializedReviewSection } from "./review-view";
import type { ReviewMutationResult } from "./routes/mutate";

interface ReviewRecordProps {
  readonly review: SerializedReview;
  readonly context: ReviewPeriodContext;
  readonly activeTabId: string;
  readonly onTabChange: (tabId: string) => void;
  readonly onSaved: () => void;
}

function readonlyText(section: SerializedReviewSection) {
  return section.body.trim().length > 0 ? (
    <div className="dh-review-section-readonly">
      <pre>{section.body}</pre>
    </div>
  ) : (
    <p className="dh-review-muted">No reflection written.</p>
  );
}

function SectionEditor({
  review,
  section,
  readOnly,
  onSaved,
}: {
  readonly review: SerializedReview;
  readonly section: SerializedReviewSection;
  readonly readOnly: boolean;
  readonly onSaved: () => void;
}) {
  const feedback = useFeedback();
  const [value, setValue] = useState(section.body);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = useCallback(async () => {
    if (value === section.body) return;
    setSaving(true);
    setError(null);
    const body = new FormData();
    body.set("intent", "update_section");
    body.set("sectionId", section.sectionId);
    body.set("body", value);
    try {
      const response = await fetch(
        `/reviews/${encodeURIComponent(review.id)}/mutate`,
        {
          method: "POST",
          body,
        },
      );
      const result = (await response.json()) as ReviewMutationResult;
      if (result.kind === "update_section" && result.ok) {
        feedback.notifySuccess("Reflection saved");
        onSaved();
      } else {
        setError(
          result.kind === "update_section"
            ? (result.formError ?? "That section couldn’t be saved.")
            : "That section couldn’t be saved.",
        );
      }
    } catch {
      setError("That section couldn’t be saved.");
    } finally {
      setSaving(false);
    }
  }, [review.id, section.body, section.sectionId, value, feedback, onSaved]);

  return (
    <section
      className="dh-review-section"
      aria-labelledby={`${section.sectionId}-heading`}
    >
      <div className="dh-review-section__header">
        <h2 id={`${section.sectionId}-heading`}>{section.label}</h2>
        {!readOnly ? (
          <button
            type="button"
            className="dh-btn dh-btn--secondary"
            disabled={saving || value === section.body}
            onClick={() => void save()}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        ) : null}
      </div>
      {readOnly ? (
        readonlyText(section)
      ) : (
        <LiveMarkdownEditor
          value={value}
          onChange={setValue}
          onBlur={() => void save()}
          label={section.label}
          placeholder="Write your reflection..."
          error={error}
          rows={10}
        />
      )}
    </section>
  );
}

function ContextList({
  title,
  items,
  empty,
}: {
  readonly title: string;
  readonly items: readonly ReviewContextItem[];
  readonly empty: string;
}) {
  const { openDrawer } = useDrawer();
  return (
    <section
      className="dh-review-context-list"
      aria-labelledby={`${title}-heading`}
    >
      <h2 id={`${title}-heading`}>{title}</h2>
      {items.length === 0 ? (
        <p className="dh-review-muted">{empty}</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              {item.target.kind === "drawer" ? (
                <button
                  type="button"
                  className="dh-review-context-link"
                  onClick={() => {
                    if (item.target.kind === "drawer") {
                      openDrawer(item.target.drawerKey);
                    }
                  }}
                >
                  {item.title}
                </button>
              ) : (
                <Link className="dh-review-context-link" to={item.target.to}>
                  {item.title}
                </Link>
              )}
              <span>{item.dateLabel}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function section(review: SerializedReview, id: ReviewSectionId) {
  const found = review.sections.find((item) => item.sectionId === id);
  if (!found) throw new Error(`Missing review section ${id}`);
  return found;
}

export function ReviewRecord({
  review,
  context,
  activeTabId,
  onTabChange,
  onSaved,
}: ReviewRecordProps) {
  const feedback = useFeedback();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const readOnly = review.archived || review.status === "completed";

  const post = useCallback(
    async (
      intent: string,
      extra?: Record<string, string>,
    ): Promise<ReviewMutationResult> => {
      const body = new FormData();
      body.set("intent", intent);
      for (const [key, value] of Object.entries(extra ?? {}))
        body.set(key, value);
      const response = await fetch(
        `/reviews/${encodeURIComponent(review.id)}/mutate`,
        {
          method: "POST",
          body,
        },
      );
      return (await response.json()) as ReviewMutationResult;
    },
    [review.id],
  );

  const runLifecycle = useCallback(
    async (intent: string, success: string): Promise<boolean> => {
      setPending(true);
      try {
        const result = await post(intent);
        if (result.ok) {
          feedback.notifySuccess(success);
          onSaved();
          return true;
        } else {
          feedback.notifyError(
            result.formError ?? "That change couldn’t be saved.",
          );
        }
      } catch {
        feedback.notifyError("That change couldn’t be saved.");
      } finally {
        setPending(false);
      }
      return false;
    },
    [feedback, onSaved, post],
  );

  const onRename = async (title: string) => {
    const result = await post("rename", { title });
    if (result.kind === "rename" && result.ok) {
      feedback.notifySuccess("Review renamed");
      onSaved();
    } else {
      feedback.notifyError(
        result.kind === "rename"
          ? (result.formError ?? "That title couldn’t be saved.")
          : "That title couldn’t be saved.",
      );
    }
  };

  const onDelete = async () => {
    const result = await post("delete");
    if (result.kind === "delete" && result.ok) {
      navigate("/reviews?view=archived");
      return;
    }
    throw new Error(
      result.kind === "delete"
        ? result.formError
        : "That review couldn’t be deleted.",
    );
  };

  const metadata: RecordMetaItem[] = [
    { id: "type", label: "Type", value: review.typeLabel },
    { id: "period", label: "Period", value: review.periodLabel },
    { id: "template", label: "Template", value: review.templateId },
    { id: "authored", label: "Reflection", value: review.completionLabel },
  ];
  if (review.completedAt) {
    metadata.push({
      id: "completed",
      label: "Completed",
      value: review.completedLabel,
    });
  }

  const completeAction: RecordAction =
    review.status === "completed"
      ? {
          id: "reopen",
          label: "Reopen",
          variant: "secondary",
          onSelect: () => void runLifecycle("reopen", "Review reopened"),
        }
      : {
          id: "complete",
          label: "Complete",
          variant: "primary",
          onSelect: () => void runLifecycle("complete", "Review completed"),
        };

  // PX-04 — the shared lifecycle in the shared overflow slot: identical wording,
  // ordering and confirmation friction to every other record. The Settings tab
  // keeps the fuller explanation.
  const lifecycle = useRecordLifecycle({
    entityType: "review",
    title: review.title,
    archived: review.archived,
    pending,
    notifyOnSuccess: false,
    // A failed lifecycle post THROWS, so the shared confirmation dialog stays
    // open with its inline error and a retry rather than closing as if it worked.
    onArchive: async () => {
      const ok = await runLifecycle(
        "archive",
        lifecycleSuccessMessage("archive", "review"),
      );
      if (!ok) throw new Error("Couldn’t archive this Review.");
    },
    onRestore: async () => {
      const ok = await runLifecycle(
        "restore",
        lifecycleSuccessMessage("restore", "review"),
      );
      if (!ok) throw new Error("Couldn’t restore this Review.");
    },
    onDelete,
  });

  return (
    <>
      <RecordLayout
        title={review.title}
        typeLabel={`${review.typeLabel} Review`}
        icon={<EntityIcon type="review" />}
        breadcrumb={[{ id: "reviews", label: "Reviews", href: "/reviews" }]}
        status={{
          label: review.archived
            ? `Archived · ${review.statusLabel}`
            : review.statusLabel,
          tone: review.archived
            ? "warning"
            : review.status === "completed"
              ? "success"
              : review.status === "in_progress"
                ? "info"
                : "neutral",
        }}
        metadata={metadata}
        primaryAction={review.archived ? undefined : completeAction}
        overflowActions={lifecycle.overflowActions}
        activeTabId={activeTabId}
        onTabChange={onTabChange}
        tabs={[
          {
            id: "summary",
            label: "Summary",
            content: (
              <div className="dh-record-stack">
                {[
                  "summary.overall",
                  "summary.highlights",
                  "summary.challenges",
                  "summary.lessons",
                  "summary.decisions",
                  "summary.next_focus",
                ].map((id) => (
                  <SectionEditor
                    key={id}
                    review={review}
                    section={section(review, id as ReviewSectionId)}
                    readOnly={readOnly}
                    onSaved={onSaved}
                  />
                ))}
              </div>
            ),
          },
          {
            id: "progress",
            label: "Progress",
            content: (
              <div className="dh-record-stack">
                <p className="dh-review-context-note">{context.note}</p>
                <SectionEditor
                  review={review}
                  section={section(review, "progress.commentary")}
                  readOnly={readOnly}
                  onSaved={onSaved}
                />
              </div>
            ),
          },
          {
            id: "tasks",
            label: "Tasks",
            content: (
              <div className="dh-record-stack">
                <ContextList
                  title="Completed tasks"
                  items={context.completedTasks}
                  empty="No completed tasks were found in this bounded period context."
                />
                <ContextList
                  title="Open or overdue tasks"
                  items={context.openTasks}
                  empty="No overdue open tasks were found."
                />
                <SectionEditor
                  review={review}
                  section={section(review, "tasks.commentary")}
                  readOnly={readOnly}
                  onSaved={onSaved}
                />
              </div>
            ),
          },
          {
            id: "diary",
            label: "Diary",
            content: (
              <div className="dh-record-stack">
                <ContextList
                  title="Diary entries"
                  items={context.diaryEntries}
                  empty="No diary entries were found in this bounded period context."
                />
                <SectionEditor
                  review={review}
                  section={section(review, "diary.commentary")}
                  readOnly={readOnly}
                  onSaved={onSaved}
                />
              </div>
            ),
          },
          {
            id: "people",
            label: "People & Meetings",
            content: (
              <div className="dh-record-stack">
                <ContextList
                  title="Meetings"
                  items={context.meetings}
                  empty="No meetings were found in this bounded period context."
                />
                <SectionEditor
                  review={review}
                  section={section(review, "people_meetings.commentary")}
                  readOnly={readOnly}
                  onSaved={onSaved}
                />
              </div>
            ),
          },
          {
            id: "linked",
            label: "Linked",
            content: (
              <LinkedItemsTab
                anchorId={review.id}
                anchorType="review"
                readOnly={review.archived}
                linkCommandTarget={{
                  kind: "route",
                  to: `/reviews/${review.id}?tab=linked`,
                }}
              />
            ),
          },
          {
            id: "activity",
            label: "Activity",
            content: (
              <ReviewTimelineTab
                reviewId={review.id}
                reloadKey={review.updatedAt}
              />
            ),
          },
          {
            id: "settings",
            label: "Settings",
            content: (
              <ReviewSettings
                review={review}
                pending={pending}
                onRename={onRename}
                onStatus={(status) =>
                  void runLifecycle(
                    "set_status",
                    `Review status changed to ${status}`,
                  )
                }
                onComplete={() =>
                  void runLifecycle("complete", "Review completed")
                }
                onReopen={() => void runLifecycle("reopen", "Review reopened")}
                onArchive={() =>
                  void runLifecycle(
                    "archive",
                    lifecycleSuccessMessage("archive", "review"),
                  )
                }
                onRestore={() =>
                  void runLifecycle(
                    "restore",
                    lifecycleSuccessMessage("restore", "review"),
                  )
                }
                onDelete={onDelete}
                post={post}
                onSaved={onSaved}
              />
            ),
          },
        ]}
      />
      {lifecycle.dialogs}
    </>
  );
}

function ReviewSettings({
  review,
  pending,
  onRename,
  onComplete,
  onReopen,
  onArchive,
  onRestore,
  onDelete,
  post,
  onSaved,
}: {
  readonly review: SerializedReview;
  readonly pending: boolean;
  readonly onRename: (title: string) => Promise<void>;
  readonly onStatus: (status: ReviewStatus) => void;
  readonly onComplete: () => void;
  readonly onReopen: () => void;
  readonly onArchive: () => void;
  readonly onRestore: () => void;
  readonly onDelete: () => Promise<void>;
  readonly post: (
    intent: string,
    extra?: Record<string, string>,
  ) => Promise<ReviewMutationResult>;
  readonly onSaved: () => void;
}) {
  const [title, setTitle] = useState(review.title);
  const [status, setStatus] = useState<ReviewStatus>(review.status);
  const feedback = useFeedback();
  return (
    <SettingsLayout aria-label="Review settings">
      <SettingsGroup title="Name" headingLevel={2}>
        <SettingsRow
          label="Review title"
          description="The display name shown in Reviews, Search and links."
          control={
            <form
              className="dh-review-inline-form"
              onSubmit={(event) => {
                event.preventDefault();
                void onRename(title);
              }}
            >
              <input
                className="dh-input"
                value={title}
                onChange={(event) => setTitle(event.currentTarget.value)}
                aria-label="Review title"
                disabled={review.archived}
              />
              <button
                className="dh-btn dh-btn--secondary"
                type="submit"
                disabled={review.archived || title === review.title}
              >
                Rename
              </button>
            </form>
          }
        />
      </SettingsGroup>
      <SettingsGroup title="Status" headingLevel={2}>
        <SettingsRow
          label="Status"
          description="Completion is reversible. Reopening clears the current completed timestamp while preserving history in Activity."
          control={
            <div className="dh-review-inline-form">
              <select
                className="dh-select"
                value={status}
                disabled={review.archived || review.status === "completed"}
                onChange={(event) =>
                  setStatus(event.currentTarget.value as ReviewStatus)
                }
                aria-label="Review status"
              >
                {REVIEW_STATUSES.map((value) => (
                  <option key={value} value={value}>
                    {value === "in_progress"
                      ? "In progress"
                      : value[0].toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
              <button
                className="dh-btn dh-btn--secondary"
                type="button"
                disabled={
                  review.archived ||
                  review.status === "completed" ||
                  status === review.status
                }
                onClick={() => {
                  void post("set_status", { status }).then((result) => {
                    if (result.ok) {
                      feedback.notifySuccess("Status changed");
                      onSaved();
                    } else {
                      feedback.notifyError(
                        result.formError ?? "That status couldn’t be saved.",
                      );
                    }
                  });
                }}
              >
                Save status
              </button>
            </div>
          }
        />
        <SettingsRow
          label={review.status === "completed" ? "Reopen" : "Complete"}
          description={
            review.status === "completed"
              ? "Restore editing while keeping the previous completion in Activity."
              : "Mark this Review completed and make authored sections read-only."
          }
          control={
            <button
              className="dh-btn dh-btn--primary"
              type="button"
              disabled={review.archived || pending}
              onClick={review.status === "completed" ? onReopen : onComplete}
            >
              {review.status === "completed"
                ? "Reopen review"
                : "Complete review"}
            </button>
          }
        />
      </SettingsGroup>
      <SettingsGroup title="Record lifecycle" headingLevel={2}>
        <SettingsRow
          label={review.archived ? "Restore" : "Archive"}
          description={
            review.archived
              ? "Bring this Review back into active views."
              : "Hide this Review from active views without deleting its content or links."
          }
          control={
            <button
              className="dh-btn dh-btn--secondary"
              type="button"
              disabled={pending}
              onClick={review.archived ? onRestore : onArchive}
            >
              {review.archived ? "Restore review" : "Archive review"}
            </button>
          }
        />
      </SettingsGroup>
      <SettingsGroup title="Danger zone" headingLevel={2} tone="danger">
        <DangerousAction
          label="Delete this Review"
          description="Permanently remove this Review’s detail and section rows, plus its links. Linked source records are never deleted."
          actionLabel="Delete Review..."
          confirmTitle={`Delete ${review.title}?`}
          confirmBody="This permanently removes the Review record and authored reflection. It cannot be undone."
          confirmLabel="Delete Review"
          busyLabel="Deleting..."
          successMessage="Review deleted"
          disabled={pending}
          typedConfirmation={{
            phrase: review.title,
            label: "Type the Review title to confirm.",
          }}
          onConfirm={onDelete}
        />
      </SettingsGroup>
    </SettingsLayout>
  );
}
