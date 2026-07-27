/**
 * The Universal Relationship System — the drop-in Linked Items tab.
 *
 * The thin wrapper a record's DS-02 Record Layout mounts as its "Linked" tab:
 * it renders the shared {@link LinkedItemsSection} and, when given a target,
 * registers a Command-Palette contextual action ("Link a record to this …") so
 * relationships can be created from `⌘K` (a `navigate` action that opens the
 * record's Linked tab — never a focus-moving `run` action, per COMMAND_PALETTE.md).
 */

import { useMemo } from "react";

import {
  useRegisterContextualActions,
  type AppAction,
} from "~/shared/commands";
import { getEntityIdentity } from "~/shared/entity";
import type { SearchResultTarget } from "~/kernel/modules";

import {
  LinkedItemsSection,
  type LinkedItemsSectionProps,
} from "./LinkedItemsSection";

export interface LinkedItemsTabProps extends LinkedItemsSectionProps {
  /**
   * Where the palette's "Link a record…" action navigates (this record's Linked
   * tab). Omit to skip registering the command (e.g. the demo fixture).
   */
  readonly linkCommandTarget?: SearchResultTarget;
}

export function LinkedItemsTab({
  linkCommandTarget,
  ...sectionProps
}: LinkedItemsTabProps) {
  const anchorType = sectionProps.anchorType;
  const readOnly = sectionProps.readOnly ?? false;

  const actions = useMemo<AppAction[]>(() => {
    if (!linkCommandTarget || readOnly) return [];
    const label =
      (anchorType
        ? getEntityIdentity(anchorType)?.label.toLowerCase()
        : null) ?? "record";
    return [
      {
        id: `linked-items.link.${sectionProps.anchorId}`,
        title: `Link a record to this ${label}`,
        keywords: ["link", "relate", "related", "connect", "relationship"],
        kind: "navigate",
        target: linkCommandTarget,
      },
    ];
  }, [linkCommandTarget, readOnly, anchorType, sectionProps.anchorId]);

  useRegisterContextualActions(actions);

  return <LinkedItemsSection {...sectionProps} />;
}
