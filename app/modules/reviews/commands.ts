import type { CommandContribution } from "~/kernel/modules";

export const reviewsCommands: readonly CommandContribution[] = [
  {
    id: "reviews.open",
    title: "Open Reviews",
    subtitle: "Weekly, monthly, quarterly and annual reflection records",
    keywords: ["reviews", "review", "weekly", "monthly", "reflect"],
    kind: "navigate",
    target: { kind: "route", to: "/reviews" },
  },
  {
    id: "reviews.new",
    title: "New Review",
    subtitle: "Start a guided reflection record",
    keywords: ["review", "new", "create", "weekly", "monthly", "quarterly"],
    kind: "navigate",
    target: { kind: "route", to: "/reviews/new" },
  },
];
