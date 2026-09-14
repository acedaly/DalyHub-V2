/**
 * The badge tone vocabulary, in one file that imports nothing.
 *
 * It lived in `Badge.tsx` and `UntitledStatusBadge` imported it from there.
 * That was fine while `Badge` painted itself; now that `Badge` RENDERS
 * `UntitledStatusBadge`, leaving the type there would make the two files import
 * each other. The import that closed the loop was type-only and would have been
 * erased, so nothing would have broken at runtime — which is exactly why it is
 * worth removing rather than relying on: a cycle that happens to be harmless is
 * a cycle somebody later makes harmful by adding one value import.
 */

/**
 * The tones. `neutral` is the default and the absence state — a value that is
 * present but unremarkable. The rest are the semantic roles, and they are the
 * ONLY thing they mean: `danger` is a failure state, not "red", and an Area's
 * identity accent is a different ramp entirely (D21).
 */
export type BadgeTone =
  "neutral" | "accent" | "success" | "warning" | "danger" | "info";

/**
 * `soft` (the default) is a tinted container. `outline` is a hairline with no
 * fill, for a run of several badges where the tints would read as a stripe.
 * There is no `solid`: a filled, saturated badge competes with the one primary
 * action on the surface, which is the thing the accent is spent on.
 */
export type BadgeVariant = "soft" | "outline";
