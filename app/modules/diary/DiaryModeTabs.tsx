/**
 * DIARY-01B — the Day / Timeline mode switch.
 *
 * Two REAL modes only. Day shows one selected local calendar day; Timeline shows
 * the multi-day paginated history. Week and Month are deliberately absent — a tab
 * that does nothing is a dead control, so they appear only when they are genuinely
 * implemented (the mock-up shows them as longer-term visual direction, not licence
 * to ship placeholders).
 *
 * A group of client-navigation links (deep-linkable, Back/Forward correct) marking
 * the active mode with `aria-current`. Switching mode is a SCOPE change, so it drops
 * the pagination `cursor` (a cursor is bound to its range/filter scope and must not
 * survive); leaving Day drops the now-irrelevant `date`. The entry-type filter and
 * an open details panel are preserved.
 */

import { Link, useSearchParams } from "react-router";

import type { DiaryMode } from "./routes/index";

export interface DiaryModeTabsProps {
  readonly mode: DiaryMode;
}

const MODES: readonly { readonly value: DiaryMode; readonly label: string }[] =
  [
    { value: "day", label: "Day" },
    { value: "timeline", label: "Timeline" },
  ];

export function DiaryModeTabs({ mode }: DiaryModeTabsProps) {
  const [searchParams] = useSearchParams();

  const hrefFor = (target: DiaryMode): string => {
    const next = new URLSearchParams(searchParams);
    // Switching mode changes the query scope: the cursor is scope-bound and must
    // be dropped so a stale page never bleeds into the new mode.
    next.delete("cursor");
    if (target === "timeline") {
      next.set("mode", "timeline");
      next.delete("date");
    } else {
      // Day is the default mode — expressed by the ABSENCE of `mode`.
      next.delete("mode");
    }
    const query = next.toString();
    return query.length > 0 ? `?${query}` : "?";
  };

  return (
    <div className="dh-diary-modes" role="group" aria-label="Diary view">
      {MODES.map((item) => (
        <Link
          key={item.value}
          to={hrefFor(item.value)}
          replace
          preventScrollReset
          className="dh-diary-modes__tab"
          aria-current={mode === item.value ? "true" : undefined}
        >
          {item.label}
        </Link>
      ))}
    </div>
  );
}
