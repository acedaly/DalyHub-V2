/**
 * IDENTITY-01 — the ENTITY IDENTITY glyph set. DalyHub's own drawings.
 *
 * ## Why this set exists beside `icons.tsx`
 *
 * `icons.tsx` is Material Symbols Outlined: closed shapes with holes in them,
 * painted as fills. That is the right library for the application FRAME, where a
 * glyph is chrome — a chevron, a close button, a menu.
 *
 * It is the wrong library for a record's identity mark. IDENTITY-01 rebuilt the
 * identity tile to the reference's construction — a whisper of the record's hue
 * as the fill, a fine tinted edge, and the full saturated hue as the GLYPH — and
 * inside that tile a filled symbol reads as a solid blob of colour, which is
 * precisely the Material look the tile was rebuilt to leave behind.
 * `mockup3.png` draws stroked line art: a vivid blue monitor, a vivid green
 * heart, a vivid red flame, a vivid orange truck.
 *
 * So every glyph an owner can CHOOSE is drawn here, in one idiom, at one weight
 * (`createStrokeIcon`, 1.75 on the 24-unit grid), and the frame keeps Material
 * Symbols. The split is deliberate rather than drift, and it is recorded in
 * `docs/md3-inventory.md`.
 *
 * ## The drawing rules
 *
 * One weight, round caps and joins, and geometry on a 24×24 grid inside a ~3–21
 * live area so a glyph never touches the tile's edge. No fills anywhere — a
 * filled counter inside a stroked set is the single most visible way for one
 * icon to look imported. Every drawing is reduced to the fewest strokes that
 * still name the thing at 20px, which is the size the identity tile actually
 * renders it at.
 *
 * ## The contract with the vocabulary
 *
 * The kernel owns the KEYS (`entity-icon-keys.ts`); the catalogue maps a key to
 * one of these components and a label; `test/unit/entity-icons` holds the three
 * in lockstep, so a key with no drawing and a drawing with no key both fail.
 * Nothing here knows what a key is.
 */

import { createStrokeIcon } from "./Icon";

/* -------------------------------------------------------------------------- */
/* General                                                                    */
/* -------------------------------------------------------------------------- */

export const GlyphFolder = createStrokeIcon(
  "GlyphFolder",
  <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
);

export const GlyphTask = createStrokeIcon(
  "GlyphTask",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </>,
);

export const GlyphTarget = createStrokeIcon(
  "GlyphTarget",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <circle cx="12" cy="12" r="4.5" />
    <circle cx="12" cy="12" r="0.6" />
  </>,
);

export const GlyphChecklist = createStrokeIcon(
  "GlyphChecklist",
  <>
    <path d="m3.5 7 1.6 1.6L8.2 5.5M3.5 16l1.6 1.6 3.1-3.1" />
    <path d="M11.5 7h9M11.5 16h9" />
  </>,
);

export const GlyphBoard = createStrokeIcon(
  "GlyphBoard",
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M9.2 4.5v15M14.8 4.5v15" />
  </>,
);

export const GlyphGrid = createStrokeIcon(
  "GlyphGrid",
  <>
    <rect x="4" y="4" width="7" height="7" rx="1.5" />
    <rect x="13" y="4" width="7" height="7" rx="1.5" />
    <rect x="4" y="13" width="7" height="7" rx="1.5" />
    <rect x="13" y="13" width="7" height="7" rx="1.5" />
  </>,
);

export const GlyphInbox = createStrokeIcon(
  "GlyphInbox",
  <>
    <path d="M3.5 13.5 6.4 5.6A1.6 1.6 0 0 1 7.9 4.5h8.2a1.6 1.6 0 0 1 1.5 1.1l2.9 7.9" />
    <path d="M3.5 13.5h4.2l1.2 2.4h6.2l1.2-2.4h4.2v4a2 2 0 0 1-2 2H5.5a2 2 0 0 1-2-2Z" />
  </>,
);

export const GlyphTag = createStrokeIcon(
  "GlyphTag",
  <>
    <path d="M11.4 3.5H19a1.5 1.5 0 0 1 1.5 1.5v7.6a2 2 0 0 1-.59 1.41l-6 6a2 2 0 0 1-2.83 0l-6-6a2 2 0 0 1 0-2.83l6-6A2 2 0 0 1 11.4 3.5Z" />
    <circle cx="16" cy="8" r="1.1" />
  </>,
);

export const GlyphArchive = createStrokeIcon(
  "GlyphArchive",
  <>
    <rect x="3.5" y="4.5" width="17" height="4" rx="1.2" />
    <path d="M5 8.5v9.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5" />
    <path d="M10 12.5h4" />
  </>,
);

export const GlyphBox = createStrokeIcon(
  "GlyphBox",
  <>
    <path d="M20.5 8.2v7.6a1.5 1.5 0 0 1-.79 1.32l-7 3.8a1.5 1.5 0 0 1-1.42 0l-7-3.8A1.5 1.5 0 0 1 3.5 15.8V8.2a1.5 1.5 0 0 1 .79-1.32l7-3.8a1.5 1.5 0 0 1 1.42 0l7 3.8A1.5 1.5 0 0 1 20.5 8.2Z" />
    <path d="m3.8 7.4 8.2 4.4 8.2-4.4M12 20.6v-8.8" />
  </>,
);

/* -------------------------------------------------------------------------- */
/* Work and money                                                             */
/* -------------------------------------------------------------------------- */

export const GlyphDocument = createStrokeIcon(
  "GlyphDocument",
  <>
    <path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9Z" />
    <path d="M13.5 3.5V9H19" />
    <path d="M8.5 13h7M8.5 16.5h5" />
  </>,
);

export const GlyphLicence = createStrokeIcon(
  "GlyphLicence",
  <>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="11" r="2.1" />
    <path d="M5.9 16.2a3.6 3.6 0 0 1 6.2 0M14.5 9.8h3.4M14.5 13.4h3.4" />
  </>,
);

export const GlyphSubscription = createStrokeIcon(
  "GlyphSubscription",
  <>
    <path d="M20.2 11.4a8.2 8.2 0 1 0-.6 4.4" />
    <path d="M20.4 10.2v3.5h-3.5" />
    <path d="M12 8v4.4l2.8 1.7" />
  </>,
);

export const GlyphBriefcase = createStrokeIcon(
  "GlyphBriefcase",
  <>
    <rect x="3" y="7.5" width="18" height="12" rx="2" />
    <path d="M9 7.5V5.8a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 5.8v1.7" />
    <path d="M3 12.5h18M10.6 12.5v1.8h2.8v-1.8" />
  </>,
);

export const GlyphPresentation = createStrokeIcon(
  "GlyphPresentation",
  <>
    <rect x="3.5" y="4" width="17" height="11" rx="1.6" />
    <path d="M12 15v3.2M8.6 20.2 12 18.2l3.4 2" />
    <path d="M8 11.6V9M12 11.6V7.4M16 11.6v-1.8" />
  </>,
);

export const GlyphChart = createStrokeIcon(
  "GlyphChart",
  <>
    <path d="M4 4v15.2a.8.8 0 0 0 .8.8H20" />
    <path d="m7.5 15.5 3.4-4.2 3 2.6 4.1-5.4" />
  </>,
);

export const GlyphHandshake = createStrokeIcon(
  "GlyphHandshake",
  <>
    <path d="M3 9.5 6.5 7l4.2 1.8L9 10.6a1.6 1.6 0 0 0 2.2 2.3l1.5-1.3 4.3 3.6" />
    <path d="M21 9.5 17.5 7l-3.1 1.3" />
    <path d="M3 9.5v5.2l2.6 2.1M21 9.5v5.2l-2.6 2.1" />
  </>,
);

export const GlyphAward = createStrokeIcon(
  "GlyphAward",
  <>
    <circle cx="12" cy="9" r="5.5" />
    <path d="m8.6 13.6-1.4 6.4 4.8-2.6 4.8 2.6-1.4-6.4" />
  </>,
);

export const GlyphFinance = createStrokeIcon(
  "GlyphFinance",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M14.6 9.2a3 3 0 0 0-2.6-1.3c-1.5 0-2.6.9-2.6 2.1 0 2.9 5.4 1.5 5.4 4.3 0 1.3-1.2 2.2-2.8 2.2a3.2 3.2 0 0 1-2.8-1.5" />
    <path d="M12 6.2v11.6" />
  </>,
);

export const GlyphSavings = createStrokeIcon(
  "GlyphSavings",
  <>
    <path d="M4 12.6a5.6 5.6 0 0 1 5.6-5.6h3.2a5.6 5.6 0 0 1 5.5 4.5l2.2 1.1v3l-2.4.5a5.6 5.6 0 0 1-2.3 2.6V20h-3v-1.4h-3.2V20h-3v-1.9A5.6 5.6 0 0 1 4 13.6Z" />
    <path d="M9.6 7a3.1 3.1 0 0 1 4.6-3M16 12.4h.01" />
  </>,
);

export const GlyphReceipt = createStrokeIcon(
  "GlyphReceipt",
  <>
    <path d="M5.5 3.5h13v17l-2.2-1.5-2.2 1.5-2.1-1.5-2.2 1.5-2.2-1.5-2.1 1.5Z" />
    <path d="M9 8.5h6M9 12.5h6" />
  </>,
);

export const GlyphBank = createStrokeIcon(
  "GlyphBank",
  <>
    <path d="M3.5 9.5 12 4.5l8.5 5" />
    <path d="M5.5 9.5v8M9.8 9.5v8M14.2 9.5v8M18.5 9.5v8" />
    <path d="M3.5 20h17" />
  </>,
);

/* -------------------------------------------------------------------------- */
/* Home and property                                                          */
/* -------------------------------------------------------------------------- */

export const GlyphProperty = createStrokeIcon(
  "GlyphProperty",
  <>
    <path d="m3.5 10.8 8.5-6.6 8.5 6.6" />
    <path d="M5.8 9.4V19a1 1 0 0 0 1 1h10.4a1 1 0 0 0 1-1V9.4" />
    <path d="M10 20v-5.4h4V20" />
  </>,
);

export const GlyphAppliance = createStrokeIcon(
  "GlyphAppliance",
  <>
    <rect x="5" y="3.5" width="14" height="17" rx="2" />
    <path d="M5 8.5h14" />
    <circle cx="12" cy="14.6" r="3.4" />
    <path d="M8 6h2.5" />
  </>,
);

export const GlyphElectronics = createStrokeIcon(
  "GlyphElectronics",
  <>
    <rect x="6.5" y="2.8" width="11" height="18.4" rx="2.2" />
    <path d="M10.6 5.6h2.8M12 18.2h.01" />
  </>,
);

export const GlyphFurniture = createStrokeIcon(
  "GlyphFurniture",
  <>
    <path d="M4 11.5V8a1.8 1.8 0 0 1 1.8-1.8h12.4A1.8 1.8 0 0 1 20 8v3.5" />
    <path d="M3 15.4a2.2 2.2 0 0 1 2.2-2.2h13.6a2.2 2.2 0 0 1 2.2 2.2V18H3Z" />
    <path d="M5 18v2M19 18v2" />
  </>,
);

export const GlyphCleaning = createStrokeIcon(
  "GlyphCleaning",
  <>
    <path d="m14.4 3.6 5.5 5.5-3.1 3.1-5.5-5.5Z" />
    <path d="m11.3 6.7-6 6L4 20l7.3-1.3 6-6" />
    <path d="m8.3 9.7 5.5 5.5" />
  </>,
);

export const GlyphKey = createStrokeIcon(
  "GlyphKey",
  <>
    <circle cx="7.8" cy="16.2" r="3.8" />
    <path d="m10.5 13.5 8-8M16.2 7.8l2.2 2.2M18.6 5.4l2.2 2.2" />
  </>,
);

export const GlyphGarden = createStrokeIcon(
  "GlyphGarden",
  <>
    <path d="M12 20.5V11" />
    <path d="M12 12.5C8.5 12.5 6 10.4 6 6.4c4 0 6 2.2 6 6.1Z" />
    <path d="M12 15c3.5 0 6-2 6-6-4 0-6 2.1-6 6Z" />
  </>,
);

export const GlyphPlant = createStrokeIcon(
  "GlyphPlant",
  <>
    <path d="M6.5 14h11l-1 6.5h-9Z" />
    <path d="M12 14V8.5" />
    <path d="M12 10.5c-2.6 0-4.2-1.6-4.2-4.4 2.8 0 4.2 1.5 4.2 4.4Z" />
    <path d="M12 9.5c2.4 0 3.8-1.4 3.8-4-2.6 0-3.8 1.4-3.8 4Z" />
  </>,
);

/* -------------------------------------------------------------------------- */
/* Health and fitness                                                         */
/* -------------------------------------------------------------------------- */

export const GlyphHeart = createStrokeIcon(
  "GlyphHeart",
  <path d="M12 20.2 4.9 13.3a4.7 4.7 0 0 1 0-6.7 4.7 4.7 0 0 1 6.6 0l.5.5.5-.5a4.7 4.7 0 0 1 6.6 0 4.7 4.7 0 0 1 0 6.7Z" />,
);

export const GlyphFitness = createStrokeIcon(
  "GlyphFitness",
  <>
    <path d="M8 8v8M5.2 10v4M16 8v8M18.8 10v4" />
    <path d="M8 12h8M2.8 11.4v1.2M21.2 11.4v1.2" />
  </>,
);

export const GlyphRunning = createStrokeIcon(
  "GlyphRunning",
  <>
    <circle cx="15.4" cy="5" r="2.1" />
    <path d="m6 20 2.6-4.4 3-1.6-1.1-4 -3.3 2L6 15" />
    <path d="m11.6 14 3.2 2 .9 4M12.5 10l4.4-1.6 3.1 2.6" />
  </>,
);

export const GlyphCycling = createStrokeIcon(
  "GlyphCycling",
  <>
    <circle cx="5.6" cy="16.4" r="3.6" />
    <circle cx="18.4" cy="16.4" r="3.6" />
    <path d="m5.6 16.4 4-6.4h4.6l3.4 6.4" />
    <path d="M9.6 10 8.4 7h3.4M14.2 10l1.6-3" />
  </>,
);

export const GlyphSwimming = createStrokeIcon(
  "GlyphSwimming",
  <>
    <circle cx="17" cy="7.4" r="1.8" />
    <path d="m4 12.6 4.6-3.4 3.6 2.6-2.4 2" />
    <path d="M3 17.4c1.6 0 1.6 1.4 3.2 1.4s1.6-1.4 3.2-1.4 1.6 1.4 3.2 1.4 1.6-1.4 3.2-1.4 1.6 1.4 3.2 1.4 1.6-1.4 3-1.4" />
  </>,
);

export const GlyphYoga = createStrokeIcon(
  "GlyphYoga",
  <>
    <circle cx="12" cy="4.8" r="2.1" />
    <path d="M12 8.2v5.4" />
    <path d="m12 13.6-4.6 3.2M12 13.6l4.6 3.2" />
    <path d="M3.6 19.6h16.8" />
    <path d="m7.4 16.8-3.2 2.8M16.6 16.8l3.2 2.8" />
  </>,
);

export const GlyphSleep = createStrokeIcon(
  "GlyphSleep",
  <>
    <path d="M20 14.4A8.2 8.2 0 0 1 9.6 4a8.4 8.4 0 1 0 10.4 10.4Z" />
    <path d="M14.6 4.2h3.6l-3.6 3.8h3.6" />
  </>,
);

export const GlyphNutrition = createStrokeIcon(
  "GlyphNutrition",
  <>
    <path d="M12 8.4c-1-1.4-2.4-2-3.9-2C5.8 6.4 4 8.6 4 12c0 4.4 4 8.4 5.8 8.4 1 0 1.5-.5 2.2-.5s1.2.5 2.2.5C16 20.4 20 16.4 20 12c0-3.4-1.8-5.6-4.1-5.6-1.5 0-2.9.6-3.9 2Z" />
    <path d="M12 6.4c0-1.9 1.3-3.3 3.2-3.4" />
  </>,
);

export const GlyphMedical = createStrokeIcon(
  "GlyphMedical",
  <>
    <path d="M4 8.4a1.6 1.6 0 0 1 1.6-1.6h12.8A1.6 1.6 0 0 1 20 8.4v9.2a1.6 1.6 0 0 1-1.6 1.6H5.6A1.6 1.6 0 0 1 4 17.6Z" />
    <path d="M9 6.8V5.6a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 5.6v1.2" />
    <path d="M12 10.6v5.4M9.3 13.3h5.4" />
  </>,
);

/* -------------------------------------------------------------------------- */
/* Technology and making                                                      */
/* -------------------------------------------------------------------------- */

export const GlyphSoftware = createStrokeIcon(
  "GlyphSoftware",
  <>
    <rect x="3" y="4.5" width="18" height="15" rx="2" />
    <path d="M3 9h18" />
    <path d="m8.6 12.6-1.8 2 1.8 2M15.4 12.6l1.8 2-1.8 2M12.8 12.2l-1.6 4.8" />
  </>,
);

export const GlyphEquipment = createStrokeIcon(
  "GlyphEquipment",
  <>
    <circle cx="12" cy="12" r="3.1" />
    <path d="M12 3.4v2.6M12 18v2.6M3.4 12H6M18 12h2.6M5.9 5.9l1.9 1.9M16.2 16.2l1.9 1.9M18.1 5.9l-1.9 1.9M7.8 16.2l-1.9 1.9" />
  </>,
);

export const GlyphTool = createStrokeIcon(
  "GlyphTool",
  <path d="M15.2 3.6a5.2 5.2 0 0 0-4.4 8.8L4 19.2 5.9 21l6.7-6.7a5.2 5.2 0 0 0 6.5-7.1l-2.9 2.9-2.6-.7-.7-2.6Z" />,
);

export const GlyphMonitor = createStrokeIcon(
  "GlyphMonitor",
  <>
    <rect x="2.8" y="4" width="18.4" height="12.4" rx="2" />
    <path d="M12 16.4V20M8.4 20h7.2" />
  </>,
);

export const GlyphServer = createStrokeIcon(
  "GlyphServer",
  <>
    <rect x="3.5" y="3.8" width="17" height="6.4" rx="1.6" />
    <rect x="3.5" y="13.8" width="17" height="6.4" rx="1.6" />
    <path d="M7 7h.01M7 17h.01M11 7h4M11 17h4" />
  </>,
);

export const GlyphCamera = createStrokeIcon(
  "GlyphCamera",
  <>
    <path d="M3 8.8a1.8 1.8 0 0 1 1.8-1.8h2.6l1.4-2.4h6.4L16.6 7h2.6A1.8 1.8 0 0 1 21 8.8v9a1.8 1.8 0 0 1-1.8 1.8H4.8A1.8 1.8 0 0 1 3 17.8Z" />
    <circle cx="12" cy="13" r="3.6" />
  </>,
);

export const GlyphRobot = createStrokeIcon(
  "GlyphRobot",
  <>
    <rect x="4.5" y="8" width="15" height="11" rx="2.4" />
    <path d="M12 4.2V8M2.6 12.4v2.6M21.4 12.4v2.6" />
    <circle cx="12" cy="3.4" r="1.1" />
    <path d="M9.4 12.2h.01M14.6 12.2h.01M9.8 15.6h4.4" />
  </>,
);

export const GlyphRocket = createStrokeIcon(
  "GlyphRocket",
  <>
    <path d="M12 2.8c3 2.3 4.6 5.6 4.6 9.2l-1.7 4.4H9.1L7.4 12c0-3.6 1.6-6.9 4.6-9.2Z" />
    <path d="M9.1 11.2 5.6 14v3.4l2.8-1.6M14.9 11.2 18.4 14v3.4l-2.8-1.6" />
    <circle cx="12" cy="9.6" r="1.7" />
    <path d="M10.6 19.2 12 21.4l1.4-2.2" />
  </>,
);

/* -------------------------------------------------------------------------- */
/* People                                                                     */
/* -------------------------------------------------------------------------- */

export const GlyphPerson = createStrokeIcon(
  "GlyphPerson",
  <>
    <circle cx="12" cy="8" r="3.8" />
    <path d="M4.8 20.2a7.4 7.4 0 0 1 14.4 0" />
  </>,
);

export const GlyphChat = createStrokeIcon(
  "GlyphChat",
  <path d="M20.5 12.4c0 4-3.8 7.2-8.5 7.2a9.9 9.9 0 0 1-2.7-.4l-5.8 1.6 1.7-4.3a6.8 6.8 0 0 1-1.7-4.4c0-4 3.8-7.2 8.5-7.2s8.5 3.2 8.5 7.2Z" />,
);

export const GlyphMeeting = createStrokeIcon(
  "GlyphMeeting",
  <>
    <circle cx="8.6" cy="8.4" r="3.1" />
    <circle cx="16.4" cy="9.4" r="2.4" />
    <path d="M2.8 18.6a6 6 0 0 1 11.6 0M16 13.4a5.2 5.2 0 0 1 5.2 4.6" />
  </>,
);

export const GlyphBaby = createStrokeIcon(
  "GlyphBaby",
  <>
    <circle cx="12" cy="11.4" r="7.6" />
    <path d="M9.2 10.2h.01M14.8 10.2h.01" />
    <path d="M9.6 14.6a3.4 3.4 0 0 0 4.8 0" />
    <path d="M9.4 4.4a3 3 0 0 1 5.2 0" />
  </>,
);

export const GlyphRing = createStrokeIcon(
  "GlyphRing",
  <>
    <circle cx="12" cy="14.8" r="5.4" />
    <path d="m8.9 10.2 3.1-4.6 3.1 4.6" />
    <path d="M9.2 5.6h5.6" />
  </>,
);

/* -------------------------------------------------------------------------- */
/* Learning and thinking                                                      */
/* -------------------------------------------------------------------------- */

export const GlyphNote = createStrokeIcon(
  "GlyphNote",
  <>
    <path d="M5 5.4a1.9 1.9 0 0 1 1.9-1.9h10.2A1.9 1.9 0 0 1 19 5.4v13.2a1.9 1.9 0 0 1-1.9 1.9H6.9A1.9 1.9 0 0 1 5 18.6Z" />
    <path d="M8.4 8.4h7.2M8.4 12h7.2M8.4 15.6h4.2" />
  </>,
);

export const GlyphIdea = createStrokeIcon(
  "GlyphIdea",
  <>
    <path d="M8.4 14.6a5.6 5.6 0 1 1 7.2 0c-.8.7-1.2 1.5-1.2 2.4H9.6c0-.9-.4-1.7-1.2-2.4Z" />
    <path d="M9.8 19.4h4.4M10.4 21.4h3.2" />
  </>,
);

export const GlyphDecision = createStrokeIcon(
  "GlyphDecision",
  <>
    <path d="M12 20.4V13l-5.4-4.6" />
    <path d="M12 13l5.4-4.6" />
    <circle cx="5.2" cy="6.4" r="2.4" />
    <circle cx="18.8" cy="6.4" r="2.4" />
    <circle cx="12" cy="20.4" r="1.4" />
  </>,
);

export const GlyphObservation = createStrokeIcon(
  "GlyphObservation",
  <>
    <path d="M2.6 12S6 6.2 12 6.2 21.4 12 21.4 12 18 17.8 12 17.8 2.6 12 2.6 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </>,
);

export const GlyphReflection = createStrokeIcon(
  "GlyphReflection",
  <>
    <path d="M4.2 11.4A7.8 7.8 0 1 1 7.6 18l-3.4 1 1-3.4" />
    <path d="M12 8v4.4l2.8 1.6" />
  </>,
);

export const GlyphDiary = createStrokeIcon(
  "GlyphDiary",
  <>
    <path d="M5.6 4.6A1.6 1.6 0 0 1 7.2 3h10.2a1.4 1.4 0 0 1 1.4 1.4v15.2a1.4 1.4 0 0 1-1.4 1.4H7.2a1.6 1.6 0 0 1-1.6-1.6Z" />
    <path d="M5.6 17.2h13.2" />
    <path d="M9.4 7.2h5.6" />
  </>,
);

export const GlyphReview = createStrokeIcon(
  "GlyphReview",
  <>
    <rect x="3.6" y="4.6" width="16.8" height="15.8" rx="2" />
    <path d="M3.6 9h16.8M8.2 2.8v3.6M15.8 2.8v3.6" />
    <path d="m8.8 14.4 2 2 4.4-4.4" />
  </>,
);

export const GlyphBook = createStrokeIcon(
  "GlyphBook",
  <>
    <path d="M4 5.2A1.6 1.6 0 0 1 5.6 3.6h4.2A2.2 2.2 0 0 1 12 5.8v13a2 2 0 0 0-2-2H4Z" />
    <path d="M20 5.2a1.6 1.6 0 0 0-1.6-1.6h-4.2A2.2 2.2 0 0 0 12 5.8v13a2 2 0 0 1 2-2h6Z" />
  </>,
);

export const GlyphGraduation = createStrokeIcon(
  "GlyphGraduation",
  <>
    <path d="M2.6 9 12 4.6 21.4 9 12 13.4Z" />
    <path d="M6.6 11v4.6c0 1.6 2.4 2.8 5.4 2.8s5.4-1.2 5.4-2.8V11" />
    <path d="M21.4 9v5" />
  </>,
);

export const GlyphLanguage = createStrokeIcon(
  "GlyphLanguage",
  <>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M3.6 12h16.8" />
    <path d="M12 3.4c2.2 2.4 3.4 5.4 3.4 8.6s-1.2 6.2-3.4 8.6c-2.2-2.4-3.4-5.4-3.4-8.6S9.8 5.8 12 3.4Z" />
  </>,
);

export const GlyphScience = createStrokeIcon(
  "GlyphScience",
  <>
    <path d="M9.6 3.4v6L4.4 18a1.8 1.8 0 0 0 1.5 2.8h12.2a1.8 1.8 0 0 0 1.5-2.8l-5.2-8.6v-6" />
    <path d="M8.4 3.4h7.2M7.2 14.6h9.6" />
  </>,
);

export const GlyphPuzzle = createStrokeIcon(
  "GlyphPuzzle",
  <path d="M10.2 3.4a2 2 0 0 1 3.6 0c.3.6.2 1.3-.2 1.9h3.6a1.4 1.4 0 0 1 1.4 1.4v3.6c.6-.4 1.3-.5 1.9-.2a2 2 0 0 1 0 3.6c-.6.3-1.3.2-1.9-.2v3.6a1.4 1.4 0 0 1-1.4 1.4h-3.6c.4-.6.5-1.3.2-1.9a2 2 0 0 0-3.6 0c-.3.6-.2 1.3.2 1.9H6.8a1.4 1.4 0 0 1-1.4-1.4v-3.6c-.6.4-1.3.5-1.9.2a2 2 0 0 1 0-3.6c.6-.3 1.3-.2 1.9.2V6.7a1.4 1.4 0 0 1 1.4-1.4h3.6c-.4-.6-.5-1.3-.2-1.9Z" />,
);

/* -------------------------------------------------------------------------- */
/* Life and leisure                                                           */
/* -------------------------------------------------------------------------- */

export const GlyphMusic = createStrokeIcon(
  "GlyphMusic",
  <>
    <path d="M9.4 17.6V5.6l9.2-2v12" />
    <circle cx="6.6" cy="17.6" r="2.8" />
    <circle cx="15.8" cy="15.6" r="2.8" />
  </>,
);

export const GlyphGuitar = createStrokeIcon(
  "GlyphGuitar",
  <>
    <path d="m20.6 3.4-4.4 4.4" />
    <path d="m17.4 6.6-5.2 5.2" />
    <path d="M12.2 11.8a4 4 0 0 0-5.6 0 3.4 3.4 0 0 0-.6 4 3.4 3.4 0 0 1-.6 4 3.6 3.6 0 0 0 5.1 5.1h.01" />
    <circle cx="9.4" cy="14.6" r="1.2" />
  </>,
);

export const GlyphFilm = createStrokeIcon(
  "GlyphFilm",
  <>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="M7.4 5v14M16.6 5v14M3 12h18M3 8.5h4.4M3 15.5h4.4M16.6 8.5H21M16.6 15.5H21" />
  </>,
);

export const GlyphGame = createStrokeIcon(
  "GlyphGame",
  <>
    <path d="M7.6 7.4h8.8a4.6 4.6 0 0 1 4.5 3.7l.7 3.6a2.6 2.6 0 0 1-4.7 2l-1.3-1.9H8.4l-1.3 1.9a2.6 2.6 0 0 1-4.7-2l.7-3.6a4.6 4.6 0 0 1 4.5-3.7Z" />
    <path d="M7.2 11.2v2.4M6 12.4h2.4M16 11.6h.01M18 13.4h.01" />
  </>,
);

export const GlyphArt = createStrokeIcon(
  "GlyphArt",
  <>
    <path d="M12 3.4a8.6 8.6 0 0 0 0 17.2c1.4 0 2.2-.9 2.2-2 0-.6-.2-1-.6-1.4a1.9 1.9 0 0 1 1.4-3.2h2A5.6 5.6 0 0 0 20.6 8C19.9 5.4 16.4 3.4 12 3.4Z" />
    <path d="M7.6 11.4h.01M10.4 7.8h.01M14.4 7.8h.01M17 11.2h.01" />
  </>,
);

export const GlyphGift = createStrokeIcon(
  "GlyphGift",
  <>
    <rect x="3.4" y="8.4" width="17.2" height="4" rx="1" />
    <path d="M5 12.4v6.4a1.6 1.6 0 0 0 1.6 1.6h10.8a1.6 1.6 0 0 0 1.6-1.6v-6.4" />
    <path d="M12 8.4v12" />
    <path d="M12 8.4H8.2a2.4 2.4 0 1 1 0-4.8c2.4 0 3.8 4.8 3.8 4.8Zm0 0h3.8a2.4 2.4 0 1 0 0-4.8C13.4 3.6 12 8.4 12 8.4Z" />
  </>,
);

export const GlyphCelebration = createStrokeIcon(
  "GlyphCelebration",
  <>
    <path d="m3 21 4.4-11.6 7.2 7.2Z" />
    <path d="M13 3.4v2.2M18.4 5.6l-1.6 1.6M20.6 11h-2.2" />
    <path d="M11.4 8.4a3.8 3.8 0 0 1 4.2-1M15.6 12.6a3.8 3.8 0 0 1 1-4.2" />
  </>,
);

export const GlyphCoffee = createStrokeIcon(
  "GlyphCoffee",
  <>
    <path d="M4 9.4h13v6.2a4.4 4.4 0 0 1-4.4 4.4H8.4A4.4 4.4 0 0 1 4 15.6Z" />
    <path d="M17 11h1.4a2.6 2.6 0 0 1 0 5.2H17" />
    <path d="M8 6.4V4.2M12 6.4V4.2" />
  </>,
);

export const GlyphFood = createStrokeIcon(
  "GlyphFood",
  <>
    <path d="M6.6 3.4v8.2a2.4 2.4 0 0 0 4.8 0V3.4M9 3.4v6" />
    <path d="M9 14v6.6" />
    <path d="M17.2 3.4c-1.6 1.4-2.4 3.4-2.4 5.8 0 1.8.8 2.8 2.4 3v8.4" />
  </>,
);

export const GlyphWine = createStrokeIcon(
  "GlyphWine",
  <>
    <path d="M7.4 3.4h9.2l-.7 6.2a4.1 4.1 0 0 1-8.2 0Z" />
    <path d="M12 14v6.6M8.6 20.6h6.8" />
  </>,
);

export const GlyphPaw = createStrokeIcon(
  "GlyphPaw",
  <>
    <ellipse cx="6.6" cy="10.6" rx="2.1" ry="2.6" />
    <ellipse cx="17.4" cy="10.6" rx="2.1" ry="2.6" />
    <ellipse cx="10.2" cy="5.8" rx="2" ry="2.5" />
    <ellipse cx="13.8" cy="5.8" rx="2" ry="2.5" />
    <path d="M12 12.4c2.6 0 4.8 2 4.8 4.4 0 2-1.4 3.2-3 3.2-.9 0-1.3-.4-1.8-.4s-.9.4-1.8.4c-1.6 0-3-1.2-3-3.2 0-2.4 2.2-4.4 4.8-4.4Z" />
  </>,
);

/* -------------------------------------------------------------------------- */
/* Travel and outdoors                                                        */
/* -------------------------------------------------------------------------- */

export const GlyphTravel = createStrokeIcon(
  "GlyphTravel",
  <>
    <rect x="3" y="7.4" width="18" height="12.2" rx="2" />
    <path d="M8.6 7.4V5.6a1.8 1.8 0 0 1 1.8-1.8h3.2a1.8 1.8 0 0 1 1.8 1.8v1.8" />
    <path d="M3 13h18" />
  </>,
);

export const GlyphVehicle = createStrokeIcon(
  "GlyphVehicle",
  <>
    <path d="M2.6 15.4V9.6h9.6v5.8" />
    <path d="M12.2 11h3.6l3.6 3v1.4" />
    <path d="M2.6 15.4h1.6M9 15.4h4.6M18 15.4h3.4V13" />
    <circle cx="6.6" cy="16.6" r="2.2" />
    <circle cx="15.8" cy="16.6" r="2.2" />
  </>,
);

export const GlyphTrailer = createStrokeIcon(
  "GlyphTrailer",
  <>
    <path d="M3.4 15.6V9a2 2 0 0 1 2-2h9.8a2 2 0 0 1 1.7 1l3.7 6v1.6" />
    <path d="M3.4 15.6h2M9.8 15.6h9.4" />
    <circle cx="7.6" cy="16.8" r="2.2" />
    <path d="M6.4 10.4h5.2v3H6.4Z" />
  </>,
);

export const GlyphPlane = createStrokeIcon(
  "GlyphPlane",
  <path d="M10.4 12.6 3 10.4l1.6-2 5.8.9 3.6-3.7c1-1 2.6-1.2 3.4-.4.8.8.6 2.4-.4 3.4l-3.7 3.6.9 5.8-2 1.6Z" />,
);

export const GlyphMap = createStrokeIcon(
  "GlyphMap",
  <>
    <path d="m3 6.4 6-2.4 6 2.4 6-2.4v13.6l-6 2.4-6-2.4-6 2.4Z" />
    <path d="M9 4v14M15 6.4v13.6" />
  </>,
);

export const GlyphCompass = createStrokeIcon(
  "GlyphCompass",
  <>
    <circle cx="12" cy="12" r="8.6" />
    <path d="m15.6 8.4-2 5.2-5.2 2 2-5.2Z" />
  </>,
);

export const GlyphCamping = createStrokeIcon(
  "GlyphCamping",
  <>
    <path d="m12 4 8.6 15.8H3.4Z" />
    <path d="m12 10.6 5 9.2H7Z" />
  </>,
);

export const GlyphHiking = createStrokeIcon(
  "GlyphHiking",
  <>
    <circle cx="13.6" cy="4.8" r="2" />
    <path d="m10 20.4 1.4-5.2-2.4-2.2.8-4.2 3.4-1.2 2.4 3.4 2.8.8" />
    <path d="m13 15.2 2 1.8.8 3.4" />
    <path d="M6 3.6v16.8" />
  </>,
);

export const GlyphBeach = createStrokeIcon(
  "GlyphBeach",
  <>
    <path d="M3 12.6a9.6 9.6 0 0 1 18 0Z" />
    <path d="M12 12.6v8M12 20.6c-1.6 0-1.6-1.4-3.2-1.4M12 20.6c1.6 0 1.6-1.4 3.2-1.4" />
    <path d="M3.4 20.6h1.6M19 20.6h1.6" />
  </>,
);

export const GlyphMountain = createStrokeIcon(
  "GlyphMountain",
  <>
    <path d="m2.6 19.4 6.4-11 4 6.4 2.2-3.4 6.2 8Z" />
    <path d="m6.4 12.8 2.6-1.4 2.4 1.4" />
  </>,
);

/* -------------------------------------------------------------------------- */
/* Time and nature                                                            */
/* -------------------------------------------------------------------------- */

export const GlyphCalendar = createStrokeIcon(
  "GlyphCalendar",
  <>
    <rect x="3.4" y="4.6" width="17.2" height="16" rx="2" />
    <path d="M3.4 9.4h17.2M8.2 2.8v3.6M15.8 2.8v3.6" />
  </>,
);

export const GlyphToday = createStrokeIcon(
  "GlyphToday",
  <>
    <rect x="3.4" y="4.6" width="17.2" height="16" rx="2" />
    <path d="M3.4 9.4h17.2M8.2 2.8v3.6M15.8 2.8v3.6" />
    <circle cx="12" cy="15" r="2.2" />
  </>,
);

export const GlyphClock = createStrokeIcon(
  "GlyphClock",
  <>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M12 6.8V12l3.4 2" />
  </>,
);

export const GlyphSun = createStrokeIcon(
  "GlyphSun",
  <>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7" />
  </>,
);

export const GlyphMoon = createStrokeIcon(
  "GlyphMoon",
  <path d="M20.4 14.6A8.4 8.4 0 0 1 9.4 3.6a8.6 8.6 0 1 0 11 11Z" />,
);

export const GlyphStar = createStrokeIcon(
  "GlyphStar",
  <path d="m12 3.4 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17.4l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9Z" />,
);

export const GlyphLeaf = createStrokeIcon(
  "GlyphLeaf",
  <>
    <path d="M20.4 3.6C11.2 3.6 5 7.4 5 14.2a6.2 6.2 0 0 0 1.6 4.2C10.6 14 14.4 12 20.4 3.6Z" />
    <path d="M4 20.4c1-3 2.4-5.4 4.2-7.4" />
  </>,
);

export const GlyphFire = createStrokeIcon(
  "GlyphFire",
  <>
    <path d="M12 2.6c3.4 3.4 6.4 6.4 6.4 10.6a6.4 6.4 0 1 1-12.8 0c0-2.2 1-4 2.4-5.6.6 1.2 1.4 2 2.2 2.2C10 7.4 10.6 4.8 12 2.6Z" />
    <path d="M12 20a3.2 3.2 0 0 1-1.8-5.8c.4 1 1 1.6 1.8 2 .8-1 1.2-2 1.2-3.2A3.2 3.2 0 0 1 12 20Z" />
  </>,
);

export const GlyphWater = createStrokeIcon(
  "GlyphWater",
  <path d="M12 3.4c3.4 4.2 6.2 7.6 6.2 10.8A6.2 6.2 0 0 1 5.8 14.2C5.8 11 8.6 7.6 12 3.4Z" />,
);

export const GlyphLightning = createStrokeIcon(
  "GlyphLightning",
  <path d="M13.4 2.6 5 13.4h5.6L10.6 21.4 19 10.6h-5.6Z" />,
);

export const GlyphGlobe = createStrokeIcon(
  "GlyphGlobe",
  <>
    <circle cx="12" cy="12" r="8.6" />
    <path d="M3.4 12h17.2" />
    <path d="M12 3.4c2.2 2.4 3.4 5.4 3.4 8.6s-1.2 6.2-3.4 8.6c-2.2-2.4-3.4-5.4-3.4-8.6S9.8 5.8 12 3.4Z" />
    <path d="M5.4 6.8a12 12 0 0 0 13.2 0M5.4 17.2a12 12 0 0 1 13.2 0" />
  </>,
);

export const GlyphFlag = createStrokeIcon(
  "GlyphFlag",
  <>
    <path d="M5.4 14.4c3.6-2.4 7.2 2.4 10.8 0V4.6c-3.6 2.4-7.2-2.4-10.8 0Z" />
    <path d="M5.4 21V3.4" />
  </>,
);

export const GlyphAnchor = createStrokeIcon(
  "GlyphAnchor",
  <>
    <circle cx="12" cy="5.4" r="2.4" />
    <path d="M12 7.8v12.8" />
    <path d="M7.6 10.4h8.8" />
    <path d="M20.4 13.6a8.4 8.4 0 0 1-16.8 0" />
  </>,
);

export const GlyphShield = createStrokeIcon(
  "GlyphShield",
  <path d="M12 3.2 4.6 6.2v6c0 4.2 3 7.4 7.4 8.6 4.4-1.2 7.4-4.4 7.4-8.6v-6Z" />,
);

export const GlyphLock = createStrokeIcon(
  "GlyphLock",
  <>
    <rect x="4.6" y="10.4" width="14.8" height="10" rx="2" />
    <path d="M8 10.4V7.6a4 4 0 0 1 8 0v2.8" />
    <path d="M12 14.2v2.6" />
  </>,
);

export const GlyphBell = createStrokeIcon(
  "GlyphBell",
  <>
    <path d="M6 17.4V11a6 6 0 1 1 12 0v6.4l1.8 2.2H4.2Z" />
    <path d="M10 19.6a2.2 2.2 0 0 0 4 0" />
  </>,
);

/* -------------------------------------------------------------------------- */
/* The entity DEFAULTS                                                        */
/* -------------------------------------------------------------------------- */

/*
 * A record that has chosen NO icon still lands inside an identity tile, and
 * until IDENTITY-01 it landed there wearing the application frame's Material
 * Symbol for its type. On a page where some records had chosen and some had not,
 * that put two idioms side by side in one grid — a stroked heart beside a filled
 * layers glyph — which is exactly the "filled straggler" the pass exists to
 * remove. It was the most visible remaining tell.
 *
 * So each entity type gets a default in THIS set too. `EntityIcon` keeps the
 * Material Symbol for the places a TYPE is the whole story (the navigation rail,
 * an empty state, a menu); `RecordIcon` resolves through here, because a record
 * inside its own tile is a different question.
 */

/** Area — stacked layers: a permanent domain of life. */
export const GlyphAreaDefault = createStrokeIcon(
  "GlyphAreaDefault",
  <>
    <path d="m3.4 8.2 8.6-4.4 8.6 4.4-8.6 4.4Z" />
    <path d="m3.4 12.6 8.6 4.4 8.6-4.4M3.4 16.6 12 21l8.6-4.4" />
  </>,
);

/** Goal — a flag planted at a desired outcome. */
export const GlyphGoalDefault = createStrokeIcon(
  "GlyphGoalDefault",
  <>
    <path d="M5.6 14.2c3.6-2.4 7.2 2.4 10.8 0V4.4c-3.6 2.4-7.2-2.4-10.8 0Z" />
    <path d="M5.6 21V3.2" />
  </>,
);

/** Project — a folder of finite work. Shares the `folder` key's geometry. */
export const GlyphProjectDefault = createStrokeIcon(
  "GlyphProjectDefault",
  <path d="M3 7a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
);

/** Task — a checked circle: an atomic action. */
export const GlyphTaskDefault = createStrokeIcon(
  "GlyphTaskDefault",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </>,
);

/** Note — a page with lines on it. */
export const GlyphNoteDefault = createStrokeIcon(
  "GlyphNoteDefault",
  <>
    <path d="M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9Z" />
    <path d="M13.5 3.5V9H19M8.5 13h7M8.5 16.5h5" />
  </>,
);

/** Meeting — people together. */
export const GlyphMeetingDefault = createStrokeIcon(
  "GlyphMeetingDefault",
  <>
    <circle cx="8.6" cy="8.4" r="3.1" />
    <circle cx="16.4" cy="9.4" r="2.4" />
    <path d="M2.8 18.6a6 6 0 0 1 11.6 0M16 13.4a5.2 5.2 0 0 1 5.2 4.6" />
  </>,
);

/** Person — one figure. */
export const GlyphPersonDefault = createStrokeIcon(
  "GlyphPersonDefault",
  <>
    <circle cx="12" cy="8" r="3.8" />
    <path d="M4.8 20.2a7.4 7.4 0 0 1 14.4 0" />
  </>,
);

/** Asset — a thing owned, in a box. */
export const GlyphAssetDefault = createStrokeIcon(
  "GlyphAssetDefault",
  <>
    <rect x="3.5" y="4.5" width="17" height="4" rx="1.2" />
    <path d="M5 8.5v9.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5M10 12.5h4" />
  </>,
);

/** Diary — a bound book of days. */
export const GlyphDiaryDefault = createStrokeIcon(
  "GlyphDiaryDefault",
  <>
    <path d="M5.6 4.6A1.6 1.6 0 0 1 7.2 3h10.2a1.4 1.4 0 0 1 1.4 1.4v15.2a1.4 1.4 0 0 1-1.4 1.4H7.2a1.6 1.6 0 0 1-1.6-1.6Z" />
    <path d="M5.6 17.2h13.2M9.4 7.2h5.6" />
  </>,
);

/** Review — a calendar with a tick in it. */
export const GlyphReviewDefault = createStrokeIcon(
  "GlyphReviewDefault",
  <>
    <rect x="3.6" y="4.6" width="16.8" height="15.8" rx="2" />
    <path d="M3.6 9h16.8M8.2 2.8v3.6M15.8 2.8v3.6" />
    <path d="m8.8 14.4 2 2 4.4-4.4" />
  </>,
);

/**
 * The default glyph for each entity type, in the identity vocabulary.
 *
 * Keyed by the kernel's `entities.type` slug, exactly as `ENTITY_IDENTITY` is,
 * so the two maps can be read side by side. `RecordIcon` is the only consumer.
 */
export const ENTITY_DEFAULT_GLYPHS = {
  area: GlyphAreaDefault,
  goal: GlyphGoalDefault,
  project: GlyphProjectDefault,
  task: GlyphTaskDefault,
  note: GlyphNoteDefault,
  meeting: GlyphMeetingDefault,
  person: GlyphPersonDefault,
  asset: GlyphAssetDefault,
  diary: GlyphDiaryDefault,
  review: GlyphReviewDefault,
} as const;
