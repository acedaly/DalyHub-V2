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
}
