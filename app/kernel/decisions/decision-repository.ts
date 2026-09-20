import type {
  CreateDecisionInput,
  DecisionRecord,
  ListDecisionsInput,
  SearchDecisionsInput,
} from "./decision";

export interface DecisionRepository {
  create(input: CreateDecisionInput): Promise<DecisionRecord>;
  get(id: string): Promise<DecisionRecord | null>;
  list(input?: ListDecisionsInput): Promise<readonly DecisionRecord[]>;
  search(input: SearchDecisionsInput): Promise<readonly DecisionRecord[]>;
}
