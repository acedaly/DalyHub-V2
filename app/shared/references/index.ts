/**
 * NOTES-02 — the shared References surface: reading the FND-04 relationship
 * graph DIRECTIONALLY (backlinks in, outgoing links out) with bounded context.
 *
 * Isolated from `~/shared/linked-items` on purpose (§15): that surface owns
 * CREATING and REMOVING relationships; this one owns reading them. Both read the
 * same EntityLink kernel — no second relationship representation exists.
 */

export { ReferenceList, type ReferenceListProps } from "./ReferenceList";
export {
  availableReferenceFamilies,
  groupReferencesByFamily,
  groupReferencesByType,
  referenceFamilyOf,
  referencesOfType,
  relationshipLabel,
  OTHER_REFERENCE_FAMILY,
  REFERENCE_FAMILIES,
  type RecordReference,
  type ReferenceDirection,
  type ReferenceFamilyGroup,
  type ReferenceFamilyId,
  type ReferenceGroup,
  type ReferencePage,
  type ReferenceRecord,
} from "./references-model";
