/**
 * MEET-02 — the Meeting follow-through UI.
 *
 * Renders (1) the structured-item sections the notebook is built from (agenda /
 * decisions / outcomes / actions), (2) the Follow-up tab — canonical Tasks
 * related to the meeting, grouped Open / Waiting-or-delegated / Completed from
 * the CANONICAL Task display state, plus unconverted Action items — and (3) the
 * drawer form host.
 *
 * ── UNTITLED-13: the agenda is a list you can work down, not a page of boxes ──
 *
 * §14 of the brief asks agenda items to be quick to scan DURING a live meeting,
 * and names what to avoid: giant cards, repeated borders, oversized metadata and
 * always-visible destructive buttons. Every one of those was here.
 *
 *   - Each item was a bordered, filled, rounded box (`meetings.css` drew it,
 *     then a second rule in the same file unset the border and background
 *     again for the notebook's copy — the module was arguing with itself).
 *   - Each carried a KIND chip ("Agenda item") under a heading that already said
 *     "Agenda items", so every line repeated its own section.
 *   - Each ended in two full-weight text buttons, one of which was Remove, both
 *     faded to `opacity: 0` on a fine pointer and restored by a `@media (hover:
 *     hover)` block plus a `:focus-within` rule. That is three CSS mechanisms
 *     keeping a destructive control simultaneously hidden and reachable.
 *
 * It is Untitled's divided list now: a hairline between rows, the row's own
 * words at the top of the reading order, the conversion state as quiet
 * supporting text, ONE visible conversion control and a context menu for the
 * rest. The menu is the shared `OverflowMenu`, so Remove sits where every other
 * destructive row action in the product sits and is never a button that appears
 * on hover.
 *
 * The conversion control stays VISIBLE rather than moving into the menu with
 * Remove, and that is a live-meeting decision rather than an oversight: turning
 * an action item into a Task is the single most frequent thing done on this
 * surface, and two presses for it during a meeting is one too many.
 *
 * Accessibility: every control is a real button/link (no nested interactive
 * controls); state is always carried by text (never colour alone); long text
 * wraps; the Task Drawer opener is the exact control clicked, so focus returns
 * to it on close (the DrawerProvider captures it).
 */

import { useCallback, useMemo, useState } from "react";
import { useRevalidator } from "react-router";

import { useDrawer } from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon } from "~/shared/entity";
import { OverflowMenu } from "~/shared/overflow-menu";
import { Badge, Button, Input } from "~/shared/ui";
import { SectionHeading } from "~/shared/ui/untitled/overrides/section-heading";
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
  const kind = meetingItemKindLabel(item.kind).toLowerCase();

  return (
    <li className="dh-meeting-item flex items-start gap-3 border-b border-secondary py-2.5 last:border-b-0">
      <div className="dh-meeting-item__body flex min-w-0 flex-1 flex-col gap-0.5">
        {/*
          The item's own words lead, at the reading size. They used to sit under
          a kind chip repeating the section heading above them.
        */}
        <span className="dh-meeting-item__text text-sm break-words text-primary">
          {item.bodyMarkdown}
        </span>
        {/*
          The one thing that genuinely varies per row: whether this has become a
          Task, and which one. `meetingItemKindLabel` survives as the row's
          accessible naming for the controls, not as a visible chip.
        */}
        {convertedTask ? (
          <span className="dh-meeting-item__meta flex min-w-0 items-center gap-1.5 text-xs text-tertiary">
            <span className="shrink-0">Linked task</span>
            <span
              className="min-w-0 truncate font-medium text-secondary"
              title={convertedTask.title}
            >
              {convertedTask.title}
            </span>
          </span>
        ) : item.kind === "action" ? (
          <span className="dh-meeting-item__meta text-xs text-tertiary">
            Not yet a task
          </span>
        ) : null}
      </div>

      <div className="dh-meeting-item__actions flex shrink-0 items-center gap-1">
        {convertedTask ? (
          <Button
            variant="subtle"
            size="sm"
            onClick={() => onOpenTask(convertedTask.id)}
          >
            Open task
          </Button>
        ) : readOnly ? (
          <span className="dh-follow-up-row__state text-xs text-tertiary">
            Not converted
          </span>
        ) : (
          <Button variant="subtle" size="sm" onClick={() => onConvert(item.id)}>
            Create task
          </Button>
        )}
        {/*
          §14 — the destructive action lives in the shared context menu, not as
          a permanently-rendered "Remove" beside every line. It was drawn at
          `opacity: 0` under a hover rule with a `:focus-within` escape hatch,
          which is three mechanisms to make one control both hidden and
          reachable; a menu is one.
        */}
        {!readOnly && onRemove ? (
          <OverflowMenu
            label={`Actions for this ${kind}`}
            items={[
              {
                id: "remove",
                label: `Remove ${kind}`,
                tone: "danger",
                onSelect: () => onRemove(item.id),
              },
            ]}
          />
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

/** An agenda / decisions / outcomes / actions section: list + add form + conversion controls. */
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
    /*
     * UIX-04 §26 — inside the notebook this is a LIST under a section heading
     * the notebook already drew, so it renders no heading of its own: "AGENDA"
     * immediately followed by a second, larger "Agenda items" was the same word
     * twice at two sizes. The heading survives as the list's accessible name, so
     * a screen-reader user still knows which of the four lists they are in.
     */
    <section
      className="dh-meeting-items-section flex min-w-0 flex-col gap-2"
      aria-label={heading}
    >
      {rows.length === 0 ? (
        <p className="dh-follow-up-empty m-0 text-sm text-tertiary">
          No {label}s yet.
        </p>
      ) : (
        <ul className="dh-meeting-items m-0 flex list-none flex-col p-0">
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
          className="flex flex-wrap items-end gap-2"
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
          {/*
            RECORD-01 — "Add {label}" once, not twice. The section already has a
            heading, so the visible button stays the bare verb and keeps the
            specific ACCESSIBLE name, which is what a screen-reader user needs
            when four of these forms sit on one record.

            The field names the NOUN, not the act. It used to say "Add {label}"
            too, which gave the textbox and the submit button one accessible
            name between them: a screen reader announced "Add action item, edit
            text" then "Add action item, button", and there was no way to ask
            for either one unambiguously.

            UNTITLED-13 — it is the shared `Input` (Untitled's `base/input`
            recipe) rather than a `.dh-field` label wrapping a bare `<input>`,
            so the field's height, corner, ground and focus ring are the
            product's one control rather than this module's.
          */}
          <label className="flex min-w-0 flex-1 basis-64 flex-col gap-1.5">
            {/* Untitled's own label recipe (`base/input/label`'s type ramp and
             * colour) on a native `<label>`. The component itself is React
             * Aria's `Label`, which needs a `TextField` context this one-line
             * inline form has no reason to introduce — the native element
             * associates by containment and reads identically. */}
            <span className="text-sm font-medium text-secondary">
              New {label}
            </span>
            <Input
              name="body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
            />
          </label>
          <Button
            type="submit"
            variant="secondary"
            aria-label={`Add ${label}`}
            disabled={saving}
          >
            Add
          </Button>
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

/**
 * The Follow-up tab: grouped canonical follow-up Tasks + unconverted items.
 *
 * §16 — every Task here is a DalyHub Task and is opened in the shared Task
 * drawer; nothing in this file draws a task card, a task status or a task
 * action of its own. The grouping is the canonical Task display state
 * (`groupFollowUps`), not a Meetings-local one.
 */
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
  const unconvertedActions = items.filter(
    (item) => item.kind === "action" && !liveTasks.has(item.id),
  );
  const noneYet = hasNoFollowUps(followUps);
  const allDone = allFollowUpsComplete(followUps);

  return (
    <section className="dh-record-section flex min-w-0 flex-col gap-6">
      <div className="dh-follow-up-group__heading flex flex-wrap items-center justify-between gap-3">
        <h2 className="m-0 text-md font-semibold text-primary">Follow-up</h2>
        {!readOnly ? (
          <Button variant="primary" size="sm" onClick={onAddFollowUp}>
            Add follow-up task
          </Button>
        ) : null}
      </div>

      {noneYet ? (
        <EmptyState
          icon={<EntityIcon type="task" />}
          title="No follow-up tasks yet"
          description="Add an action item or follow-up task when this meeting creates work."
        />
      ) : allDone ? (
        <p className="dh-follow-up-empty m-0 text-sm text-tertiary">
          Everything from this meeting is complete.
        </p>
      ) : null}

      {!noneYet
        ? groups.map((group) => (
            <div
              key={group.key}
              className="dh-follow-up-group flex min-w-0 flex-col gap-2"
            >
              {/*
                UNTITLED-13 — the count is a BADGE BESIDE the heading, and it
                names its noun.
                
                It used to be inside the heading as "Open (1)", so the heading's
                accessible name carried a parenthesised digit. The badge sits
                outside now, exactly as the Meetings collection's day heading
                does, and for the same reason: a bare figure welded onto a label
                is a worse heading than a label, and a badge that does not say
                what it counts is a worse badge than one that does.
              */}
              <div className="dh-follow-up-group__heading flex flex-wrap items-center gap-2">
                <SectionHeading level={3} title={group.label} />
                <Badge tone="neutral" variant="outline">
                  {group.entries.length === 1
                    ? "1 task"
                    : `${group.entries.length} tasks`}
                </Badge>
              </div>
              {group.entries.length === 0 ? (
                <p className="dh-follow-up-empty m-0 text-sm text-tertiary">
                  {group.emptyHint}
                </p>
              ) : (
                /*
                 * UNTITLED-13 — the divided list, not a stack of stadium-radius
                 * outlined boxes. `.dh-follow-up-row` drew a `--dh-radius-pill`
                 * border around every task title, which is the geometry the
                 * product reserves for a CONTROL; these are rows.
                 */
                <ul className="dh-follow-up-list m-0 list-none overflow-hidden rounded-xl bg-primary p-0 shadow-xs ring-1 ring-secondary">
                  {group.entries.map((entry) => (
                    <li
                      key={entry.task.id}
                      className="dh-follow-up-row flex items-center gap-3 border-b border-secondary px-4 py-3 last:border-b-0 hover:bg-secondary"
                    >
                      <button
                        type="button"
                        className="dh-follow-up-row__title min-w-0 flex-1 cursor-pointer border-0 bg-transparent p-0 text-left text-sm font-medium break-words text-primary underline-offset-2 outline-focus-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
                        onClick={() => onOpenTask(entry.task.id)}
                        aria-label={`Open task: ${entry.task.title}`}
                      >
                        {entry.task.title}
                      </button>
                      <span className="dh-follow-up-row__state shrink-0 text-xs whitespace-nowrap text-tertiary">
                        {group.label}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))
        : null}

      <div className="dh-follow-up-group flex min-w-0 flex-col gap-2">
        <SectionHeading level={3} title="Unconverted action items" />
        {unconvertedActions.length === 0 ? (
          <p className="dh-follow-up-empty m-0 text-sm text-tertiary">
            No explicit action items are waiting to become tasks.
          </p>
        ) : (
          <ul className="dh-meeting-items m-0 flex list-none flex-col p-0">
            {unconvertedActions.map((item) => (
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
