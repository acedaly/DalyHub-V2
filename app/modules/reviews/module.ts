import {
  REVIEW_ARCHIVED,
  REVIEW_COMPLETED,
  REVIEW_CREATED,
  REVIEW_DELETED,
  REVIEW_REOPENED,
  REVIEW_RESTORED,
  REVIEW_STATUS_CHANGED,
  REVIEW_UPDATED,
} from "~/kernel/reviews";
import { defineModule } from "~/kernel/modules";

import { reviewsCommands } from "./commands";
import routes from "./routes.manifest";
import { reviewsSearchProvider } from "./search";

export default defineModule({
  id: "reviews",
  name: "Reviews",
  description:
    "Periodic reflection records for closing loops and planning ahead.",
  order: 200,
  routes,
  entityTypes: [{ type: "review", singular: "Review", plural: "Reviews" }],
  activityTypes: [
    {
      type: REVIEW_CREATED,
      label: "Review created",
      description: "A Review record was created.",
    },
    {
      type: REVIEW_UPDATED,
      label: "Review updated",
      description: "A Review’s structural details or sections changed.",
    },
    {
      type: REVIEW_STATUS_CHANGED,
      label: "Review status changed",
      description: "A Review moved between draft and in-progress states.",
    },
    {
      type: REVIEW_COMPLETED,
      label: "Review completed",
      description: "A Review was marked completed.",
    },
    {
      type: REVIEW_REOPENED,
      label: "Review reopened",
      description: "A completed Review was reopened for editing.",
    },
    {
      type: REVIEW_ARCHIVED,
      label: "Review archived",
      description: "A Review was archived.",
    },
    {
      type: REVIEW_RESTORED,
      label: "Review restored",
      description: "An archived Review was restored.",
    },
    {
      type: REVIEW_DELETED,
      label: "Review deleted",
      description: "A Review was permanently deleted.",
    },
  ],
  commands: reviewsCommands,
  searchProviders: [reviewsSearchProvider],
});
