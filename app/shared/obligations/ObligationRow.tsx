/**
 * V2.10 LIFE-02 / UNTITLED-16 — the ONE Obligation row.
 *
 * Drawn identically by Life Admin's collection and by the Asset record's
 * Obligations tab, because they are the same record seen from two places. The
 * Assets module used to draw its own `<li class="dh-asset-obligation">` with its
 * own badge, its own meta line and its own action set; when Life Admin arrived
 * that would have become two rows for one record, which is how two surfaces come
 * to disagree about what an obligation is (ADR-115, and the precedent the Task
 * and Habit rows already set).
 *
 * ── The action set is part of the row, not part of the surface ──────────────
 * Which actions an obligation offers is a property of its STATE — a completed
 * occurrence offers no "Complete", one with a live Task says "Open task" rather
 * than "Create task" — and that rule belongs in one place. Each surface passes
 * the handlers it can honour and the row decides what to show; a surface that
 * passes none renders a read-only row, which is exactly what an archived Asset
 * needs.
 *
 * ── UNTITLED-16: one visible action, and the rest in the menu ───────────────
 *
 * The row used to draw up to FIVE permanent buttons — Complete, Edit, Create
 * task, Hold, Dismiss — each a bare `dh-btn dh-btn--ghost dh-btn--sm` class
 * string, on every row of a collection whose whole job is to say what needs
 * dealing with. Twenty obligations meant a hundred controls, four fifths of them
 * for something the owner was not doing, and two of them (Hold, Dismiss)
 * one mis-tap from silencing a commitment.
 *
 * It is now what Meetings arrived at for the same problem: ONE primary control
 * for the thing the row exists for — Complete, or Reopen where the occurrence is
 * closed — and the shared `OverflowMenu` for everything else. Dismiss carries
 * the menu's `danger` tone, because it is the one that makes an obligation stop
 * asking.
 *
 * The badge is the genuine Untitled `base/badges` through the shared
 * `UntitledStatusBadge`, replacing a hand-drawn stadium with its own five-tone
 * container map in `obligations.css`. The row's own box, hover, columns and
 * phone arrangement are Untitled's divided-list anatomy rather than six rules of
 * `dh-obligation-row__*`.
 *
 * ── What is deliberately NOT here ───────────────────────────────────────────
 * No amount on the compact row. A price is the most private fact an obligation
 * carries, and a collection is glanced at over someone's shoulder; the record
 * shows it, and `density="comfortable"` shows it where the surface has asked
 * for the fuller line. No countdown, no percentage, no colour without a word
 * beside it (§24). And no due-date PILL: the state's word is the badge, and the
 * date itself stays in the quiet meta line, because a collection where every row
 * carries a bright date is a collection with no emphasis left for the overdue
 * one (§28).
 */

import { Link } from "react-router";

import { AccentIcon, isEntityType } from "~/shared/entity";
import { OverflowMenu, type OverflowMenuItem } from "~/shared/overflow-menu";
import { UntitledStatusBadge } from "~/shared/pill";
import { Button } from "~/shared/ui";

import {
  obligationStateTone,
  type SerializedObligation,
} from "./obligation-view";

export interface ObligationRowProps {
  readonly obligation: SerializedObligation;
  /**
   * `compact` is the collection's line: state, title, and one meta line.
   * `comfortable` adds the description, the expected amount and the subject —
   * the record's own tab, where there is room and the owner asked to look.
   */
  readonly density?: "compact" | "comfortable";
  /** Show which record this is about. Off inside that record's own tab. */
  readonly showSubject?: boolean;
  /** Omit to render the row read-only (an archived subject, a print view). */
  readonly onComplete?: (obligation: SerializedObligation) => void;
  readonly onEdit?: (obligation: SerializedObligation) => void;
  readonly onCreateTask?: (obligation: SerializedObligation) => void;
  readonly onHold?: (obligation: SerializedObligation) => void;
  readonly onDismiss?: (obligation: SerializedObligation) => void;
  readonly onReopen?: (obligation: SerializedObligation) => void;
  /** True while a mutation for THIS obligation is in flight. */
  readonly busy?: boolean;
  /** Omit to render the title as plain text (a context with no destination). */
  readonly href?: string | null;
  readonly "data-testid"?: string;
}

export function ObligationRow({
  obligation,
  density = "compact",
  showSubject = true,
  onComplete,
  onEdit,
  onCreateTask,
  onHold,
  onDismiss,
  onReopen,
  busy = false,
  href,
  "data-testid": testId = "obligation-row",
}: ObligationRowProps) {
  const tone = obligationStateTone(obligation.state);
  const destination = href === undefined ? obligation.href : href;
  const open = obligation.status === "open";
  const comfortable = density === "comfortable";

  /*
   * The mark is the SUBJECT's where there is one, and the obligation's own where
   * there is not. An obligation about the ute should look like the ute in a list
   * that also holds a tax return — and a tax return is about nothing, which is
   * not a gap to fill with a borrowed glyph.
   */
  const markType =
    obligation.subject && isEntityType(obligation.subject.type)
      ? obligation.subject.type
      : "obligation";

  const meta = [
    obligation.categoryLabel,
    obligation.stateText,
    obligation.recurrenceKind === "none" ? null : obligation.recurrenceLabel,
    showSubject && obligation.subject ? obligation.subject.title : null,
  ].filter(Boolean) as string[];

  /*
   * The secondary actions. Each names its obligation, so a menu opened from the
   * fourteenth row of a list is never a set of bare verbs — and so the trigger's
   * own label can stay short.
   */
  const menuItems: readonly OverflowMenuItem[] = open
    ? ([
        onEdit
          ? {
              /*
               * The accessible name CONTAINS the visible label, which WCAG
               * 2.5.3 (Label in Name) requires and a first draft broke: "Create
               * a task for X" and "Put X on hold" read better in isolation and
               * are names a speech-input user cannot reach the item by, because
               * neither starts with the words on the screen. Naming the
               * obligation is what the suffix is for.
               */
              id: "edit",
              label: "Edit",
              ariaLabel: `Edit ${obligation.title}`,
              onSelect: () => onEdit(obligation),
              ...(busy ? { pending: true } : {}),
            }
          : null,
        onCreateTask && obligation.taskId === null
          ? {
              id: "create-task",
              label: "Create task",
              ariaLabel: `Create task for ${obligation.title}`,
              onSelect: () => onCreateTask(obligation),
              ...(busy ? { pending: true } : {}),
            }
          : null,
        onHold
          ? {
              id: "hold",
              label: "Hold",
              ariaLabel: `Hold ${obligation.title}`,
              onSelect: () => onHold(obligation),
              ...(busy ? { pending: true } : {}),
            }
          : null,
        onDismiss
          ? {
              id: "dismiss",
              label: "Dismiss",
              ariaLabel: `Dismiss ${obligation.title}`,
              /*
               * The one action that makes a commitment stop asking. It takes the
               * menu's destructive tone and sits behind a separator, because it
               * is not a neighbour of "Edit" — it is the end of the row's life as
               * something the owner is tracking.
               */
              tone: "danger" as const,
              separatorBefore: true,
              onSelect: () => onDismiss(obligation),
              ...(busy ? { pending: true } : {}),
            }
          : null,
      ].filter(Boolean) as OverflowMenuItem[])
    : [];

  return (
    <li
      className="dh-obligation-row flex flex-wrap items-start gap-x-3 gap-y-2 px-4 py-3 md:flex-nowrap md:gap-4 md:px-5"
      data-density={density}
      data-state={obligation.state}
      data-testid={testId}
      data-obligation-id={obligation.id}
    >
      <span className="mt-0.5 shrink-0" aria-hidden="true">
        <AccentIcon entityType={markType} size="sm" />
      </span>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="m-0 flex flex-wrap items-center gap-2">
          {/* The state is a WORD first; the tone only tints the word it is on. */}
          <UntitledStatusBadge tone={tone} size="sm">
            {obligation.stateLabel}
          </UntitledStatusBadge>
          {destination === null ? (
            <span className="text-sm font-medium break-words text-primary">
              {obligation.title}
            </span>
          ) : (
            <Link
              className="text-sm font-medium break-words text-primary outline-focus-ring hover:underline focus-visible:outline-2 focus-visible:outline-offset-2"
              to={destination}
              aria-label={`Open ${obligation.title}`}
              data-testid="obligation-row-open"
            >
              {obligation.title}
            </Link>
          )}
        </p>

        <p className="m-0 text-xs break-words text-tertiary">
          {meta.map((part, index) => (
            <span key={part}>
              {index > 0 ? <span aria-hidden="true"> · </span> : null}
              <span>{part}</span>
            </span>
          ))}
        </p>

        {comfortable && obligation.description ? (
          <p className="m-0 text-sm break-words text-tertiary">
            {obligation.description}
          </p>
        ) : null}

        {comfortable && obligation.expectedAmountDisplay ? (
          <p className="m-0 text-sm text-tertiary tabular-nums">
            {/* "Expected", never "owed" or "due": V2.10 records no payment. */}
            Expected {obligation.expectedAmountDisplay}
          </p>
        ) : null}

        {obligation.taskId ? (
          <p className="m-0 text-xs text-tertiary">
            {obligation.taskOpen ? (
              <>
                Tracked as a task.{" "}
                <a
                  className="font-medium text-brand-secondary underline-offset-2 hover:underline"
                  href={`/tasks?drawer=task%3A${encodeURIComponent(obligation.taskId)}`}
                >
                  Open task
                </a>
              </>
            ) : (
              /* The authority contract, said plainly to the owner (§7): ticking
                 the Task off is not proof that the work happened. */
              <>
                Its task is done. Record what actually happened to complete this
                obligation.
              </>
            )}
          </p>
        ) : null}
      </div>

      {/*
       * ONE visible control and one menu.
       *
       * The mark and the body sit side by side at EVERY width and only this
       * wraps, because a first draft stacked all three below `md` and gave a
       * phone a line holding one 20px glyph and nothing else — fourteen wasted
       * lines down a collection whose whole job is to fit what needs dealing
       * with on one screen. Empty for a read-only row, which then draws no gap
       * (see `obligations.css`).
       */}
      <div className="flex shrink-0 items-center gap-1 max-md:w-full">
        {open && onComplete ? (
          <Button
            variant="secondary"
            size="sm"
            className="max-md:min-h-[var(--app-touch-target-min)]"
            disabled={busy}
            onClick={() => onComplete(obligation)}
          >
            Complete
            <span className="sr-only"> {obligation.title}</span>
          </Button>
        ) : null}
        {!open && obligation.status !== "completed" && onReopen ? (
          <Button
            variant="subtle"
            size="sm"
            className="max-md:min-h-[var(--app-touch-target-min)]"
            disabled={busy}
            onClick={() => onReopen(obligation)}
          >
            Reopen
            <span className="sr-only"> {obligation.title}</span>
          </Button>
        ) : null}
        {menuItems.length > 0 ? (
          <OverflowMenu
            items={menuItems}
            label={`More actions for ${obligation.title}`}
          />
        ) : null}
      </div>
    </li>
  );
}
