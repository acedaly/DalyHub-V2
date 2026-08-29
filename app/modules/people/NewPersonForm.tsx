/**
 * PEOPLE-01 — the "New Person" form (hosted in the DS-03 Drawer or the
 * `/new/person` page). Uses DS-06 explicit form controls and posts to the trusted
 * `/new/person` action, which creates through `PersonRepository.create` — the
 * client never supplies workspace or actor data. Captures the essentials warmly;
 * the full field set is edited on the person's Contact tab.
 */

import { useTagVocabulary } from "~/shared/tags";
import {
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  SelectField,
  TagsField,
  TextField,
  required,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";
import { PERSON_RELATIONSHIPS } from "~/kernel/people";

import type { CreatePersonResult } from "./routes/create";

type Values = {
  readonly title: string;
  readonly preferredName: string;
  readonly organisation: string;
  readonly role: string;
  readonly email: string;
  readonly mobile: string;
  readonly relationship: string;
  readonly tags: readonly string[];
};

const FIELD_LABELS: Record<string, string> = {
  title: "Name",
  preferredName: "Preferred name",
  organisation: "Organisation",
  role: "Role",
  email: "Email",
  mobile: "Mobile",
  relationship: "Relationship",
  tags: "Tags",
};

const RELATIONSHIP_OPTIONS = [
  { value: "", label: "Not set" },
  ...PERSON_RELATIONSHIPS.map((r) => ({ value: r.value, label: r.label })),
];

interface NewPersonFormProps {
  readonly onCreated: (personId: string) => void;
  readonly onCancel?: () => void;
}

export function NewPersonForm({ onCreated, onCancel }: NewPersonFormProps) {
  // V2.6 FIND-02 — the ONE workspace tag vocabulary, so adding a tag here is
  // the same interaction it is everywhere else in the product.
  const vocabulary = useTagVocabulary();

  const form = useForm<Values>({
    initialValues: {
      title: "",
      preferredName: "",
      organisation: "",
      role: "",
      email: "",
      mobile: "",
      relationship: "",
      tags: [],
    },
    fields: { title: { validate: required("A name is required") } },
    fieldOrder: [
      "title",
      "preferredName",
      "organisation",
      "role",
      "email",
      "mobile",
      "relationship",
      "tags",
    ],
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("title", values.title);
      body.set("preferredName", values.preferredName);
      body.set("organisation", values.organisation);
      body.set("role", values.role);
      body.set("email", values.email);
      body.set("mobile", values.mobile);
      body.set("relationship", values.relationship);
      body.set("tags", JSON.stringify(values.tags));
      let data: CreatePersonResult;
      try {
        const response = await fetch("/people/create", {
          method: "POST",
          body,
        });
        data = (await response.json()) as CreatePersonResult;
      } catch {
        return {
          status: "error",
          formError: "That person couldn’t be created. Please try again.",
        };
      }
      if (data.ok) {
        onCreated(data.personId);
        return { status: "success" };
      }
      return {
        status: "error",
        formError: data.formError,
        fieldErrors: data.fieldErrors as
          Partial<Record<keyof Values & string, string>> | undefined,
      };
    },
  });

  return (
    <Form
      aria-label="New Person"
      busy={form.isSubmitting}
      onSubmit={form.handleSubmit}
    >
      <FormErrorSummary
        formError={form.formError}
        fieldErrors={form.fieldErrors}
        order={form.fieldOrder as string[]}
        labels={FIELD_LABELS}
        onFocusField={form.focusField}
      />
      <TextField
        label="Name"
        required
        maxLength={512}
        autoComplete="name"
        {...form.field("title")}
      />
      <TextField
        label="Preferred name"
        maxLength={200}
        {...form.field("preferredName")}
      />
      <TextField
        label="Organisation"
        maxLength={200}
        autoComplete="organization"
        {...form.field("organisation")}
      />
      <TextField
        label="Role"
        maxLength={200}
        autoComplete="organization-title"
        {...form.field("role")}
      />
      <TextField
        label="Email"
        type="email"
        maxLength={320}
        autoComplete="email"
        {...form.field("email")}
      />
      <TextField
        label="Mobile"
        type="tel"
        maxLength={64}
        autoComplete="tel"
        {...form.field("mobile")}
      />
      <SelectField
        label="Relationship"
        options={RELATIONSHIP_OPTIONS}
        {...form.field("relationship")}
      />
      <TagsField label="Tags" vocabulary={vocabulary} {...form.field("tags")} />
      <FormActions>
        {onCancel ? (
          <FormButton
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={form.isSubmitting}
          >
            Cancel
          </FormButton>
        ) : null}
        <FormButton type="submit" variant="primary" pending={form.isSubmitting}>
          Create person
        </FormButton>
      </FormActions>
    </Form>
  );
}
