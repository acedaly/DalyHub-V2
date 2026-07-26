/**
 * TODAY-03 / TASKS-02 — the Waiting collection card presentation.
 *
 * The pure presentational mapping from a `WaitingCardData` to the shared DS-04
 * `CardProps` for the `/today/waiting` collection. Kept in its own module (no
 * server-only imports) so it renders identically wherever it is used AND can be
 * unit-tested directly — the route file itself imports `cloudflare:workers` and so
 * cannot be imported into a jsdom test.
 *
 * A waiting task is still a task, so it carries the SAME shared signals as every
 * other task card: the coloured `PriorityIndicator` (TASKS-02), so a P1–P4 task
 * keeps its priority when the user moves from the main Today view into the Waiting
 * collection. The waiting-subject and elapsed metadata are preserved; the urgency
 * word is carried by the card's `dateLabel` (which delegates to `taskUrgency`), so
 * no separate urgency chip is duplicated here.
 */

import type { CardMetaItem, CardProps } from "~/shared/card";
import { EntityIcon, isEntityType } from "~/shared/entity";
import { PriorityIndicator } from "~/shared/task-record/PriorityIndicator";

import type { WaitingCardData } from "./waiting-view";

/** Build the DS-04 Card props for one waiting task (opens the shared Task Drawer). */
export function toWaitingCardProps(
  card: WaitingCardData,
  openProps: (key: string) => { href: string; onOpen: () => void },
): CardProps {
  const metadata: CardMetaItem[] = [];

  // The shared PriorityIndicator (TASKS-02) renders on every task card — the Waiting
  // collection included — so a prioritised task keeps its P1–P4 signal here (Codex
  // review, DEBT-28). Untriaged tasks render no priority chip (no false priority).
  if (card.priority) {
    metadata.push({
      id: "priority",
      value: <PriorityIndicator priority={card.priority} />,
    });
  }

  metadata.push({
    id: "waiting-for",
    label: "Waiting for",
    value: (
      <span className="dh-waiting-card__subject">
        {card.subjectType && isEntityType(card.subjectType) ? (
          <EntityIcon type={card.subjectType} />
        ) : null}
        <span>{card.subjectLabel}</span>
      </span>
    ),
  });

  metadata.push({
    id: "since",
    label: "Since",
    value: card.sinceLabel
      ? `${card.sinceLabel} · ${card.elapsedLabel}`
      : card.elapsedLabel,
  });

  return {
    id: card.id,
    title: card.title,
    typeLabel: "Task",
    icon: <EntityIcon type="task" />,
    // The pane title is h1; cards are h2 so the heading order never skips a level.
    headingLevel: 2,
    status: { label: "Waiting", tone: "warning" },
    metadata,
    context: card.parent ? { label: card.parent.title } : undefined,
    dateLabel: card.dateLabel ?? undefined,
    density: "comfortable",
    presentation: "list",
    openAriaLabel: `Open ${card.title}`,
    ...openProps(`task:${card.id}`),
  };
}
