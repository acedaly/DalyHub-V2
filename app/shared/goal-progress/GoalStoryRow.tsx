/**
 * STEER-03 — the ONE row a Goal's story is told in.
 *
 * `/goals`'s master–detail list and the Area record's Goals tab now render
 * literally the same component from literally the same facts, which is the
 * strongest available form of ADR-111 decision 6: there is no second
 * composition to drift, and no Area-only measure to reappear.
 *
 * ── What it replaced on the Area record (DEBT-206) ─────────────────────────
 * The Area's Goal cards drew `taskCompleted / taskTotal` — a Task roll-up — as
 * the Goal's progress bar, captioned "Task roll-up", with no measurement, no
 * movement and no alignment. So the same Goal read *"53% · Ahead"* on Today and
 * an unrelated percentage on its own Area. The roll-up is not deleted: it is a
 * real structural fact and it survives as one of the caller's `notes`, worded as
 * what it is and placed where a context line goes — never as the Goal's progress
 * answer.
 *
 * ── What it draws, and what it deliberately leaves to the caller ───────────
 * The bar and the trailing value are GOAL-02's measurement, from
 * `goalProgressMeter` — so an UNMEASURED Goal gets no bar and no figure rather
 * than a fabricated 0%. Movement is FOLLOW-02's shared line. The owner's
 * condition is STEER-02's value, stated as a word where it is set. Alignment is
 * ADR-040's indicator, drawn only where the surface asked for it:
 *
 *   - on `/goals` it is NOT drawn in the row, because REDESIGN-04 §6.2 decided
 *     it belongs to the pane beside it — the row carries it in its accessible
 *     name instead, which this component does unconditionally;
 *   - on the Area record there is no pane, so the indicator is drawn.
 *
 * That is a per-surface DENSITY decision about where one value appears, not a
 * second interpretation of it: both surfaces read the same `alignment.state`,
 * and the parity attributes below prove it.
 *
 * ── The parity attributes ──────────────────────────────────────────────────
 * Every row stamps `goalStoryDataAttributes` — the story's machine facts — so a
 * cross-surface test compares VALUES rather than sentences. `dh-goal-fact` is
 * `display: contents`, so the wrapper is a DOM hook and not a box: it adds no
 * level to the row's own sizing chain.
 */

import type { ReactNode } from "react";

import { ProgressRow } from "~/shared/card";
import { AccentIcon } from "~/shared/entity";
import {
  resolveIdentity,
  type IdentitySource,
} from "~/shared/entity/identity-resolution";
import {
  AlignmentIndicator,
  GoalMovementLine,
  alignmentAccessibleSummary,
  goalMovementStatement,
} from "~/shared/alignment";

import { GoalConditionTag } from "./GoalConditionTag";
import {
  goalProgressMeter,
  goalProgressStatusLabel,
  goalRowValue,
} from "./goal-progress-view";
import { goalStoryDataAttributes, type GoalStory } from "./goal-story";

export interface GoalStoryRowProps {
  readonly story: GoalStory;
  /** The resolved identity source, from the ONE rule (`goalIdentitySource`). */
  readonly identity: IdentitySource;
  readonly href: string;
  readonly headingLevel?: 2 | 3 | 4;
  /**
   * What precedes the derived status on the context line — the Area's name on
   * `/goals`, and nothing on an Area record, where the Area is the page.
   */
  readonly contextLead?: string | null;
  /**
   * Extra CONTEXT facts, after the derived status — the Goal's structure
   * ("3 of 8 Projects complete") and its target date, worded as what they are.
   *
   * Never a progress claim and never a percentage: the bar and the trailing
   * value are the Goal's measurement, and nothing else may take their place.
   */
  readonly notes?: readonly (string | null | undefined)[];
  /** Draw ADR-040's indicator in the row (a surface with no pane beside it). */
  readonly showAlignment?: boolean;
  /** Master–detail selection, for the workspace list. */
  readonly selected?: boolean;
  /** A trailing slot for anything the surface adds beneath the signals. */
  readonly children?: ReactNode;
  readonly "data-testid"?: string;
}

export function GoalStoryRow({
  story,
  identity,
  href,
  headingLevel = 3,
  contextLead = null,
  notes = [],
  showAlignment = false,
  selected = false,
  children,
  "data-testid": testId,
}: GoalStoryRowProps) {
  const meter = goalProgressMeter(story.progress);
  const context = [
    contextLead,
    goalProgressStatusLabel(story.progress.status),
    ...notes,
  ]
    .filter((part): part is string => Boolean(part))
    .join(" · ");

  const signals: ReactNode[] = [];
  if (story.movement) {
    signals.push(<GoalMovementLine key="movement" movement={story.movement} />);
  }
  if (showAlignment && story.alignment) {
    signals.push(
      <AlignmentIndicator key="alignment" alignment={story.alignment} />,
    );
  }
  if (story.condition !== null) {
    signals.push(
      <GoalConditionTag key="condition" condition={story.condition} />,
    );
  }
  if (children) signals.push(<span key="extra">{children}</span>);

  return (
    <span className="dh-goal-fact" {...goalStoryDataAttributes(story)}>
      <ProgressRow
        data-testid={testId}
        icon={<AccentIcon entityType="goal" {...identity} size="sm" />}
        title={story.title}
        headingLevel={headingLevel}
        context={context.length > 0 ? context : null}
        signal={
          signals.length > 0 ? (
            <span className="dh-goal-row__signals">{signals}</span>
          ) : null
        }
        /*
         * The RESOLVED slot, from the one ladder — not the raw own-or-inherited
         * value. `ProgressRow` runs its own `resolveIdentity` over what it is
         * given, so handing it the unresolved pair would make the row's tint a
         * second resolution that happens to agree rather than the same one.
         * The Area's rank travels as the accent for the same reason: it is the
         * derived rung `goalIdentitySource` puts under a Goal.
         */
        accent={identity.inherited?.colourRank ?? identity.colourRank ?? null}
        colourSlot={resolveIdentity(identity).slot}
        selected={selected}
        progress={meter ?? undefined}
        value={goalRowValue(story.progress)}
        href={href}
        /*
         * The accessible name carries the derived answers the DRAWING keeps
         * quiet — ADR-040's alignment state and FOLLOW-02's movement — which are
         * different questions and are allowed to disagree, so the name states
         * each rather than reconciling them.
         */
        openAriaLabel={goalStoryRowAccessibleName(story)}
      />
    </span>
  );
}

/**
 * The row's accessible name: the VERB, the identity, then every derived answer
 * the row holds.
 *
 * The verb is not decoration. Every other open-link in the product is named
 * `Open <title>` — `ProjectsCollection`, `AssetsCollection`, `ProjectTasksTab`,
 * `GoalSummarySection`, `NotesList` — and a link's accessible name should say
 * where it GOES, which is the one thing "Reach 70 kg — On track" does not.
 *
 * `/goals` shipped without it in STEER-01 and nothing caught that, because the
 * only surface asserting the convention was the Area record — which used to
 * draw its own card. Giving both surfaces ONE row made the two conventions
 * collide, and this is the side that was right: the Area's `Open …` keeps the
 * verb, `/goals` gains it, and the derived facts stay in the name either way.
 */
export function goalStoryRowAccessibleName(story: GoalStory): string {
  const parts = [`Open ${story.title}`];
  if (story.alignment) parts.push(alignmentAccessibleSummary(story.alignment));
  if (story.movement)
    parts.push(goalMovementStatement(story.movement).headline);
  return parts.join(" — ");
}
