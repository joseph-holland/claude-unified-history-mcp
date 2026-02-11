import type { ConversationSource } from '../sources/index.js';
import type { Conversation, SourceType } from '../types.js';

export interface GetConversationArgs {
  sessionId: string;
  source?: SourceType;
  messageTypes?: string[];
  limit?: number;
  offset?: number;
}

export async function getConversation(
  sources: ConversationSource[],
  args: GetConversationArgs,
): Promise<Conversation | null> {
  const { sessionId, source, messageTypes, limit = 100, offset = 0 } = args;

  const opts = { sessionId, messageTypes, limit, offset };

  // If source hint provided, try that first
  if (source) {
    const targeted = sources.find(s => s.type === source && s.isAvailable());
    if (targeted) {
      const result = await targeted.getConversation(opts).catch(() => null);
      if (result) return result;
    }
  }

  // Auto-detect: try code first (local = fast), then cloud
  const ordered = [...sources].sort((a, b) => {
    if (a.type === 'code') return -1;
    if (b.type === 'code') return 1;
    return 0;
  });

  for (const src of ordered) {
    if (!src.isAvailable()) continue;
    if (source && src.type !== source) continue;

    try {
      const result = await src.getConversation(opts);
      if (result) return result;
    } catch {
      // Try next source
    }
  }

  return null;
}
