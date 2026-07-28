/**
 * DS-12 — public entry for the shared overflow (⋯) menu.
 *
 * One menu component and one item model for every overflow surface: the Record
 * Header (DS-02) and the Card (DS-04). Never build a second menu.
 */

export { OverflowMenu } from "./OverflowMenu";
export type {
  OverflowMenuItem,
  OverflowMenuItemTone,
  OverflowMenuProps,
} from "./types";
