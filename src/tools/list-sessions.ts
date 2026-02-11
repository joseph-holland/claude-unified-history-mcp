import type { ConversationSource, ListSessionsOptions } from '../sources/index.js';
import type { Session, SourceType, PaginationInfo } from '../types.js';

export interface ListSessionsArgs {
  source?: SourceType | 'all';
  projectPath?: string;
  projectId?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
  limit?: number;
  offset?: number;
}

export interface ListSessionsResponse {
  sessions: Session[];
  pagination: PaginationInfo;
}

export async function listSessions(
  sources: ConversationSource[],
  args: ListSessionsArgs,
): Promise<ListSessionsResponse> {
  const sourceFilter = args.source ?? 'all';
  const limit = args.limit ?? 50;
  const offset = args.offset ?? 0;

  const activeSources = sources.filter(
    s => s.isAvailable() && (sourceFilter === 'all' || s.type === sourceFilter),
  );

  const opts: ListSessionsOptions = {
    projectPath: args.projectPath,
    projectId: args.projectId,
    startDate: args.startDate,
    endDate: args.endDate,
    timezone: args.timezone,
    // Fetch more than needed for merging, then paginate
    limit: limit + offset,
    offset: 0,
  };

  const sessionArrays = await Promise.all(
    activeSources.map(s => s.listSessions(opts).catch(() => [] as Session[])),
  );

  const allSessions: Session[] = [];
  for (const arr of sessionArrays) {
    allSessions.push(...arr);
  }

  // Sort by updatedAt descending
  allSessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

  const totalCount = allSessions.length;
  const paginated = allSessions.slice(offset, offset + limit);
  const hasMore = offset + limit < totalCount;

  return {
    sessions: paginated,
    pagination: {
      total_count: totalCount,
      limit,
      offset,
      has_more: hasMore,
    },
  };
}
