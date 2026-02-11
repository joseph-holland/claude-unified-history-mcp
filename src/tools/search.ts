import type { ConversationSource } from '../sources/index.js';
import type { SearchResult, Source, SourceType } from '../types.js';

export interface SearchConversationsArgs {
  query: string;
  source?: SourceType | 'all';
  projectPath?: string;
  projectId?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  limit?: number;
}

export interface SearchConversationsResponse {
  results: SearchResult[];
  sources_searched: Source[];
}

export async function searchConversations(
  sources: ConversationSource[],
  args: SearchConversationsArgs,
): Promise<SearchConversationsResponse> {
  const sourceFilter = args.source ?? 'all';
  const limit = args.limit ?? 30;

  const activeSources = sources.filter(
    s => s.isAvailable() && (sourceFilter === 'all' || s.type === sourceFilter),
  );

  const sourcesSearched: Source[] = activeSources.map(s => ({ type: s.type }));

  const resultArrays = await Promise.all(
    activeSources.map(s =>
      s.search({
        query: args.query,
        projectPath: args.projectPath,
        projectId: args.projectId,
        startDate: args.startDate,
        endDate: args.endDate,
        timezone: args.timezone,
        limit,
      }).catch(() => [] as SearchResult[]),
    ),
  );

  const allResults: SearchResult[] = [];
  for (const arr of resultArrays) {
    allResults.push(...arr);
  }

  // Merge by timestamp (most recent first)
  allResults.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

  return {
    results: allResults.slice(0, limit),
    sources_searched: sourcesSearched,
  };
}
