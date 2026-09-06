/**
 * V2.10 LIFE-02 — the ONE Obligation row.
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
 * ── What is deliberately NOT here ───────────────────────────────────────────
 * No amount on the compact row. A price is the most private fact an obligation
 * carries, and a collection is glanced at over someone's shoulder; the record
 * shows it, and `density="comfortable"` shows it where the surface has asked
 * for the fuller line. No countdown, no percentage, no colour without a word
 * beside it (§24).
 */

import { Link } from "react-router";

import { AccentIcon, isEntityType } from "~/shared/entity";

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

/** A button that names its obligation, so a list is never all "Complete". */
function RowAction({
  label,
  suffix,
  variant,
  busy,
  onClick,
}: {
  readonly label: string;
  readonly suffix: string;
  readonly variant: "primary" | "ghost";
  readonly busy: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`dh-btn dh-btn--${variant} dh-btn--sm`}
      disabled={busy}
      onClick={onClick}
    >
      {label}
      <span className="dh-visually-hidden"> {suffix}</span>
    </button>
  );
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

  return (
    <li
      className="dh-obligation-row"
      data-density={density}
      data-state={obligation.state}
      data-testid={testId}
      data-obligation-id={obligation.id}
    >
      <span className="dh-obligation-row__lead" aria-hidden="true">
        <AccentIcon entityType={markType} size="sm" />
      </span>

      <div className="dh-obligation-row__main">
        <p className="dh-obligation-row__title">
          {/* The state is a WORD first; the tone only tints the word it is on. */}
          <span className={`dh-obligation-badge dh-obligation-badge--${tone}`}>
            {obligation.stateLabel}
          </span>{" "}
          {destination === null ? (
            <span className="dh-obligation-row__name">{obligation.title}</span>
          ) : (
            <Link
              className="dh-obligation-row__name"
              to={destination}
              aria-label={`Open ${obligation.title}`}
              data-testid="obligation-row-open"
            >
              {obligation.title}
            </Link>
          )}
        </p>

        <p className="dh-obligation-row__meta">
          {meta.map((part, index) => (
            <span key={part}>
              {index > 0 ? <span aria-hidden="true"> · </span> : null}
              <span>{part}</span>
            </span>
          ))}
        </p>

        {comfortable && obligation.description ? (
          <p className="dh-obligation-row__description">
            {obligation.description}
          </p>
        ) : null}

        {comfortable && obligation.expectedAmountDisplay ? (
          <p className="dh-obligation-row__amount">
            {/* "Expected", never "owed" or "due": V2.10 records no payment. */}
            Expected {obligation.expectedAmountDisplay}
          </p>
        ) : null}

        {obligation.taskId ? (
          <p className="dh-obligation-row__task">
            {obligation.taskOpen ? (
              <>
                Tracked as a task.{" "}
                <a
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

      <div className="dh-obligation-row__actions">
        {open ? (
          <>
            {onComplete ? (
              <RowAction
                label="Complete"
                suffix={obligation.title}
                variant="primary"
                busy={busy}
                onClick={() => onComplete(obligation)}
              />
            ) : null}
            {onEdit ? (
              <RowAction
                label="Edit"
                suffix={obligation.title}
                variant="ghost"
                busy={busy}
                onClick={() => onEdit(obligation)}
              />
            ) : null}
            {onCreateTask && obligation.taskId === null ? (
              <RowAction
                label="Create task"
                suffix={`for ${obligation.title}`}
                variant="ghost"
                busy={busy}
                onClick={() => onCreateTask(obligation)}
              />
            ) : null}
            {onHold ? (
              <RowAction
                label="Hold"
                suffix={obligation.title}
                variant="ghost"
                busy={busy}
                onClick={() => onHold(obligation)}
              />
            ) : null}
            {onDismiss ? (
              <RowAction
                label="Dismiss"
                suffix={obligation.title}
                variant="ghost"
                busy={busy}
                onClick={() => onDismiss(obligation)}
              />
            ) : null}
          </>
        ) : obligation.status === "completed" ? null : onReopen ? (
          <RowAction
            label="Reopen"
            suffix={obligation.title}
            variant="ghost"
            busy={busy}
            onClick={() => onReopen(obligation)}
          />
        ) : null}
      </div>
    </li>
  );
}
