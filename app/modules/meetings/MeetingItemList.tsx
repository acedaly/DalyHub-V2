/**
 * UNTITLED-14 — the Meeting's four artifact lists, as ONE list component.
 *
 * Agenda items, decisions and outcomes are all the same object: a line of text
 * the owner captured during a meeting, kept in order, findable later. They were
 * drawn by three copies of one arrangement plus four disclosure forms, which is
 * what made the record read as "several forms for adding different kinds of
 * meeting record" rather than as one place to run a meeting.
 *
 * This is that arrangement, once:
 *
 *     ┌────────────────────────────────────────┐
 *     │ Budget assumptions                 ··· │   ← hairline between rows
 *     │ Recruitment timeline               ··· │
 *     │ Fire season readiness              ··· │
 *     │ + Add agenda item                      │   ← the list's own last row
 *     └────────────────────────────────────────┘
 *
 * ── The composition, and where it comes from ────────────────────────────────
 *
 * Untitled Pro `informational-01/13` and `informational-02/13` (the project
 * detail pages) draw exactly this: a divided body of quiet rows inside one
 * bordered card, and a single compact "Add" affordance attached to the list
 * rather than parked beside a heading. Every pixel here is the vendored
 * `application/table` card anatomy and the shared `OverflowMenu`; the
 * composition is theirs.
 *
 * ── Why a DECISION looks different, and how much ────────────────────────────
 *
 * §I of the redesign brief: a decision deserves to be findable when you scan a
 * finished meeting, and it must not become a coloured slab. So a decision — and
 * only a decision — carries a small circular MARK in the row's leading column,
 * the same one the Activity stream puts on a moment. That is the whole
 * difference: same row, same type, same density, one mark. An OUTCOME does not
 * get one, because an outcome is a consequence rather than a commitment, and
 * marking both would tell the reader they are the same kind of thing.
 *
 * The two are genuinely different in the schema (`meeting_items.kind`, migration
 * 0021) and the product keeps both: a DECISION is what was settled, an OUTCOME
 * is what followed from it. Nothing about that model changed here.
 */

import { CheckCircle } from "@untitledui/icons";

import { InlineAddRow } from "~/shared/inline-edit";
import { OverflowMenu } from "~/shared/overflow-menu";
import { Button } from "~/shared/ui";
import { cx } from "~/shared/ui/untitled/utils/cx";

import type { MeetingItemKind } from "~/kernel/meetings";
import { meetingItemKindLabel } from "./follow-up-view";
import type { SerializedMeeting } from "./meeting-view";

type SerializedMeetingItem = SerializedMeeting["items"][number];

export interface MeetingItemListProps {
  readonly kind: MeetingItemKind;
  /** The list's accessible name — the band's heading. */
  readonly label: string;
  readonly items: readonly SerializedMeetingItem[];
  readonly readOnly: boolean;
  /** Persist one line; resolves `true` on success. */
  readonly onAdd: (kind: MeetingItemKind, body: string) => Promise<boolean>;
  readonly onRemove: (itemId: string) => void;
  /** Turn this line into a DalyHub Task. Omitted where the kind cannot. */
  readonly onConvert?: (itemId: string) => void;
  /** Which lines already became a Task, so the row can say so instead of offering it again. */
  readonly convertedTitles?: ReadonlyMap<string, string>;
  readonly onOpenTask?: (itemId: string) => void;
  readonly announce?: (message: string) => void;
}

export function MeetingItemList({
  kind,
  label,
  items,
  readOnly,
  onAdd,
  onRemove,
  onConvert,
  convertedTitles,
  onOpenTask,
  announce,
}: MeetingItemListProps) {
  const rows = items.filter((item) => item.kind === kind);
  const noun = meetingItemKindLabel(kind).toLowerCase();
  const marked = kind === "decision";

  if (rows.length === 0 && readOnly) {
    return (
      <p className="dh-follow-up-empty m-0 text-sm text-tertiary">
        No {noun}s were recorded.
      </p>
    );
  }

  return (
    <div
      className="dh-meeting-items-card overflow-hidden rounded-xl bg-primary shadow-xs ring-1 ring-secondary"
      data-kind={kind}
    >
      {rows.length === 0 ? (
        /*
         * An empty list still draws its card, because the add row lives in it.
         * The line says what the list is FOR rather than that it is empty — a
         * meeting with no decisions yet is normal, not a gap to apologise for.
         */
        <p className="dh-follow-up-empty m-0 border-b border-secondary px-4 py-3 text-sm text-tertiary">
          {EMPTY_HINT[kind]}
        </p>
      ) : (
        <ul
          className="dh-meeting-items m-0 flex list-none flex-col p-0"
          aria-label={label}
        >
          {rows.map((item) => {
            const converted = convertedTitles?.get(item.id) ?? null;
            return (
              <li
                key={item.id}
                className="dh-meeting-item flex items-start gap-3 border-b border-secondary px-4 py-2.5 hover:bg-secondary"
              >
                {marked ? (
                  <span
                    aria-hidden="true"
                    className="dh-meeting-item__mark mt-0.5 shrink-0 text-fg-brand-secondary"
                  >
                    <CheckCircle className="size-4" />
                  </span>
                ) : null}
                <div className="dh-meeting-item__body flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="dh-meeting-item__text text-sm break-words text-primary">
                    {item.bodyMarkdown}
                  </span>
                  {converted ? (
                    <span className="dh-meeting-item__meta flex min-w-0 items-center gap-1.5 text-xs text-tertiary">
                      <span className="shrink-0">Linked task</span>
                      <span
                        className="min-w-0 truncate font-medium text-secondary"
                        title={converted}
                      >
                        {converted}
                      </span>
                    </span>
                  ) : null}
                </div>
                {/*
                  §H — a list you work down during a meeting carries no
                  permanently-rendered destructive button and no repeated
                  "Create task". The acts a line supports are behind its own
                  menu, which is the same shape on every row of every kind.

                  ONE exception, and it is the most frequent act on the surface:
                  an ACTION that is not yet a Task keeps a visible control,
                  because turning an action into work is what the band exists
                  for and two presses for it during a live meeting is one too
                  many. An agenda item is a topic and a decision is a record of
                  what was settled; offering "Create task" as a full control on
                  every one of those put three identical buttons down an agenda
                  of three topics.
                */}
                {!readOnly && kind === "action" && !converted && onConvert ? (
                  <Button
                    variant="subtle"
                    size="sm"
                    className="shrink-0"
                    onClick={() => onConvert(item.id)}
                  >
                    Create task
                  </Button>
                ) : null}
                {!readOnly ? (
                  <OverflowMenu
                    label={`Actions for this ${noun}`}
                    items={[
                      ...(converted && onOpenTask
                        ? [
                            {
                              id: "open",
                              label: "Open the task",
                              onSelect: () => onOpenTask(item.id),
                            },
                          ]
                        : []),
                      ...(!converted && onConvert
                        ? [
                            {
                              id: "convert",
                              label: "Create a task from this",
                              onSelect: () => onConvert(item.id),
                            },
                          ]
                        : []),
                      {
                        id: "remove",
                        label: `Remove ${noun}`,
                        tone: "danger" as const,
                        separatorBefore: Boolean(converted || onConvert),
                        onSelect: () => onRemove(item.id),
                      },
                    ]}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {!readOnly ? (
        <InlineAddRow
          noun={noun}
          announce={announce}
          onAdd={(body) => onAdd(kind, body)}
          inputTestId={`meeting-add-${kind}`}
        />
      ) : null}
    </div>
  );
}

/**
 * What an empty list is for, said in the list's own words.
 *
 * Not "No decisions yet." — a band whose only content is a report of its own
 * emptiness teaches nothing. These say what belongs there, which is the thing a
 * person opening a blank meeting actually needs.
 */
const EMPTY_HINT: Readonly<Record<MeetingItemKind, string>> = {
  agenda: "What should this meeting cover?",
  decision: "What was settled? Decisions are what you will look for later.",
  outcome: "What followed from the decisions?",
  action: "What does someone now have to do?",
};

/** The list's own heading row — a title, an optional count, and nothing else. */
export function MeetingBandHeading({
  title,
  description,
  count,
  action,
  id,
}: {
  readonly title: string;
  readonly description?: string;
  readonly count?: number;
  readonly action?: React.ReactNode;
  readonly id?: string;
}) {
  return (
    <div className="dh-meeting-band__heading flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <div className="flex min-w-0 flex-col gap-0.5">
        <h3
          id={id}
          className="m-0 flex items-center gap-2 text-md font-semibold text-primary"
        >
          {title}
          {count !== undefined && count > 0 ? (
            <span
              className={cx(
                "rounded-full px-1.5 py-px text-xs font-medium text-tertiary tabular-nums ring-1 ring-secondary",
              )}
            >
              {count}
            </span>
          ) : null}
        </h3>
        {description ? (
          <p className="m-0 text-sm text-tertiary">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}
