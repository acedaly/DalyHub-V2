/**
 * DIARY-01B — the Day / Timeline mode switch.
 *
 * Two REAL modes only. Day shows one selected local calendar day; Timeline shows
 * the multi-day paginated history. Week and Month are deliberately absent — a tab
 * that does nothing is a dead control, so they appear only when they are genuinely
 * implemented (the mock-up shows them as longer-term visual direction, not licence
 * to ship placeholders).
 *
 * UIQ-013 — the presentation is the ONE shared `ViewSwitcher` (Diary's own
 * `.dh-diary-modes` pills are retired); this component keeps only the thing that
 * is genuinely Diary's, which is what switching mode does to the URL. Switching
 * is a SCOPE change, so it drops the pagination `cursor` (a cursor is bound to
 * its range/filter scope and must not survive); leaving Day drops the
 * now-irrelevant `date`. The entry-type filter and an open details panel are
 * preserved.
 */

import { useSearchParams } from "react-router";

import { ViewSwitcher } from "~/shared/view-switcher";

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
    <ViewSwitcher
      options={MODES.map((item) => ({
        value: item.value,
        label: item.label,
        href: hrefFor(item.value),
      }))}
      value={mode}
      label="Diary views"
      // Day/Timeline is a same-route scope switch, so it keeps the `replace`
      // history semantics it had: Back leaves the Diary rather than walking
      // every mode the owner glanced at.
      replace
    />
  );
}
