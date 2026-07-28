/**
 * MEET-02 — the Meeting follow-through UI.
 *
 * Renders (1) the Follow-up tab (canonical Tasks related to the meeting, grouped
 * Open / Waiting-or-delegated / Completed from the CANONICAL Task display state,
 * plus the still-unconverted structured items and an "Add follow-up task" action),
 * (2) the structured-item sections (agenda / decisions / outcomes) each showing item
 * text, a stable textual kind tag, whether it has a linked Task, and a single
 * Create-task / Open-task control, and (3) the drawer form host.
 *
 * Accessibility: every control is a real button/link (no nested interactive
 * controls); state is always carried by text (never colour alone); long text wraps;
 * touch targets inherit the 44px `.dh-btn` floor; the Task Drawer opener is the exact
 * control clicked, so focus returns to it on close (the DrawerProvider captures it).
 */

import { useCallback, useMemo, useState } from "react";
import { useRevalidator } from "react-router";

import { useDrawer } from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import type { SerializedTaskView } from "~/shared/task-record/task-view";

import type { MeetingItemKind } from "~/kernel/meetings";
import { MeetingFollowUpForm } from "./MeetingFollowUpForm";
import type { SerializedMeeting } from "./meeting-view";
import {
  allFollowUpsComplete,
  groupFollowUps,
  hasNoFollowUps,
  meetingItemKindLabel,
  type FollowUpTaskEntry,
} from "./follow-up-view";

type SerializedMeetingItem = SerializedMeeting["items"][number];

/** Drawer key helpers — the `<kind>:<id>` convention the host `renderDrawer` splits. */
export const followUpItemDrawerKey = (itemId: string) => `follow-up:${itemId}`;
export const DIRECT_FOLLOW_UP_DRAWER_KEY = "follow-up";
export const taskDrawerKey = (taskId: string) => `task:${taskId}`;

/** Build the itemId → live Task map from the resolved follow-up entries. */
export function liveTaskByItem(
  followUps: readonly FollowUpTaskEntry[],
): ReadonlyMap<string, SerializedTaskView> {
  const map = new Map<string, SerializedTaskView>();
  for (const entry of followUps) {
    if (entry.itemId) map.set(entry.itemId, entry.task);
  }
  return map;
}

interface ItemConversionControlProps {
  readonly itemId: string;
  readonly convertedTask: SerializedTaskView | null;
  readonly readOnly: boolean;
  readonly onConvert: (itemId: string) => void;
  readonly onOpenTask: (taskId: string) => void;
}

/** The single Create-task / Open-task control + textual conversion state. */
function ItemConversionControl({
  itemId,
  convertedTask,
  readOnly,
  onConvert,
  onOpenTask,
}: ItemConversionControlProps) {
  if (convertedTask) {
    return (
      <button
        type="button"
        className="dh-btn dh-btn--secondary"
        onClick={() => onOpenTask(convertedTask.id)}
      >
        Open task
      </button>
    );
  }
  if (readOnly) {
    return <span className="dh-follow-up-row__state">Not converted</span>;
  }
  return (
    <button
      type="button"
      className="dh-btn dh-btn--secondary"
      onClick={() => onConvert(itemId)}
    >
      Create task
    </button>
  );
}

interface MeetingItemRowProps {
  readonly item: SerializedMeetingItem;
  readonly convertedTask: SerializedTaskView | null;
  readonly readOnly: boolean;
  readonly onConvert: (itemId: string) => void;
  readonly onOpenTask: (taskId: string) => void;
  readonly onRemove?: (itemId: string) => void;
}

export function MeetingItemRow({
  item,
  convertedTask,
  readOnly,
  onConvert,
  onOpenTask,
  onRemove,
}: MeetingItemRowProps) {
  return (
    <li className="dh-meeting-item">
      <div className="dh-meeting-item__body">
        <span className="dh-meeting-item__text">{item.bodyMarkdown}</span>
        <span className="dh-meeting-item__meta">
          <span className="dh-meeting-item__tag">
            {meetingItemKindLabel(item.kind)}
          </span>
          {convertedTask ? (
            <span>Linked task · {convertedTask.title}</span>
          ) : (
            <span>Not yet converted</span>
          )}
        </span>
      </div>
      <div className="dh-meeting-item__actions">
        <ItemConversionControl
          itemId={item.id}
          convertedTask={convertedTask}
          readOnly={readOnly}
          onConvert={onConvert}
          onOpenTask={onOpenTask}
        />
        {!readOnly && onRemove ? (
          <button
            type="button"
            className="dh-btn dh-btn--ghost"
            aria-label={`Remove ${meetingItemKindLabel(item.kind).toLowerCase()}`}
            onClick={() => onRemove(item.id)}
          >
            Remove
          </button>
        ) : null}
      </div>
    </li>
  );
}

interface MeetingItemsSectionProps {
  readonly kind: MeetingItemKind;
  readonly heading: string;
  readonly items: readonly SerializedMeetingItem[];
  readonly liveTasks: ReadonlyMap<string, SerializedTaskView>;
  readonly readOnly: boolean;
  readonly onConvert: (itemId: string) => void;
  readonly onOpenTask: (taskId: string) => void;
  /** Persist a new item; resolves `true` on success. The field is cleared ONLY on
   * success, so a failed save (offline/transient) never loses the entered text. */
  readonly onAddItem: (kind: MeetingItemKind, body: string) => Promise<boolean>;
  readonly onRemoveItem: (itemId: string) => void;
}

/** An agenda / decisions / outcomes section: list + add form + conversion controls. */
export function MeetingItemsSection({
  kind,
  heading,
  items,
  liveTasks,
  readOnly,
  onConvert,
  onOpenTask,
  onAddItem,
  onRemoveItem,
}: MeetingItemsSectionProps) {
  const rows = items.filter((i) => i.kind === kind);
  const label = meetingItemKindLabel(kind).toLowerCase();
  // Controlled so the entered text survives a failed save and is cleared only once
  // the mutation succeeds (no `formEl.reset()` racing an async request).
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <section className="dh-record-section">
      <h2>{heading}</h2>
      {rows.length === 0 ? (
        <p className="dh-follow-up-empty">No {label}s yet.</p>
      ) : (
        <ul className="dh-meeting-items">
          {rows.map((item) => (
            <MeetingItemRow
              key={item.id}
              item={item}
              convertedTask={liveTasks.get(item.id) ?? null}
              readOnly={readOnly}
              onConvert={onConvert}
              onOpenTask={onOpenTask}
              onRemove={onRemoveItem}
            />
          ))}
        </ul>
      )}
      {!readOnly ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!body.trim() || saving) return;
            setSaving(true);
            void (async () => {
              const ok = await onAddItem(kind, body);
              if (ok) setBody("");
              setSaving(false);
            })();
          }}
        >
          <label className="dh-field">
            <span className="dh-field__label">Add {label}</span>
            <input
              name="body"
              className="dh-input"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
            />
          </label>
          <button
            type="submit"
            className="dh-btn dh-btn--secondary"
            disabled={saving}
          >
            Add {label}
          </button>
        </form>
      ) : null}
    </section>
  );
}

interface FollowUpTabProps {
  readonly items: readonly SerializedMeetingItem[];
  readonly followUps: readonly FollowUpTaskEntry[];
  readonly readOnly: boolean;
  readonly onConvert: (itemId: string) => void;
  readonly onOpenTask: (taskId: string) => void;
  readonly onAddFollowUp: () => void;
}

/** The Follow-up tab: grouped canonical follow-up Tasks + unconverted items. */
export function MeetingFollowUpTab({
  items,
  followUps,
  readOnly,
  onConvert,
  onOpenTask,
  onAddFollowUp,
}: FollowUpTabProps) {
  const groups = useMemo(() => groupFollowUps(followUps), [followUps]);
  const liveTasks = useMemo(() => liveTaskByItem(followUps), [followUps]);
  const unconverted = items.filter((item) => !liveTasks.has(item.id));
  const noneYet = hasNoFollowUps(followUps);
  const allDone = allFollowUpsComplete(followUps);

  return (
    <section className="dh-record-section">
      <div className="dh-follow-up-group__heading">
        <h2>Follow-up</h2>
        {!readOnly ? (
          <button
            type="button"
            className="dh-btn dh-btn--primary"
            onClick={onAddFollowUp}
          >
            Add follow-up task
          </button>
        ) : null}
      </div>

      {noneYet ? (
        <EmptyState
          icon={<EntityIcon type="task" />}
          title="No follow-up Tasks yet"
          description="Convert a decision or outcome into a task when it needs action."
        />
      ) : allDone ? (
        <p className="dh-follow-up-empty">
          Everything from this meeting is complete.
        </p>
      ) : null}

      {!noneYet
        ? groups.map((group) => (
            <div key={group.key} className="dh-follow-up-group">
              <h3 className="dh-follow-up-group__heading">
                {group.label}{" "}
                <span className="dh-follow-up-group__count">
                  ({group.entries.length})
                </span>
              </h3>
              {group.entries.length === 0 ? (
                <p className="dh-follow-up-empty">{group.emptyHint}</p>
              ) : (
                <ul className="dh-follow-up-list">
                  {group.entries.map((entry) => (
                    <li key={entry.task.id} className="dh-follow-up-row">
                      <button
                        type="button"
                        className="dh-entity-link dh-follow-up-row__title"
                        onClick={() => onOpenTask(entry.task.id)}
                        aria-label={`Open task: ${entry.task.title}`}
                      >
                        {entry.task.title}
                      </button>
                      <span className="dh-follow-up-row__state">
                        {group.label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        : null}

      <div className="dh-follow-up-group">
        <h3>Not yet converted</h3>
        {unconverted.length === 0 ? (
          <p className="dh-follow-up-empty">
            Every agenda item, decision and outcome has a task.
          </p>
        ) : (
          <ul className="dh-meeting-items">
            {unconverted.map((item) => (
              <MeetingItemRow
                key={item.id}
                item={item}
                convertedTask={null}
                readOnly={readOnly}
                onConvert={onConvert}
                onOpenTask={onOpenTask}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

interface FollowUpFormHostProps {
  readonly meetingId: string;
  readonly itemId: string | null;
  readonly initialTitle: string;
}

/**
 * Hosts the follow-up form inside the Drawer: on success it revalidates the meeting
 * loader (so conversion state refreshes) and REPLACES the form with the canonical
 * Task Drawer for the new task — no extra history entry.
 */
export function MeetingFollowUpFormHost({
  meetingId,
  itemId,
  initialTitle,
}: FollowUpFormHostProps) {
  const { replaceDrawer, closeDrawer } = useDrawer();
  const revalidator = useRevalidator();
  const handleCreated = useCallback(
    (taskId: string) => {
      revalidator.revalidate();
      replaceDrawer(taskDrawerKey(taskId));
    },
    [replaceDrawer, revalidator],
  );
  return (
    <MeetingFollowUpForm
      meetingId={meetingId}
      itemId={itemId}
      initialTitle={initialTitle}
      onCreated={handleCreated}
      onCancel={closeDrawer}
    />
  );
}
