/**
 * M3-INT — how ABSENCE is rendered, product-wide.
 *
 * DS-14 §8 established the right rule — absence is a DESIGNED rendering in the
 * owner's words, never an empty slot, a zeroed count or a hyphen — and then
 * gave it the wrong shape. It reached for the neutral `StatusPill`, so "No
 * tags" and "No Projects contributing yet" arrived as 32px outlined chips
 * sitting beside real lifecycle chips like "Active" and "On hold". A chip is a
 * loud container, and M3 spends it on things that are meaningful and usually
 * interactive: a status, a priority, a selected filter, a compact state worth
 * noticing. Nothing being there yet is the quietest fact a record has, and
 * giving it the same weight as a status made every sparse record look busier
 * than a full one.
 *
 * So absence keeps the DS-14 rule and loses the container: the same truthful,
 * caller-owned phrase, rendered as restrained supporting text. The caller still
 * owns the wording, because the surface knows what is missing and the design
 * system only knows how missing should look.
 *
 * This is NOT for a genuine status. Planned, Waiting, Completed, On hold and
 * Overdue are states of a record, not the absence of one, and they stay chips.
 */

import type { ReactNode } from "react";

export interface AbsenceTextProps {
  /** The truthful phrase, in the owner's words ("No tags", "No tasks yet"). */
  readonly children: ReactNode;
  readonly className?: string;
}

export function AbsenceText({ children, className }: AbsenceTextProps) {
  return (
    <span className={className ? `dh-absence ${className}` : "dh-absence"}>
      {children}
    </span>
  );
}
