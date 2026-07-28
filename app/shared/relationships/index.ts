/**
 * PEOPLE-03 shared relationship presentation — public surface.
 *
 * The presentation half of the relationship kernel: the inline stay-in-touch pill,
 * the explanatory record panel and the pure wording helpers. Shared (not
 * People-owned) because the same signal belongs on any surface that shows a Person
 * — the People collection, Today, and the later Email / Communications modules —
 * and a second dialect of it would be product debt on arrival.
 */

export { StayInTouchIndicator } from "./StayInTouchIndicator";
export type { StayInTouchSignal } from "./StayInTouchIndicator";
export { StayInTouchPanel } from "./StayInTouchPanel";
export {
  relationshipToneToCardTone,
  relationshipToneToSummaryTone,
  formatRelationshipDate,
  relativeDayPhrase,
  cadencePhrase,
  relationshipReasonText,
  lastInteractionPhrase,
} from "./relationship-view";
export { createOwnerRelationshipContext } from "./window";
