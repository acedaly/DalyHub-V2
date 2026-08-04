/**
 * BRAND-01 — public entry for DalyHub's product branding.
 *
 * The product NAME and TAGLINE live here as constants so no surface invents its
 * own spelling, and the lockup is the one component that renders them together.
 *
 * The mark is re-exported from its own module rather than from the
 * `~/shared/icons` barrel, so a surface that wants only the brand — the offline
 * shell is the one that matters — does not pull the whole outline set into its
 * chunk. `~/shared/icons` still exports it for everything else.
 */

export { BrandMark } from "~/shared/icons/BrandMark";

export {
  BrandLockup,
  PRODUCT_NAME,
  PRODUCT_TAGLINE,
  type BrandLockupProps,
} from "./BrandLockup";
