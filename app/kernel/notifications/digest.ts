/**
 * NOTIFY-01 — the digest, and the obligation notice. Both pure renderers.
 *
 * ── The digest is the attention model serialised, plus the day ──────────────
 * It derives NOTHING. Every number it states was already computed for Today's
 * attention rail by the shared facts layer, which is why the digest and the rail
 * cannot disagree about how many things are waiting or which projects need a
 * look. If the digest ever wants a fact the rail cannot supply, the fact is added
 * to that layer — never computed a second time here.
 *
 * ── An empty digest is not sent ─────────────────────────────────────────────
 * {@link renderDigest} returns null when there is nothing to say, and the caller
 * treats null as "write nothing, send nothing". This inherits the rail's
 * suppression philosophy exactly: the rail has no "0 waiting" row and no "all
 * projects on track" row, because a surface that speaks when there is nothing to
 * report teaches the owner to stop reading it. A daily "nothing needs attention"
 * is the fastest way to make a notification channel worthless.
 *
 * Everything here is pure: no clock, no storage, no channel. The rendered text is
 * PLAIN — no markup, no emoji, no channel-specific escaping. Each channel formats
 * for itself (see `pushover-format.ts`); this module decides what is SAID.
 */

import {
  NOTIFICATION_BODY_MAX,
  NOTIFICATION_TITLE_MAX,
  assetObligationDedupeKey,
  digestDedupeKey,
  type NewNotification,
} from "./notification";
import type { ObligationRung } from "./notification-evaluator";

/* -------------------------------------------------------------------------- */
/* The facts                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * Everything a digest may state, and nothing that is not already a fact Today
 * reads. The shared facts layer produces one object; Today turns it into the
 * attention rail and this module turns it into a digest.
 */
export interface DigestFacts {
  /** The owner-calendar date this digest is for. */
  readonly localDate: string;
  /** Open tasks due or scheduled for today. */
  readonly dueToday: number;
  /** Open tasks due strictly before today. */
  readonly overdue: number;
  /** Open tasks with no Area or Project above them. */
  readonly inboxCount: number;
  readonly waiting: {
    readonly count: number;
    /** Owner-calendar days the oldest waiting item has waited, or null. */
    readonly oldestDays: number | null;
    /**
     * V2.7 RECALL-03 — waiting Tasks whose FOLLOW-UP date has arrived.
     *
     * The SAME field Today's attention rail reads, from the same shared facts
     * layer and the same `followUp: "due"` predicate — so the digest's follow-up
     * line and Today's follow-up fact are one number with two renderings, not
     * two counts that happen to agree. Reading `count` here instead would state
     * the generic waiting total under follow-up words, which is the specific
     * untruth `digest.test.ts` falsifies.
     */
    readonly followUpDue: number;
  };
  readonly assets: {
    /** Obligations needing attention that no open Task already carries. */
    readonly visibleCount: number;
    readonly first: {
      readonly assetTitle: string;
      readonly text: string;
    } | null;
  };
  /** Projects the EXISTING health evaluation says need a look. */
  readonly projects: readonly {
    readonly title: string;
    readonly statusLabel: string;
  }[];
  /** Today's external calendar occurrences and Meetings, in order. */
  readonly events: readonly {
    readonly title: string;
    /** "09:00", or null for an all-day item. */
    readonly timeLabel: string | null;
  }[];
}

/* -------------------------------------------------------------------------- */
/* Wording                                                                     */
/* -------------------------------------------------------------------------- */

/** How many named items a line lists before it counts instead. */
const NAMED_MAX = 3;

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

/** "Saturday 16 August" — the calm date form the product uses elsewhere. */
export function digestDateLabel(localDate: string): string {
  const [year, month, day] = localDate
    .split("-")
    .map((part) => Number.parseInt(part, 10));
  if (
    Number.isNaN(year) ||
    Number.isNaN(month) ||
    Number.isNaN(day) ||
    month < 1 ||
    month > 12
  ) {
    return localDate;
  }
  return new Intl.DateTimeFormat("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/** Truncate to a bound at a word boundary where one is near enough. */
function clamp(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max - 24 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/* -------------------------------------------------------------------------- */
/* The digest                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Build the day's digest, or null when there is nothing worth saying.
 *
 * The lines are ordered the way the rail is ordered, and for the same reason:
 * the day's work first (it is what the owner is about to do), then the cheap
 * fixes, then what is ageing, then what is drifting. Every line is strictly
 * conditional — there is no "0 overdue" line, no placeholder and no filler.
 */
export function renderDigest(facts: DigestFacts): NewNotification | null {
  const lines: string[] = [];

  if (facts.dueToday > 0 || facts.overdue > 0) {
    const parts: string[] = [];
    if (facts.dueToday > 0) {
      parts.push(`${plural(facts.dueToday, "task", "tasks")} for today`);
    }
    if (facts.overdue > 0) parts.push(`${facts.overdue} overdue`);
    lines.push(parts.join(" · "));
  }

  if (facts.events.length > 0) {
    const named = facts.events
      .slice(0, NAMED_MAX)
      .map((event) =>
        event.timeLabel === null
          ? event.title
          : `${event.timeLabel} ${event.title}`,
      )
      .join(" · ");
    const rest = facts.events.length - Math.min(NAMED_MAX, facts.events.length);
    lines.push(
      rest > 0
        ? `${plural(facts.events.length, "event", "events")}: ${named} · +${rest} more`
        : `${plural(facts.events.length, "event", "events")}: ${named}`,
    );
  }

  if (facts.inboxCount > 0) {
    lines.push(
      `${plural(facts.inboxCount, "unfiled task", "unfiled tasks")} in your inbox`,
    );
  }

  if (facts.waiting.count > 0) {
    const count = `${plural(facts.waiting.count, "waiting item", "waiting items")}`;
    lines.push(
      facts.waiting.oldestDays === null
        ? count
        : `${count} · oldest ${plural(facts.waiting.oldestDays, "day", "days")}`,
    );
  }

  /*
   * V2.7 RECALL-03 — the follow-ups-due line, beside the waiting line.
   *
   * Its own line rather than a clause on the waiting line, because it is a
   * different fact with a different action: "two things are outstanding" is
   * ageing, "one of them you said you would chase today" is a commitment that
   * has come due. It obeys the file's suppression rule exactly as every line
   * above it does — no follow-ups due, no line, and never "0 follow-ups due".
   */
  if (facts.waiting.followUpDue > 0) {
    lines.push(
      `${plural(facts.waiting.followUpDue, "follow-up", "follow-ups")} due`,
    );
  }

  if (facts.assets.visibleCount > 0) {
    if (facts.assets.visibleCount === 1 && facts.assets.first !== null) {
      lines.push(
        `${facts.assets.first.assetTitle}: ${facts.assets.first.text}`,
      );
    } else {
      lines.push(
        `${plural(facts.assets.visibleCount, "asset obligation needs", "asset obligations need")} attention`,
      );
    }
  }

  if (facts.projects.length > 0) {
    const named = facts.projects
      .slice(0, NAMED_MAX)
      .map((project) => `${project.title} (${project.statusLabel})`)
      .join(" · ");
    lines.push(
      `${plural(facts.projects.length, "project needs", "projects need")} a look: ${named}`,
    );
  }

  // THE SUPPRESSION RULE. Nothing to say means nothing is said — no row in the
  // ledger, no push, no "all clear".
  if (lines.length === 0) return null;

  return {
    kind: "digest",
    subjectEntityId: null,
    dedupeKey: digestDedupeKey(facts.localDate),
    title: clamp(
      `Your day — ${digestDateLabel(facts.localDate)}`,
      NOTIFICATION_TITLE_MAX,
    ),
    body: clamp(lines.join("\n"), NOTIFICATION_BODY_MAX),
    href: "/today",
  };
}

/* -------------------------------------------------------------------------- */
/* The obligation notice                                                       */
/* -------------------------------------------------------------------------- */

/** The facts one obligation rung is announced from. */
export interface ObligationNoticeFacts {
  readonly obligationId: string;
  readonly assetId: string;
  readonly assetTitle: string;
  /** The obligation's own title — "Registration renewal". */
  readonly title: string;
  /**
   * The obligation's owner-facing sentence, written by the ONE Assets evaluator
   * (`evaluateObligation`). Reused verbatim so the notification, the Asset record
   * and Today's rail all say the same words about the same fact.
   */
  readonly text: string;
  readonly rung: ObligationRung;
}

/**
 * Announce one obligation crossing one rung.
 *
 * The subject is the ASSET (that is what the owner opens), while the dedupe key
 * names the OBLIGATION (that is what fired) — an Asset with a registration
 * renewal and a service due in the same week must produce two notices, not one.
 */
export function renderObligationNotice(
  facts: ObligationNoticeFacts,
): NewNotification {
  return {
    kind: "asset_obligation",
    subjectEntityId: facts.assetId,
    dedupeKey: assetObligationDedupeKey(facts.obligationId, facts.rung),
    title: clamp(
      `${facts.assetTitle} — ${facts.title}`,
      NOTIFICATION_TITLE_MAX,
    ),
    body: clamp(facts.text, NOTIFICATION_BODY_MAX),
    href: `/asset/${facts.assetId}?tab=obligations`,
  };
}
