import type {
  CloudConversationSummary,
  CloudConversationDetail,
  CloudMessage,
  Project,
  Session,
  Conversation,
  Message,
  SearchResult,
} from '../types.js';
import type {
  ConversationSource,
  ListSessionsOptions,
  GetConversationOptions,
  SearchOptions,
} from './index.js';
import type { CloudSession } from '../auth/session.js';
import { normalizeDate } from '../utils/date.js';

export class ClaudeApiSource implements ConversationSource {
  readonly type = 'cloud' as const;
  private session: CloudSession;

  constructor(session: CloudSession) {
    this.session = session;
  }

  isAvailable(): boolean {
    return this.session.isAvailable();
  }

  async listProjects(): Promise<Project[]> {
    // Cloud conversations don't have a project hierarchy like Claude Code.
    // Return a single virtual project representing all cloud conversations.
    const orgId = await this.session.getOrgId();
    if (!orgId) return [];

    const conversations = await this.session.fetchApi<CloudConversationSummary[]>(
      `/api/organizations/${orgId}/chat_conversations`,
    );

    if (!conversations) return [];

    let lastActivity = new Date(0);
    for (const conv of conversations) {
      const updated = new Date(conv.updated_at);
      if (updated > lastActivity) {
        lastActivity = updated;
      }
    }

    return [{
      id: 'cloud_conversations',
      name: 'Claude.ai Conversations',
      source: { type: 'cloud' },
      sessionCount: conversations.length,
      messageCount: 0, // Would require fetching each conversation
      lastActivity,
    }];
  }

  async listSessions(options: ListSessionsOptions = {}): Promise<Session[]> {
    const { startDate, endDate, timezone, limit = 50, offset = 0 } = options;

    const orgId = await this.session.getOrgId();
    if (!orgId) return [];

    const normalizedStartDate = startDate ? normalizeDate(startDate, false, timezone) : undefined;
    const normalizedEndDate = endDate ? normalizeDate(endDate, true, timezone) : undefined;

    const conversations = await this.session.fetchApi<CloudConversationSummary[]>(
      `/api/organizations/${orgId}/chat_conversations`,
    );

    if (!conversations) return [];

    let sessions: Session[] = conversations.map(conv => ({
      id: conv.uuid,
      source: { type: 'cloud' as const },
      projectId: 'cloud_conversations',
      projectName: 'Claude.ai Conversations',
      title: conv.name || undefined,
      createdAt: new Date(conv.created_at),
      updatedAt: new Date(conv.updated_at),
      messageCount: 0,
    }));

    // Apply date filtering
    if (normalizedStartDate) {
      const startMs = new Date(normalizedStartDate).getTime();
      sessions = sessions.filter(s => s.updatedAt.getTime() >= startMs);
    }
    if (normalizedEndDate) {
      const endMs = new Date(normalizedEndDate).getTime();
      sessions = sessions.filter(s => s.createdAt.getTime() <= endMs);
    }

    // Sort by updatedAt (newest first)
    sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return sessions.slice(offset, offset + limit);
  }

  async getConversation(options: GetConversationOptions): Promise<Conversation | null> {
    const { sessionId, messageTypes, limit = 100, offset = 0 } = options;
    const allowedTypes = messageTypes && messageTypes.length > 0 ? messageTypes : ['user', 'assistant'];

    const orgId = await this.session.getOrgId();
    if (!orgId) return null;

    const detail = await this.session.fetchApi<CloudConversationDetail>(
      `/api/organizations/${orgId}/chat_conversations/${sessionId}`,
    );

    if (!detail) return null;

    const allMessages: Message[] = (detail.chat_messages ?? [])
      .filter((msg: CloudMessage) => {
        const role = msg.sender === 'human' ? 'user' : 'assistant';
        return allowedTypes.includes(role);
      })
      .map((msg: CloudMessage) => ({
        id: msg.uuid,
        role: (msg.sender === 'human' ? 'user' : 'assistant') as 'user' | 'assistant',
        content: extractCloudContent(msg),
        timestamp: new Date(msg.created_at),
      }));

    allMessages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    const paginatedMessages = allMessages.slice(offset, offset + limit);

    return {
      id: sessionId,
      source: { type: 'cloud' },
      session: {
        id: sessionId,
        source: { type: 'cloud' },
        projectId: 'cloud_conversations',
        projectName: 'Claude.ai Conversations',
        title: detail.name || undefined,
        createdAt: new Date(detail.created_at),
        updatedAt: new Date(detail.updated_at),
        messageCount: allMessages.length,
      },
      messages: paginatedMessages,
    };
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, startDate, endDate, timezone, limit = 30 } = options;

    const orgId = await this.session.getOrgId();
    if (!orgId) return [];

    // Try server-side search first
    const searchPath = `/api/organizations/${orgId}/chat_conversations?search=${encodeURIComponent(query)}`;
    const conversations = await this.session.fetchApi<CloudConversationSummary[]>(searchPath);

    if (!conversations) return [];

    const normalizedStartDate = startDate ? normalizeDate(startDate, false, timezone) : undefined;
    const normalizedEndDate = endDate ? normalizeDate(endDate, true, timezone) : undefined;

    const results: SearchResult[] = [];
    const queryLower = query.toLowerCase();

    for (const conv of conversations) {
      if (results.length >= limit) break;

      // Date filtering
      if (normalizedStartDate && conv.updated_at < normalizedStartDate) continue;
      if (normalizedEndDate && conv.created_at > normalizedEndDate) continue;

      // Fetch conversation detail to search messages
      const detail = await this.session.fetchApi<CloudConversationDetail>(
        `/api/organizations/${orgId}/chat_conversations/${conv.uuid}`,
      );

      if (!detail?.chat_messages) continue;

      for (const msg of detail.chat_messages) {
        if (results.length >= limit) break;

        const content = extractCloudContent(msg);
        if (content.toLowerCase().includes(queryLower)) {
          const idx = content.toLowerCase().indexOf(queryLower);
          const snippetStart = Math.max(0, idx - 50);
          const snippetEnd = Math.min(content.length, idx + query.length + 50);
          const snippet = (snippetStart > 0 ? '...' : '') +
            content.slice(snippetStart, snippetEnd) +
            (snippetEnd < content.length ? '...' : '');

          results.push({
            source: { type: 'cloud' },
            sessionId: conv.uuid,
            messageId: msg.uuid,
            snippet,
            timestamp: new Date(msg.created_at),
          });
        }
      }
    }

    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return results.slice(0, limit);
  }
}

function extractCloudContent(msg: CloudMessage): string {
  // Try text field first (simpler format)
  if (msg.text) return msg.text;

  // Fall back to content blocks
  if (msg.content && Array.isArray(msg.content)) {
    return msg.content
      .filter(block => block.type === 'text' && block.text)
      .map(block => block.text ?? '')
      .join(' ');
  }

  return '';
}
