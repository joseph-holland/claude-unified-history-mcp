import type { ConversationSource } from '../sources/index.js';
import type { Project, SourceType } from '../types.js';

export interface ListProjectsArgs {
  source?: SourceType | 'all';
}

export async function listProjects(
  sources: ConversationSource[],
  args: ListProjectsArgs,
): Promise<Project[]> {
  const sourceFilter = args.source ?? 'all';
  const activeSources = sources.filter(
    s => s.isAvailable() && (sourceFilter === 'all' || s.type === sourceFilter),
  );

  const projectArrays = await Promise.all(
    activeSources.map(s => s.listProjects().catch(() => [] as Project[])),
  );

  const allProjects: Project[] = [];
  for (const arr of projectArrays) {
    allProjects.push(...arr);
  }

  // Sort by lastActivity descending
  allProjects.sort((a, b) => b.lastActivity.getTime() - a.lastActivity.getTime());
  return allProjects;
}
