/**
 * X-02 — the cross-module Views surface.
 *
 * Composed entirely from shared primitives: the PX-02 `CollectionLayout`, the
 * MOBILE-01 `CollectionControls` sheet and its `CollectionFilterChips` row, the
 * shared saved-view switcher, the PX-02 entity identity/`EntityLink` navigation and
 * the shared `EmptyState`. There is no new visual language here and no bespoke
 * detail surface — every result opens its own canonical record destination.
 *
 * The controls read as a sentence, not a query builder: **Show** chooses the record
 * types, **Filter & sort** carries the conditions in the owner's words, and the chip
 * row states what is applied. A configuration is never displayed as
 * `field · operator · value`.
 */

import { useMemo } from "react";
import { Link, useSearchParams } from "react-router";

import {
  CollectionControls,
  CollectionFilterChips,
  CollectionLayout,
} from "~/shared/collection-layout";
import {
  DrawerProvider,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { EntityIcon, EntityLink } from "~/shared/entity";
import { SavedViewSwitcher } from "~/shared/saved-views";
import { TaskRecordDrawer } from "~/shared/task-record/TaskRecordDrawer";

import type {
  ViewResultGroup,
  ViewResultItem,
  ViewsPageData,
} from "./views-contract";
import { viewsControlGroups, viewsResetParams } from "./views-controls";
import { configFromParams } from "./views-url-state";

export interface ViewsWorkspaceProps {
  readonly data: ViewsPageData;
}

/**
 * A Task's canonical destination is the shared Task drawer, so this surface has to
 * HOST that drawer — exactly as Today and a Project record do. It hosts nothing
 * else: every other result type opens its own record route, and a saved view never
 * gets a detail surface of its own.
 */
export function ViewsWorkspace({ data }: ViewsWorkspaceProps) {
  const renderDrawer = useMemo(() => {
    return function render(entry: DrawerEntry): DrawerRenderResult | null {
      const separator = entry.key.indexOf(":");
      const kind = separator === -1 ? entry.key : entry.key.slice(0, separator);
      const id = separator === -1 ? "" : entry.key.slice(separator + 1);
      if (kind !== "task" || id.length === 0) return null;
      return {
        title: "Task",
        description: "Task record",
        children: <TaskRecordDrawer taskId={id} />,
      };
    };
  }, []);

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <ViewsWorkspaceInner data={data} />
    </DrawerProvider>
  );
}

function ViewsWorkspaceInner({ data }: ViewsWorkspaceProps) {
  const [params] = useSearchParams();
  const config = configFromParams(params);
  const groups = viewsControlGroups(config);
  const resetParams = viewsResetParams();

  const included = data.scopeOptions.filter((option) => option.selected);
  const subtitle = `${data.total} ${data.total === 1 ? "record" : "records"}${
    data.bounded ? " (first page)" : ""
  } · ${included.map((option) => option.label).join(" + ")}`;

  const isEmpty = data.total === 0;

  return (
    <CollectionLayout
      title={data.title}
      subtitle={subtitle}
      persistentControls
      viewSwitcher={
        <SavedViewSwitcher
          views={data.views}
          activeViewId={data.activeViewId}
          modified={data.modified}
          currentQuery={data.currentQuery}
          shareUrl={data.shareUrl}
          basePath="/views"
          actionPath="/views/saved"
          collectionLabel="saved views"
          defaultViewLabel="view"
          newViewPlaceholder="My view"
          deleteExplanation="This deletes the saved view only. None of the records it showed are affected, and you can save the same configuration again at any time."
          supportsDefault={false}
          classPrefix="dh-tasks-views"
          testIdPrefix="cross-view"
        />
      }
      filterBar={
        <div className="dh-views__filters">
          <ScopeSelector data={data} />
          <CollectionFilterChips
            groups={groups}
            params={params}
            basePath="/views"
            resetParams={resetParams}
            label="Applied conditions"
          />
        </div>
      }
      mobileControls={
        <CollectionControls
          groups={groups}
          basePath="/views"
          resetParams={resetParams}
          triggerLabel="Filter & sort"
          label="Filter, sort and group these views"
        />
      }
      isEmpty={isEmpty}
      emptySlot={<ViewsEmptyState data={data} />}
    >
      <ScopeNotices data={data} />
      {data.groups.map((group) => (
        <ResultGroup key={group.id} group={group} />
      ))}
    </CollectionLayout>
  );
}

/**
 * The scope selector: "Show — Tasks, Projects, …". Toggles, not a multi-select
 * combobox, because choosing which record types are included is the one decision a
 * cross-module view cannot hide behind a menu.
 */
function ScopeSelector({ data }: { readonly data: ViewsPageData }) {
  return (
    <fieldset className="dh-views__scopes">
      <legend className="dh-views__scopes-legend">Show</legend>
      <ul className="dh-views__scope-list">
        {data.scopeOptions.map((option) => (
          <li key={option.scope}>
            {option.hidden ? (
              <span
                className="dh-views__scope dh-views__scope--hidden"
                data-testid={`cross-view-scope-${option.scope}`}
              >
                <EntityIcon type={option.scope} />
                {option.label}
                <span className="dh-views__scope-note"> · module hidden</span>
              </span>
            ) : (
              /*
               * A LINK, because a scope is URL state — so selection is carried by
               * `aria-current` (valid on a link) plus a visually-hidden word, never
               * by `aria-pressed` (a button-only attribute) and never by colour
               * alone.
               */
              <Link
                to={`/views?${option.query}`}
                className="dh-views__scope"
                aria-current={option.selected ? "true" : undefined}
                data-selected={option.selected ? "true" : undefined}
                data-testid={`cross-view-scope-${option.scope}`}
                preventScrollReset
              >
                <EntityIcon type={option.scope} />
                {option.label}
                <span className="dh-visually-hidden">
                  {option.selected ? " — included" : " — not included"}
                </span>
              </Link>
            )}
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/**
 * Why a scope the owner selected contributed nothing. Stated plainly and never
 * silently: a hidden module and a filter this record type cannot answer are
 * different facts, and neither one quietly widens the query.
 */
function ScopeNotices({ data }: { readonly data: ViewsPageData }) {
  if (data.unavailable.length === 0 && !data.bounded) return null;
  return (
    <div className="dh-views__notices" role="status">
      {data.unavailable.map((entry) => (
        <p key={`${entry.scope}-${entry.reason}`} className="dh-views__notice">
          {entry.reason === "module_hidden"
            ? `${entry.scope} records are not shown because that module is hidden in your settings.`
            : `${entry.scope} records are not shown because this view filters on something they don’t have.`}
        </p>
      ))}
      {data.bounded ? (
        <p className="dh-views__notice">
          Showing the first page. Narrow the view to see the rest.
        </p>
      ) : null}
    </div>
  );
}

/**
 * The zero-result state distinguishes three genuinely different situations, because
 * "nothing matched" and "this view can no longer be loaded" need different next
 * actions (ROADMAP X-02 §25).
 */
function ViewsEmptyState({ data }: { readonly data: ViewsPageData }) {
  if (data.awaitingFirstReview) {
    return (
      <EmptyState
        title="No completed Review yet"
        description="This view compares against the period your last completed Review closed. Complete a Review and it will start answering."
        primaryAction={
          <Link to="/reviews" className="dh-btn dh-btn--primary">
            Go to Reviews
          </Link>
        }
      />
    );
  }
  if (data.unavailable.length > 0 && data.filterCount > 0) {
    return (
      <EmptyState
        title="Nothing to show for the record types in this view"
        description="Some of the record types you selected can’t answer one of these conditions, and the rest matched nothing. Change what’s included, or relax a condition."
      />
    );
  }
  return (
    <EmptyState
      title="Nothing matches this view"
      description="No records currently meet these conditions. Change what’s included above, or adjust the filters."
      primaryAction={
        <Link to="/views" className="dh-btn dh-btn--primary">
          Reset to Needs attention
        </Link>
      }
    />
  );
}

function ResultGroup({ group }: { readonly group: ViewResultGroup }) {
  if (group.items.length === 0) return null;
  return (
    <section className="dh-views__group" aria-label={group.label}>
      <h2 className="dh-views__group-heading">
        {group.entityType ? <EntityIcon type={group.entityType} /> : null}
        {group.label}
        <span className="dh-views__group-count">{group.items.length}</span>
      </h2>
      <ul className="dh-views__list">
        {group.items.map((item) => (
          <ResultRow key={`${item.scope}:${item.id}`} item={item} />
        ))}
      </ul>
    </section>
  );
}

function ResultRow({ item }: { readonly item: ViewResultItem }) {
  const context = [item.areaTitle, item.goalTitle, item.projectTitle].filter(
    (value): value is string => Boolean(value),
  );
  return (
    <li className="dh-views__row" data-testid={`cross-view-result-${item.id}`}>
      <EntityLink
        type={item.entityType}
        id={item.id}
        title={item.title}
        className="dh-views__row-link"
      />
      <p className="dh-views__row-meta">
        {item.dateLabel ? (
          <span className="dh-views__row-date">{item.dateLabel}</span>
        ) : null}
        {item.statusLabel ? (
          <span className="dh-views__row-status">{item.statusLabel}</span>
        ) : null}
        {item.archived ? (
          <span className="dh-views__row-status">Archived</span>
        ) : null}
        {context.length > 0 ? (
          <span className="dh-views__row-context">{context.join(" · ")}</span>
        ) : null}
      </p>
    </li>
  );
}
