import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useCallback, useState } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  MEETING_HELD_ACTION_ID,
  MEETING_HELD_ERROR_MESSAGE,
  meetingHeldActionItem,
  meetingHeldSuccessMessage,
} from "~/modules/meetings/meeting-held-action";
import { CheckIcon } from "~/shared/icons";
import { OverflowMenu, type OverflowMenuItem } from "~/shared/overflow-menu";

/**
 * MEET-03 — the "Mark as held" record action, as RULES and as BEHAVIOUR.
 *
 * The rules half proves visibility, wording and the completed state without any
 * rendering. The behaviour half mounts the item in the REAL shared DS-12 overflow
 * menu — the surface it actually ships in — so the busy, success and error paths,
 * the keyboard path and the disabled-but-visible completed state are proven
 * against the shared component rather than a bespoke stand-in.
 */

const FORMAT = (instant: string) =>
  new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(instant));

const HELD_AT = "2026-07-27T09:30:00.000Z";

describe("when the action is offered", () => {
  it("is offered on an active meeting that has not been held", () => {
    const item = meetingHeldActionItem(
      { heldAt: null, archived: false, pending: false },
      FORMAT,
    );
    expect(item).not.toBeNull();
    expect(item?.label).toBe("Mark as held");
    expect(item?.disabled).toBe(false);
  });

  it("is NOT offered at all on an archived meeting (read-only)", () => {
    expect(
      meetingHeldActionItem(
        { heldAt: null, archived: true, pending: false },
        FORMAT,
      ),
    ).toBeNull();
    // Not even once it has been held — an archived record offers no mutations.
    expect(
      meetingHeldActionItem(
        { heldAt: HELD_AT, archived: true, pending: false },
        FORMAT,
      ),
    ).toBeNull();
  });

  it("stays VISIBLE but disabled once held, stating when — in words", () => {
    const item = meetingHeldActionItem(
      { heldAt: HELD_AT, archived: false, pending: false },
      FORMAT,
    );
    expect(item?.label).toBe("Marked as held");
    expect(item?.disabled).toBe(true);
    expect(item?.description).toContain("Recorded on");
    expect(item?.description).toContain(FORMAT(HELD_AT));
    expect(item?.description).toContain("only recorded as held once");
  });

  it("reports busy while a submission is in flight", () => {
    const item = meetingHeldActionItem(
      { heldAt: null, archived: false, pending: true },
      FORMAT,
    );
    expect(item?.pending).toBe(true);
  });

  it("degrades calmly if the recorded instant cannot be formatted", () => {
    const item = meetingHeldActionItem(
      { heldAt: "not-a-date", archived: false, pending: false },
      () => {
        throw new Error("bad date");
      },
    );
    expect(item?.label).toBe("Marked as held");
    expect(item?.disabled).toBe(true);
    expect(item?.description).toContain("Already recorded");
  });
});

describe("what the action says afterwards", () => {
  it("reports a real recording, and how many timelines it reached", () => {
    expect(
      meetingHeldSuccessMessage({ outcome: "recorded", attendeeCount: 3 }),
    ).toEqual({
      title: "Meeting marked as held.",
      message: "Added to the timeline of 3 attendees.",
    });
    expect(
      meetingHeldSuccessMessage({ outcome: "recorded", attendeeCount: 1 })
        .message,
    ).toBe("Added to the timeline of 1 attendee.");
  });

  it("is honest when there were no attendees to reach", () => {
    expect(
      meetingHeldSuccessMessage({ outcome: "recorded", attendeeCount: 0 })
        .message,
    ).toMatch(/No attendees are linked yet/);
  });

  it("does NOT claim a fresh success for a repeat submission", () => {
    const result = meetingHeldSuccessMessage({
      outcome: "already_held",
      attendeeCount: 2,
    });
    expect(result.title).toBe("This meeting was already marked as held.");
    expect(result.message).toBeUndefined();
  });
});

/** A minimal host mirroring how the Meeting record composes the action. */
function Host({
  onMarkHeld,
  initialHeldAt = null,
}: {
  onMarkHeld: () => Promise<boolean>;
  initialHeldAt?: string | null;
}) {
  const [heldAt, setHeldAt] = useState<string | null>(initialHeldAt);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const run = useCallback(async () => {
    setPending(true);
    try {
      const ok = await onMarkHeld();
      if (ok) {
        setHeldAt(HELD_AT);
        setStatus(
          meetingHeldSuccessMessage({ outcome: "recorded", attendeeCount: 1 })
            .title,
        );
      } else {
        setStatus(MEETING_HELD_ERROR_MESSAGE);
      }
    } finally {
      setPending(false);
    }
  }, [onMarkHeld]);

  const item = meetingHeldActionItem(
    { heldAt, archived: false, pending },
    FORMAT,
  );
  const items: OverflowMenuItem[] = item
    ? [
        {
          ...item,
          icon: <CheckIcon />,
          ...(item.disabled ? {} : { onSelect: () => void run() }),
        },
      ]
    : [];

  return (
    <>
      <OverflowMenu items={items} label="More actions for Weekly sync" />
      <p role="status">{status}</p>
    </>
  );
}

function openMenu() {
  fireEvent.click(
    screen.getByRole("button", { name: "More actions for Weekly sync" }),
  );
}

describe("the action inside the shared overflow menu", () => {
  it("runs, then shows the completed state on the same item", async () => {
    const onMarkHeld = vi.fn().mockResolvedValue(true);
    render(<Host onMarkHeld={onMarkHeld} />);

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Mark as held/ }));

    await waitFor(() => expect(onMarkHeld).toHaveBeenCalledTimes(1));
    await screen.findByText("Meeting marked as held.");

    // Repeated completion is VISIBLY idempotent: the item is still there, now
    // disabled and saying when it happened.
    openMenu();
    const done = await screen.findByRole("menuitem", {
      name: /Marked as held/,
    });
    // The shared menu marks a blocked item `aria-disabled` rather than removing
    // it from the tab order, so a keyboard user can still reach it and hear why.
    expect(done).toHaveAttribute("aria-disabled", "true");
    expect(done).toHaveAccessibleDescription(/Recorded on/);
    fireEvent.click(done);
    expect(onMarkHeld).toHaveBeenCalledTimes(1);
  });

  it("is operable from the keyboard alone", async () => {
    const onMarkHeld = vi.fn().mockResolvedValue(true);
    render(<Host onMarkHeld={onMarkHeld} />);

    const trigger = screen.getByRole("button", {
      name: "More actions for Weekly sync",
    });
    trigger.focus();
    fireEvent.keyDown(trigger, { key: "ArrowDown" });
    const item = await screen.findByRole("menuitem", {
      name: /Mark as held/,
    });
    expect(item).toHaveFocus();
    fireEvent.click(item);

    await waitFor(() => expect(onMarkHeld).toHaveBeenCalledTimes(1));
    // Focus returns to the trigger, never dropped to <body>.
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("reports failure calmly and leaves the action available to retry", async () => {
    const onMarkHeld = vi.fn().mockResolvedValue(false);
    render(<Host onMarkHeld={onMarkHeld} />);

    openMenu();
    fireEvent.click(screen.getByRole("menuitem", { name: /Mark as held/ }));

    await screen.findByText(MEETING_HELD_ERROR_MESSAGE);
    openMenu();
    const retry = await screen.findByRole("menuitem", {
      name: /Mark as held/,
    });
    expect(retry).not.toHaveAttribute("aria-disabled", "true");
  });

  it("renders nothing when the meeting is archived", () => {
    render(
      <>
        <OverflowMenu
          items={
            meetingHeldActionItem(
              { heldAt: null, archived: true, pending: false },
              FORMAT,
            )
              ? [{ id: MEETING_HELD_ACTION_ID, label: "unreachable" }]
              : []
          }
          label="More actions for Weekly sync"
        />
      </>,
    );
    expect(
      screen.queryByRole("button", { name: /More actions/ }),
    ).not.toBeInTheDocument();
  });
});
