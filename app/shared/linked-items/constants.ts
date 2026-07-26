/**
 * The Universal Relationship System — client-side constants.
 *
 * The single relationship type the shared Linked Items UI creates. It mirrors
 * the platform authority ({@link file://app/platform/entity-links/universal-links.ts}),
 * but lives here because the shared layer must not import the platform layer. The
 * server is still authoritative: `/links` fixes the link type server-side and
 * never trusts the client's choice, so this constant is presentation only.
 */

/** The module-agnostic "related to" relationship type. */
export const UNIVERSAL_RELATED_LINK = "link.related";

/** The user-language descriptor the picker shows for the universal link type. */
export const UNIVERSAL_RELATED_DESCRIPTOR = {
  type: UNIVERSAL_RELATED_LINK,
  label: "Related",
} as const;
