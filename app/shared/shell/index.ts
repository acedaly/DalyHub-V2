/**
 * PX-02 — public entry for the application frame.
 *
 * The premium shell: a persistent sidebar (identity, search/command entries,
 * navigation, user menu) and a full-height content pane with its own Pane Header
 * (PRODUCT_EXPERIENCE #1–#4). Compose one `AppShell` around the route Outlet; give
 * each surface a `PaneHeader`. Existing direct imports (`~/shared/shell/AppShell`)
 * keep working; this entry is the tidy surface.
 */

export { AppShell, type AppShellProps } from "./AppShell";
export { Sidebar, type SidebarProps } from "./Sidebar";
export { DesktopTopBar, type DesktopTopBarProps } from "./DesktopTopBar";
export { PaneHeader, type PaneHeaderProps } from "./PaneHeader";
/**
 * UX-01 — a full-page surface that does not compose a `PaneHeader` (a create page,
 * for example) publishes its own phone top-bar identity with this. Without it the
 * phone bar falls back to the workspace name, so the owner sees "DalyHub" where the
 * screen's name belongs.
 */
export {
  useSetMobileTopBar,
  type MobileTopBarState,
} from "./mobile-top-bar-context";
export { PrimaryNavigation } from "./PrimaryNavigation";
export { SidebarBrand } from "./SidebarBrand";
export { SidebarSearch } from "./SidebarSearch";
export { CaptureFab } from "./CaptureFab";
export { UserMenu, ACCESS_LOGOUT_PATH } from "./UserMenu";
/**
 * APPEARANCE-01 — the ONE appearance control and its presentation registry. Both
 * the account menu and Settings compose the same component; there is no second
 * appearance control anywhere in the product.
 */
export {
  AppearanceSelector,
  APPEARANCE_ACTION_PATH,
  type AppearanceSelectorProps,
} from "./AppearanceSelector";
export {
  APPEARANCE_LABEL,
  APPEARANCE_OPTIONS,
  appearanceLabel,
  appearanceOption,
  type AppearanceDescriptor,
} from "./appearance";
export {
  displayNameFromEmail,
  greetingNameFor,
  initialsFromName,
} from "./identity-display";
export { MobileNav, MOBILE_NAV_ID } from "./MobileNav";
export { ModulePlaceholder } from "./ModulePlaceholder";
export {
  ModuleComingSoon,
  type ModuleComingSoonProps,
} from "./ModuleComingSoon";
