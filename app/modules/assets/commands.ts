/**
 * ASSET-01 / DS-09 — the Assets module's registry-discovered command
 * contributions. Honest NAVIGATION commands that open the Assets surfaces, the
 * create-asset page and the date-driven views. They reuse the validated DS-08
 * `SearchResultTarget` contract — no bespoke navigation type, no `run` handler, no
 * server execution boundary — and do not duplicate commands owned by other modules.
 */

import type { CommandContribution } from "~/kernel/modules";

export const assetsCommands: readonly CommandContribution[] = [
  {
    id: "assets.open",
    title: "Open Assets",
    subtitle: "Things of value in your life",
    keywords: ["assets", "asset", "belongings", "possessions", "warranties"],
    kind: "navigate",
    target: { kind: "route", to: "/assets" },
  },
  {
    id: "assets.new",
    title: "New Asset",
    subtitle: "Add something of value",
    keywords: [
      "asset",
      "new",
      "add",
      "create",
      "vehicle",
      "warranty",
      "licence",
    ],
    kind: "navigate",
    target: { kind: "route", to: "/new/asset" },
  },
  {
    id: "assets.expiring",
    title: "View Expiring Assets",
    subtitle: "Warranties and renewals coming due",
    keywords: ["expiring", "warranty", "renewal", "assets", "due", "expiry"],
    kind: "navigate",
    target: { kind: "route", to: "/assets/expiring" },
  },
  {
    id: "assets.service_due",
    title: "View Service Due Assets",
    subtitle: "Assets due for service or maintenance",
    keywords: ["service", "maintenance", "due", "assets", "overdue"],
    kind: "navigate",
    target: { kind: "route", to: "/assets/service-due" },
  },
  {
    id: "assets.archived",
    title: "Archived Assets",
    subtitle: "Assets you have archived",
    keywords: ["archived", "assets", "hidden"],
    kind: "navigate",
    target: { kind: "route", to: "/assets/archived" },
  },
];
