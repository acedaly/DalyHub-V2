import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";

import type {
  ProjectSettingsChangeResult,
  ProjectSettingsRecord,
  ProjectWorkflowStatus,
} from "./project-settings";
export interface ProjectSettingsRepository {
  get(id: string): Promise<ProjectSettingsRecord | null>;
  setStatus(
    id: string,
    status: ProjectWorkflowStatus,
  ): Promise<ProjectSettingsChangeResult>;
  archive(id: string): Promise<ProjectSettingsChangeResult>;
  restore(id: string): Promise<ProjectSettingsChangeResult>;

  /**
   * Choose (or clear) the Project's icon, returning the settings that now apply.
   *
   * `null` clears the choice — a legitimate value, not a failure: it is what
   * "reset to default" stores, and the Project then renders its entity icon. A
   * NON-null key is expected to be a member of the vocabulary already; refusing
   * an unrecognised one is the route boundary's job, so that an owner is told
   * their choice was rejected rather than seeing it silently become "no icon".
   */
  setIcon(
    id: string,
    iconKey: EntityIconKey | null,
  ): Promise<ProjectSettingsRecord>;
}
