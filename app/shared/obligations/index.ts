/**
 * V2.10 LIFE-02 — the shared Obligation surface.
 *
 * The row, the list and the view-model every surface that renders an obligation
 * draws from: Life Admin's collection, the Obligation record, and the Asset
 * record's Obligations tab. Import from `~/shared/obligations`, never from a
 * file inside it.
 */

export {
  CompleteObligationForm,
  type CompleteObligationFormProps,
  type CompleteObligationResponse,
  type ObligationRecordOption,
} from "./CompleteObligationForm";
export {
  ObligationForm,
  type ObligationFormProps,
  type ObligationFormResponse,
} from "./ObligationForm";
export { ObligationRow, type ObligationRowProps } from "./ObligationRow";
export {
  useObligationActions,
  type ObligationActionFeedback,
  type ObligationActions,
  type ObligationMutationResult,
  type UseObligationActionsInput,
} from "./use-obligation-actions";
export {
  SubjectPicker,
  type ObligationSubjectOption,
  type SubjectPickerProps,
} from "./SubjectPicker";
export {
  ObligationBands,
  ObligationList,
  type ObligationBandsProps,
  type ObligationListProps,
} from "./ObligationList";
export {
  formatObligationDate,
  groupObligationsByBand,
  obligationStateTone,
  serializeObligation,
  type ObligationBandGroup,
  type SerializeObligationOptions,
  type SerializedObligation,
  type SerializedObligationSubject,
} from "./obligation-view";
