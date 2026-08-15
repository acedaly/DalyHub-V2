/**
 * DS-08 — the ONE label a collection's create action wears.
 *
 * Every collection has the same primary action in the same slot ("New <thing>"),
 * and before this every collection wrote it out itself. The whole-app baseline
 * found four conventions across eight screens:
 *
 *     Tasks     "+ New task"      ← a plus glyph, sentence case
 *     Projects  "New Project"     ← no glyph, Title Case
 *     Areas     "New Area"        ← no glyph, Title Case
 *     Meetings  "New meeting"     ← no glyph, sentence case
 *
 * None of that was a decision; it was eight independent implementations of one
 * control. Both concept references draw the same button on every screen, with a
 * leading `+`.
 *
 * ── The rules ───────────────────────────────────────────────────────────────
 *
 * **A leading plus.** It is the one glyph that means "make a new one", it is
 * what makes the control findable without reading, and it is decorative — the
 * words beside it are the accessible name, so nothing is carried by the icon.
 *
 * **Sentence case.** DalyHub capitalises its NOUNS in running copy ("6 Goals"),
 * because they are the product's own vocabulary — but a button label is an
 * instruction rather than a sentence about records, and "New Project" reads as a
 * proper noun for a thing that does not exist yet. Tasks and Meetings already
 * had it right.
 *
 * This is a LABEL, not a button: the call sites are variously a `DrawerTrigger`,
 * a router `Link` and a plain `button`, each with its own behaviour, and
 * wrapping those in one component would mean a component that knows about
 * drawers, routing and click handlers at once. It composes into whichever of
 * them the module already uses, and carries only the glyph and the words.
 */
import type { ReactNode } from "react";

import { PlusIcon } from "~/shared/icons";

export type CreateActionLabelProps = {
  /** The words — "New project", "New goal". Sentence case. */
  readonly children: ReactNode;
};

export function CreateActionLabel({ children }: CreateActionLabelProps) {
  return (
    <>
      <span className="dh-btn__icon" aria-hidden="true">
        <PlusIcon />
      </span>
      {children}
    </>
  );
}
