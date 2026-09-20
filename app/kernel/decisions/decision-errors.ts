export class DecisionValidationError extends Error {
  readonly code = "validation" as const;
  constructor(message: string) {
    super(`Invalid decision: ${message}`);
    this.name = "DecisionValidationError";
  }
}

export class DecisionRelationNotFoundError extends Error {
  readonly code = "not_found" as const;
  constructor() {
    super("Related project or area not found");
    this.name = "DecisionRelationNotFoundError";
  }
}

export class DecisionStorageError extends Error {
  readonly code = "storage" as const;
  constructor(options?: ErrorOptions) {
    super("A decision storage error occurred.", options);
    this.name = "DecisionStorageError";
  }
}
