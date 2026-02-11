export type SourceType = 'code' | 'cloud';

export interface Source {
  type: SourceType;
}

export interface Project {
  id: string;
  name: string;
  path?: string;           // code only
  source: Source;
  sessionCount: number;
  messageCount: number;
  lastActivity: Date;
}

export interface Session {
  id: string;
  source: Source;
  projectId?: string;
  projectName?: string;
  title?: string;          // cloud conversations have titles
  createdAt: Date;
  updatedAt: Date;
  messageCount: number;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

export interface Conversation {
  id: string;
  source: Source;
  session: Session;
  messages: Message[];
}

export interface SearchResult {
  source: Source;
  sessionId: string;
  messageId: string;
  snippet: string;
  timestamp: Date;
  score?: number;
}

export interface PaginationInfo {
  total_count: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

export interface ListSessionsResult {
  sessions: Session[];
  pagination: PaginationInfo;
}

export interface SearchConversationsResult {
  results: SearchResult[];
  sources_searched: Source[];
}

// Raw Claude Code JSONL message format
export interface ClaudeCodeMessage {
  parentUuid: string | null;
  isSidechain: boolean;
  userType: string;
  cwd: string;
  sessionId: string;
  version: string;
  type: 'user' | 'assistant' | 'system' | 'result';
  message?: {
    role: string;
    content: string | ContentBlock[];
    model?: string;
    usage?: TokenUsage;
  };
  uuid: string;
  timestamp: string;
  requestId?: string;
}

export interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

export interface TokenUsage {
  input_tokens?: number;
  output_tokens?: number;
  [key: string]: unknown;
}

// Claude.ai API response types
export interface CloudOrganization {
  uuid: string;
  name: string;
  capabilities?: string[];
  [key: string]: unknown;
}

export interface CloudConversationSummary {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  [key: string]: unknown;
}

export interface CloudConversationDetail {
  uuid: string;
  name: string;
  created_at: string;
  updated_at: string;
  chat_messages: CloudMessage[];
  [key: string]: unknown;
}

export interface CloudMessage {
  uuid: string;
  sender: 'human' | 'assistant';
  text: string;
  created_at: string;
  updated_at: string;
  content: CloudContentBlock[];
  [key: string]: unknown;
}

export interface CloudContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}
