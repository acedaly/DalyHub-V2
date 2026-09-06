/**
 * V2.11 FILE-00 — the media-type allow-list, and exactly what checking it
 * guarantees.
 *
 * ## The honest claim
 *
 * DalyHub stores opaque bytes. It never parses, renders, executes or interprets
 * an attachment's contents, and this module is NOT antivirus, NOT content
 * inspection and NOT a guarantee that a file is well-formed. What it guarantees
 * is narrower and worth stating precisely:
 *
 *   1. the DECLARED media type is one of the types below;
 *   2. the filename's EXTENSION is one that type is known by;
 *   3. for the formats with a short, unambiguous leading signature — PDF, PNG,
 *      JPEG, GIF, WEBP — the first bytes match it.
 *
 * That is enough to stop a `.pdf` that is really an HTML page from being
 * accepted and later served as `application/pdf`. It is not a promise about
 * anything inside the file, and DalyHub does not need one: it needs to be unable
 * to be tricked into executing an upload. **Store and download is not parse and
 * render.**
 *
 * Deliberately NOT a large signature database. The formats without a stable,
 * short magic number — the Office ZIP containers, plain text, CSV — are accepted
 * on their declaration and their extension, and they are served as downloads
 * only, so a wrong guess costs a file the browser hands to another application
 * rather than anything that runs here.
 *
 * ## Two types are refused outright
 *
 * `text/html` and `image/svg+xml` are not on the list and are not merely forced
 * to download. Both are ACTIVE CONTENT in a browser, both would sit on DalyHub's
 * own origin, and neither has a legitimate use as evidence — nobody attaches an
 * insurance policy as HTML. Refusing them is smaller than defending against
 * them, and it is the only rule here that cannot be relaxed without a new ADR.
 */

/** How a stored file may be served back. */
export type AttachmentDisposition =
  /** Always `Content-Disposition: attachment`. The default and the majority. */
  | "download"
  /**
   * May ALSO be served `inline`, through the preview route, for an `<img>`.
   *
   * Restricted to raster images for a measured reason: DalyHub's own CSP sets
   * `object-src 'none'`, `frame-src 'none'` and `media-src 'none'`, so a PDF
   * cannot be embedded in a DalyHub page at any price, while `img-src 'self'`
   * means a same-origin raster image can. The security question was decided by
   * the policy before the product asked it.
   */
  | "image";

/** One accepted media type and everything the boundary needs to know about it. */
export interface AttachmentMediaType {
  /** The canonical, lowercase media type stored on the row. */
  readonly value: string;
  /** Every filename extension this type is accepted under, lowercase, dotted. */
  readonly extensions: readonly string[];
  /** How it may be served. */
  readonly disposition: AttachmentDisposition;
  /**
   * The leading bytes every file of this type starts with, or `null` where the
   * format has no short unambiguous signature. `null` is a stated absence, not
   * an oversight: see the header.
   */
  readonly signature: readonly number[] | null;
  /** What the owner is told this class of file is, in one word. */
  readonly label: string;
}

const PDF = [0x25, 0x50, 0x44, 0x46] as const; // %PDF
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] as const;
const JPEG = [0xff, 0xd8, 0xff] as const;
const GIF = [0x47, 0x49, 0x46, 0x38] as const; // GIF8
const RIFF = [0x52, 0x49, 0x46, 0x46] as const; // WEBP is RIFF....WEBP

/**
 * Every media type DalyHub accepts as evidence.
 *
 * Sorted by class, then by name, so the list reads as a policy rather than as an
 * accretion. Adding one is a deliberate change with a test; the allow-list is
 * the security boundary, and a deny-list would not be.
 */
export const ATTACHMENT_MEDIA_TYPES: readonly AttachmentMediaType[] = [
  /* Documents ------------------------------------------------------------- */
  {
    value: "application/pdf",
    extensions: [".pdf"],
    disposition: "download",
    signature: [...PDF],
    label: "PDF",
  },

  /* Images ---------------------------------------------------------------- */
  {
    value: "image/gif",
    extensions: [".gif"],
    disposition: "image",
    signature: [...GIF],
    label: "Image",
  },
  {
    /*
     * HEIC/HEIF is what an iPhone produces by default. Its signature lives at
     * byte 4 rather than byte 0 (an ISO-BMFF `ftyp` box), so it is accepted on
     * its declaration and extension like the container formats below, and it is
     * served as a DOWNLOAD rather than inline: a browser that cannot decode it
     * would otherwise render a broken image where the owner expected their
     * photo.
     */
    value: "image/heic",
    extensions: [".heic"],
    disposition: "download",
    signature: null,
    label: "Image",
  },
  {
    value: "image/heif",
    extensions: [".heif"],
    disposition: "download",
    signature: null,
    label: "Image",
  },
  {
    value: "image/jpeg",
    extensions: [".jpg", ".jpeg"],
    disposition: "image",
    signature: [...JPEG],
    label: "Image",
  },
  {
    value: "image/png",
    extensions: [".png"],
    disposition: "image",
    signature: [...PNG],
    label: "Image",
  },
  {
    value: "image/webp",
    extensions: [".webp"],
    disposition: "image",
    signature: [...RIFF],
    label: "Image",
  },

  /* Text ------------------------------------------------------------------ */
  {
    value: "text/csv",
    extensions: [".csv"],
    disposition: "download",
    signature: null,
    label: "Spreadsheet",
  },
  {
    value: "text/markdown",
    extensions: [".md", ".markdown"],
    disposition: "download",
    signature: null,
    label: "Text",
  },
  {
    value: "text/plain",
    extensions: [".txt", ".log"],
    disposition: "download",
    signature: null,
    label: "Text",
  },

  /* Office ---------------------------------------------------------------- */
  {
    value: "application/msword",
    extensions: [".doc"],
    disposition: "download",
    signature: null,
    label: "Document",
  },
  {
    value: "application/vnd.ms-excel",
    extensions: [".xls"],
    disposition: "download",
    signature: null,
    label: "Spreadsheet",
  },
  {
    value: "application/vnd.ms-powerpoint",
    extensions: [".ppt"],
    disposition: "download",
    signature: null,
    label: "Presentation",
  },
  {
    value:
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extensions: [".pptx"],
    disposition: "download",
    signature: null,
    label: "Presentation",
  },
  {
    value: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extensions: [".xlsx"],
    disposition: "download",
    signature: null,
    label: "Spreadsheet",
  },
  {
    value:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extensions: [".docx"],
    disposition: "download",
    signature: null,
    label: "Document",
  },
];

/**
 * Media types that are REFUSED with their own sentence rather than with the
 * generic "that kind of file is not accepted".
 *
 * The owner who tries to attach an SVG has a reason, and telling them *why* it
 * is refused is the difference between a rule and a wall. Nothing here is ever
 * accepted; this map only changes the message.
 */
export const ATTACHMENT_REFUSED_MEDIA_TYPES: Readonly<Record<string, string>> =
  {
    "text/html":
      "HTML files aren’t accepted as evidence, because a web page can run code. Save it as a PDF and attach that.",
    "application/xhtml+xml":
      "HTML files aren’t accepted as evidence, because a web page can run code. Save it as a PDF and attach that.",
    "image/svg+xml":
      "SVG files aren’t accepted as evidence, because an SVG can run code. Attach a PNG or a JPEG instead.",
  };

const BY_VALUE: ReadonlyMap<string, AttachmentMediaType> = new Map(
  ATTACHMENT_MEDIA_TYPES.map((type) => [type.value, type]),
);

const BY_EXTENSION: ReadonlyMap<string, readonly AttachmentMediaType[]> =
  (() => {
    const index = new Map<string, AttachmentMediaType[]>();
    for (const type of ATTACHMENT_MEDIA_TYPES) {
      for (const extension of type.extensions) {
        const bucket = index.get(extension);
        if (bucket) bucket.push(type);
        else index.set(extension, [type]);
      }
    }
    return index;
  })();

/** The `accept` attribute for a file input: every type and every extension. */
export const ATTACHMENT_ACCEPT_ATTRIBUTE: string = [
  ...ATTACHMENT_MEDIA_TYPES.map((type) => type.value),
  ...ATTACHMENT_MEDIA_TYPES.flatMap((type) => type.extensions),
].join(",");

/** Look up an accepted media type. Returns `null` for anything not on the list. */
export function attachmentMediaType(value: string): AttachmentMediaType | null {
  return BY_VALUE.get(normaliseMediaType(value)) ?? null;
}

/**
 * Normalise a declared media type: lowercase, parameters (`; charset=…`)
 * dropped, whitespace trimmed.
 *
 * A browser sends `text/plain; charset=utf-8` for a `.txt` file, and the
 * parameter is not part of the type's identity. Dropping it here means the
 * allow-list holds one entry per type rather than one per parameter spelling.
 */
export function normaliseMediaType(value: string): string {
  const semicolon = value.indexOf(";");
  return (semicolon === -1 ? value : value.slice(0, semicolon))
    .trim()
    .toLowerCase();
}

/** The lowercase dotted extension of a filename, or `""` when it has none. */
export function filenameExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return "";
  return filename.slice(dot).toLowerCase();
}

/** Every accepted type a given extension is known by. Empty when unknown. */
export function mediaTypesForExtension(
  extension: string,
): readonly AttachmentMediaType[] {
  return BY_EXTENSION.get(extension.toLowerCase()) ?? [];
}

/**
 * True when `bytes` begins with the signature `type` declares.
 *
 * A type with no signature returns `true`: the absence is a stated property of
 * the format, not a check that failed. WEBP is the one special case — its RIFF
 * container is shared with other formats, so the four `WEBP` bytes at offset 8
 * are checked too, which is what makes a `.wav` renamed to `.webp` fail.
 */
export function matchesSignature(
  type: AttachmentMediaType,
  bytes: Uint8Array,
): boolean {
  const { signature } = type;
  if (signature === null) return true;
  if (bytes.length < signature.length) return false;
  for (let index = 0; index < signature.length; index += 1) {
    if (bytes[index] !== signature[index]) return false;
  }
  if (type.value === "image/webp") {
    // "WEBP" at offset 8, inside the RIFF container.
    const marker = [0x57, 0x45, 0x42, 0x50];
    if (bytes.length < 12) return false;
    for (let index = 0; index < marker.length; index += 1) {
      if (bytes[8 + index] !== marker[index]) return false;
    }
  }
  return true;
}
