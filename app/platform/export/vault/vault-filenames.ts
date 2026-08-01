/**
 * X-04 — deterministic, collision-safe, cross-platform vault filenames.
 *
 * The vault has to open cleanly on macOS, Windows, Linux and inside Obsidian,
 * and it has to be the SAME vault every time the same data is exported. Those
 * two requirements are what this module exists for, and they pull in different
 * directions: the safest filename is a hash, and the most useful one is the
 * record's title. The rules below keep titles readable and only fall back to an
 * id suffix where a name would otherwise be ambiguous.
 *
 * ## What a filename must survive
 *
 * | Hazard | Rule |
 * | --- | --- |
 * | path separators (`/`, `\`) | replaced with a hyphen — a title can never create a folder |
 * | Windows-reserved characters `<>:"|?*` | replaced with a hyphen |
 * | control characters, `NUL` | removed |
 * | Windows device names (`CON`, `COM1`, `NUL`, …) | prefixed so the name is not reserved |
 * | leading/trailing dots and spaces | trimmed (Windows silently drops them) |
 * | a title that reduces to nothing | falls back to `Untitled` |
 * | very long titles | truncated on a code-point boundary and bounded in UTF-8 bytes |
 * | duplicate titles | EVERY record sharing the stem gets a stable id suffix |
 * | case-insensitive collisions (`Plan` / `plan`) | same rule — macOS/Windows would otherwise overwrite |
 *
 * ## Unicode is preserved, not transliterated
 *
 * A note titled `Café résumé` exports as `Café résumé.md`, not `cafe-resume.md`.
 * Every target filesystem and Obsidian handle UTF-8 filenames, and mangling the
 * owner's own words to ASCII would be a worse export, not a safer one. Names are
 * normalised to **NFC** so a macOS-decomposed title and a Linux-composed one
 * produce the same bytes, and so collision detection compares like with like.
 *
 * ## Why duplicates suffix *all* of the colliding records
 *
 * The obvious rule — "first one keeps the plain name, later ones get a suffix" —
 * makes a filename depend on what else exists. Add a record whose id sorts
 * earlier and the OTHER record silently renames between exports. Suffixing every
 * member of a colliding group makes each filename a function of that record and
 * its title alone, so exports stay comparable over time.
 *
 * A record RENAMED in DalyHub does get a different filename in the next export.
 * That is unavoidable — the name comes from the title — and it is why every file
 * carries a stable `dalyhub_id` in its frontmatter: the id is the identity, the
 * filename is a convenience.
 */

/** The vault's top-level folder inside the archive. */
export const VAULT_ROOT = "DalyHub Export";

/** The internal folder holding export metadata rather than records. */
export const VAULT_META_FOLDER = "_DalyHub";

/** The longest filename stem, in code points, before the extension. */
export const MAX_STEM_CODE_POINTS = 80;

/** The longest filename stem, in UTF-8 bytes — the real filesystem constraint. */
export const MAX_STEM_BYTES = 160;

/** The stem used when a title reduces to nothing usable. */
export const FALLBACK_STEM = "Untitled";

const encoder = new TextEncoder();

/**
 * Windows reserved device names. A file called `CON.md` cannot be created on
 * Windows at all, so the stem is prefixed rather than rejected.
 */
const RESERVED_DEVICE_NAMES: ReadonlySet<string> = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`),
  ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`),
]);

/**
 * Reduce a title to a safe, readable filename stem — WITHOUT any collision
 * handling. Pure and deterministic.
 */
export function safeVaultStem(title: string): string {
  const normalised = (typeof title === "string" ? title : "")
    .normalize("NFC")
    // Control characters and DEL: never legal in a filename, never useful.
    // Tab, LF and CR are deliberately EXCLUDED here and handled by the
    // whitespace collapse below — a title carrying a line break should read as
    // "a b", not "ab", which is what removing them outright would produce.
    // eslint-disable-next-line no-control-regex -- rejecting controls is the point.
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    // Path separators and the Windows-reserved set. A hyphen keeps the shape of
    // the original title readable (`Health / Fitness` → `Health - Fitness`).
    .replace(/[/\\<>:"|?*]/g, "-")
    // Collapse runs of whitespace so a title with a newline does not become a
    // name with a stray gap.
    .replace(/\s+/g, " ")
    .trim();

  // Truncate by code points first (so a surrogate pair is never split), then
  // tighten until the UTF-8 encoding fits. Both bounds matter: filesystems limit
  // bytes, and a 255-byte limit is only ~63 emoji.
  let stem = [...normalised].slice(0, MAX_STEM_CODE_POINTS).join("");
  while (stem.length > 0 && encoder.encode(stem).length > MAX_STEM_BYTES) {
    stem = [...stem].slice(0, -1).join("");
  }

  // Windows silently strips trailing dots and spaces, which would turn two
  // distinct names into one. Strip them here so the name we compute is the name
  // that lands on disk. Leading dots are removed too: a dotfile hides the record.
  stem = stem.replace(/^[.\s]+/, "").replace(/[.\s]+$/, "");

  // A title made only of characters we had to replace (`///`, `***`) leaves
  // nothing but separator hyphens, which is a name that says less than
  // "Untitled" does. Treat it as an unusable title rather than shipping `---.md`.
  if (stem === "" || /^[-\s]+$/.test(stem)) return FALLBACK_STEM;

  // A reserved device name is reserved with OR without an extension.
  const base = stem.split(".")[0] ?? stem;
  if (RESERVED_DEVICE_NAMES.has(base.toLowerCase())) {
    return `_${stem}`;
  }
  return stem;
}

/**
 * The short, stable disambiguator derived from a record's own id.
 *
 * Taken from the END of the id: DalyHub ids are `crypto.randomUUID()` values
 * whose final group is pure entropy, whereas the first group is not (version and
 * variant bits live in the middle). Six characters over a personal workspace is
 * ample; {@link buildVaultFilenameIndex} widens it if two records in one folder
 * still collide.
 */
export function stableIdSuffix(id: string, length = 6): string {
  const compact = id.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
  if (compact.length === 0) return "record";
  return compact.slice(-Math.max(1, length));
}

/**
 * The key two names collide on: case-folded, so macOS and Windows agree.
 * Joined with `\u0000`, which cannot occur in a folder or a stem — a printable
 * separator could be forged by a title and make two distinct names collide.
 */
function collisionKey(folder: string, stem: string): string {
  return `${folder.toLowerCase()}\u0000${stem.normalize("NFC").toLowerCase()}`;
}

/** A record that needs a file in the vault. */
export interface VaultFileRequest {
  /** The record's stable DalyHub id. */
  readonly id: string;
  /** The record's title, exactly as stored. */
  readonly title: string;
  /** The vault folder the file belongs in, e.g. `Notes`. */
  readonly folder: string;
}

/**
 * The resolved location of one record's file, relative to the vault root.
 * `path` is what links point at and what the archive entry is named.
 */
export interface VaultFileLocation {
  readonly id: string;
  readonly folder: string;
  readonly stem: string;
  /** e.g. `Notes/Reading list (a1b2c3).md` — vault-root-relative, POSIX. */
  readonly path: string;
}

/**
 * Assign every record a deterministic, unique file location.
 *
 * Two passes, because a filename cannot be decided until every title is known:
 *
 *   1. compute each record's plain stem and count how many records in the same
 *      folder share it (case-folded);
 *   2. give every member of a colliding group a stable id suffix — and, in the
 *      vanishingly rare case that two ids share their suffix, widen the suffix
 *      until they differ.
 *
 * The result depends only on the set of `(id, title, folder)` triples, never on
 * the order they arrive in, so two exports of unchanged data place every file at
 * exactly the same path.
 */
export function buildVaultFilenameIndex(
  requests: readonly VaultFileRequest[],
): ReadonlyMap<string, VaultFileLocation> {
  const stems = new Map<string, string>();
  const groups = new Map<string, number>();
  for (const request of requests) {
    const stem = safeVaultStem(request.title);
    stems.set(request.id, stem);
    const key = collisionKey(request.folder, stem);
    groups.set(key, (groups.get(key) ?? 0) + 1);
  }

  const taken = new Set<string>();
  const located = new Map<string, VaultFileLocation>();
  // Sort by id so the widening loop below is itself order-independent.
  const ordered = [...requests].sort((a, b) =>
    a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
  );

  for (const request of ordered) {
    const plain = stems.get(request.id) ?? FALLBACK_STEM;
    const collides = (groups.get(collisionKey(request.folder, plain)) ?? 0) > 1;

    let stem = plain;
    if (collides) {
      let width = 6;
      stem = `${plain} (${stableIdSuffix(request.id, width)})`;
      // Two different ids sharing a 6-character tail is astronomically unlikely
      // but not impossible; widen rather than overwrite a file.
      while (taken.has(collisionKey(request.folder, stem)) && width < 32) {
        width += 4;
        stem = `${plain} (${stableIdSuffix(request.id, width)})`;
      }
      if (taken.has(collisionKey(request.folder, stem))) {
        // Last resort: the full id. Guaranteed unique, and the frontmatter
        // explains it.
        stem = `${plain} (${request.id})`;
      }
    }

    taken.add(collisionKey(request.folder, stem));
    located.set(request.id, {
      id: request.id,
      folder: request.folder,
      stem,
      path: `${request.folder}/${stem}.md`,
    });
  }
  return located;
}

/* -------------------------------------------------------------------------- */
/* Relative links                                                             */
/* -------------------------------------------------------------------------- */

/**
 * The portable relative path from one vault file to another.
 *
 * Standard relative Markdown links, not Obsidian's `[[…]]` — the vault must read
 * correctly in any Markdown tool, and Obsidian follows relative links natively.
 */
export function relativeVaultPath(fromPath: string, toPath: string): string {
  const from = fromPath.split("/").slice(0, -1);
  const to = toPath.split("/");
  const toFile = to.pop() ?? "";

  let shared = 0;
  while (
    shared < from.length &&
    shared < to.length &&
    from[shared] === to[shared]
  ) {
    shared += 1;
  }
  const up = from.length - shared;
  const segments = [
    ...Array.from({ length: up }, () => ".."),
    ...to.slice(shared),
    toFile,
  ];
  const joined = segments.join("/");
  // A same-folder sibling needs an explicit `./` so it is unambiguously a path
  // rather than a bare word some renderers treat as a scheme-less URL.
  return up === 0 && to.length === shared ? `./${joined}` : joined;
}

/**
 * Render a Markdown link whose destination is a filesystem path.
 *
 * Paths with spaces or parentheses use CommonMark's angle-bracket destination
 * form, which every conforming renderer and Obsidian accept, and which stays
 * readable — unlike percent-encoding, which turns `Run 5k.md` into
 * `Run%205k.md` in the source the owner reads.
 */
export function markdownLink(label: string, path: string): string {
  const safeLabel = label
    .replace(/\r?\n/g, " ")
    .replace(/([[\]])/g, "\\$1")
    .trim();
  const destination = /[\s()]/.test(path) ? `<${path}>` : path;
  return `[${safeLabel === "" ? path : safeLabel}](${destination})`;
}
