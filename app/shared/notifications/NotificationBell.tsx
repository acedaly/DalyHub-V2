/**
 * NOTIFY-01 — the notification bell.
 *
 * ── The comment this replaces ───────────────────────────────────────────────
 * `DesktopTopBar` used to say, in its list of what the bar deliberately does
 * NOT carry: "a notification bell (DalyHub has no notification system, and a
 * bell that never rings is a decorative control — the references show one, and
 * this is the clearest place the product's truth has to win over the picture)".
 * That was exactly right at the time. NOTIFY-01 changes the truth rather than
 * the principle: there is a notification system now, so the bell rings.
 *
 * ── It is calm ──────────────────────────────────────────────────────────────
 * DalyHub's product philosophy rules out red badges competing for attention, so
 * the count is drawn in the product's own accent rather than in alarm red, and
 * it is ABSENT at zero rather than showing a "0". The control itself is always
 * present, because a control that appears and disappears moves everything beside
 * it — and because "nothing has happened" is a thing the owner should be able to
 * check, not merely infer from an empty space.
 *
 * ── The count is in the accessible name ─────────────────────────────────────
 * A number rendered in a corner is invisible to a screen reader unless it is
 * part of the name, and colour-plus-position is not information. The label reads
 * "Notifications, 3 unread", and the visible number is `aria-hidden`.
 */

import { BellIcon } from "~/shared/icons";
import { IconButton } from "~/shared/ui";

export type NotificationBellProps = {
  /** How many notifications the owner has not read. Server-resolved. */
  readonly unread: number;
  /** Open the inbox, receiving the trigger so focus can return to it. */
  readonly onOpen: (opener: HTMLElement) => void;
  /** Whether the inbox is currently open, for `aria-expanded`. */
  readonly open?: boolean;
  readonly className?: string;
  /**
   * The test id, supplied by the BAR rather than fixed here.
   *
   * Both top bars render a bell and both are in the DOM at every width (one is
   * `display: none`), so a single shared id would match twice and make every
   * query ambiguous. Each bar names its own.
   */
  readonly testId?: string;
};

/** Bounded so a long-unopened inbox cannot widen the top bar. */
function countLabel(unread: number): string {
  return unread > 99 ? "99+" : String(unread);
}

export function NotificationBell({
  unread,
  onOpen,
  open = false,
  className,
  testId,
}: NotificationBellProps) {
  const label =
    unread === 0
      ? "Notifications, none unread"
      : `Notifications, ${unread} unread`;
  return (
    <span className={["dh-bell", className].filter(Boolean).join(" ")}>
      <IconButton
        icon={<BellIcon />}
        label={label}
        tooltip="Notifications"
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid={testId}
        onClick={(event) => onOpen(event.currentTarget)}
      />
      {unread > 0 ? (
        <span className="dh-bell__count" aria-hidden="true">
          {countLabel(unread)}
        </span>
      ) : null}
    </span>
  );
}
