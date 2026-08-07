/**
 * M3-TIP — the ONE tooltip primitive.
 *
 * Compose `Tooltip` around any control whose meaning is carried by a glyph. It
 * supplies the description, never the NAME: every adopter keeps its own
 * `aria-label` or visually-hidden text. See `Tooltip.tsx` for the full contract.
 */

export {
  Tooltip,
  composeRefs,
  type TooltipProps,
  type TooltipTriggerProps,
} from "./Tooltip";
export { parseModShortcut } from "./shortcut-notation";
