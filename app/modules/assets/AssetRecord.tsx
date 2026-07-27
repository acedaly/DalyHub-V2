/**
 * ASSET-01 — the canonical Asset record, composed through the shared DS-02 Record
 * Layout.
 *
 * Presentation + client-side mutation plumbing only: the header (type identity,
 * status, Rename, archive state) and the tabs (Summary / Details / Dates / Linked /
 * Activity / Settings). Data loading lives in the route; this component renders it
 * and posts lifecycle intents (`archive` / `restore` / `delete`) to
 * `/asset/:id/mutate`, revalidating on success. The Details form owns its own save.
 * Empty-looking tabs stay calm (the Dates tab shows a gentle line rather than a wall
 * of empty rows); no tab is hidden, but none is noisy.
 */

import { useCallback, useState } from "react";
import { useNavigate } from "react-router";

import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import { LinkedItemsTab } from "~/shared/linked-items";
import {
  RecordLayout,
  type RecordAction,
  type RecordMetaItem,
} from "~/shared/record-layout";

import { AssetDatesTab } from "./AssetDatesTab";
import { AssetDetailsForm, type RecordOption } from "./AssetDetailsForm";
import { AssetSettingsTab } from "./AssetSettingsTab";
import { AssetSummary, type AssetSummaryContext } from "./AssetSummary";
import { AssetTimelineTab } from "./AssetTimelineTab";
import { assetStatusTone, type SerializedAsset } from "./asset-view";
import type { AssetMutationResult } from "./routes/mutate";

interface AssetRecordProps {
  readonly asset: SerializedAsset;
  readonly names: AssetSummaryContext;
  readonly people: readonly RecordOption[];
  readonly areas: readonly RecordOption[];
  readonly today: string;
  readonly activeTabId: string;
  readonly onTabChange: (tabId: string) => void;
  readonly onRename: () => void;
  readonly onSaved: () => void;
}

const TONE_TO_RECORD: Record<
  ReturnType<typeof assetStatusTone>,
  "neutral" | "accent" | "success" | "warning" | "danger" | "info"
> = {
  neutral: "neutral",
  accent: "accent",
  success: "success",
  warning: "warning",
  danger: "danger",
};

export function AssetRecord({
  asset,
  names,
  people,
  areas,
  today,
  activeTabId,
  onTabChange,
  onRename,
  onSaved,
}: AssetRecordProps) {
  const feedback = useFeedback();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);

  const post = useCallback(
    async (intent: string): Promise<AssetMutationResult> => {
      const body = new FormData();
      body.set("intent", intent);
      const response = await fetch(
        `/asset/${encodeURIComponent(asset.id)}/mutate`,
        { method: "POST", body },
      );
      return (await response.json()) as AssetMutationResult;
    },
    [asset.id],
  );

  const onArchive = useCallback(() => {
    setPending(true);
    void post("archive")
      .then((result) => {
        if (result.kind === "archive" && result.ok) {
          feedback.notifySuccess(`"${asset.title}" archived`);
          onSaved();
        } else {
          feedback.notifyError("Couldn't archive this asset. Try again.");
        }
      })
      .catch(() =>
        feedback.notifyError("Couldn't archive this asset. Try again."),
      )
      .finally(() => setPending(false));
  }, [post, feedback, asset.title, onSaved]);

  const onRestore = useCallback(() => {
    setPending(true);
    void post("restore")
      .then((result) => {
        if (result.kind === "restore" && result.ok) {
          feedback.notifySuccess(`"${asset.title}" restored`);
          onSaved();
        } else {
          feedback.notifyError("Couldn't restore this asset. Try again.");
        }
      })
      .catch(() =>
        feedback.notifyError("Couldn't restore this asset. Try again."),
      )
      .finally(() => setPending(false));
  }, [post, feedback, asset.title, onSaved]);

  const onDelete = useCallback(async () => {
    const result = await post("delete");
    if (result.kind === "delete" && result.ok) {
      navigate("/assets");
      return;
    }
    if (result.kind === "delete" && result.blockedReason === "has_links") {
      throw new Error(
        "Unlink this asset's related records before deleting it permanently.",
      );
    }
    throw new Error("Couldn't delete this asset.");
  }, [post, navigate]);

  const renameAction: RecordAction = {
    id: "rename",
    label: "Rename",
    variant: "secondary",
    onSelect: onRename,
  };

  const headerMetadata: RecordMetaItem[] = [
    { id: "type", label: "Type", value: asset.assetTypeLabel },
  ];
  const modelLine = [asset.manufacturer, asset.model].filter(Boolean).join(" ");
  if (modelLine) {
    headerMetadata.push({
      id: "model",
      label: "Make & model",
      value: modelLine,
    });
  }
  if (names.ownerName) {
    headerMetadata.push({
      id: "owner",
      label: "Owner",
      value: names.ownerName,
    });
  }

  return (
    <RecordLayout
      title={asset.title}
      typeLabel={asset.assetTypeLabel}
      icon={<EntityIcon type="asset" />}
      breadcrumb={[{ id: "assets", label: "Assets", href: "/assets" }]}
      status={{
        label: asset.archived
          ? `Archived · ${asset.statusLabel}`
          : asset.statusLabel,
        tone: asset.archived
          ? "warning"
          : TONE_TO_RECORD[assetStatusTone(asset.status)],
      }}
      metadata={headerMetadata}
      secondaryActions={[renameAction]}
      activeTabId={activeTabId}
      onTabChange={onTabChange}
      tabs={[
        {
          id: "summary",
          label: "Summary",
          content: (
            <AssetSummary
              asset={asset}
              names={names}
              today={today}
              onEditDetails={() => onTabChange("details")}
            />
          ),
        },
        {
          id: "details",
          label: "Details",
          content: (
            <AssetDetailsForm
              asset={asset}
              people={people}
              areas={areas}
              onSaved={onSaved}
            />
          ),
        },
        {
          id: "dates",
          label: "Dates",
          content: <AssetDatesTab asset={asset} today={today} />,
        },
        {
          id: "linked",
          label: "Linked",
          content: (
            <LinkedItemsTab
              anchorId={asset.id}
              anchorType="asset"
              readOnly={asset.archived}
              linkCommandTarget={{
                kind: "route",
                to: `/asset/${asset.id}?tab=linked`,
              }}
            />
          ),
        },
        {
          id: "activity",
          label: "Activity",
          content: (
            <AssetTimelineTab assetId={asset.id} reloadKey={asset.updatedAt} />
          ),
        },
        {
          id: "settings",
          label: "Settings",
          content: (
            <AssetSettingsTab
              asset={asset}
              onRename={onRename}
              onArchive={onArchive}
              onRestore={onRestore}
              onDelete={onDelete}
              pending={pending}
            />
          ),
        },
      ]}
    />
  );
}
