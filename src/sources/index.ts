import type {
  Project,
  Session,
  Conversation,
  SearchResult,
  SourceType,
} from '../types.js';

export interface DateRangeFilter {
  startDate?: string;
  endDate?: string;
  timezone?: string;
}

export interface ListSessionsOptions extends DateRangeFilter {
  projectPath?: string;
  projectId?: string;
  limit?: number;
  offset?: number;
}

export interface GetConversationOptions {
  sessionId: string;
  messageTypes?: string[];
  limit?: number;
  offset?: number;
}

export interface SearchOptions extends DateRangeFilter {
  query: string;
  projectPath?: string;
  projectId?: string;
  limit?: number;
}

/**
 * Interface that both code and cloud sources implement.
 */
export interface ConversationSource {
  readonly type: SourceType;

  /** Whether this source is currently available. */
  isAvailable(): boolean;

  /** List all projects/workspaces. */
  listProjects(): Promise<Project[]>;

  /** List sessions with optional filtering. */
  listSessions(options?: ListSessionsOptions): Promise<Session[]>;

  /** Get a full conversation by session ID. */
  getConversation(options: GetConversationOptions): Promise<Conversation | null>;

  /** Search across conversation content. */
  search(options: SearchOptions): Promise<SearchResult[]>;
}
