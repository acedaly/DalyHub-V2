/**
 * UX-01 — the shared keyboard-shortcut reference body.
 *
 * One renderer for the one catalogue (`shortcut-reference.ts`), used by BOTH hosts
 * (the app-wide sheet and Today's DS-03 Drawer) so the two can never drift.
 *
 * Presentation rules, unchanged from the TODAY-05 original this generalises: the
 * keys are real `<kbd>` elements beside a text description, so no meaning is
 * carried by an unlabelled glyph or by colour, and the whole thing is a plain
 * definition list a screen reader can walk.
 */

import {
  SHORTCUT_REFERENCE_GROUPS,
  SHORTCUT_REFERENCE_INTRO,
  type ShortcutReferenceGroup,
} from "./shortcut-reference";

export type KeyboardShortcutsReferenceProps = {
  /**
   * The groups to show. Defaults to the complete catalogue — a host that knows the
   * owner is not on a given surface may pass a narrower set rather than claiming a
   * shortcut works where it does not.
   */
  readonly groups?: readonly ShortcutReferenceGroup[];
};

/** A DOM-safe id fragment for a group title. */
function groupId(title: string): string {
  return `kbd-${title.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
}

export function KeyboardShortcutsReference({
  groups = SHORTCUT_REFERENCE_GROUPS,
}: KeyboardShortcutsReferenceProps) {
  return (
    <div className="dh-keyboard-help">
      <p className="dh-keyboard-help__intro">{SHORTCUT_REFERENCE_INTRO}</p>
      {groups.map((group) => (
        <section
          key={group.title}
          className="dh-keyboard-help__group"
          aria-labelledby={groupId(group.title)}
        >
          <h3
            id={groupId(group.title)}
            className="dh-keyboard-help__group-title"
          >
            {group.title}
          </h3>
          <dl className="dh-keyboard-help__list">
            {group.rows.map((row) => (
              <div key={row.description} className="dh-keyboard-help__row">
                <dt className="dh-keyboard-help__keys">
                  {row.keys.map((key, index) => (
                    <span key={key} className="dh-keyboard-help__key-wrap">
                      {index > 0 ? (
                        <span
                          className="dh-keyboard-help__plus"
                          aria-hidden="true"
                        >
                          {" + "}
                        </span>
                      ) : null}
                      <kbd className="dh-keyboard-help__key">{key}</kbd>
                    </span>
                  ))}
                </dt>
                <dd className="dh-keyboard-help__desc">{row.description}</dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}
