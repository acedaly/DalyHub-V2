import type { CommandContribution } from "~/kernel/modules";

export const settingsCommands: readonly CommandContribution[] = [
  {
    id: "settings.open",
    title: "Open Settings",
    subtitle: "App, workspace and account preferences",
    keywords: ["settings", "preferences", "configuration"],
    kind: "navigate",
    target: { kind: "route", to: "/settings" },
  },
  {
    id: "settings.date_time",
    title: "Change date and time settings",
    subtitle: "Timezone, date display and week start",
    keywords: ["timezone", "calendar", "date", "time", "week"],
    kind: "navigate",
    target: { kind: "route", to: "/settings?section=date-time" },
  },
  {
    id: "settings.appearance",
    title: "Change appearance",
    subtitle: "System, Light and Dark",
    keywords: ["theme", "appearance", "light", "dark", "system"],
    kind: "navigate",
    target: { kind: "route", to: "/settings?section=appearance" },
  },
];
