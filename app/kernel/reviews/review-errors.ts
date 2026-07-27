/** REVIEWS-01 typed error family. */

export type ReviewErrorCode =
  "validation" | "not_found" | "conflict" | "archived" | "storage";

export abstract class ReviewError extends Error {
  abstract readonly code: ReviewErrorCode;
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = new.target.name;
  }
}

export type ReviewValidationField =
  | "id"
  | "title"
  | "type"
  | "periodStart"
  | "periodEnd"
  | "status"
  | "sectionId"
  | "content"
  | "view"
  | "cursor"
  | "limit"
  | "query"
  | "templateId";

export class ReviewValidationError extends ReviewError {
  readonly code = "validation" as const;
  readonly field: ReviewValidationField;
  constructor(field: ReviewValidationField, message: string) {
    super(`Invalid ${field}: ${message}`);
    this.field = field;
  }
}

export class ReviewNotFoundError extends ReviewError {
  readonly code = "not_found" as const;
  constructor() {
    super("Review not found");
  }
}

export class ReviewConflictError extends ReviewError {
  readonly code = "conflict" as const;
  constructor() {
    super("That review changed before this update completed.");
  }
}

export class ReviewArchivedError extends ReviewError {
  readonly code = "archived" as const;
  constructor() {
    super("Archived reviews are read-only until restored.");
  }
}

export class ReviewStorageError extends ReviewError {
  readonly code = "storage" as const;
  constructor(options?: ErrorOptions) {
    super("A review storage error occurred.", options);
  }
}

export class InvalidReviewCursorError extends ReviewValidationError {
  constructor() {
    super("cursor", "is not valid for this review query");
  }
}
