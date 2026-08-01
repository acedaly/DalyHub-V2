/**
 * X-04 — the workspace-export platform surface.
 *
 * One canonical snapshot builder, two serialisers derived from it, and the
 * dependency-free ZIP writer they share. Import from here; nothing outside this
 * folder should reach into an individual module.
 */

export {
  WorkspaceSnapshotUnavailableError,
  buildWorkspaceSnapshot,
  type BuildSnapshotOptions,
} from "./build-snapshot";

export {
  buildObsidianVaultArchive,
  buildStructuredExportArchive,
  exportFilename,
  sha256Hex,
  type ExportArchive,
} from "./archives";

export {
  EXPORT_EXCLUSIONS,
  buildExportManifest,
  countRecordsByModule,
  type ExportManifest,
  type ManifestFile,
  type ManifestModuleCounts,
} from "./manifest";

export {
  buildObsidianVault,
  describeRecurrence,
  type VaultBuildResult,
  type VaultFile,
} from "./vault/build-vault";

export {
  VAULT_META_FOLDER,
  VAULT_ROOT,
  buildVaultFilenameIndex,
  markdownLink,
  relativeVaultPath,
  safeVaultStem,
  stableIdSuffix,
  type VaultFileLocation,
  type VaultFileRequest,
} from "./vault/vault-filenames";

export {
  buildVaultIndex,
  VAULT_FOLDER_ORDER,
  vaultFolderForType,
  type VaultIndex,
} from "./vault/vault-index";

export {
  MAX_VAULT_LINK_REWRITES,
  rewriteBodyForVault,
  type UnresolvedLink,
  type UnresolvedLinkReason,
  type VaultLinkResolver,
} from "./vault/vault-links";

export { fields, frontmatter, yamlString, yamlValue } from "./vault/vault-yaml";

export {
  ZIP_MAX_TOTAL_BYTES,
  ZipPathError,
  ZipTooLargeError,
  assertSafeZipPath,
  crc32,
  createZipArchive,
  textEntry,
  type ZipEntry,
} from "./zip";
