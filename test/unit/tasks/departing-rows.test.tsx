/**
 * DHDS-11 — a completed row LEAVES, and focus goes somewhere named.
 *
 * The behavioural half of DEBT-177. Two decisions are under test, and they are
 * the two DHDS-08 refused to guess at:
 *
 *   1. WHICH rows depart — only ones the surface's own act removed. A filter
 *      change, a page, a navigation removes rows too and must not borrow the
 *      motion;
 *   2. WHERE FOCUS GOES — the row that takes this one's place, then the one
 *      before it, then the list. Never `<body>`.
 */

import { act, render, screen } from "@testing-library/react";
import { useRef, useState } from "react";
import { describe, expect, it } from "vitest";

import { useDepartingRows } from "~/shared/task-record/use-departing-rows";

interface Row {
  readonly id: string;
  readonly title: string;
}

const ROWS: readonly Row[] = [
  { id: "a", title: "Alpha" },
  { id: "b", title: "Bravo" },
  { id: "c", title: "Charlie" },
];

/**
 * A list shaped exactly like the real one: an `<li>` per row, each carrying the
 * completion control the focus handoff looks for, and `data-dh-exit` on the way
 * out.
 */
function Fixture({
  rows,
  watch,
}: {
  readonly rows: readonly Row[];
  readonly watch: ReadonlySet<string>;
}) {
  const list = useRef<HTMLUListElement | null>(null);
  const { rendered, isLeaving } = useDepartingRows(rows, watch, list);
  return (
    <ul ref={list} tabIndex={-1} aria-label="Tasks">
      {rendered.map((row) => (
        <li
          key={row.id}
          data-dh-exit={isLeaving(row.id) ? "true" : undefined}
          aria-hidden={isLeaving(row.id) ? "true" : undefined}
        >
          <input
            type="checkbox"
            data-testid="task-complete"
            aria-label={`Complete ${row.title}`}
          />
          <span>{row.title}</span>
        </li>
      ))}
    </ul>
  );
}

function Harness({ initial = ROWS }: { readonly initial?: readonly Row[] }) {
  const [rows, setRows] = useState<readonly Row[]>(initial);
  const [watch, setWatch] = useState<ReadonlySet<string>>(new Set());
  return (
    <>
      <button
        type="button"
        onClick={() => {
          setWatch(new Set(["b"]));
          setRows((current) => current.filter((row) => row.id !== "b"));
        }}
      >
        complete Bravo
      </button>
      <button
        type="button"
        onClick={() =>
          // A filter change: rows go, but nothing was mutated.
          setRows((current) => current.filter((row) => row.id !== "c"))
        }
      >
        filter out Charlie
      </button>
      <Fixture rows={rows} watch={watch} />
    </>
  );
}

/*
 * Read the DOM, not the accessibility tree: a departing row is `aria-hidden`, so
 * `getAllByRole("listitem")` would not see it — which is the property under test
 * two assertions down, not a reason to be unable to look at it.
 */
const titles = () =>
  [...document.querySelectorAll("li")].map(
    (item) => item.textContent?.trim() ?? "",
  );

const press = (name: string) =>
  act(() => {
    screen.getByRole("button", { name }).click();
  });

describe("a row the owner's own act removed", () => {
  it("stays on screen, marked as leaving, instead of vanishing", () => {
    render(<Harness />);
    press("complete Bravo");
    expect(titles()).toContain("Bravo");
    const leaving = document.querySelectorAll('[data-dh-exit="true"]');
    expect(leaving).toHaveLength(1);
    expect(leaving[0]).toHaveTextContent("Bravo");
  });

  it("is hidden from assistive technology the moment it is reported gone", () => {
    render(<Harness />);
    press("complete Bravo");
    expect(document.querySelector('[data-dh-exit="true"]')).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });

  it("is finally removed once the exit has had time to run", async () => {
    render(<Harness />);
    press("complete Bravo");
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(titles()).not.toContain("Bravo");
  });
});

describe("a row removed by anything else", () => {
  it("simply goes — a changed filter is a different collection, not a departure", () => {
    render(<Harness />);
    press("filter out Charlie");
    expect(titles()).not.toContain("Charlie");
    expect(document.querySelectorAll('[data-dh-exit="true"]')).toHaveLength(0);
  });
});

describe("focus", () => {
  it("moves to the row that takes the departing one's place", () => {
    render(<Harness />);
    screen.getByLabelText("Complete Bravo").focus();
    press("complete Bravo");
    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      "Complete Charlie",
    );
  });

  it("falls back to the row BEFORE it when there is nothing after", () => {
    render(<Harness initial={[ROWS[0]!, ROWS[1]!]} />);
    screen.getByLabelText("Complete Bravo").focus();
    press("complete Bravo");
    expect(document.activeElement).toHaveAttribute(
      "aria-label",
      "Complete Alpha",
    );
  });

  it("falls back to the LIST when the list is now empty — never <body>", () => {
    render(<Harness initial={[ROWS[1]!]} />);
    screen.getByLabelText("Complete Bravo").focus();
    press("complete Bravo");
    expect(document.activeElement).toBe(
      screen.getByRole("list", { name: "Tasks" }),
    );
    expect(document.activeElement).not.toBe(document.body);
  });

  it("leaves focus alone when it was never inside the departing row", () => {
    render(<Harness />);
    const elsewhere = screen.getByRole("button", { name: "complete Bravo" });
    elsewhere.focus();
    press("complete Bravo");
    expect(document.activeElement).toBe(elsewhere);
  });
});

describe("a row that comes back", () => {
  it("cancels its own exit rather than being drawn twice", async () => {
    function Reopenable() {
      const [rows, setRows] = useState<readonly Row[]>(ROWS);
      const [watch, setWatch] = useState<ReadonlySet<string>>(new Set());
      return (
        <>
          <button
            type="button"
            onClick={() => {
              setWatch(new Set(["b"]));
              setRows((current) => current.filter((row) => row.id !== "b"));
            }}
          >
            complete
          </button>
          <button type="button" onClick={() => setRows(ROWS)}>
            reopen
          </button>
          <Fixture rows={rows} watch={watch} />
        </>
      );
    }
    render(<Reopenable />);
    press("complete");
    press("reopen");
    expect(titles().filter((title) => title === "Bravo")).toHaveLength(1);
    expect(document.querySelectorAll('[data-dh-exit="true"]')).toHaveLength(0);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    // The stale timer must not take the row that came back.
    expect(titles()).toContain("Bravo");
  });
});
