/**
 * ASSET-01 / PX-05 — the Asset-type subtype icons.
 *
 * ONE stable icon per Asset type, mapped from the SHARED icon set
 * (`~/shared/icons`) — never a one-off SVG at a call site, and never a hand-picked
 * icon in a component. PX-05 registers the map with the shared subtype-icon
 * registry (`~/shared/entity`) alongside Diary's, so both modules consume one
 * pattern instead of maintaining two private ones; resolution and the safe
 * fallback to the Asset entity glyph now live in shared code. The collection,
 * record, search results and Linked Items all resolve an Asset’s type glyph
 * through this.
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
import { getSubtypeIcon, registerSubtypeIcons } from "~/shared/entity";

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

registerSubtypeIcons("asset", ASSET_TYPE_ICONS);

/** The icon component for an Asset type, falling back to the Asset entity glyph. */
export function assetTypeIcon(assetType: string): ComponentType<IconProps> {
  return getSubtypeIcon("asset", assetType) ?? AssetIcon;
}
