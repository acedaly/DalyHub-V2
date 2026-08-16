import type { EntityIconKey } from "~/kernel/entities/entity-icon-keys";
import type { IdentityColourSlot } from "~/kernel/entities/identity-colour-slots";

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
   * Choose (or clear) the Project's IDENTITY — its icon and its colour together
   * — returning the settings that now apply.
   *
   * One method rather than two because the owner picks both in one surface and
   * applies them once. Two writes would give a half-applied identity a moment to
   * exist, and give the failure path two different things to undo.
   *
   * `null` on either field clears that choice — a legitimate value, not a
   * failure: it is what "reset to default" and "Automatic" store, and the
   * Project then renders its entity icon and its derived colour. A NON-null
   * value is expected to be a member of its vocabulary already; refusing an
   * unrecognised one is the route boundary's job, so that an owner is told their
   * choice was rejected rather than seeing it silently become "no choice".
   */
  setIdentity(
    id: string,
    identity: {
      readonly iconKey: EntityIconKey | null;
      readonly colourSlot: IdentityColourSlot | null;
    },
  ): Promise<ProjectSettingsRecord>;
}
