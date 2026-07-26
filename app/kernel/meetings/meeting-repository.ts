import type {
  CreateMeetingInput,
  Meeting,
  MeetingItem,
  MeetingItemKind,
  MeetingPage,
  MeetingView,
  UpdateMeetingInput,
} from "./meeting";

export interface MeetingRepository {
  create(input: CreateMeetingInput): Promise<Meeting>;
  get(id: string): Promise<Meeting | null>;
  list(input?: {
    view?: MeetingView;
    query?: string;
    limit?: number;
    cursor?: string;
  }): Promise<MeetingPage>;
  update(
    id: string,
    input: UpdateMeetingInput,
  ): Promise<{ meeting: Meeting; changed: boolean }>;
  addItem(
    id: string,
    kind: MeetingItemKind,
    bodyMarkdown: string,
  ): Promise<MeetingItem>;
  removeItem(id: string, itemId: string): Promise<boolean>;
  archive(id: string): Promise<boolean>;
  restore(id: string): Promise<boolean>;
}
