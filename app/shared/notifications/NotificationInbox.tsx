/**
 * NOTIFY-01 — the notification INBOX.
 *
 * A log of what DalyHub said, newest first, in the ONE shared `Sheet` (which is
 * itself the DS-03 focus trap, background inerting, scroll lock and focus
 * restoration — there is no second modal machinery in DalyHub).
 *
 * ── It is a log, and the restraint is the design ────────────────────────────
 * No per-notification actions, no snooze, no grouping, no filters, no priority
 * and no "resolve". Every one of those would make this a second attention model,
 * and DalyHub already has one — Today's rail, which is recomputed from facts and
 * cannot go stale. If the two ever disagree about what needs the owner, the rail
 * is right and this is history.
 *
 * One row does one thing: opening it goes where the event pointed, and marks it
 * read on the way. "Mark all read" exists because reading a log and then having
 * to dismiss it item by item is busywork the product refuses everywhere else.
 *
 * ── A failed external delivery is stated, not hidden ────────────────────────
 * The row is here whatever happened, because the ledger insert commits before
 * any send. When a channel failed, the row says so in the product's own words —
 * so "I never got a push" has an answer inside the application rather than in a
 * provider's dashboard.
 *
 * Naming: `~/shared/feedback/NotificationCenter.tsx` is the transient TOAST
 * layer and is unrelated. This is the INBOX.
 */

import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";

import { Sheet } from "~/shared/sheet";
import { Button } from "~/shared/ui";

import type { NotificationInboxData, NotificationView } from "./model";
import { EMPTY_INBOX } from "./model";

export type NotificationInboxProps = {
  /** The control that opened it, so focus returns there on close. */
  readonly opener: HTMLElement | null;
  readonly onClose: () => void;
  /**
   * Called after a write that changed the unread count, so the shell can refresh
   * the bell. The count lives in the shell's loader data — this surface reports
   * that it moved rather than owning a second copy of it.
   */
  readonly onUnreadChanged?: () => void;
  /**
   * Open a row: navigate to it, mark it read, and close this sheet.
   *
   * Owned by the SHELL rather than done here, and the reason is unmounting.
   * Opening a row closes the sheet, and a `useFetcher` belongs to the component
   * that created it — a submission fired on the way out is a submission whose
   * result nobody is left to see, so the bell would keep its old count until the
   * next navigation. The shell is still mounted, so its fetcher lands.
   */
  readonly onOpenNotification: (item: {
    readonly id: string;
    readonly href: string;
    readonly read: boolean;
  }) => void;
};

export function NotificationInbox({
  opener,
  onClose,
  onUnreadChanged,
  onOpenNotification,
}: NotificationInboxProps) {
  // The log itself. Fetched when the sheet opens rather than carried in every
  // page's loader data: a fifty-row log on every navigation, for a surface most
  // of them never open, is a payload nobody asked for.
  const inbox = useFetcher<NotificationInboxData>();
  const write = useFetcher<{
    readonly ok: boolean;
    readonly changed: number;
  }>();
  const [data, setData] = useState<NotificationInboxData>(EMPTY_INBOX);
  // Loaded ONCE per open. A fetcher's identity changes as its state does, so a
  // state-shaped guard alone would let a re-render slip a second request through
  // the gap before the first is registered.
  const requested = useRef(false);

  useEffect(() => {
    if (requested.current) return;
    requested.current = true;
    inbox.load("/notifications");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (inbox.data !== undefined) setData(inbox.data);
  }, [inbox.data]);

  useEffect(() => {
    if (write.data?.ok === true && (write.data.changed ?? 0) > 0) {
      onUnreadChanged?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [write.data]);

  const loading = inbox.state !== "idle" && inbox.data === undefined;

  function openNotification(item: NotificationView) {
    // Painted read here and written by the SHELL (see `onOpenNotification`).
    // Read state is not a claim about the owner's data — it is a claim about
    // what they have looked at — so painting it immediately cannot be wrong in a
    // way that matters, and waiting would mean the row is still bold as the page
    // navigates away from under it.
    setData((current) => ({
      items: current.items.map((row) =>
        row.id === item.id ? { ...row, read: true } : row,
      ),
      unread: item.read ? current.unread : Math.max(0, current.unread - 1),
    }));
    onOpenNotification({ id: item.id, href: item.href, read: item.read });
  }

  function markAllRead() {
    setData((current) => ({
      items: current.items.map((row) => ({ ...row, read: true })),
      unread: 0,
    }));
    write.submit(
      { intent: "read-all" },
      { method: "post", action: "/notifications" },
    );
  }

  return (
    <Sheet
      title="Notifications"
      description="What DalyHub has told you, most recent first."
      opener={opener}
      onClose={onClose}
      data-testid="notification-inbox"
      // Every row is a button, so the scrolling body is reachable by keyboard
      // through them — except in the empty and loading states, where there is
      // nothing focusable at all (WCAG 2.1.1; axe `scrollable-region-focusable`).
      bodyFocusable={data.items.length === 0}
      trailing={
        data.unread > 0 ? (
          <Button
            variant="subtle"
            size="sm"
            onClick={markAllRead}
            data-testid="notification-mark-all"
          >
            Mark all read
          </Button>
        ) : undefined
      }
    >
      {loading ? (
        <p className="dh-inbox__empty">Loading…</p>
      ) : data.items.length === 0 ? (
        /*
         * The empty state teaches the next action rather than apologising. It is
         * also honest about WHY it is empty: notifications are off by default, so
         * "nothing yet" would be misleading for most owners reading it.
         */
        <p className="dh-inbox__empty" data-testid="notification-inbox-empty">
          Nothing yet. DalyHub sends a daily digest and a heads-up before an
          asset obligation falls due, once you turn notifications on in
          Settings.
        </p>
      ) : (
        <ul className="dh-inbox" data-testid="notification-inbox-list">
          {data.items.map((item) => (
            <li key={item.id} className="dh-inbox__item">
              <button
                type="button"
                className="dh-inbox__row md-state-layer"
                data-read={item.read ? "true" : "false"}
                data-testid="notification-row"
                onClick={() => openNotification(item)}
              >
                <span className="dh-inbox__head">
                  <span className="dh-inbox__title">
                    {/* Unread is stated in WORDS as well as weight: a bolder
                        line is not information a screen reader receives, and
                        DalyHub does not carry state in appearance alone. */}
                    {item.read ? null : (
                      <span className="dh-visually-hidden">Unread. </span>
                    )}
                    {item.title}
                  </span>
                  <span className="dh-inbox__when">{item.whenLabel}</span>
                </span>
                <span className="dh-inbox__body">{item.body}</span>
                {item.failures.map((failure) => (
                  <span
                    key={failure.channel}
                    className="dh-inbox__failure"
                    data-testid="notification-failure"
                  >
                    {failure.message ?? "Not sent to your other devices."}
                  </span>
                ))}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

export default NotificationInbox;
