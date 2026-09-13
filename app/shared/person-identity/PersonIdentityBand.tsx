/**
 * UNTITLED-13 — the identity band at the top of a Person's own record.
 *
 * ── The Pro composition this follows ────────────────────────────────────────
 *
 * `informational-01/17` and `informational-02/12`, both Pro, both studied from
 * their screenshots rather than their source (which the connector will not hand
 * over here). They arrange a person the same way and it is not the way a CRM
 * does:
 *
 *     ┌─────────────────────────────────────────────────────────┐
 *     │  ⬤        Amélie Laurent                    [Call] [Email] │
 *     │  photo    I'm a Product Designer based in Melbourne.      │
 *     └─────────────────────────────────────────────────────────┘
 *
 * A large photograph, the name, ONE sentence about who they are, and the two
 * things you would actually do next — then everything else below, in bands. The
 * facts that a contact-management grid would put in a labelled table are a
 * quiet two-column strip further down the page (`PersonFactStrip`), because
 * they are reference rather than the point.
 *
 * DalyHub's own header already carries the name (it is the record's `h1`, and
 * it is editable in place), the role and organisation, and the stay-in-touch
 * state. So this band carries what a shared record header genuinely cannot: the
 * FACE, the preferred name, the relationship word, and the contact actions.
 *
 * ── What is Untitled's ─────────────────────────────────────────────────────
 *
 * The mark is the genuine `base/avatar` `AvatarProfilePhoto` — the ringed,
 * padded disc its own profile templates use, retrieved from Untitled's public
 * component API (see the file's provenance header). The actions are the shared
 * `Button` recipe. The surface roles, the hairline and the type ramp are
 * Untitled's semantic classes.
 */

import type { ReactNode } from "react";

import { AvatarProfilePhoto } from "~/shared/ui/untitled/base/avatar/avatar-profile-photo";
import { areaAccentForRank } from "~/shared/pill";
import { cx } from "~/shared/ui/untitled/utils/cx";

import { initialsFromName } from "./person-initials";

export interface PersonIdentityBandProps {
  readonly name: string;
  readonly initials?: string | null;
  readonly photoUrl?: string | null;
  /** The Person's circle rank, for the generated mark's identity tint. */
  readonly colourRank?: number | null;
  /**
   * What they are called, when it differs from the record's title. The header
   * above already states the title, so repeating it here would be the name
   * twice.
   */
  readonly preferredName?: string | null;
  /** The relationship word — "Family", "Colleague". One value, from a closed set. */
  readonly relationship?: ReactNode;
  /**
   * Call / Email / Message — only the ones the contact data supports.
   *
   * Pass `null` when there are none. This is wrapped in a `role="group"` named
   * "Contact actions", and an element is truthy even when it renders nothing,
   * so a component that returns `null` internally still buys an empty labelled
   * group — a landmark a screen-reader user can reach and find nothing in.
   */
  readonly actions?: ReactNode;
  readonly className?: string;
}

export function PersonIdentityBand({
  name,
  initials,
  photoUrl,
  colourRank = null,
  preferredName,
  relationship,
  actions,
  className,
}: PersonIdentityBandProps) {
  const letters =
    initials && initials.trim().length > 0 ? initials : initialsFromName(name);

  return (
    <div
      className={cx(
        "dh-person-identity flex flex-wrap items-center gap-x-5 gap-y-4",
        className,
      )}
    >
      <AvatarProfilePhoto
        size="sm"
        // Decorative: the record's `h1` a few pixels above is the name.
        alt=""
        src={photoUrl ?? undefined}
        initials={letters}
        className={cx(
          "dh-person-avatar",
          // The circle accent, exactly as the small mark carries it — the same
          // six generated tints, so a Person is recognisably the same object on
          // their record and in the directory. A photograph takes none.
          !photoUrl && colourRank !== null
            ? `dh-person-avatar__accent dh-person-avatar__accent--${areaAccentForRank(colourRank)}`
            : undefined,
        )}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {preferredName ? (
          <p className="m-0 text-lg font-semibold text-primary">
            {preferredName}
          </p>
        ) : null}
        {relationship}
      </div>

      {actions ? (
        <div
          className="flex flex-wrap gap-2"
          role="group"
          aria-label="Contact actions"
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
}
