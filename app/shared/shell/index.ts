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
export { PaneHeader, type PaneHeaderProps } from "./PaneHeader";
export { PrimaryNavigation } from "./PrimaryNavigation";
export { SidebarBrand } from "./SidebarBrand";
export { SidebarSearch } from "./SidebarSearch";
export {
  UserMenu,
  ACCESS_LOGOUT_PATH,
  displayNameFromEmail,
  initialsFromName,
} from "./UserMenu";
export { ThemeControl, THEME_ACTION_PATH } from "./ThemeControl";
export { MobileNav, MOBILE_NAV_ID } from "./MobileNav";
export { ModulePlaceholder } from "./ModulePlaceholder";
export {
  THEME_PREFERENCES,
  DEFAULT_THEME,
  THEME_COOKIE_NAME,
  THEME_COOKIE_MAX_AGE,
  isThemePreference,
  parseThemePreference,
  readThemePreference,
  serializeThemeCookie,
  type ThemePreference,
} from "./theme";
