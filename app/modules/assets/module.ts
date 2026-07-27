/**
 * ASSET-01 — the Assets product module manifest.
 *
 * Assets are first-class DalyHub records (AGENTS.md §5) — things of value, physical,
 * digital or financial. The manifest declares the `asset` entity type (so the
 * sidebar renders its identity glyph), the Asset-owned Activity event types (for the
 * relationship Timeline), the `asset.linked_*` EntityLink types (so links across the
 * spine are labelled), the command-palette contributions and the global search
 * provider. Everything is declarative data; discovery wires it in with no central
 * edit.
 */

import {
  ASSET_ARCHIVED,
  ASSET_CREATED,
  ASSET_DISPOSED,
  ASSET_LINKED_AREA,
  ASSET_LINKED_ASSET,
  ASSET_LINKED_DIARY,
  ASSET_LINKED_GOAL,
  ASSET_LINKED_MEETING,
  ASSET_LINKED_NOTE,
  ASSET_LINKED_PERSON,
  ASSET_LINKED_PROJECT,
  ASSET_LINKED_TASK,
  ASSET_RESTORED,
  ASSET_STATUS_CHANGED,
  ASSET_UPDATED,
} from "~/kernel/assets";
import { defineModule } from "~/kernel/modules";

import { assetsCommands } from "./commands";
import routes from "./routes.manifest";
import { assetsSearchProvider } from "./search";

export default defineModule({
  id: "assets",
  name: "Assets",
  description: "Things of value — physical, digital or financial.",
  order: 140,
  routes,
  entityTypes: [{ type: "asset", singular: "Asset", plural: "Assets" }],
  activityTypes: [
    {
      type: ASSET_CREATED,
      label: "Asset added",
      description: "An asset was added to Assets.",
    },
    {
      type: ASSET_UPDATED,
      label: "Asset details updated",
      description: "An asset's details changed.",
    },
    {
      type: ASSET_STATUS_CHANGED,
      label: "Asset status changed",
      description: "An asset's real-world status changed.",
    },
    {
      type: ASSET_ARCHIVED,
      label: "Asset archived",
      description: "An asset was archived.",
    },
    {
      type: ASSET_RESTORED,
      label: "Asset restored",
      description: "An archived asset was restored.",
    },
    {
      type: ASSET_DISPOSED,
      label: "Asset disposed",
      description: "An asset was marked as disposed.",
    },
  ],
  entityLinkTypes: [
    {
      type: ASSET_LINKED_AREA,
      sourceLabel: "Linked area",
      sourceEntityType: "asset",
      targetEntityType: "area",
    },
    {
      type: ASSET_LINKED_GOAL,
      sourceLabel: "Linked goal",
      sourceEntityType: "asset",
      targetEntityType: "goal",
    },
    {
      type: ASSET_LINKED_PROJECT,
      sourceLabel: "Linked project",
      sourceEntityType: "asset",
      targetEntityType: "project",
    },
    {
      type: ASSET_LINKED_TASK,
      sourceLabel: "Linked task",
      sourceEntityType: "asset",
      targetEntityType: "task",
    },
    {
      type: ASSET_LINKED_NOTE,
      sourceLabel: "Linked note",
      sourceEntityType: "asset",
      targetEntityType: "note",
    },
    {
      type: ASSET_LINKED_DIARY,
      sourceLabel: "Linked diary entry",
      sourceEntityType: "asset",
      targetEntityType: "diary",
    },
    {
      type: ASSET_LINKED_MEETING,
      sourceLabel: "Linked meeting",
      sourceEntityType: "asset",
      targetEntityType: "meeting",
    },
    {
      type: ASSET_LINKED_PERSON,
      sourceLabel: "Linked person",
      sourceEntityType: "asset",
      targetEntityType: "person",
    },
    {
      type: ASSET_LINKED_ASSET,
      sourceLabel: "Linked asset",
      sourceEntityType: "asset",
      targetEntityType: "asset",
    },
  ],
  commands: assetsCommands,
  searchProviders: [assetsSearchProvider],
});
