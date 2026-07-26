/**
 * AREA-05 Area Settings kernel — public surface.
 */

export {
  AREA_ARCHIVED,
  AREA_RESTORED,
  AREA_DELETED,
  DEFAULT_AREA_SETTINGS,
  isAreaArchived,
} from "./area-settings";
export type {
  AreaSettings,
  AreaSettingsRecord,
  AreaSettingsChangeResult,
} from "./area-settings";

export type { AreaSettingsRepository } from "./area-settings-repository";

export {
  AreaArchivedError,
  AreaSettingsConflictError,
  AreaSettingsNotFoundError,
  AreaSettingsStorageError,
} from "./area-settings-errors";
export type { AreaSettingsErrorCode } from "./area-settings-errors";
