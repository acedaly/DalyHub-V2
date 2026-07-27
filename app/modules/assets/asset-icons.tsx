/**
 * ASSET-01 — the Asset-type subtype-icon registry.
 *
 * ONE stable icon per Asset type, mapped from the SHARED icon set
 * (`~/shared/icons`) — never a one-off SVG at a call site, and never a hand-picked
 * icon in a component. This mirrors the Diary subtype-icon precedent
 * (`~/modules/diary/diary-icons`): a small module-local mapping over shared,
 * design-token (`currentColor`) icons that work in light and dark, with a safe
 * fallback to the Asset entity glyph for an unknown type. The collection, record,
 * search results and Linked Items all resolve an Asset's type glyph through this.
 */

import type { ComponentType } from "react";

import type { AssetType } from "~/kernel/assets";
import {
  ApplianceIcon,
  AssetIcon,
  DocumentIcon,
  ElectronicsIcon,
  EquipmentIcon,
  type IconProps,
  LicenceIcon,
  PropertyIcon,
  ShieldIcon,
  SoftwareIcon,
  SubscriptionIcon,
  ToolIcon,
  TrailerIcon,
  VehicleIcon,
} from "~/shared/icons";

/** The stable Asset-type → icon mapping. Extend here when a new type is added. */
const ASSET_TYPE_ICONS: Record<AssetType, ComponentType<IconProps>> = {
  vehicle: VehicleIcon,
  trailer: TrailerIcon,
  equipment: EquipmentIcon,
  appliance: ApplianceIcon,
  electronics: ElectronicsIcon,
  tool: ToolIcon,
  property_item: PropertyIcon,
  document: DocumentIcon,
  licence: LicenceIcon,
  insurance: ShieldIcon,
  subscription: SubscriptionIcon,
  software: SoftwareIcon,
  other: AssetIcon,
};

/** The icon component for an Asset type, falling back to the Asset entity glyph. */
export function assetTypeIcon(assetType: string): ComponentType<IconProps> {
  return ASSET_TYPE_ICONS[assetType as AssetType] ?? AssetIcon;
}
