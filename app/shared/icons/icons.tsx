/**
 * M3-01 — the DalyHub icon set: Material Symbols Outlined geometry.
 *
 * Two groups, exactly as before:
 *   - ENTITY icons — one per entity type; consumed only through the
 *     entity-identity map (app/shared/entity), never hand-picked at a call site.
 *   - UI icons — the frame's affordances, record actions, content kinds and
 *     asset kinds.
 *
 * Plus ONE exception: `BrandMark`, the product identity. It is not a Symbols
 * glyph and does not take `currentColor` — see its own note below.
 *
 * ── Why the geometry changed ─────────────────────────────────────────────────
 * PX-02 shipped an in-house outline set drawn in the Lucide idiom, and recorded
 * that the SET was swappable while the entity-identity MAPPING was the durable
 * contract. M3-01 is that swap (ADR-074 decision 7): the design language is now
 * Material Design 3, and its icon library is Material Symbols. Every component
 * NAME, prop and accessibility behaviour below is unchanged, so no call site
 * moved — only the paths inside them.
 *
 * ── Provenance ───────────────────────────────────────────────────────────────
 * Each `d` attribute is the upstream Material Symbols Outlined path, weight 400,
 * copied VERBATIM from `@material-symbols/svg-400@0.45.10` (Apache-2.0, a
 * repackaging of <https://github.com/google/material-design-icons>), retrieved
 * 2026-08-06. They are build-time copied assets, not a dependency — nothing is
 * installed, imported or bundled from that package.
 *
 * Upstream authors them in a 960-unit design space with a flipped origin
 * (`viewBox="0 -960 960 960"`). `Icon.tsx` maps that space into the 24×24
 * viewBox with one transform, in one place, so the numbers here can stay
 * byte-identical to the source and a re-copy is a diff rather than a rewrite.
 * The glyph each component uses is named in its own comment.
 *
 * Each is a tiny tree-shakeable component sharing one accessibility/sizing
 * contract (see Icon.tsx). Add an icon here; never inline a one-off SVG at a
 * call site.
 */

import { createIcon } from "./Icon";

/* -------------------------------------------------------------------------- */
/* Entity icons (one per entity type — consumed via the entity-identity map). */
/* -------------------------------------------------------------------------- */

/** Area — stacked layers (a permanent domain of life). Material Symbols `layers`. */
export const AreaIcon = createIcon(
  "AreaIcon",
  <path d="M480-130 120-410l50-37 310 241 310-241 50 37-360 280Zm0-152L120-562l360-280 360 280-360 280Zm0-301Zm0 225 262-204-262-204-262 204 262 204Z" />,
);

/** Goal — a flag planted at a desired outcome. Material Symbols `flag`. */
export const GoalIcon = createIcon(
  "GoalIcon",
  <path d="M200-120v-680h343l19 86h238v370H544l-18.93-85H260v309h-60Zm300-452Zm95 168h145v-250H511l-19-86H260v251h316l19 85Z" />,
);

/** Project — a folder of finite work. Material Symbols `folder`. */
export const ProjectIcon = createIcon(
  "ProjectIcon",
  <path d="M140-160q-24 0-42-18.5T80-220v-520q0-23 18-41.5t42-18.5h281l60 60h339q23 0 41.5 18.5T880-680v460q0 23-18.5 41.5T820-160H140Zm0-60h680v-460H456l-60-60H140v520Zm0 0v-520 520Z" />,
);

/** Task — a checked circle (an atomic action). Material Symbols `check_circle`. */
export const TaskIcon = createIcon(
  "TaskIcon",
  <path d="m421-298 283-283-46-45-237 237-120-120-45 45 165 166Zm59 218q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-156t86-127Q252-817 325-848.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 82-31.5 155T763-197.5q-54 54.5-127 86T480-80Zm0-60q142 0 241-99.5T820-480q0-142-99-241t-241-99q-141 0-240.5 99T140-480q0 141 99.5 240.5T480-140Zm0-340Z" />,
);

/** Note — a document with text lines. Material Symbols `description`. */
export const NoteIcon = createIcon(
  "NoteIcon",
  <path d="M319-250h322v-60H319v60Zm0-170h322v-60H319v60ZM220-80q-24 0-42-18t-18-42v-680q0-24 18-42t42-18h361l219 219v521q0 24-18 42t-42 18H220Zm331-554v-186H220v680h520v-494H551ZM220-820v186-186 680-680Z" />,
);

/** Meeting — people together. Material Symbols `groups`. */
export const MeetingIcon = createIcon(
  "MeetingIcon",
  <path d="M0-240v-53q0-38.57 41.5-62.78Q83-380 150.38-380q12.16 0 23.39.5t22.23 2.15q-8 17.35-12 35.17-4 17.81-4 37.18v65H0Zm240 0v-65q0-32 17.5-58.5T307-410q32-20 76.5-30t96.5-10q53 0 97.5 10t76.5 30q32 20 49 46.5t17 58.5v65H240Zm540 0v-65q0-19.86-3.5-37.43T765-377.27q11-1.73 22.17-2.23 11.17-.5 22.83-.5 67.5 0 108.75 23.77T960-293v53H780Zm-480-60h360v-6q0-37-50.5-60.5T480-390q-79 0-129.5 23.5T300-305v5ZM149.57-410q-28.57 0-49.07-20.56Q80-451.13 80-480q0-29 20.56-49.5Q121.13-550 150-550q29 0 49.5 20.5t20.5 49.93q0 28.57-20.5 49.07T149.57-410Zm660 0q-28.57 0-49.07-20.56Q740-451.13 740-480q0-29 20.56-49.5Q781.13-550 810-550q29 0 49.5 20.5t20.5 49.93q0 28.57-20.5 49.07T809.57-410ZM480-480q-50 0-85-35t-35-85q0-51 35-85.5t85-34.5q51 0 85.5 34.5T600-600q0 50-34.5 85T480-480Zm.35-60Q506-540 523-557.35t17-43Q540-626 522.85-643t-42.5-17q-25.35 0-42.85 17.15t-17.5 42.5q0 25.35 17.35 42.85t43 17.5ZM480-300Zm0-300Z" />,
);

/** Person — a single person. Material Symbols `person`. */
export const PersonIcon = createIcon(
  "PersonIcon",
  <path d="M372-523q-42-42-42-108t42-108q42-42 108-42t108 42q42 42 42 108t-42 108q-42 42-108 42t-108-42ZM160-160v-94q0-38 19-65t49-41q67-30 128.5-45T480-420q62 0 123 15.5T731-360q31 14 50 41t19 65v94H160Zm60-60h520v-34q0-16-9.5-30.5T707-306q-64-31-117-42.5T480-360q-57 0-111 11.5T252-306q-14 7-23 21.5t-9 30.5v34Zm324.5-346.5Q570-592 570-631t-25.5-64.5Q519-721 480-721t-64.5 25.5Q390-670 390-631t25.5 64.5Q441-541 480-541t64.5-25.5ZM480-631Zm0 411Z" />,
);

/** Asset — a lidded carton (a thing of value). Material Symbols `inventory_2`. */
export const AssetIcon = createIcon(
  "AssetIcon",
  <path d="M180-80q-24.75 0-42.37-17.63Q120-115.25 120-140v-483q-17-6-28.5-21.39T80-680v-140q0-24.75 17.63-42.38Q115.25-880 140-880h680q24.75 0 42.38 17.62Q880-844.75 880-820v140q0 20.22-11.5 35.61T840-623v483q0 24.75-17.62 42.37Q804.75-80 780-80H180Zm0-540v480h600v-480H180Zm-40-60h680v-140H140v140Zm220 260h240v-60H360v60Zm120 40Z" />,
);

/** Diary — an open book (a private journal). Material Symbols `menu_book`. */
export const DiaryIcon = createIcon(
  "DiaryIcon",
  <path d="M560-574v-48q33-14 67.5-21t72.5-7q26 0 51 4t49 10v44q-24-9-48.5-13.5T700-610q-38 0-73 9.5T560-574Zm0 220v-49q33-13.5 67.5-20.25T700-430q26 0 51 4t49 10v44q-24-9-48.5-13.5T700-390q-38 0-73 9t-67 27Zm0-110v-48q33-14 67.5-21t72.5-7q26 0 51 4t49 10v44q-24-9-48.5-13.5T700-500q-38 0-73 9.5T560-464ZM248-300q53.57 0 104.28 12.5Q403-275 452-250v-427q-45-30-97.62-46.5Q301.76-740 248-740q-38 0-74.5 9.5T100-707v434q31-14 70.5-20.5T248-300Zm264 50q50-25 98-37.5T712-300q38 0 78.5 6t69.5 16v-429q-34-17-71.82-25-37.82-8-76.18-8-54 0-104.5 16.5T512-677v427Zm-30 90q-51-38-111-58.5T248-239q-36.54 0-71.77 9T106-208q-23.1 11-44.55-3Q40-225 40-251v-463q0-15 7-27.5T68-761q42-20 87.39-29.5 45.4-9.5 92.61-9.5 63 0 122.5 17T482-731q51-35 109.5-52T712-800q46.87 0 91.93 9.5Q849-781 891-761q14 7 21.5 19.5T920-714v463q0 27.89-22.5 42.45Q875-194 853-208q-34-14-69.23-22.5Q748.54-239 712-239q-63 0-121 21t-109 58ZM276-489Z" />,
);

/** Review — a recurring date (a weekly ritual). Material Symbols `event_repeat`. */
export const ReviewIcon = createIcon(
  "ReviewIcon",
  <path d="M180-80q-24 0-42-18t-18-42v-620q0-24 18-42t42-18h65v-60h65v60h340v-60h65v60h65q24 0 42 18t18 42v300h-60v-110H180v430h324v60H180ZM760 0q-73 0-127.5-45.5T564-160h62q13 44 49.5 72T760-60q58 0 99-41t41-99q0-58-41-99t-99-41q-29 0-54 10.5T662-300h58v60H560v-160h60v57q27-26 63-41.5t77-15.5q83 0 141.5 58.5T960-200q0 83-58.5 141.5T760 0ZM180-630h600v-130H180v130Zm0 0v-130 130Z" />,
);

/* -------------------------------------------------------------------------- */
/* UI icons (the frame's affordances).                                        */
/* -------------------------------------------------------------------------- */

/** Search — a magnifier. Material Symbols `search`. */
export const SearchIcon = createIcon(
  "SearchIcon",
  <path d="M796-121 533-384q-30 26-70 40.5T378-329q-108 0-183-75t-75-181q0-106 75-181t182-75q106 0 180.5 75T632-585q0 43-14 83t-42 75l264 262-44 44ZM377-389q81 0 138-57.5T572-585q0-81-57-138.5T377-781q-82 0-139.5 57.5T180-585q0 81 57.5 138.5T377-389Z" />,
);

/** Command — the ⌘ glyph, for the palette affordance. Material Symbols `keyboard_command_key`. */
export const CommandIcon = createIcon(
  "CommandIcon",
  <path d="M249.9-120q-53.9 0-91.9-38.1-38-38.1-38-92t38.07-91.9q38.07-38 91.93-38h70v-200h-70q-53.86 0-91.93-38.1-38.07-38.1-38.07-92t38.1-91.9q38.1-38 92-38t91.9 38.07q38 38.07 38 91.93v70h200v-70q0-53.86 38.1-91.93 38.1-38.07 92-38.07t91.9 38.1q38 38.1 38 92T801.93-618q-38.07 38-91.93 38h-70v200h70q53.86 0 91.93 38.1 38.07 38.1 38.07 92T801.9-158q-38.1 38-92 38T618-158.07q-38-38.07-38-91.93v-70H380v70q0 53.86-38.1 91.93-38.1 38.07-92 38.07Zm-.02-60q29.12 0 49.62-20.42Q320-220.83 320-250v-70h-70q-29.17 0-49.58 20.38Q180-279.24 180-250.12t20.38 49.62q20.38 20.5 49.5 20.5Zm460 0q29.12 0 49.62-20.38 20.5-20.38 20.5-49.5t-20.42-49.62Q739.17-320 710-320h-70v70q0 29.17 20.38 49.58Q680.76-180 709.88-180ZM380-380h200v-200H380v200ZM250-640h70v-70q0-29.17-20.38-49.58Q279.24-780 250.12-780t-49.62 20.38q-20.5 20.38-20.5 49.5t20.42 49.62Q220.83-640 250-640Zm390 0h70q29.17 0 49.58-20.38Q780-680.76 780-709.88t-20.38-49.62q-20.38-20.5-49.5-20.5t-49.62 20.42Q640-739.17 640-710v70Z" />,
);

/** Settings — a gear. Material Symbols `settings`. */
export const SettingsIcon = createIcon(
  "SettingsIcon",
  <path d="m388-80-20-126q-19-7-40-19t-37-25l-118 54-93-164 108-79q-2-9-2.5-20.5T185-480q0-9 .5-20.5T188-521L80-600l93-164 118 54q16-13 37-25t40-18l20-127h184l20 126q19 7 40.5 18.5T669-710l118-54 93 164-108 77q2 10 2.5 21.5t.5 21.5q0 10-.5 21t-2.5 21l108 78-93 164-118-54q-16 13-36.5 25.5T592-206L572-80H388Zm48-60h88l14-112q33-8 62.5-25t53.5-41l106 46 40-72-94-69q4-17 6.5-33.5T715-480q0-17-2-33.5t-7-33.5l94-69-40-72-106 46q-23-26-52-43.5T538-708l-14-112h-88l-14 112q-34 7-63.5 24T306-642l-106-46-40 72 94 69q-4 17-6.5 33.5T245-480q0 17 2.5 33.5T254-413l-94 69 40 72 106-46q24 24 53.5 41t62.5 25l14 112Zm44-210q54 0 92-38t38-92q0-54-38-92t-92-38q-54 0-92 38t-38 92q0 54 38 92t92 38Zm0-130Z" />,
);

/** Menu — a hamburger (mobile nav toggle). Material Symbols `menu`. */
export const MenuIcon = createIcon(
  "MenuIcon",
  <path d="M120-240v-60h720v60H120Zm0-210v-60h720v60H120Zm0-210v-60h720v60H120Z" />,
);

/** Close — an X. Material Symbols `close`. */
export const CloseIcon = createIcon(
  "CloseIcon",
  <path d="m249-207-42-42 231-231-231-231 42-42 231 231 231-231 42 42-231 231 231 231-42 42-231-231-231 231Z" />,
);

/** Chevron down — disclosure/menu indicator. Material Symbols `keyboard_arrow_down`. */
export const ChevronDownIcon = createIcon(
  "ChevronDownIcon",
  <path d="M480-344 240-584l43-43 197 197 197-197 43 43-240 240Z" />,
);

/** Chevron right — nested/forward indicator. Material Symbols `keyboard_arrow_right`. */
export const ChevronRightIcon = createIcon(
  "ChevronRightIcon",
  <path d="M530-481 332-679l43-43 241 241-241 241-43-43 198-198Z" />,
);

/** Sun — the light appearance. Material Symbols `light_mode`. */
export const SunIcon = createIcon(
  "SunIcon",
  <path d="M579-381q41-41 41-99t-41-99q-41-41-99-41t-99 41q-41 41-41 99t41 99q41 41 99 41t99-41Zm-240.5 42.5Q280-397 280-480t58.5-141.5Q397-680 480-680t141.5 58.5Q680-563 680-480t-58.5 141.5Q563-280 480-280t-141.5-58.5ZM200-450H40v-60h160v60Zm720 0H760v-60h160v60ZM450-760v-160h60v160h-60Zm0 720v-160h60v160h-60ZM262-658l-100-97 43-44 96 100-39 41Zm494 496-98-100 41-41 99 98-42 43Zm-99-537 98-99 44 42-99 98-43-41ZM162-205l99-98 42 42-98 99-43-43Zm318-275Z" />,
);

/** Moon — the dark appearance. Material Symbols `dark_mode`. */
export const MoonIcon = createIcon(
  "MoonIcon",
  <path d="M480-120q-150 0-255-105T120-480q0-150 105-255t255-105q8 0 17 .5t23 1.5q-36 32-56 79t-20 99q0 90 63 153t153 63q52 0 99-18.5t79-51.5q1 12 1.5 19.5t.5 14.5q0 150-105 255T480-120Zm0-60q109 0 190-67.5T771-406q-25 11-53.67 16.5Q688.67-384 660-384q-114.69 0-195.34-80.66Q384-545.31 384-660q0-24 5-51.5t18-62.5q-98 27-162.5 109.5T180-480q0 125 87.5 212.5T480-180Zm-4-297Z" />,
);

/** Monitor — the system appearance. Material Symbols `computer`. */
export const MonitorIcon = createIcon(
  "MonitorIcon",
  <path d="M40-120v-60h880v60H40Zm100-120q-24 0-42-18t-18-42v-480q0-24 18-42t42-18h680q24 0 42 18t18 42v480q0 24-18 42t-42 18H140Zm0-60h680v-480H140v480Zm0 0v-480 480Z" />,
);

/** Today — a calendar with the current day marked. Distinct from the Diary glyph. Material Symbols `today`. */
export const TodayIcon = createIcon(
  "TodayIcon",
  <path d="M284-338.18q-28-28.19-28-69Q256-448 284.18-476q28.19-28 69-28Q394-504 422-475.82q28 28.19 28 69Q450-366 421.82-338q-28.19 28-69 28Q312-310 284-338.18ZM180-80q-24 0-42-18t-18-42v-620q0-24 18-42t42-18h65v-60h65v60h340v-60h65v60h65q24 0 42 18t18 42v620q0 24-18 42t-42 18H180Zm0-60h600v-430H180v430Zm0-490h600v-130H180v130Zm0 0v-130 130Z" />,
);

/** Help — a question mark in a circle. Material Symbols `help`. */
export const HelpIcon = createIcon(
  "HelpIcon",
  <path d="M511-258q11-11 11-27t-11-27q-11-11-27-11t-27 11q-11 11-11 27t11 27q11 11 27 11t27-11Zm-62-135h59q0-26 6.5-47.5T555-490q31-26 44-51t13-55q0-53-34.5-85T486-713q-49 0-86.5 24.5T345-621l53 20q11-28 33-43.5t52-15.5q34 0 55 18.5t21 47.5q0 22-13 41.5T508-512q-30 26-44.5 51.5T449-393Zm31 313q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-156t86-127Q252-817 325-848.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 82-31.5 155T763-197.5q-54 54.5-127 86T480-80Zm0-60q142 0 241-99.5T820-480q0-142-99-241t-241-99q-141 0-240.5 99T140-480q0 141 99.5 240.5T480-140Zm0-340Z" />,
);

/** About — information in a circle. Material Symbols `info`. */
export const InfoIcon = createIcon(
  "InfoIcon",
  <path d="M453-280h60v-240h-60v240Zm50.5-323.2q9.5-9.2 9.5-22.8 0-14.45-9.48-24.22-9.48-9.78-23.5-9.78t-23.52 9.78Q447-640.45 447-626q0 13.6 9.48 22.8 9.48 9.2 23.5 9.2t23.52-9.2ZM480.27-80q-82.74 0-155.5-31.5Q252-143 197.5-197.5t-86-127.34Q80-397.68 80-480.5t31.5-155.66Q143-709 197.5-763t127.34-85.5Q397.68-880 480.5-880t155.66 31.5Q709-817 763-763t85.5 127Q880-563 880-480.27q0 82.74-31.5 155.5Q817-252 763-197.68q-54 54.31-127 86Q563-80 480.27-80Zm.23-60Q622-140 721-239.5t99-241Q820-622 721.19-721T480-820q-141 0-240.5 98.81T140-480q0 141 99.5 240.5t241 99.5Zm-.5-340Z" />,
);

/** List — the list view. Material Symbols `list`. */
export const ListIcon = createIcon(
  "ListIcon",
  <path d="M290-620v-60h550v60H290Zm0 170v-60h550v60H290Zm0 170v-60h550v60H290ZM150-620q-12 0-21-9t-9-21.5q0-12.5 9-21t21.5-8.5q12.5 0 21 8.62 8.5 8.63 8.5 21.38 0 12-8.62 21-8.63 9-21.38 9Zm0 170q-12 0-21-9t-9-21.5q0-12.5 9-21t21.5-8.5q12.5 0 21 8.62 8.5 8.63 8.5 21.38 0 12-8.62 21-8.63 9-21.38 9Zm0 170q-12 0-21-9t-9-21.5q0-12.5 9-21t21.5-8.5q12.5 0 21 8.62 8.5 8.63 8.5 21.38 0 12-8.62 21-8.63 9-21.38 9Z" />,
);

/** Board — the board view. Material Symbols `view_kanban`. */
export const BoardIcon = createIcon(
  "BoardIcon",
  <path d="M279-277h60v-406h-60v406Zm342-80h60v-326h-60v326ZM450-477h60v-206h-60v206ZM180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h600q24 0 42 18t18 42v600q0 24-18 42t-42 18H180Zm0-60h600v-600H180v600Zm0-600v600-600Z" />,
);

/** Grid — the grid view. Material Symbols `grid_view`. */
export const GridIcon = createIcon(
  "GridIcon",
  <path d="M120-510v-330h330v330H120Zm0 390v-330h330v330H120Zm390-390v-330h330v330H510Zm0 390v-330h330v330H510ZM180-570h210v-210H180v210Zm390 0h210v-210H570v210Zm0 390h210v-210H570v210Zm-390 0h210v-210H180v210Zm390-390Zm0 180Zm-180 0Zm0-180Z" />,
);

/** Plus — a create/new action. Material Symbols `add`. */
export const PlusIcon = createIcon(
  "PlusIcon",
  <path d="M450-450H200v-60h250v-250h60v250h250v60H510v250h-60v-250Z" />,
);

/** Sign out — an arrow leaving a door. Material Symbols `logout`. */
export const SignOutIcon = createIcon(
  "SignOutIcon",
  <path d="M180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h299v60H180v600h299v60H180Zm486-185-43-43 102-102H360v-60h363L621-612l43-43 176 176-174 174Z" />,
);

/** More — the overflow (⋯) affordance (DS-12). Horizontal, never vertical. Material Symbols `more_horiz`. */
export const MoreIcon = createIcon(
  "MoreIcon",
  <path d="M207.86-432Q188-432 174-446.14t-14-34Q160-500 174.14-514t34-14Q228-528 242-513.86t14 34Q256-460 241.86-446t-34 14Zm272 0Q460-432 446-446.14t-14-34Q432-500 446.14-514t34-14Q500-528 514-513.86t14 34Q528-460 513.86-446t-34 14Zm272 0Q732-432 718-446.14t-14-34Q704-500 718.14-514t34-14Q772-528 786-513.86t14 34Q800-460 785.86-446t-34 14Z" />,
);

/* -------------------------------------------------------------------------- */
/* Record action icons.                                                       */
/* -------------------------------------------------------------------------- */

/** Archive — a lidded box. The reversible “move it out of the way” lifecycle act. Material Symbols `archive`. */
export const ArchiveIcon = createIcon(
  "ArchiveIcon",
  <path d="m480-270 156-156-40-40-86 86v-201h-60v201l-86-86-40 40 156 156ZM180-674v494h600v-494H180Zm0 554q-24.75 0-42.37-17.63Q120-155.25 120-180v-529q0-9.88 3-19.06 3-9.18 9-16.94l52-71q8-11 20.94-17.5Q217.88-840 232-840h495q14.12 0 27.06 6.5T775-816l53 71q6 7.76 9 16.94 3 9.18 3 19.06v529q0 24.75-17.62 42.37Q804.75-120 780-120H180Zm17-614h565l-36.41-46H233l-36 46Zm283 307Z" />,
);

/** Restore — a counter-clockwise arrow returning a record to its active life. Material Symbols `history`. */
export const RestoreIcon = createIcon(
  "RestoreIcon",
  <path d="M477-120q-149 0-253-105.5T120-481h60q0 125 86 213t211 88q127 0 215-89t88-216q0-124-89-209.5T477-780q-68 0-127.5 31T246-667h105v60H142v-208h60v106q52-61 123.5-96T477-840q75 0 141 28t115.5 76.5Q783-687 811.5-622T840-482q0 75-28.5 141t-78 115Q684-177 618-148.5T477-120Zm128-197L451-469v-214h60v189l137 134-43 43Z" />,
);

/** Trash — deletion. Always paired with the word “Delete”, never colour alone. Material Symbols `delete`. */
export const TrashIcon = createIcon(
  "TrashIcon",
  <path d="M261-120q-24.75 0-42.37-17.63Q201-155.25 201-180v-570h-41v-60h188v-30h264v30h188v60h-41v570q0 24-18 42t-42 18H261Zm438-630H261v570h438v-570ZM367-266h60v-399h-60v399Zm166 0h60v-399h-60v399ZM261-750v570-570Z" />,
);

/** Pencil — an edit/rename action. Material Symbols `edit`. */
export const EditIcon = createIcon(
  "EditIcon",
  <path d="M180-180h44l472-471-44-44-472 471v44Zm-60 60v-128l575-574q8-8 19-12.5t23-4.5q11 0 22 4.5t20 12.5l44 44q9 9 13 20t4 22q0 11-4.5 22.5T823-694L248-120H120Zm659-617-41-41 41 41Zm-105 64-22-22 44 44-22-22Z" />,
);

/** Check — completion. Material Symbols `check`. */
export const CheckIcon = createIcon(
  "CheckIcon",
  <path d="M378-246 154-470l43-43 181 181 384-384 43 43-427 427Z" />,
);

/** Download — taking a copy of a record out of DalyHub (NOTES-06 export). Material Symbols `download`. */
export const DownloadIcon = createIcon(
  "DownloadIcon",
  <path d="M480-313 287-506l43-43 120 120v-371h60v371l120-120 43 43-193 193ZM220-160q-24 0-42-18t-18-42v-143h60v143h520v-143h60v143q0 24-18 42t-42 18H220Z" />,
);

/** Copy — duplicate content to the clipboard (NOTES-05 §21). Material Symbols `content_copy`. */
export const CopyIcon = createIcon(
  "CopyIcon",
  <path d="M300-200q-24 0-42-18t-18-42v-560q0-24 18-42t42-18h440q24 0 42 18t18 42v560q0 24-18 42t-42 18H300Zm0-60h440v-560H300v560ZM180-80q-24 0-42-18t-18-42v-620h60v620h500v60H180Zm120-180v-560 560Z" />,
);

/** Printer — a print-friendly rendering of the record (NOTES-05 §21). Material Symbols `print`. */
export const PrinterIcon = createIcon(
  "PrinterIcon",
  <path d="M658-648v-132H302v132h-60v-192h476v192h-60Zm-518 60h680-680Zm599 95q12 0 21-9t9-21q0-12-9-21t-21-9q-12 0-21 9t-9 21q0 12 9 21t21 9Zm-81 313v-192H302v192h356Zm60 60H242v-176H80v-246q0-45.05 30.5-75.53Q141-648 186-648h588q45.05 0 75.53 30.47Q880-587.05 880-542v246H718v176Zm102-236v-186.21Q820-562 806.78-575q-13.23-13-32.78-13H186q-19.55 0-32.77 13.22Q140-561.55 140-542v186h102v-76h476v76h102Z" />,
);

/** Tag — a lightweight organisational label (NOTES-03 note tags). Material Symbols `label`. */
export const TagIcon = createIcon(
  "TagIcon",
  <path d="M140-160q-24.75 0-42.37-17.63Q80-195.25 80-220v-520q0-24.75 17.63-42.38Q115.25-800 140-800h471q14.25 0 27 6.37 12.75 6.38 21 17.63l222 296-221 296q-8.25 11.25-21 17.62-12.75 6.38-27 6.38H140Zm0-60h471l195-260-195-260H140v520Zm236-260Z" />,
);

/* -------------------------------------------------------------------------- */
/* Editor formatting icons (the shared writing surface's toolbar).            */
/*                                                                            */
/* One glyph per formatting COMMAND, so a compact icon toolbar can replace the */
/* word-per-button row that previously cost a phone most of its writing space. */
/* Every one is still labelled at the call site — the icon is the drawing, the */
/* accessible name is the word (AGENTS.md §15).                               */
/* -------------------------------------------------------------------------- */

/** Bold. Material Symbols `format_bold`. */
export const BoldIcon = createIcon(
  "BoldIcon",
  <path d="M275-200v-560h228q66 0 114.5 42T666-612q0 38-21 70t-56 49v6q43 14 69.5 50t26.5 81q0 68-52.5 112T510-200H275Zm86-76h144q38 0 66-25t28-63q0-37-28-62t-66-25H361v175Zm0-247h136q35 0 60.5-23t25.5-58q0-35-25.5-58.5T497-686H361v163Z" />,
);

/** Italic. Material Symbols `format_italic`. */
export const ItalicIcon = createIcon(
  "ItalicIcon",
  <path d="M224-199v-80h134l139-409H338v-80h380v80H584L445-279h159v80H224Z" />,
);

/** Strikethrough. Material Symbols `format_strikethrough`. */
export const StrikethroughIcon = createIcon(
  "StrikethroughIcon",
  <path d="M80-410v-60h800v60H80Zm350-120v-170H200v-100h560v100H530v170H430Zm0 370v-190h100v190H430Z" />,
);

/** Heading. Material Symbols `format_h2` (the level the cycle lands on first). */
export const HeadingIcon = createIcon(
  "HeadingIcon",
  <path d="M120-280v-400h60v170h180v-170h60v400h-60v-170H180v170h-60Zm420 0v-170q0-24.75 17.63-42.38Q575.25-510 600-510h180v-110H540v-60h240q25 0 42.5 17.62Q840-644.75 840-620v110q0 24.75-17.62 42.37Q804.75-450 780-450H600v110h240v60H540Z" />,
);

/** Bulleted list. Material Symbols `format_list_bulleted`. */
export const BulletListIcon = createIcon(
  "BulletListIcon",
  <path d="M377-198v-60h463v60H377Zm0-252v-60h463v60H377Zm0-253v-60h463v60H377ZM189-161q-28.05 0-48.02-19Q121-199 121-227.5t19.5-48q19.5-19.5 48-19.5t47.5 19.98q19 19.97 19 48.02 0 27.23-19.39 46.61Q216.23-161 189-161Zm0-252q-28.05 0-48.02-19.5Q121-452 121-480t19.98-47.5Q160.95-547 189-547q27.23 0 46.61 19.5Q255-508 255-480t-19.39 47.5Q216.23-413 189-413Zm-48.5-272.5Q121-705 121-733t19.5-47.5Q160-800 188-800t47.5 19.5Q255-761 255-733t-19.5 47.5Q216-666 188-666t-47.5-19.5Z" />,
);

/** Numbered list. Material Symbols `format_list_numbered`. */
export const NumberedListIcon = createIcon(
  "NumberedListIcon",
  <path d="M120-80v-60h100v-30h-60v-60h60v-30H120v-60h120q17 0 28.5 11.5T280-280v40q0 17-11.5 28.5T240-200q17 0 28.5 11.5T280-160v40q0 17-11.5 28.5T240-80H120Zm0-280v-110q0-17 11.5-28.5T160-510h60v-30H120v-60h120q17 0 28.5 11.5T280-560v70q0 17-11.5 28.5T240-450h-60v30h100v60H120Zm60-280v-180h-60v-60h120v240h-60Zm189 431v-60h471v60H369Zm0-243v-60h471v60H369Zm0-243v-60h471v60H369Z" />,
);

/** Checklist. Material Symbols `checklist`. */
export const ChecklistIcon = createIcon(
  "ChecklistIcon",
  <path d="M222-214 80-356l42-42 100 99 179-179 42 43-221 221Zm0-320L80-676l42-42 100 99 179-179 42 43-221 221Zm298 244v-60h360v60H520Zm0-320v-60h360v60H520Z" />,
);

/** Blockquote. Material Symbols `format_quote`. */
export const QuoteIcon = createIcon(
  "QuoteIcon",
  <path d="m248-240 94-162q-5 1-11 1.5t-11 .5q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 21-5.5 41T458-480L320-240h-72Zm360 0 94-162q-5 1-11 1.5t-11 .5q-66 0-113-47t-47-113q0-66 47-113t113-47q66 0 113 47t47 113q0 21-5.5 41T818-480L680-240h-72ZM376.5-503.5Q400-527 400-560t-23.5-56.5Q353-640 320-640t-56.5 23.5Q240-593 240-560t23.5 56.5Q287-480 320-480t56.5-23.5Zm360 0Q760-527 760-560t-23.5-56.5Q713-640 680-640t-56.5 23.5Q600-593 600-560t23.5 56.5Q647-480 680-480t56.5-23.5ZM680-560Zm-360 0Z" />,
);

/** Link. Material Symbols `link`. */
export const LinkIcon = createIcon(
  "LinkIcon",
  <path d="M450-280H280q-83 0-141.5-58.5T80-480q0-83 58.5-141.5T280-680h170v60H280q-58.33 0-99.17 40.76-40.83 40.77-40.83 99Q140-422 180.83-381q40.84 41 99.17 41h170v60ZM325-450v-60h310v60H325Zm185 170v-60h170q58.33 0 99.17-40.76 40.83-40.77 40.83-99Q820-538 779.17-579q-40.84-41-99.17-41H510v-60h170q83 0 141.5 58.5T880-480q0 83-58.5 141.5T680-280H510Z" />,
);

/** Inline code. Material Symbols `code`. */
export const CodeIcon = createIcon(
  "CodeIcon",
  <path d="M320-242 80-482l242-242 43 43-199 199 197 197-43 43Zm318 2-43-43 199-199-197-197 43-43 240 240-242 242Z" />,
);

/** Fenced code block. Material Symbols `code_blocks`. */
export const CodeBlockIcon = createIcon(
  "CodeBlockIcon",
  <path d="m379-343 44-44-93-93 92-92-44-44-136 136 137 137Zm202 0 137-137-137-137-44 44 93 93-93 93 44 44ZM180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h600q24 0 42 18t18 42v600q0 24-18 42t-42 18H180Zm0-60h600v-600H180v600Zm0-600v600-600Z" />,
);

/** Table. Material Symbols `table`. */
export const TableIcon = createIcon(
  "TableIcon",
  <path d="M180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h600q24 0 42 18t18 42v600q0 24-18 42t-42 18H180Zm270-250H180v190h270v-190Zm60 0v190h270v-190H510Zm-60-60v-190H180v190h270Zm60 0h270v-190H510v190ZM180-680h600v-100H180v100Z" />,
);

/** Remove formatting. Material Symbols `format_clear`. */
export const ClearFormattingIcon = createIcon(
  "ClearFormattingIcon",
  <path d="m507-524-77-76 24-56h-79L271-760h529v100H565l-58 136ZM806-56 457-406l-88 206H260l120-282L56-806l42-42L848-98l-42 42Z" />,
);

/** Undo. Material Symbols `undo`. */
export const UndoIcon = createIcon(
  "UndoIcon",
  <path d="M259-200v-60h310q70 0 120.5-46.5T740-422q0-69-50.5-115.5T569-584H274l114 114-42 42-186-186 186-186 42 42-114 114h294q95 0 163.5 64T800-422q0 94-68.5 158T568-200H259Z" />,
);

/** Redo. Material Symbols `redo`. */
export const RedoIcon = createIcon(
  "RedoIcon",
  <path d="M392-200q-95 0-163.5-64T160-422q0-94 68.5-158T392-644h294L572-758l42-42 186 186-186 186-42-42 114-114H391q-70 0-120.5 46.5T220-422q0 69 50.5 115.5T391-260h310v60H392Z" />,
);

/* -------------------------------------------------------------------------- */
/* Card metadata icons (a compact, grouped metadata region on a gallery card). */
/* -------------------------------------------------------------------------- */

/** A moment in time — "updated 3 days ago". Material Symbols `history`. */
export const HistoryIcon = createIcon(
  "HistoryIcon",
  <path d="M477-120q-149 0-253-105.5T120-481h60q0 125 86 213t211 88q127 0 215-89t88-216q0-124-89-209.5T477-780q-68 0-127.5 31T246-667h105v60H142v-208h60v106q52-61 123.5-96T477-840q75 0 141 28t115.5 76.5Q783-687 811.5-622T840-482q0 75-28.5 141t-78 115Q684-177 618-148.5T477-120Zm128-197L451-469v-214h60v189l137 134-43 43Z" />,
);

/** A deadline. Material Symbols `schedule`. */
export const ScheduleIcon = createIcon(
  "ScheduleIcon",
  <path d="m627-287 45-45-159-160v-201h-60v225l174 181ZM480-80q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-82 31.5-155t86-127.5Q252-817 325-848.5T480-880q82 0 155 31.5t127.5 86Q817-708 848.5-635T880-480q0 82-31.5 155t-86 127.5Q708-143 635-111.5T480-80Zm0-400Zm0 340q140 0 240-100t100-240q0-140-100-240T480-820q-140 0-240 100T140-480q0 140 100 240t240 100Z" />,
);

/**
 * A repeating task's recurrence signal (TASKS-07). Always paired with the shared
 * `taskRecurrenceLabel` text — the icon reinforces, it never carries the meaning.
 * Material Symbols `repeat`.
 */
export const RepeatIcon = createIcon(
  "RepeatIcon",
  <path d="M280-80 120-240l160-160 42 43-86 87h422v-120h60v180H236l86 87-42 43Zm-100-440v-180h598l-86-87 42-43 160 160-160 160-42-43 86-87H240v120h-60Z" />,
);

/** Completed work. Material Symbols `check_circle`. */
export const CheckCircleIcon = createIcon(
  "CheckCircleIcon",
  <path d="m421-298 283-283-46-45-237 237-120-120-45 45 165 166Zm59 218q-82 0-155-31.5t-127.5-86Q143-252 111.5-325T80-480q0-83 31.5-156t86-127Q252-817 325-848.5T480-880q83 0 156 31.5T763-763q54 54 85.5 127T880-480q0 82-31.5 155T763-197.5q-54 54.5-127 86T480-80Zm0-60q142 0 241-99.5T820-480q0-142-99-241t-241-99q-141 0-240.5 99T140-480q0 141 99.5 240.5T480-140Zm0-340Z" />,
);

/*
 * UIX-01 added the three glyphs the redesigned surfaces genuinely needed and
 * the set did not carry: a trajectory (the day's progress widget and a Goal's
 * direction), a funnel (the Tasks utility cluster's Filter control) and a flag
 * (priority, where the row shows it as a mark rather than a coloured pill).
 * Same set, same provenance, same factory — never a second icon dependency.
 */

/** An upward trajectory — progress over time. Material Symbols `trending_up`. */
export const TrendingUpIcon = createIcon(
  "TrendingUpIcon",
  <path d="m136-240-56-56 296-298 160 160 208-206H640v-80h240v240h-80v-104L536-320 376-480 136-240Z" />,
);

/** Narrowing a collection. Material Symbols `filter_alt`. */
export const FilterIcon = createIcon(
  "FilterIcon",
  <path d="M400-240v-80h160v80H400ZM240-440v-80h480v80H240ZM120-640v-80h720v80H120Z" />,
);

/** Priority, as a mark rather than a pill. Material Symbols `flag`. */
export const FlagIcon = createIcon(
  "FlagIcon",
  <path d="M200-120v-680h360l16 80h224v400H520l-16-80H280v280h-80Zm300-370Zm86 130h134v-240H510l-16-80H280v240h290l16 80Z" />,
);

/* -------------------------------------------------------------------------- */
/* Content-kind icons (Diary entry kinds, empty states).                      */
/* -------------------------------------------------------------------------- */

/** Chat — a conversation. Material Symbols `chat_bubble`. */
export const ChatIcon = createIcon(
  "ChatIcon",
  <path d="M80-80v-740q0-24 18-42t42-18h680q24 0 42 18t18 42v520q0 24-18 42t-42 18H240L80-80Zm134-220h606v-520H140v600l74-80Zm-74 0v-520 520Z" />,
);

/** Calendar — a scheduled moment (a Diary meeting/event entry). Material Symbols `calendar_month`. */
export const CalendarIcon = createIcon(
  "CalendarIcon",
  <path d="M180-80q-24 0-42-18t-18-42v-620q0-24 18-42t42-18h65v-60h65v60h340v-60h65v60h65q24 0 42 18t18 42v620q0 24-18 42t-42 18H180Zm0-60h600v-430H180v430Zm0-490h600v-130H180v130Zm0 0v-130 130Zm300 230q-17 0-28.5-11.5T440-440q0-17 11.5-28.5T480-480q17 0 28.5 11.5T520-440q0 17-11.5 28.5T480-400Zm-188.5-11.5Q280-423 280-440t11.5-28.5Q303-480 320-480t28.5 11.5Q360-457 360-440t-11.5 28.5Q337-400 320-400t-28.5-11.5ZM640-400q-17 0-28.5-11.5T600-440q0-17 11.5-28.5T640-480q17 0 28.5 11.5T680-440q0 17-11.5 28.5T640-400ZM480-240q-17 0-28.5-11.5T440-280q0-17 11.5-28.5T480-320q17 0 28.5 11.5T520-280q0 17-11.5 28.5T480-240Zm-188.5-11.5Q280-263 280-280t11.5-28.5Q303-320 320-320t28.5 11.5Q360-297 360-280t-11.5 28.5Q337-240 320-240t-28.5-11.5ZM640-240q-17 0-28.5-11.5T600-280q0-17 11.5-28.5T640-320q17 0 28.5 11.5T680-280q0 17-11.5 28.5T640-240Z" />,
);

/** Lightbulb — an idea. Material Symbols `lightbulb`. */
export const IdeaIcon = createIcon(
  "IdeaIcon",
  <path d="M422.5-103.5Q399-127 399-161h162q0 34-23.5 57.5T480-80q-34 0-57.5-23.5ZM318-223v-60h324v60H318Zm5-121q-66-43-104.5-107.5T180-597q0-122 89-211t211-89q122 0 211 89t89 211q0 81-38 145.5T637-344H323Zm22-60h271q48-32 76-83t28-110q0-99-70.5-169.5T480-837q-99 0-169.5 70.5T240-597q0 59 28 110t77 83Zm135 0Z" />,
);

/** Signpost — a decision taken. Material Symbols `signpost`. */
export const DecisionIcon = createIcon(
  "DecisionIcon",
  <path d="M450-80v-190H230L120-380l110-110h220v-90H160v-220h290v-80h60v80h220l110 110-110 110H510v90h290v220H510v190h-60ZM220-640h485l50-50-50-50H220v100Zm35 310h485v-100H255l-50 50 50 50Zm-35-310v-100 100Zm520 310v-100 100Z" />,
);

/** Plane — travel. Material Symbols `flight`. */
export const TravelIcon = createIcon(
  "TravelIcon",
  <path d="M285-80v-83l124-86v-172L80-288v-102l329-231v-188q0-29 21-50t50-21q29 0 50 21t21 50v188l329 231v102L551-421v172l123 86v83l-194-59-195 59Z" />,
);

/** Eye — an observation. Material Symbols `visibility`. */
export const ObservationIcon = createIcon(
  "ObservationIcon",
  <path d="M600.5-379.5Q650-429 650-500t-49.5-120.5Q551-670 480-670t-120.5 49.5Q310-571 310-500t49.5 120.5Q409-330 480-330t120.5-49.5Zm-200-41Q368-453 368-500t32.5-79.5Q433-612 480-612t79.5 32.5Q592-547 592-500t-32.5 79.5Q527-388 480-388t-79.5-32.5ZM216-283Q98-366 40-500q58-134 176-217t264-83q146 0 264 83t176 217q-58 134-176 217t-264 83q-146 0-264-83Zm264-217Zm222.5 174.5Q804-391 857-500q-53-109-154.5-174.5T480-740q-121 0-222.5 65.5T102-500q54 109 155.5 174.5T480-260q121 0 222.5-65.5Z" />,
);

/** Ripple — a reflection (looking back on something). Material Symbols `waves`. */
export const ReflectionIcon = createIcon(
  "ReflectionIcon",
  <path d="M80-146v-60q28-3 48-16t40-27.5q20-14.5 45-25.5t62-11q37 0 63 12.5t47.5 27.5q21.5 15 43.5 27.5t51 12.5q29 0 51-12.5t43.5-27.5q21.5-15 47.5-27.5t63-12.5q37 0 61.5 11t45 25.5Q812-235 832-222t48 16v60q-35-2-58.5-14.5t-44-27Q757-202 736-214t-51-12q-30 0-52.5 12.5t-44 27.5q-21.5 15-47 27.5T480-146q-36 0-61.5-12.5t-47-27.5q-21.5-15-44-27.5T275-226q-30 0-51.5 12T182-187.5q-20 14.5-43.5 27T80-146Zm0-176v-60q28-3 48-16t40-27.5q20-14.5 45-25.5t62-11q37 0 63 12.5t47.5 27.5q21.5 15 43.5 27.5t51 12.5q29 0 51-12.5t43.5-27.5q21.5-15 47.5-27.5t63-12.5q37 0 61.5 11t45 25.5Q812-411 832-398t48 16v60q-35-4-58.5-17t-44-27Q757-380 736-391t-51-11q-30 0-52 12.5T589-362q-22 15-47.5 27.5T480-322q-36 0-61.5-12.5t-47-27.5q-21.5-15-44-27.5T275-402q-30 0-51.5 12T182-363.5q-20 14.5-43.5 27T80-322Zm0-176v-60q28-2 48-14.5t40-27q20-14.5 45-26.5t62-12q37 0 63 12.5t47.5 27.5q21.5 15 43.5 27.5t51 12.5q29 0 51-12.5t43.5-27.5q21.5-15 47.5-27.5t63-12.5q37 0 61.5 12t45 26.5q20.5 14.5 40.5 27t48 14.5v60q-35-2-58.5-14.5t-44-27Q757-554 736-566t-51-12q-30 0-52.5 12.5t-44 27.5q-21.5 15-47 27.5T480-498q-36 0-61.5-12.5t-47-27.5q-21.5-15-44-27.5T275-578q-30 0-51.5 12T182-539.5q-20 14.5-43.5 27T80-498Zm0-176v-60q28-3 48-16t40-27.5q20-14.5 45-25.5t62-11q37 0 63 12.5t47.5 27.5q21.5 15 43.5 27.5t51 12.5q29 0 51-12.5t43.5-27.5q21.5-15 47.5-27.5t63-12.5q37 0 61.5 11t45 25.5Q812-763 832-750t48 16v60q-35-2-58.5-14.5t-44-27Q757-730 736-742t-51-12q-30 0-52.5 12.5t-44 27.5q-21.5 15-47 27.5T480-674q-36 0-61.5-12.5t-47-27.5q-21.5-15-44-27.5T275-754q-30 0-51.5 12T182-715.5q-20 14.5-43.5 27T80-674Z" />,
);

/** Inbox — the default empty-state glyph. Material Symbols `inbox`. */
export const InboxIcon = createIcon(
  "InboxIcon",
  <path d="M180-120q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h600q24 0 42 18t18 42v600q0 24-18 42t-42 18H180Zm0-60h600v-136H634q-26 40-67.5 61.5T480-233q-45 0-86.5-21.5T326-316H180v136Zm374-136.5q33-23.5 56-59.5h170v-404H180v404h170q23 36 56.25 59.5 33.24 23.5 74 23.5Q521-293 554-316.5ZM180-180h600-600Z" />,
);

/**
 * Notification — a bell. Material Symbols `notifications`.
 *
 * NOTIFY-01. The name is the LEDGER's, not the feedback layer's: this is the
 * glyph on the top bar's inbox control, never on a toast (see
 * `app/shared/notifications`).
 */
export const BellIcon = createIcon(
  "BellIcon",
  <path d="M160-200v-60h80v-304q0-84 49.5-150.5T420-798v-22q0-25 17.5-42.5T480-880q25 0 42.5 17.5T540-820v22q81 17 130.5 83.5T720-564v304h80v60H160Zm320-302Zm0 422q-33 0-56.5-23.5T400-160h160q0 33-23.5 56.5T480-80ZM300-260h360v-304q0-75-52.5-127.5T480-744q-75 0-127.5 52.5T300-564v304Z" />,
);

/* -------------------------------------------------------------------------- */
/* Asset-kind icons (ASSETS-01).                                              */
/* -------------------------------------------------------------------------- */

/** Vehicle — a car silhouette. Material Symbols `directions_car`. */
export const VehicleIcon = createIcon(
  "VehicleIcon",
  <path d="M200-204v54q0 12.75-8.62 21.37Q182.75-120 170-120h-20q-12.75 0-21.37-8.63Q120-137.25 120-150v-324l85-256q5-14 16.5-22t26.5-8h464q15 0 26.5 8t16.5 22l85 256v324q0 12.75-8.62 21.37Q822.75-120 810-120h-21q-13 0-21-8.63-8-8.62-8-21.37v-54H200Zm3-330h554l-55-166H258l-55 166Zm-23 60v210-210Zm105.76 160q23.24 0 38.74-15.75Q340-345.5 340-368q0-23.33-15.75-39.67Q308.5-424 286-424q-23.33 0-39.67 16.26Q230-391.47 230-368.24q0 23.24 16.26 38.74 16.27 15.5 39.5 15.5ZM675-314q23.33 0 39.67-15.75Q731-345.5 731-368q0-23.33-16.26-39.67Q698.47-424 675.24-424q-23.24 0-38.74 16.26-15.5 16.27-15.5 39.5 0 23.24 15.75 38.74Q652.5-314 675-314Zm-495 50h600v-210H180v210Z" />,
);

/** Trailer or camper — a towed caravan. Material Symbols `rv_hookup`. */
export const TrailerIcon = createIcon(
  "TrailerIcon",
  <path d="m784-101-43-43 63-63H470q-10 39-42.5 62.5T356-121q-39 0-71.5-23.5T242-207h-42q-53 0-86.5-33.5T80-327v-236h241v-137H80v-60h520q24 0 42 18t18 42v433h144l-63-63 43-43 136 136-136 136ZM381-563h219v-137H381v137Zm16.5 365.5Q414-214 414-239t-16.5-41.5Q381-297 356-297t-41.5 16.5Q298-264 298-239t16.5 41.5Q331-181 356-181t41.5-16.5ZM242-267q10-39 42.5-64.5T356-357q39 0 71.5 25.5T470-267h130v-236H140v176q0 27 16.5 43.5T200-267h42Zm0-236H140h460-358Z" />,
);

/** Equipment — machinery. Material Symbols `precision_manufacturing`. */
export const EquipmentIcon = createIcon(
  "EquipmentIcon",
  <path d="M166-120v-94h127L187-576q-32-15-50-40.5T119-684q0-47 34.5-81.5T235-800q44 0 73 23.5t39 62.5h146v-59q0-12 9-21t21-9q11 0 18.5 8.5T549-775l75-72q8-8 20.5-10.5T670-854l158 76q9 5 12.5 14t-1.5 19q-5 10-14.5 12t-18.5-3l-155-75-98 99v52l98 103 155-76q10-5 19-2.5t14 12.5q5 10 1.5 20T827-588l-153 72q-14 7-27 6.5T624-520l-75-72q0 14-7.5 21t-18.5 7q-12 0-21-9t-9-21v-60H345q0 12-6.5 24.5T323-609l205 395h158v94H166Zm109-524q16-16 16-40t-16-40q-16-16-40-16t-40 16q-16 16-16 40t16 40q16 16 40 16t40-16Zm84 430h102L272-581q-3 2-10 4t-11 3l108 360Zm102 0Z" />,
);

/** Appliance — a boxy machine with a control. Material Symbols `kitchen`. */
export const ApplianceIcon = createIcon(
  "ApplianceIcon",
  <path d="M309-650v-118h60v118h-60Zm0 361v-196h60v196h-60ZM220-80q-24.75 0-42.37-17.63Q160-115.25 160-140v-680q0-24.75 17.63-42.38Q195.25-880 220-880h520q24.75 0 42.38 17.62Q800-844.75 800-820v680q0 24.75-17.62 42.37Q764.75-80 740-80H220Zm0-60h520v-398H220v398Zm0-458h520v-222H220v222Z" />,
);

/** Electronics — a screen and a handset. Material Symbols `devices`. */
export const ElectronicsIcon = createIcon(
  "ElectronicsIcon",
  <path d="M501-540ZM80-160v-60h421v60H80Zm100-120q-24 0-42-18t-18-42v-400q0-24 18-42t42-18h600q24 0 42 18t18 42H180v400h321v60H180Zm640 60v-400H621v400h199Zm-214 60q-18 0-31.5-13.5T561-205v-430q0-18 13.5-31.5T606-680h229q18 0 31.5 13.5T880-635v430q0 18-13.5 31.5T835-160H606Zm115-360q12 0 21-9t9-21q0-12-9-21t-21.48-9Q709-580 700-571t-9 21.48q0 11.52 9 20.52t21 9Zm0 100Z" />,
);

/** Tool — a spanner. Material Symbols `build`. */
export const ToolIcon = createIcon(
  "ToolIcon",
  <path d="M705-128 447-388q-23 8-46 13t-47 5q-97.08 0-165.04-67.67Q121-505.33 121-602q0-31 8.16-60.39T152-718l145 145 92-86-149-149q25.91-15.16 54.96-23.58Q324-840 354-840q99.17 0 168.58 69.42Q592-701.17 592-602q0 24-5 47t-13 46l259 258q11 10.96 11 26.48T833-198l-76 70q-10.7 11-25.85 11Q716-117 705-128Zm28-57 40-40-273-273q16-21 24-49.5t8-54.5q0-75-55.5-127T350-782l102 104q9 9 8.5 21.5T451-635L318-510q-9.27 8-21.64 8-12.36 0-20.36-8l-98-97q3 77 54.67 127T354-430q25 0 53-8t49-24l277 277ZM476-484Z" />,
);

/** Property item — a house. Material Symbols `home`. */
export const PropertyIcon = createIcon(
  "PropertyIcon",
  <path d="M220-180h150v-250h220v250h150v-390L480-765 220-570v390Zm-60 60v-480l320-240 320 240v480H530v-250H430v250H160Zm320-353Z" />,
);

/** Document — a page with lines. Material Symbols `article`. */
export const DocumentIcon = createIcon(
  "DocumentIcon",
  <path d="M277-279h275v-60H277v60Zm0-171h406v-60H277v60Zm0-171h406v-60H277v60Zm-97 501q-24 0-42-18t-18-42v-600q0-24 18-42t42-18h600q24 0 42 18t18 42v600q0 24-18 42t-42 18H180Zm0-60h600v-600H180v600Zm0-600v600-600Z" />,
);

/** Licence — an ID card. Material Symbols `badge`. */
export const LicenceIcon = createIcon(
  "LicenceIcon",
  <path d="M140-80q-24 0-42-18t-18-42v-480q0-24 18-42t42-18h250v-140q0-24 18-42t42-18h60q24 0 42 18t18 42v140h250q24 0 42 18t18 42v480q0 24-18 42t-42 18H140Zm0-60h680v-480H570v30q0 28-18 44t-42 16h-60q-24 0-42-16t-18-44v-30H140v480Zm92-107h239v-14q0-18-9-32t-23-19q-32-11-50-14.5t-35-3.5q-19 0-40.5 4.5T265-312q-15 5-24 19t-9 32v14Zm336-67h170v-50H568v50Zm-175.5-65.5Q408-395 408-418t-15.5-38.5Q377-472 354-472t-38.5 15.5Q300-441 300-418t15.5 38.5Q331-364 354-364t38.5-15.5ZM568-427h170v-50H568v50ZM450-590h60v-230h-60v230Zm30 210Z" />,
);

/** Insurance — a shield (protection). Material Symbols `shield`. */
export const ShieldIcon = createIcon(
  "ShieldIcon",
  <path d="M480-81q-140-35-230-162.5T160-523v-238l320-120 320 120v238q0 152-90 279.5T480-81Zm0-62q115-38 187.5-143.5T740-523v-196l-260-98-260 98v196q0 131 72.5 236.5T480-143Zm0-337Z" />,
);

/** Subscription — a repeat/renew cycle. Material Symbols `autorenew`. */
export const SubscriptionIcon = createIcon(
  "SubscriptionIcon",
  <path d="M196-331q-20-36-28-72.5t-8-74.5q0-131 94.5-225.5T480-798h43l-80-80 39-39 149 149-149 149-40-40 79-79h-41q-107 0-183.5 76.5T220-478q0 29 5.5 55t13.5 49l-43 43ZM476-40 327-189l149-149 39 39-80 80h45q107 0 183.5-76.5T740-479q0-29-5-55t-15-49l43-43q20 36 28.5 72.5T800-479q0 131-94.5 225.5T480-159h-45l80 80-39 39Z" />,
);

/** Software — angle brackets (a licence key / code). Material Symbols `code`. */
export const SoftwareIcon = createIcon(
  "SoftwareIcon",
  <path d="M320-242 80-482l242-242 43 43-199 199 197 197-43 43Zm318 2-43-43 199-199-197-197 43-43 240 240-242 242Z" />,
);

/**
 * BRAND-01 — the DalyHub brand mark: the white "D" with its connected
 * three-node network, in the approved blue-to-teal gradient.
 *
 * Re-exported here, not defined here, and the reason is payload rather than
 * taste. Every icon in this module is created by a top-level `createIcon(...)`
 * CALL, which a bundler cannot prove is side-effect free — so importing any one
 * icon pulls the whole set into the chunk. The offline shell needs the brand
 * mark and nothing else from this set, and precaching the whole set to draw one
 * glyph cost 13.5 kB on a device that by definition has no connection to spare.
 * `./BrandMark` is a standalone module, so that import costs what the mark
 * costs.
 *
 * It is the one mark here that is NOT a Material Symbols glyph and does not take
 * `currentColor`: it is the product's identity, drawn from the same generated
 * geometry as the favicon and every PWA icon.
 *
 * The export stays here so that every existing `~/shared/icons` import keeps
 * working and this file still answers "where is the brand mark".
 */
export { BrandMark } from "./BrandMark";
