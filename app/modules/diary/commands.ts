/**
 * DIARY-01 / DS-09 — the Diary module's registry-discovered command
 * contributions. Honest NAVIGATION commands over routes the Diary already
 * serves: the Timeline, the explicit day view anchored on today (an absent
 * `date` in day mode resolves to today in the owner's timezone), and quick
 * capture through the shared Inspector deep link (`?inspector=new`) — the same
 * URL contract `DiaryWorkspace` already honours. They reuse the validated DS-08
 * `SearchResultTarget` contract — no bespoke navigation type, no `run` handler —
 * and do not duplicate commands owned by other modules.
 */

import type { CommandContribution } from "~/kernel/modules";

export const diaryCommands: readonly CommandContribution[] = [
  {
    id: "diary.open",
    title: "Open Diary",
    subtitle: "The chronological history of your life",
    keywords: ["diary", "journal", "timeline", "history"],
    kind: "navigate",
    target: { kind: "route", to: "/diary" },
  },
  {
    id: "diary.today",
    title: "Open Diary for today",
    subtitle: "Today's diary entries in the day view",
    keywords: ["diary", "today", "day", "journal"],
    kind: "navigate",
    target: { kind: "route", to: "/diary?mode=day" },
  },
  {
    id: "diary.capture",
    title: "Capture Diary entry",
    subtitle: "Capture a moment — a meeting, a decision, an idea",
    keywords: ["diary", "capture", "new", "entry", "journal", "note"],
    kind: "navigate",
    target: { kind: "route", to: "/diary?inspector=new" },
  },
];
