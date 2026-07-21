/**
 * PROJ-01 Projects kernel — public surface.
 *
 * Modules and the composition boundary import the Projects read projection from
 * here. Like the other kernel barrels it exposes only the storage-independent
 * contract; the D1 adapter is constructed from `app/platform/storage/d1`.
 */

export type {
  ProjectRelation,
  ProjectStateFilter,
  ListProjectsInput,
  ProjectListItem,
  ProjectListPage,
  ProjectOverview,
} from "./project";

export type { ProjectRepository } from "./project-repository";

export { ProjectStorageError } from "./project-errors";
