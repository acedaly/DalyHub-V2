/**
 * X-04 — assemble the two downloadable archives from ONE snapshot.
 *
 * Both entry points here take a `WorkspaceSnapshotV1` and return bytes. Neither
 * touches the database, so the structured export and the Obsidian vault describe
 * exactly the same workspace state — the "do not build two export
 * implementations that can drift" requirement, enforced by construction rather
 * than by review.
 *
 *   - {@link buildStructuredExportArchive} — `manifest.json`,
 *     `dalyhub-snapshot.json`, `README.md`, `SCHEMA.md` and `CHECKSUMS.txt`.
 *     This is the format SET-02's restore will read.
 *   - {@link buildObsidianVaultArchive} — the ready-to-open Markdown vault.
 *
 * Integrity: every file carries a SHA-256 in `manifest.json` (structured) and in
 * `CHECKSUMS.txt` (both), in the `sha256sum` format, so `sha256sum -c` verifies
 * an extracted archive with no DalyHub involved.
 */

import {
  SNAPSHOT_COLLECTION_ORDER,
  type SnapshotCollection,
  type WorkspaceSnapshotV1,
} from "~/kernel/export";

import {
  buildExportManifest,
  EXPORT_EXCLUSIONS,
  type ManifestFile,
} from "./manifest";
import { buildObsidianVault } from "./vault/build-vault";
import { VAULT_META_FOLDER, VAULT_ROOT } from "./vault/vault-filenames";
import { createZipArchive, textEntry, type ZipEntry } from "./zip";

/** A finished download: the bytes and the filename to serve them under. */
export interface ExportArchive {
  readonly filename: string;
  readonly bytes: Uint8Array;
  /** The paths inside the archive, for tests and for the response headers. */
  readonly paths: readonly string[];
}

/* -------------------------------------------------------------------------- */
/* Checksums                                                                  */
/* -------------------------------------------------------------------------- */

/** Lowercase hex SHA-256 of a byte sequence, via the platform WebCrypto. */
export async function sha256Hex(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    data as unknown as ArrayBuffer,
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/** The `sha256sum` file format: `<hex>  <path>`, one per line, path-sorted. */
function checksumFile(files: readonly ManifestFile[]): string {
  return `${files
    .slice()
    .sort((a, b) => (a.path < b.path ? -1 : 1))
    .map((file) => `${file.sha256}  ${file.path}`)
    .join("\n")}\n`;
}

async function describe(entries: readonly ZipEntry[]): Promise<ManifestFile[]> {
  const described: ManifestFile[] = [];
  for (const entry of entries) {
    described.push({
      path: entry.path,
      bytes: entry.data.length,
      sha256: await sha256Hex(entry.data),
    });
  }
  return described;
}

/* -------------------------------------------------------------------------- */
/* Filenames                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * A download filename that is safe in a `Content-Disposition` header and on
 * every desktop filesystem: ASCII, no quotes, no separators, no spaces.
 */
export function exportFilename(prefix: string, exportedAt: string): string {
  const stamp = exportedAt.replace(/[:.]/g, "-").replace(/Z$/, "Z");
  return `${prefix}-${stamp}.zip`;
}

/* -------------------------------------------------------------------------- */
/* Documents                                                                  */
/* -------------------------------------------------------------------------- */

/** Stable, pretty-printed JSON. Two-space indent, key order as constructed. */
function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function structuredReadme(snapshot: WorkspaceSnapshotV1): string {
  const counts = SNAPSHOT_COLLECTION_ORDER.map(
    (collection: SnapshotCollection) =>
      `| \`${collection}\` | ${snapshot.records[collection].length} |`,
  ).join("\n");

  return `# DalyHub export

This archive is a complete, structured export of a DalyHub workspace. It exists
so the owner of that workspace is never locked into DalyHub.

- **Exported:** ${snapshot.meta.exportedAt}
- **Application:** ${snapshot.meta.application.name} ${snapshot.meta.application.version} (${snapshot.meta.application.releaseName})
- **Snapshot schema:** \`${snapshot.meta.schema}\` v${snapshot.meta.schemaVersion}
- **Workspace:** \`${snapshot.workspace.id}\`

## What is in this archive

| File | What it is |
| --- | --- |
| \`manifest.json\` | What this archive is, what it contains, and what it could not do. Read this first. |
| \`dalyhub-snapshot.json\` | The complete workspace snapshot: every record, relationship and event. |
| \`SCHEMA.md\` | The snapshot's structure, field by field, and the compatibility policy. |
| \`README.md\` | This file. |
| \`CHECKSUMS.txt\` | SHA-256 of every other file, in \`sha256sum\` format. |

Verify the archive after extracting it:

\`\`\`sh
sha256sum -c CHECKSUMS.txt
\`\`\`

## What the snapshot holds

| Collection | Records |
| --- | --- |
${counts}

Every record carries its stable DalyHub id, its type, its canonical timestamps
and its lifecycle state. **Archived and soft-deleted records are included and
marked**, not silently dropped. Markdown content — note bodies, task
descriptions, diary entries, meeting notes, review responses — is the exact
source you wrote; nothing here is rendered to HTML.

## Dates and empty values

All instants are ISO-8601 UTC with millisecond precision
(\`2026-08-01T09:00:00.000Z\`). Calendar dates that have no time — a due date, a
review period — stay \`YYYY-MM-DD\` and are never converted through a timezone.
An absent value is an explicit \`null\`, never a missing key and never an empty
string standing in for "nothing".

## What is deliberately NOT here

${EXPORT_EXCLUSIONS.map((item) => `- ${item}`).join("\n")}

## Consistency

${snapshot.meta.consistency}. The snapshot was read through a sequence of
bounded database statements. Each statement saw a consistent database, but the
sequence is **not** an atomic point-in-time snapshot: a change made while the
export was running may appear in some collections and not others. DalyHub says
so rather than claiming a guarantee it does not have.

## Restoring

DalyHub cannot yet import this archive. Restore is a separate, deliberate piece
of work (roadmap item SET-02), and this format is the input contract it will
read. Until it ships, this archive is a complete, readable copy of your data —
not a one-click undo button. Keep it somewhere you control.

If you want your records as human-readable Markdown you can open immediately,
use **Download Obsidian vault** in DalyHub's Settings instead. Both downloads are
built from the same snapshot.
`;
}

function schemaDocument(snapshot: WorkspaceSnapshotV1): string {
  return `# Snapshot schema

- **Schema:** \`${snapshot.meta.schema}\`
- **Version:** ${snapshot.meta.schemaVersion}

## Top-level shape

\`\`\`
{
  "meta":         { schema, schemaVersion, application, exportedAt, consistency },
  "workspace":    { id, createdAt, updatedAt },
  "owner":        { preferences, taskSavedViews },
  "records":      { …collections, in the fixed order below… },
  "limitations":  [ { code, subject, detail } ]
}
\`\`\`

## Collections, in serialisation order

${SNAPSHOT_COLLECTION_ORDER.map((collection) => `- \`records.${collection}\``).join("\n")}

The order is fixed and meaningful: entities first, then spine membership, then
per-module detail rows, then module child records, then relationships, then
history. A restore can insert in this order without deriving a dependency graph.

## Identity and references

- Every first-class record is a row in \`records.entities\` with a stable \`id\`.
- A detail row references its record by \`entityId\`; a child record references
  its parent by that parent's id (\`meetingId\`, \`assetId\`, \`reviewId\`).
- \`records.entityLinks\` is the relationship graph. Direction is meaningful:
  \`sourceEntityId\` → \`targetEntityId\`, typed by \`type\`. A link with a
  non-null \`deletedAt\` was **unlinked** and is exported so the lifecycle can be
  reproduced exactly.
- \`records.activitySubjects\` associates events with the records they are about.
  One event may name several subjects.

## Ordering

Every collection is sorted by a documented, total key, so two exports of
unchanged data are byte-identical:

| Collection | Sorted by |
| --- | --- |
| \`entities\`, \`entityLinks\`, \`meetingItems\`, \`assetEvents\`, \`assetObligations\` | \`id\` |
| \`activities\` | \`occurredAt\`, then \`id\` |
| \`activitySubjects\` | \`activityId\`, then \`entityId\` |
| \`reviewSections\` | \`reviewId\`, then \`sectionId\` |
| \`meetingItemTasks\` | \`taskId\` |
| every other collection | \`entityId\` |

## Markdown-bearing fields

These fields hold the owner's canonical Markdown source, exported verbatim:

- \`noteDetails[].content\`
- \`taskDetails[].description\`
- \`diaryEntryDetails[].body\`
- \`meetingDetails[].agendaMarkdown\`, \`meetingDetails[].notesMarkdown\`
- \`meetingItems[].bodyMarkdown\`
- \`reviewSections[].bodyMarkdown\`

Everything else that reads like prose — \`goalDetails[].definitionOfDone\`,
\`personDetails[].notes\`, the Asset note fields — is stored as plain text and is
exported as plain text.

## Compatibility policy

- The **version** changes only for a breaking change: a field removed, a field's
  meaning changed, or an ordering rule changed.
- Adding a new optional field, a new collection, or a new \`limitations\` code is
  **backwards compatible** and does not change the version. A reader must ignore
  fields it does not recognise.
- A reader must check \`meta.schema\` and \`meta.schemaVersion\` before anything
  else, and must refuse an archive whose major version it does not understand
  rather than guessing.
`;
}

/* -------------------------------------------------------------------------- */
/* Structured archive                                                         */
/* -------------------------------------------------------------------------- */

/** Build the structured, restore-oriented export archive. */
export async function buildStructuredExportArchive(
  snapshot: WorkspaceSnapshotV1,
): Promise<ExportArchive> {
  const content: ZipEntry[] = [
    textEntry("dalyhub-snapshot.json", json(snapshot)),
    textEntry("README.md", structuredReadme(snapshot)),
    textEntry("SCHEMA.md", schemaDocument(snapshot)),
  ];

  // The manifest describes the content files; CHECKSUMS then covers the manifest
  // too, so every byte in the archive except the checksum file itself is
  // verifiable.
  const described = await describe(content);
  const manifestEntry = textEntry(
    "manifest.json",
    json(buildExportManifest(snapshot, described)),
  );
  const withManifest = [...content, manifestEntry];
  const allDescribed = await describe(withManifest);
  const entries = [
    ...withManifest,
    textEntry("CHECKSUMS.txt", checksumFile(allDescribed)),
  ].sort((a, b) => (a.path < b.path ? -1 : 1));

  const bytes = await createZipArchive(
    entries,
    new Date(snapshot.meta.exportedAt),
  );
  return {
    filename: exportFilename("dalyhub-export", snapshot.meta.exportedAt),
    bytes,
    paths: entries.map((entry) => entry.path),
  };
}

/* -------------------------------------------------------------------------- */
/* Vault archive                                                              */
/* -------------------------------------------------------------------------- */

/** Build the ready-to-open Obsidian vault archive. */
export async function buildObsidianVaultArchive(
  snapshot: WorkspaceSnapshotV1,
): Promise<ExportArchive> {
  const vault = buildObsidianVault(snapshot);
  const files: ZipEntry[] = vault.files.map((file) =>
    textEntry(`${VAULT_ROOT}/${file.path}`, file.contents),
  );

  const described = await describe(files);
  const entries = [
    ...files,
    textEntry(
      `${VAULT_ROOT}/${VAULT_META_FOLDER}/CHECKSUMS.txt`,
      checksumFile(
        described.map((file) => ({
          ...file,
          // Paths are recorded relative to the vault root so `sha256sum -c`
          // works from inside the extracted vault folder.
          path: file.path.slice(`${VAULT_ROOT}/`.length),
        })),
      ),
    ),
  ].sort((a, b) => (a.path < b.path ? -1 : 1));

  const bytes = await createZipArchive(
    entries,
    new Date(snapshot.meta.exportedAt),
  );
  return {
    filename: exportFilename(
      "dalyhub-obsidian-vault",
      snapshot.meta.exportedAt,
    ),
    bytes,
    paths: entries.map((entry) => entry.path),
  };
}
