/**
 * TODAY-03 / TASKS-02 — the Waiting collection card presentation.
 *
 * Regression coverage for the PR #63 review gap: a prioritised task must keep its
 * shared P1–P4 signal in the Waiting collection (it previously rendered only the
 * waiting-subject and elapsed metadata), while an untriaged task must not gain a
 * false priority, and the existing waiting metadata must remain visible.
 */

import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Card } from "~/shared/card";
import { toWaitingCardProps } from "~/modules/today/task/WaitingTaskCard";
import type { WaitingCardData } from "~/modules/today/task/waiting-view";

const openProps = (key: string) => ({
  href: `?drawer=${key}`,
  onOpen: () => {},
});

function waitingCard(over: Partial<WaitingCardData> = {}): WaitingCardData {
  return {
    id: "t1",
    title: "Await supplier sign-off",
    priority: null,
    parent: { kind: "project", id: "p1", title: "Launch" },
    subjectLabel: "Supplier",
    subjectType: null,
    sinceLabel: "18 Jul 2026",
    elapsedLabel: "3 days",
    dateLabel: null,
    ...over,
  };
}

function renderWaitingCard(card: WaitingCardData) {
  return render(<Card {...toWaitingCardProps(card, openProps)} />);
}

describe("Waiting collection card — shared priority signal (TASKS-02)", () => {
  it("shows the P1–P4 PriorityIndicator for a prioritised waiting task", () => {
    const { container } = renderWaitingCard(waitingCard({ priority: "p2" }));
    const indicator = container.querySelector<HTMLElement>(".dh-priority");
    expect(indicator).not.toBeNull();
    expect(indicator).toHaveAttribute("data-priority", "p2");
    // Meaning carried by text, never colour alone: the tag + the action word.
    expect(indicator).toHaveTextContent("P2");
    expect(indicator).toHaveTextContent(/priority — Defer/);
  });

  it("shows no priority chip for an untriaged waiting task (no false priority)", () => {
    const { container } = renderWaitingCard(waitingCard({ priority: null }));
    expect(container.querySelector(".dh-priority")).toBeNull();
  });

  it("preserves the waiting-subject and elapsed metadata in both cases", () => {
    for (const priority of [null, "p1"] as const) {
      const { unmount } = renderWaitingCard(
        waitingCard({
          priority,
          subjectLabel: "Supplier",
          sinceLabel: "18 Jul 2026",
          elapsedLabel: "3 days",
        }),
      );
      // "Waiting for" subject and the "Since … · elapsed" metadata remain visible.
      expect(screen.getByText("Waiting for:")).toBeInTheDocument();
      expect(screen.getByText("Supplier")).toBeInTheDocument();
      expect(screen.getByText("Since:")).toBeInTheDocument();
      expect(screen.getByText("18 Jul 2026 · 3 days")).toBeInTheDocument();
      unmount();
    }
  });

  it("keeps the Waiting display-state pill and opens the shared Task Drawer", () => {
    renderWaitingCard(waitingCard({ priority: "p1" }));
    const article = screen.getByRole("article");
    expect(within(article).getByText("Waiting")).toBeInTheDocument();
    // The title is the primary open target and points at the canonical task drawer.
    const open = within(article).getByRole("link", {
      name: /Await supplier sign-off/,
    });
    expect(open).toHaveAttribute("href", "?drawer=task:t1");
  });
});
