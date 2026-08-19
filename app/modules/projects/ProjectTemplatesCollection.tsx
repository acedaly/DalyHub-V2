/**
 * PROJECT-02 — the Templates collection (`/projects/templates`).
 *
 * ── Why a LIST and not a gallery ─────────────────────────────────────────────
 * Projects are drawn as a card grid because a Project is recognised by its
 * mark: an owner scanning `/projects` is looking for a colour and a glyph they
 * already know. A template is chosen by READING it — its name, what it is for,
 * and how much it will create — and every one of those facts is text. Measured
 * at 1440 a three-column gallery gives each card ~380px and puts the two counts
 * on a third line; the list gives the name and the description a full row and
 * the counts a fixed trailing column, and it is the SAME shape at 393 rather
 * than a different one. So: one single-column list at every width, which is
 * also why there is no presentation toggle to keep in step.
 *
 * ── What a row says, and what it deliberately does not ───────────────────────
 * The name, the description if there is one, the Area or Goal it usually goes
 * under, and "12 tasks · 3 checklist items" — the four things that change which
 * template the owner picks. No created date, no last-used count, no usage
 * chart: a template is configuration, and a statistic about configuration is
 * decoration.
 */

import { useMemo, useState } from "react";
import { useNavigate, useRevalidator } from "react-router";

import { templateContentsLabel } from "~/kernel/project-templates";
import {
  CollectionLayout,
  useCollectionLoading,
} from "~/shared/collection-layout";
import {
  DrawerProvider,
  DrawerTrigger,
  useDrawer,
  type DrawerEntry,
  type DrawerRenderResult,
} from "~/shared/drawer";
import { EmptyState } from "~/shared/empty-state";
import { AccentIcon, EntityIcon } from "~/shared/entity";
import type { SelectOption } from "~/shared/forms/types";
import { ButtonLink } from "~/shared/ui";

import { CreateFromTemplateForm } from "./CreateFromTemplateForm";
import type { SerializedTemplateSummary } from "./template-view";

/** The drawer key hosting the create-from-template form. */
const CREATE_FROM_TEMPLATE_KEY = "create-from-template";

export interface ProjectTemplatesViewProps {
  readonly templates: readonly SerializedTemplateSummary[];
  readonly parentOptions: readonly SelectOption[];
  readonly failed: boolean;
}

export function ProjectTemplatesView({
  templates,
  parentOptions,
  failed,
}: ProjectTemplatesViewProps) {
  const navigate = useNavigate();
  const revalidator = useRevalidator();
  const [selected, setSelected] = useState<SerializedTemplateSummary | null>(
    null,
  );

  const renderDrawer = useMemo(() => {
    return function render(entry: DrawerEntry): DrawerRenderResult | null {
      if (entry.key !== CREATE_FROM_TEMPLATE_KEY || selected === null) {
        return null;
      }
      return {
        title: "Create from template",
        // The template's NAME; its counts are stated by the form itself, which
        // is the part a phone actually draws.
        description: selected.name,
        children: (
          <CreateFromTemplateHost
            template={selected}
            parentOptions={parentOptions}
            onCreated={(projectId) => {
              navigate(`/projects/${encodeURIComponent(projectId)}`);
            }}
            onCancelled={() => revalidator.revalidate()}
          />
        ),
      };
    };
  }, [navigate, parentOptions, revalidator, selected]);

  const isReloading = useCollectionLoading();

  return (
    <DrawerProvider renderDrawer={renderDrawer}>
      <CollectionLayout
        isLoading={isReloading}
        title="Templates"
        subtitle={
          failed
            ? "We couldn’t load your templates."
            : templatesCountLabel(templates.length)
        }
        presentation="list"
        /*
         * The way BACK is the primary action here, not a "new template"
         * button: a template is made by saving a Project that already worked,
         * which is the whole product premise. Offering a blank template
         * alongside it would advertise a second, worse way in.
         */
        primaryAction={
          <ButtonLink href="/projects" variant="secondary">
            All projects
          </ButtonLink>
        }
        error={
          failed ? (
            <EmptyState
              title="We couldn’t load your templates"
              description="Something went wrong. Please try again."
            />
          ) : undefined
        }
        isEmpty={!failed && templates.length === 0}
        emptySlot={
          <EmptyState
            icon={<EntityIcon type="project" />}
            title="No templates yet"
            description="Open a project that worked, then choose “Save as template” from its menu. The next one starts from that shape instead of a blank page."
            primaryAction={
              <ButtonLink href="/projects" variant="primary">
                Go to projects
              </ButtonLink>
            }
          />
        }
      >
        <ul className="dh-template-list" aria-label="Templates">
          {templates.map((template) => (
            <li key={template.id} className="dh-template-row">
              <span className="dh-template-row__mark" aria-hidden="true">
                <AccentIcon
                  entityType="project"
                  iconKey={template.iconKey}
                  colourSlot={template.colourSlot}
                  colourRank={template.colourRank}
                  size="md"
                />
              </span>
              <span className="dh-template-row__body">
                {/*
                 * The whole row is not a link: the row carries TWO actions, and
                 * a nested control inside a link is the pattern that breaks
                 * both keyboards and screen readers. The name is the link to
                 * the template; "Use template" is a button beside it.
                 */}
                <a
                  className="dh-template-row__name"
                  href={`/projects/templates/${encodeURIComponent(template.id)}`}
                >
                  {template.name}
                </a>
                {template.description ? (
                  <span className="dh-template-row__description">
                    {template.description}
                  </span>
                ) : null}
                <span className="dh-template-row__meta">
                  {templateContentsLabel(
                    template.taskCount,
                    template.checklistCount,
                  )}
                  {template.parentLabel ? ` · ${template.parentLabel}` : ""}
                </span>
              </span>
              <span className="dh-template-row__actions">
                <DrawerTrigger
                  drawerKey={CREATE_FROM_TEMPLATE_KEY}
                  className="dh-btn dh-btn--secondary"
                  onClick={() => setSelected(template)}
                >
                  {/* Named for the record, so a screen reader hears which one. */}
                  <span aria-hidden="true">Use template</span>
                  <span className="dh-visually-hidden">
                    Create a project from {template.name}
                  </span>
                </DrawerTrigger>
              </span>
            </li>
          ))}
        </ul>
      </CollectionLayout>
    </DrawerProvider>
  );
}

/** The collection count. Singular spelled out rather than "1 templates". */
export function templatesCountLabel(count: number): string {
  if (count === 0) return "No templates yet";
  return count === 1 ? "1 template" : `${count} templates`;
}

function CreateFromTemplateHost({
  template,
  parentOptions,
  onCreated,
  onCancelled,
}: {
  readonly template: SerializedTemplateSummary;
  readonly parentOptions: readonly SelectOption[];
  readonly onCreated: (projectId: string) => void;
  readonly onCancelled: () => void;
}) {
  const { closeDrawer } = useDrawer();
  return (
    <CreateFromTemplateForm
      template={template}
      parentOptions={parentOptions}
      onCreated={onCreated}
      onCancel={() => {
        closeDrawer();
        onCancelled();
      }}
    />
  );
}
