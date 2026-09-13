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

import { useCallback, useRef, useState } from "react";
import { useRevalidator } from "react-router";

import { useDrawer } from "~/shared/drawer";
import { OverflowMenu } from "~/shared/overflow-menu";
import { Button, Input } from "~/shared/ui";
import type { SerializedTaskView } from "~/shared/task-record/task-view";

import type { MeetingItemKind } from "~/kernel/meetings";
import { MeetingFollowUpForm } from "./MeetingFollowUpForm";
import type { SerializedMeeting } from "./meeting-view";
import { meetingItemKindLabel, type FollowUpTaskEntry } from "./follow-up-view";

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
        {/*
          §14 — the visible conversion control belongs to an ACTION, and to the
          context menu everywhere else.

          Turning an action item into a Task is the most frequent thing done on
          this surface and two presses for it during a live meeting is one too
          many, so an action keeps its button. An AGENDA item is a topic and a
          DECISION is a record of what was settled: offering "Create task" as a
          full control on every one of those lines put three identical buttons
          down an agenda of three topics and made the chrome the loudest thing
          in the band. The action is still one menu away, on every kind.
        */}
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
        ) : item.kind === "action" ? (
          <Button variant="subtle" size="sm" onClick={() => onConvert(item.id)}>
            Create task
          </Button>
        ) : null}
        {/*
          The destructive action lives in the shared context menu, not as a
          permanently-rendered "Remove" beside every line. It was drawn at
          `opacity: 0` under a hover rule with a `:focus-within` escape hatch,
          which is three mechanisms to make one control both hidden and
          reachable; a menu is one.
        */}
        {!readOnly && (onRemove || item.kind !== "action") ? (
          <OverflowMenu
            label={`Actions for this ${kind}`}
            items={[
              ...(convertedTask || item.kind === "action"
                ? []
                : [
                    {
                      id: "convert",
                      label: "Create a task from this",
                      onSelect: () => onConvert(item.id),
                    },
                  ]),
              ...(onRemove
                ? [
                    {
                      id: "remove",
                      label: `Remove ${kind}`,
                      tone: "danger" as const,
                      separatorBefore: !convertedTask && item.kind !== "action",
                      onSelect: () => onRemove(item.id),
                    },
                  ]
                : []),
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
        <AddItemForm kind={kind} label={label} onAdd={onAddItem} />
      ) : null}
    </section>
  );
}

/**
 * UNTITLED-13 — adding an item is one control until you want it, then a field.
 *
 * §12 asks the notebook not to carry excessive persistent chrome and to use
 * progressive disclosure. It carried five bands, and four of them held a visible
 * label, a text field and an Add button whether or not anything was being
 * added — so an upcoming meeting with an agenda and nothing else opened on four
 * empty forms, and the forms outweighed the writing.
 *
 * The LIVE path is untouched and is not this: the capture bar pinned to the
 * bottom of the workspace takes a note, an action, a decision or an outcome
 * without scrolling anywhere (MOBILE-01). This is the considered path — you are
 * already reading the band and you want to add to it — so it costs one press to
 * open and focuses the field when it does.
 *
 * The text still survives a failed save: the field is cleared only on success,
 * and the form only closes when it clears.
 */
function AddItemForm({
  kind,
  label,
  onAdd,
}: {
  readonly kind: MeetingItemKind;
  readonly label: string;
  readonly onAdd: (kind: MeetingItemKind, body: string) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const fieldRef = useRef<HTMLInputElement>(null);

  if (!open) {
    return (
      <Button
        variant="subtle"
        size="sm"
        className="self-start"
        onClick={() => {
          setOpen(true);
          // The field is the point of pressing this, so focus lands in it.
          requestAnimationFrame(() => fieldRef.current?.focus());
        }}
      >
        Add {label}
      </Button>
    );
  }

  return (
    <form
      className="flex flex-wrap items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!body.trim() || saving) return;
        setSaving(true);
        void (async () => {
          const ok = await onAdd(kind, body);
          if (ok) {
            setBody("");
            setOpen(false);
          }
          setSaving(false);
        })();
      }}
    >
      {/*
        RECORD-01 — "Add {label}" once, not twice. The section already has a
        heading, so the visible button stays the bare verb and keeps the specific
        ACCESSIBLE name, which is what a screen-reader user needs when four of
        these forms sit on one record.

        The field names the NOUN, not the act. It used to say "Add {label}" too,
        which gave the textbox and the submit button one accessible name between
        them: a screen reader announced "Add action item, edit text" then "Add
        action item, button", and there was no way to ask for either one
        unambiguously.
      */}
      <label className="flex min-w-0 flex-1 basis-64 flex-col gap-1.5">
        {/* Untitled's own label recipe (`base/input/label`'s type ramp and
         * colour) on a native `<label>`. The component itself is React Aria's
         * `Label`, which needs a `TextField` context this one-line inline form
         * has no reason to introduce — the native element associates by
         * containment and reads identically. */}
        <span className="text-sm font-medium text-secondary">New {label}</span>
        <Input
          ref={fieldRef}
          name="body"
          value={body}
          onChange={(event) => setBody(event.target.value)}
          onKeyDown={(event) => {
            // Escape abandons an empty field rather than trapping the owner in
            // a form they opened by accident.
            if (event.key === "Escape" && body.length === 0) setOpen(false);
          }}
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
