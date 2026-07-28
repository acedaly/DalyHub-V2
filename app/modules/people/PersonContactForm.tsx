/**
 * PEOPLE-01 — the Person "Contact details" editor (the record's Contact tab).
 *
 * The full structured detail slice, edited through DS-06 controls and saved with
 * `intent=update` to `/person/:id/mutate` (which calls `PersonRepository.update`).
 * Every field is optional; clearing a field and saving stores the cleared value.
 * Presentation only — the route owns loading and revalidation.
 */

import {
  DateField,
  Form,
  FormActions,
  FormButton,
  FormErrorSummary,
  SelectField,
  TagsField,
  TextField,
  useForm,
  type SubmitOutcome,
} from "~/shared/forms";
import {
  CONTACT_METHODS,
  FOLLOW_UP_FREQUENCIES,
  PERSON_RELATIONSHIPS,
} from "~/kernel/people";

import type { SerializedPerson } from "./person-view";
import type { PersonMutationResult } from "./routes/mutate";

type Values = {
  readonly firstName: string;
  readonly middleName: string;
  readonly lastName: string;
  readonly preferredName: string;
  readonly pronouns: string;
  readonly organisation: string;
  readonly role: string;
  readonly department: string;
  readonly email: string;
  readonly secondaryEmail: string;
  readonly mobile: string;
  readonly workPhone: string;
  readonly address: string;
  readonly website: string;
  readonly birthday: string;
  readonly relationship: string;
  readonly favouriteContactMethod: string;
  readonly followUpFrequency: string;
  readonly nextFollowUp: string;
  readonly lastInteraction: string;
  readonly photoUrl: string;
  readonly tags: readonly string[];
};

const RELATIONSHIP_OPTIONS = [
  { value: "", label: "Not set" },
  ...PERSON_RELATIONSHIPS.map((r) => ({ value: r.value, label: r.label })),
];
const CONTACT_METHOD_OPTIONS = [
  { value: "", label: "Not set" },
  ...CONTACT_METHODS.map((c) => ({ value: c.value, label: c.label })),
];
const FREQUENCY_OPTIONS = [
  { value: "", label: "Not set" },
  ...FOLLOW_UP_FREQUENCIES.map((f) => ({ value: f.value, label: f.label })),
];

const FIELD_LABELS: Record<string, string> = {
  firstName: "First name",
  middleName: "Middle name",
  lastName: "Last name",
  preferredName: "Preferred name",
  pronouns: "Pronouns",
  organisation: "Organisation",
  role: "Role",
  department: "Department",
  email: "Email",
  secondaryEmail: "Secondary email",
  mobile: "Mobile",
  workPhone: "Work phone",
  address: "Address",
  website: "Website",
  birthday: "Birthday",
  relationship: "Relationship",
  favouriteContactMethod: "Favourite contact method",
  followUpFrequency: "Follow-up frequency",
  nextFollowUp: "Next follow-up",
  lastInteraction: "Last interaction",
  photoUrl: "Photo URL",
  tags: "Tags",
};

const FIELD_ORDER = Object.keys(FIELD_LABELS) as (keyof Values)[];

interface PersonContactFormProps {
  readonly person: SerializedPerson;
  readonly onSaved: () => void;
}

export function PersonContactForm({ person, onSaved }: PersonContactFormProps) {
  const form = useForm<Values>({
    initialValues: {
      firstName: person.firstName ?? "",
      middleName: person.middleName ?? "",
      lastName: person.lastName ?? "",
      preferredName: person.preferredName ?? "",
      pronouns: person.pronouns ?? "",
      organisation: person.organisation ?? "",
      role: person.role ?? "",
      department: person.department ?? "",
      email: person.email ?? "",
      secondaryEmail: person.secondaryEmail ?? "",
      mobile: person.mobile ?? "",
      workPhone: person.workPhone ?? "",
      address: person.address ?? "",
      website: person.website ?? "",
      birthday: person.birthday ?? "",
      relationship: person.relationship ?? "",
      favouriteContactMethod: person.favouriteContactMethod ?? "",
      followUpFrequency: person.followUpFrequency ?? "",
      nextFollowUp: person.nextFollowUp ?? "",
      lastInteraction: person.lastInteraction ?? "",
      photoUrl: person.photoUrl ?? "",
      tags: person.tags,
    },
    fieldOrder: FIELD_ORDER,
    onSubmit: async (values): Promise<SubmitOutcome<Values>> => {
      const body = new FormData();
      body.set("intent", "update");
      for (const [key, value] of Object.entries(values)) {
        if (key === "tags") continue;
        body.set(key, String(value));
      }
      body.set("tags", JSON.stringify(values.tags));
      let data: PersonMutationResult;
      try {
        const response = await fetch(
          `/person/${encodeURIComponent(person.id)}/mutate`,
          { method: "POST", body },
        );
        data = (await response.json()) as PersonMutationResult;
      } catch {
        return {
          status: "error",
          formError: "That couldn’t be saved. Please try again.",
        };
      }
      if (data.kind === "update" && data.ok) {
        onSaved();
        return { status: "success" };
      }
      return {
        status: "error",
        formError: data.kind === "update" ? data.formError : undefined,
        fieldErrors:
          data.kind === "update"
            ? (data.fieldErrors as
                Partial<Record<keyof Values & string, string>> | undefined)
            : undefined,
      };
    },
  });

  return (
    <Form
      aria-label="Contact details"
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
        label="First name"
        maxLength={200}
        autoComplete="given-name"
        {...form.field("firstName")}
      />
      <TextField
        label="Middle name"
        maxLength={200}
        autoComplete="additional-name"
        {...form.field("middleName")}
      />
      <TextField
        label="Last name"
        maxLength={200}
        autoComplete="family-name"
        {...form.field("lastName")}
      />
      <TextField
        label="Preferred name"
        maxLength={200}
        autoComplete="nickname"
        {...form.field("preferredName")}
      />
      <TextField label="Pronouns" maxLength={64} {...form.field("pronouns")} />
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
        label="Department"
        maxLength={200}
        {...form.field("department")}
      />
      <TextField
        label="Email"
        type="email"
        maxLength={320}
        autoComplete="email"
        {...form.field("email")}
      />
      <TextField
        label="Secondary email"
        type="email"
        maxLength={320}
        {...form.field("secondaryEmail")}
      />
      <TextField
        label="Mobile"
        type="tel"
        maxLength={64}
        autoComplete="tel"
        {...form.field("mobile")}
      />
      <TextField
        label="Work phone"
        type="tel"
        maxLength={64}
        {...form.field("workPhone")}
      />
      <TextField
        label="Address"
        multiline
        rows={2}
        maxLength={500}
        autoComplete="street-address"
        {...form.field("address")}
      />
      <TextField
        label="Website"
        type="url"
        maxLength={4096}
        autoComplete="url"
        {...form.field("website")}
      />
      <DateField label="Birthday" {...form.field("birthday")} />
      <SelectField
        label="Relationship"
        options={RELATIONSHIP_OPTIONS}
        {...form.field("relationship")}
      />
      <SelectField
        label="Favourite contact method"
        options={CONTACT_METHOD_OPTIONS}
        {...form.field("favouriteContactMethod")}
      />
      <SelectField
        label="Follow-up frequency"
        options={FREQUENCY_OPTIONS}
        {...form.field("followUpFrequency")}
      />
      <DateField label="Next follow-up" {...form.field("nextFollowUp")} />
      <DateField label="Last interaction" {...form.field("lastInteraction")} />
      <TextField
        label="Photo URL"
        type="url"
        maxLength={4096}
        help="Paste an image link, or leave blank to use generated initials."
        {...form.field("photoUrl")}
      />
      <TagsField label="Tags" {...form.field("tags")} />
      <FormActions>
        <FormButton type="submit" variant="primary" pending={form.isSubmitting}>
          Save details
        </FormButton>
      </FormActions>
    </Form>
  );
}
