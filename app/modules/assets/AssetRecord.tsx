/**
 * ASSET-01/ASSET-02 — the canonical Asset record, composed through the shared DS-02
 * Record Layout.
 *
 * Presentation + client-side mutation plumbing only: the header (type identity,
 * status, archive state) and the tabs — Overview / Obligations / History /
 * Details / Linked / Activity / Settings. Data loading lives in the route; this
 * component renders it and posts lifecycle intents (`archive` / `restore` /
 * `delete`) to `/asset/:id/mutate`, revalidating on success. The Details form owns
 * its own save; the history and obligation forms own theirs.
 *
 * ASSET-02 folded the old standalone "Dates" tab INTO Overview, behind an "All
 * dates" disclosure. Seven tabs is already the ceiling on a phone, and the dates
 * are context for the overview rather than a destination of their own — obligations
 * are now where a future date actually lives.
 */

import { useCallback, useState } from "react";
import { useNavigate } from "react-router";

import { TITLE_MAX_LENGTH } from "~/kernel/entities";
import { EntityIcon } from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import {
  InlineSelectField,
  InlineTextField,
  type InlineSaveOutcome,
} from "~/shared/inline-edit";
import { ASSET_STATUSES } from "~/kernel/assets";
import { LinkedItemsTab } from "~/shared/linked-items";
import { RecordLayout, type RecordMetaItem } from "~/shared/record-layout";
import {
  lifecycleBlockedByLinks,
  lifecycleSuccessMessage,
  useRecordLifecycle,
} from "~/shared/record-lifecycle";

import { AssetDetailsForm, type RecordOption } from "./AssetDetailsForm";
import { AssetHistoryTab, type QuickEventAction } from "./AssetHistoryTab";
import { AssetObligationsTab } from "./AssetObligationsTab";
import {
  AssetOverview,
  type AssetOverviewData,
  type AssetSummaryContext,
} from "./AssetOverview";
import { AssetSettingsTab } from "./AssetSettingsTab";
import { AssetTimelineTab } from "./AssetTimelineTab";
import type {
  SerializedAssetEvent,
  SerializedAssetObligation,
} from "./asset-history-view";
import { assetStatusTone, type SerializedAsset } from "./asset-view";
import type { AssetMutationResult } from "./routes/mutate";

interface AssetRecordProps {
  readonly asset: SerializedAsset;
  readonly names: AssetSummaryContext;
  readonly people: readonly RecordOption[];
  readonly areas: readonly RecordOption[];
  readonly today: string;
  readonly activeTabId: string;
  /** ASSET-02 — the history + obligations payload the loader derived. */
  readonly overview: AssetOverviewData;
  readonly obligations: readonly SerializedAssetObligation[];
  readonly events: readonly SerializedAssetEvent[];
  readonly eventsCursor: string | null;
  readonly eventsHasMore: boolean;
  readonly onTabChange: (tabId: string) => void;
  /**
   * DS-16 — rename from the record heading (EDIT-02). Returns an outcome rather
   * than throwing, so a refusal keeps the typed name in the field.
   */
  readonly onRename: (title: string) => Promise<InlineSaveOutcome>;
  /**
   * DHDS-10 — set ONE detail field, through the same `intent=update` endpoint
   * the details form posts to. Omit and the context line renders plain facts.
   */
  readonly onSetField?: (
    field: string,
    value: string,
  ) => Promise<InlineSaveOutcome>;
  readonly onSaved: () => void;
  readonly onQuickEvent: (action: QuickEventAction) => void;
  readonly onEditEvent: (event: SerializedAssetEvent) => void;
  readonly onAddObligation: () => void;
  readonly onEditObligation: (obligation: SerializedAssetObligation) => void;
  readonly onCompleteObligation: (
    obligation: SerializedAssetObligation,
  ) => void;
}

/**
 * The status vocabulary, from the ONE module that owns it.
 *
 * `ASSET_STATUSES` is the kernel's list, in its display order, with its
 * wording — so this control, the details form and the collection filter can
 * never offer different words for the same six values. DHDS-10 §22 is explicit
 * that a status vocabulary is not something an interaction pass invents.
 */
const ASSET_STATUS_OPTIONS = ASSET_STATUSES.map(({ value, label }) => ({
  value,
  label,
}));

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
  overview,
  obligations,
  events,
  eventsCursor,
  eventsHasMore,
  onTabChange,
  onRename,
  onSetField,
  onSaved,
  onQuickEvent,
  onEditEvent,
  onAddObligation,
  onEditObligation,
  onCompleteObligation,
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

  const onArchive = useCallback(async () => {
    setPending(true);
    await post("archive")
      .then((result) => {
        if (result.kind === "archive" && result.ok) {
          feedback.notifySuccess(lifecycleSuccessMessage("archive", "asset"));
          onSaved();
        } else {
          feedback.notifyError("Couldn’t archive this asset. Try again.");
        }
      })
      .catch(() =>
        feedback.notifyError("Couldn’t archive this asset. Try again."),
      )
      .finally(() => setPending(false));
  }, [post, feedback, onSaved]);

  const onRestore = useCallback(async () => {
    setPending(true);
    await post("restore")
      .then((result) => {
        if (result.kind === "restore" && result.ok) {
          feedback.notifySuccess(lifecycleSuccessMessage("restore", "asset"));
          onSaved();
        } else {
          feedback.notifyError("Couldn’t restore this asset. Try again.");
        }
      })
      .catch(() =>
        feedback.notifyError("Couldn’t restore this asset. Try again."),
      )
      .finally(() => setPending(false));
  }, [post, feedback, onSaved]);

  const onDelete = useCallback(async () => {
    const result = await post("delete");
    if (result.kind === "delete" && result.ok) {
      navigate("/assets");
      return;
    }
    if (result.kind === "delete" && result.blockedReason === "has_links") {
      throw new Error(lifecycleBlockedByLinks("asset", result.linkCount));
    }
    throw new Error("Couldn’t delete this asset.");
  }, [post, navigate]);

  /*
   * RECORD-01 — the context line, with the type stated ONCE.
   *
   * "Type: Vehicle" was a labelled chip here AND the header's own subtype label
   * directly above it AND the first line of the Overview panel below it. The
   * subtype label survives — it is genuinely informative in a way "Asset" would
   * not be, which is exactly the case the contract keeps a `typeLabel` for —
   * and the duplicate chip is gone.
   */
  const headerMetadata: RecordMetaItem[] = [];
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
  /*
   * DHDS-10 — the real-world STATE, as a contextual choice.
   *
   * It is the fact an owner changes most about an Asset — a tool is lent out, a
   * car goes in for repair, a laptop is retired — and until this phase it was
   * reachable only through the Details tab's eighteen-field form.
   *
   * It is a CONTEXT-LINE control rather than the header's status pill, and the
   * distinction is load-bearing (§24). The pill states the record's headline
   * condition with archive precedence ("Archived · Stored"); the context line
   * states the Asset's own status, which is what `status` actually holds. An
   * ARCHIVED Asset gets the plain fact: it is read-only until restored, and the
   * repository refuses the mutation.
   *
   * It is LAST in the run, and that is a composition choice with a reason: a
   * `meta` field reserves its caret's width at rest so revealing it cannot move
   * the text beside it (DHDS-08's reveal contract, and DHDS-10 §26's "hover
   * must not move surrounding content"). At the END of a wrapping run that
   * reserved space costs nothing; in the MIDDLE it reads as a double gap before
   * the next separator. The identity facts come first and the state follows
   * them, which is also the order the Project record uses.
   */
  if (onSetField && !asset.archived) {
    headerMetadata.push({
      id: "status",
      label: "Status",
      value: (
        <InlineSelectField
          label="Status"
          value={asset.status}
          options={ASSET_STATUS_OPTIONS}
          onSave={(next) => onSetField("status", next)}
          presentation="meta"
          data-testid="asset-status-edit"
        />
      ),
    });
  }

  // PX-04: the SAME lifecycle actions, in the SAME shared overflow slot, as every
  // other record. The Settings tab keeps the full explanation and the
  // dependency/blocked detail; `notifyOnSuccess` is off because the handlers
  // above already report through the shared `lifecycleSuccessMessage` wording
  // (they are driven from Settings too).
  const lifecycle = useRecordLifecycle({
    entityType: "asset",
    title: asset.title,
    archived: asset.archived,
    onArchive,
    onRestore,
    onDelete,
    pending,
    notifyOnSuccess: false,
  });

  return (
    <>
      <RecordLayout
        title={asset.title}
        titleSlot={
          <InlineTextField
            label="Asset name"
            value={asset.title}
            onSave={onRename}
            // An archived Asset is read-only until restored, so its name
            // renders as plain text: a value that cannot be changed must not
            // look like one that can (DS-16).
            readOnly={asset.archived}
            variant="heading"
            maxLength={TITLE_MAX_LENGTH}
            data-testid="asset-title-edit"
          />
        }
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
        overflowActions={lifecycle.overflowActions}
        activeTabId={activeTabId}
        onTabChange={onTabChange}
        tabs={[
          {
            id: "summary",
            label: "Overview",
            content: (
              <AssetOverview
                asset={asset}
                names={names}
                data={overview}
                today={today}
                onEditDetails={() => onTabChange("details")}
                onOpenObligations={() => onTabChange("obligations")}
                onOpenHistory={() => onTabChange("history")}
                /*
                 * The loader's existing bounded Area set, and the one-field
                 * save. An ARCHIVED Asset gets neither, so its sheet renders as
                 * plain text — read-only until restored, exactly as its title
                 * already was.
                 */
                areas={areas.map((area) => ({
                  id: area.id,
                  title: area.title,
                }))}
                {...(onSetField && !asset.archived ? { onSetField } : {})}
              />
            ),
          },
          {
            id: "obligations",
            label: obligationTabLabel(obligations),
            content: (
              <AssetObligationsTab
                assetId={asset.id}
                obligations={obligations}
                readOnly={asset.archived}
                onAdd={onAddObligation}
                onEdit={onEditObligation}
                onComplete={onCompleteObligation}
                onChanged={onSaved}
              />
            ),
          },
          {
            id: "history",
            label: "History",
            content: (
              <AssetHistoryTab
                assetId={asset.id}
                assetType={asset.assetType}
                initialEvents={events}
                initialCursor={eventsCursor}
                initialHasMore={eventsHasMore}
                readOnly={asset.archived}
                reloadKey={asset.updatedAt}
                onQuickAction={onQuickEvent}
                onEditEvent={onEditEvent}
                onChanged={onSaved}
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
              <AssetTimelineTab
                assetId={asset.id}
                reloadKey={asset.updatedAt}
              />
            ),
          },
          {
            id: "settings",
            label: "Settings",
            content: (
              <AssetSettingsTab
                asset={asset}
                onArchive={onArchive}
                onRestore={onRestore}
                onDelete={onDelete}
                pending={pending}
              />
            ),
          },
        ]}
      />
      {lifecycle.dialogs}
    </>
  );
}

/**
 * The Obligations tab label carries its own overdue count, so the signal survives
 * on a phone where the tab strip may be the only thing visible — and it is a NUMBER
 * in text, never a coloured dot (§24).
 */
function obligationTabLabel(
  obligations: readonly SerializedAssetObligation[],
): string {
  const overdue = obligations.filter(
    (o) => o.status === "open" && o.state === "overdue",
  ).length;
  return overdue > 0 ? `Obligations (${overdue} overdue)` : "Obligations";
}
