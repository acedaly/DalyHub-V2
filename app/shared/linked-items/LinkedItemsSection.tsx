/**
 * The Universal Relationship System — the ONE reusable Linked Items section.
 *
 * Every record's detail surface (Area, Goal, Project, Task, Note, Diary,
 * Meeting, Person) composes THIS component for its "Linked" section, replacing
 * the per-module hand-rolled tabs (People/Meetings rendered a read-only list;
 * Projects/Tasks each wired their own picker). It shows the record's linked items
 * grouped by kind — each a navigable {@link EntityLink} inside a {@link HoverCard}
 * summary, with a Remove control for the generic links the user owns — and, when
 * writable, the shared DS-06 {@link EntityLinkPicker} as the search-to-add
 * affordance. Add/remove are optimistic with Undo, offline-aware, and go through
 * the shared `/links` endpoint (workspace-scoped, policy-enforced server-side).
 */

import { useMemo } from "react";

import {
  EntityIcon,
  EntityLink,
  getEntityIdentity,
  isEntityType,
} from "~/shared/entity";
import { useFeedback } from "~/shared/feedback";
import { EntityLinkPicker } from "~/shared/forms";
import type { EntityLinkTargetOption } from "~/shared/forms/model";

import { HoverCard } from "./HoverCard";
import { UNIVERSAL_RELATED_DESCRIPTOR } from "./constants";
import {
  groupLinkedItems,
  type LinkedItem,
  type LinkSummary,
} from "./linked-items-model";
import { useLinkedItems, type LinkedItemsTransport } from "./use-linked-items";

export interface LinkedItemsSectionProps {
  /** The anchor record's id. */
  readonly anchorId: string;
  /** The anchor record's entity type (used in help copy). */
  readonly anchorType?: string;
  /** Hide the add/remove controls (e.g. an archived, read-only record). */
  readonly readOnly?: boolean;
  /** Test/demo transport injection (defaults to the real `/links` client). */
  readonly transport?: LinkedItemsTransport;
  /** Optional server-seeded items (SSR) so the list renders without a fetch flash. */
  readonly initialItems?: readonly LinkedItem[];
}

function typeLabel(type: string): string {
  return getEntityIdentity(type)?.label ?? type;
}

function pluralLabel(type: string): string {
  return getEntityIdentity(type)?.pluralLabel ?? `${type}s`;
}

function summaryDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function LinkSummaryBody({ summary }: { readonly summary: LinkSummary }) {
  return (
    <span className="dh-linked-items__summary">
      <span className="dh-linked-items__summary-type">
        {typeLabel(summary.type)}
      </span>
      <span className="dh-linked-items__summary-title">
        {summary.title || "Untitled"}
      </span>
      <span className="dh-linked-items__summary-meta">
        Updated {summaryDate(summary.updatedAt)}
      </span>
    </span>
  );
}

export function LinkedItemsSection({
  anchorId,
  anchorType,
  readOnly = false,
  transport,
  initialItems,
}: LinkedItemsSectionProps) {
  const feedback = useFeedback();
  const controller = useLinkedItems({
    anchorId,
    ...(transport ? { transport } : {}),
    ...(initialItems ? { initialItems } : {}),
  });
  const {
    items,
    status,
    online,
    reload,
    searchTargets,
    loadSummary,
    link,
    unlink,
  } = controller;

  const groups = useMemo(() => groupLinkedItems(items), [items]);

  // The DS-06 picker excludes already-linked targets from its results; feed it
  // the current selections in its own shape.
  const pickerSelections = useMemo(
    () =>
      items.map((item) => ({
        linkId: item.linkId,
        target: item.target,
        linkType: UNIVERSAL_RELATED_DESCRIPTOR.type,
        direction: item.direction,
      })),
    [items],
  );

  const handleLink = async ({
    target,
    direction,
  }: {
    readonly target: EntityLinkTargetOption;
    readonly linkType: string;
    readonly direction: "outgoing" | "incoming";
  }) => {
    const outcome = await link(target, direction);
    if (outcome.ok) {
      feedback.notifySuccess(`Linked ${target.title || "item"}.`);
      return;
    }
    // Reject so the picker preserves the input and shows its inline error.
    throw new Error(outcome.message ?? "Couldn't link that item.");
  };

  const handleRemove = async (item: LinkedItem) => {
    const outcome = await unlink(item);
    if (outcome.ok) {
      feedback.notifyUndo(`Removed link to ${item.target.title || "item"}.`, {
        onUndo: async () => {
          const restore = await link(item.target, item.direction);
          if (!restore.ok) {
            feedback.notifyError(
              restore.message ?? "Couldn't restore the link.",
            );
          }
        },
      });
    } else {
      feedback.notifyError(outcome.message ?? "Couldn't remove the link.");
    }
  };

  return (
    <div className="dh-linked-items">
      <h2 className="dh-visually-hidden">Linked items</h2>

      {status === "loading" ? (
        <p className="dh-linked-items__status" role="status">
          Loading linked items…
        </p>
      ) : status === "error" ? (
        <p className="dh-linked-items__status dh-linked-items__status--error">
          Couldn&rsquo;t load linked items.{" "}
          <button
            type="button"
            className="dh-linked-items__retry"
            onClick={reload}
          >
            Retry
          </button>
        </p>
      ) : groups.length === 0 ? (
        <p className="dh-linked-items__empty">
          Nothing linked yet.{" "}
          {readOnly ? null : "Search below to link a record."}
        </p>
      ) : (
        <ul className="dh-linked-items__groups">
          {groups.map((group) => (
            <li key={group.type} className="dh-linked-items__group">
              <h3 className="dh-linked-items__group-heading">
                <span
                  className="dh-linked-items__group-icon"
                  aria-hidden="true"
                >
                  {isEntityType(group.type) ? (
                    <EntityIcon type={group.type} />
                  ) : null}
                </span>
                {pluralLabel(group.type)}
                <span className="dh-linked-items__group-count">
                  {" "}
                  ({group.items.length})
                </span>
              </h3>
              <ul className="dh-linked-items__list">
                {group.items.map((item) => (
                  <li key={item.linkId} className="dh-linked-items__item">
                    <HoverCard
                      loadSummary={(signal) =>
                        loadSummary(item.target.id, signal)
                      }
                      renderSummary={(summary) => (
                        <LinkSummaryBody summary={summary} />
                      )}
                    >
                      <EntityLink
                        type={item.target.type}
                        id={item.target.id}
                        title={item.target.title || "Untitled"}
                        className="dh-linked-items__link"
                      />
                    </HoverCard>
                    {!readOnly && item.removable ? (
                      <button
                        type="button"
                        className="dh-linked-items__remove"
                        aria-label={`Remove link to ${item.target.title || "item"}`}
                        onClick={() => void handleRemove(item)}
                      >
                        Remove
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}

      {!readOnly ? (
        <div className="dh-linked-items__add">
          {!online ? (
            <p className="dh-linked-items__offline" role="status">
              You&rsquo;re offline — linking is paused until you reconnect.
            </p>
          ) : null}
          <EntityLinkPicker
            label="Link a record"
            help={`Search your workspace to relate this ${
              anchorType ? typeLabel(anchorType).toLowerCase() : "record"
            } to another record.`}
            anchorId={anchorId}
            direction="outgoing"
            linkTypes={[UNIVERSAL_RELATED_DESCRIPTOR]}
            existingLinks={pickerSelections}
            hideExistingList
            searchTargets={searchTargets}
            onLink={handleLink}
            onUnlink={async () => {}}
            disabled={!online}
            renderTargetIcon={(type) =>
              isEntityType(type) ? <EntityIcon type={type} /> : null
            }
          />
        </div>
      ) : null}
    </div>
  );
}
