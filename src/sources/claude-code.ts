import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { createReadStream } from 'fs';
import { createInterface } from 'readline';
import type {
  ClaudeCodeMessage,
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
import { normalizeDate, getTimeAgo } from '../utils/date.js';

export class ClaudeCodeSource implements ConversationSource {
  readonly type = 'code' as const;
  private claudeDir: string;

  constructor(claudeDir?: string) {
    this.claudeDir = claudeDir ?? path.join(os.homedir(), '.claude');
  }

  isAvailable(): boolean {
    return true; // Local source is always available
  }

  async listProjects(): Promise<Project[]> {
    const projects = new Map<string, {
      sessionIds: Set<string>;
      messageCount: number;
      lastActivity: Date;
    }>();

    try {
      const projectsDir = path.join(this.claudeDir, 'projects');
      const projectDirs = await fs.readdir(projectsDir);

      for (const projectDir of projectDirs) {
        const projectPath = path.join(projectsDir, projectDir);
        const stats = await fs.stat(projectPath);

        if (stats.isDirectory()) {
          const files = await fs.readdir(projectPath);
          const decodedPath = decodeProjectPath(projectDir);

          if (!projects.has(decodedPath)) {
            projects.set(decodedPath, {
              sessionIds: new Set(),
              messageCount: 0,
              lastActivity: new Date(0),
            });
          }

          const projectInfo = projects.get(decodedPath);
          if (!projectInfo) continue;

          for (const file of files) {
            if (file.endsWith('.jsonl')) {
              const sessionId = file.replace('.jsonl', '');
              projectInfo.sessionIds.add(sessionId);

              const filePath = path.join(projectPath, file);
              const fileStats = await fs.stat(filePath);

              if (fileStats.mtime > projectInfo.lastActivity) {
                projectInfo.lastActivity = fileStats.mtime;
              }

              const entries = await parseJsonlFile(filePath);
              projectInfo.messageCount += entries.length;
            }
          }
        }
      }
    } catch {
      // Directory may not exist - that's fine
    }

    return Array.from(projects.entries()).map(([decodedPath, info]) => ({
      id: `code_${decodedPath}`,
      name: decodedPath,
      path: decodedPath,
      source: { type: 'code' as const },
      sessionCount: info.sessionIds.size,
      messageCount: info.messageCount,
      lastActivity: info.lastActivity,
    }));
  }

  async listSessions(options: ListSessionsOptions = {}): Promise<Session[]> {
    const { projectPath, startDate, endDate, timezone, limit = 50, offset = 0 } = options;

    const normalizedStartDate = startDate ? normalizeDate(startDate, false, timezone) : undefined;
    const normalizedEndDate = endDate ? normalizeDate(endDate, true, timezone) : undefined;
    const sessions: Session[] = [];

    try {
      const projectsDir = path.join(this.claudeDir, 'projects');
      const projectDirs = await fs.readdir(projectsDir);

      for (const projectDir of projectDirs) {
        const decodedPath = decodeProjectPath(projectDir);

        if (projectPath && decodedPath !== projectPath) {
          continue;
        }

        const projectDirPath = path.join(projectsDir, projectDir);
        const stats = await fs.stat(projectDirPath);

        if (stats.isDirectory()) {
          const files = await fs.readdir(projectDirPath);

          for (const file of files) {
            if (file.endsWith('.jsonl')) {
              const sessionId = file.replace('.jsonl', '');
              const filePath = path.join(projectDirPath, file);
              const entries = await parseJsonlFile(filePath);

              if (entries.length === 0) continue;

              const timestamps = entries.map(e => new Date(e.timestamp));
              const sessionStart = new Date(Math.min(...timestamps.map(t => t.getTime())));
              const sessionEnd = new Date(Math.max(...timestamps.map(t => t.getTime())));

              // Filter by date range
              if (normalizedStartDate && sessionEnd.toISOString() < normalizedStartDate) continue;
              if (normalizedEndDate && sessionStart.toISOString() > normalizedEndDate) continue;

              sessions.push({
                id: sessionId,
                source: { type: 'code' },
                projectId: `code_${decodedPath}`,
                projectName: decodedPath,
                createdAt: sessionStart,
                updatedAt: sessionEnd,
                messageCount: entries.length,
              });
            }
          }
        }
      }
    } catch {
      // Directory may not exist
    }

    // Sort by updatedAt (newest first)
    sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());

    return sessions.slice(offset, offset + limit);
  }

  async getConversation(options: GetConversationOptions): Promise<Conversation | null> {
    const { sessionId, messageTypes, limit = 100, offset = 0 } = options;
    const allowedTypes = messageTypes && messageTypes.length > 0 ? messageTypes : ['user', 'assistant'];

    try {
      const projectsDir = path.join(this.claudeDir, 'projects');
      const projectDirs = await fs.readdir(projectsDir);

      for (const projectDir of projectDirs) {
        const filePath = path.join(projectsDir, projectDir, `${sessionId}.jsonl`);

        try {
          await fs.access(filePath);
        } catch {
          continue;
        }

        const entries = await parseJsonlFile(filePath);
        const decodedPath = decodeProjectPath(projectDir);

        const messages: Message[] = entries
          .filter(e => {
            const role = e.type === 'result' ? 'system' : e.type;
            return allowedTypes.includes(role) || allowedTypes.includes(e.type);
          })
          .map(e => ({
            id: e.uuid,
            role: (e.type === 'result' ? 'system' : e.type) as 'user' | 'assistant' | 'system',
            content: extractContent(e),
            timestamp: new Date(e.timestamp),
          }));

        messages.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        const paginatedMessages = messages.slice(offset, offset + limit);

        const timestamps = entries.map(e => new Date(e.timestamp));
        const sessionStart = new Date(Math.min(...timestamps.map(t => t.getTime())));
        const sessionEnd = new Date(Math.max(...timestamps.map(t => t.getTime())));

        return {
          id: sessionId,
          source: { type: 'code' },
          session: {
            id: sessionId,
            source: { type: 'code' },
            projectId: `code_${decodedPath}`,
            projectName: decodedPath,
            createdAt: sessionStart,
            updatedAt: sessionEnd,
            messageCount: messages.length,
          },
          messages: paginatedMessages,
        };
      }
    } catch {
      // Not found
    }

    return null;
  }

  async search(options: SearchOptions): Promise<SearchResult[]> {
    const { query, projectPath, startDate, endDate, timezone, limit = 30 } = options;

    const normalizedStartDate = startDate ? normalizeDate(startDate, false, timezone) : undefined;
    const normalizedEndDate = endDate ? normalizeDate(endDate, true, timezone) : undefined;
    const queryLower = query.toLowerCase();
    const results: SearchResult[] = [];

    try {
      const projectsDir = path.join(this.claudeDir, 'projects');
      const projectDirs = await fs.readdir(projectsDir);

      // Collect all JSONL file paths to search
      const filePaths: string[] = [];
      for (const projectDir of projectDirs) {
        const decodedPath = decodeProjectPath(projectDir);
        if (projectPath && decodedPath !== projectPath) continue;

        const projectDirPath = path.join(projectsDir, projectDir);
        let stats;
        try { stats = await fs.stat(projectDirPath); } catch { continue; }
        if (!stats.isDirectory()) continue;

        const files = await fs.readdir(projectDirPath);
        for (const file of files) {
          if (file.endsWith('.jsonl')) {
            filePaths.push(path.join(projectDirPath, file));
          }
        }
      }

      // Process files in parallel batches of 10
      const FILE_CONCURRENCY = 10;
      for (let i = 0; i < filePaths.length; i += FILE_CONCURRENCY) {
        if (results.length >= limit) break;

        const batch = filePaths.slice(i, i + FILE_CONCURRENCY);
        const batchResults = await Promise.all(
          batch.map(async (filePath) => {
            if (await shouldSkipFile(filePath, normalizedStartDate, normalizedEndDate)) {
              return [];
            }

            const entries = await parseJsonlFile(filePath, normalizedStartDate, normalizedEndDate);
            const fileResults: SearchResult[] = [];

            for (const entry of entries) {
              const content = extractContent(entry);
              if (content.toLowerCase().includes(queryLower)) {
                const idx = content.toLowerCase().indexOf(queryLower);
                const snippetStart = Math.max(0, idx - 50);
                const snippetEnd = Math.min(content.length, idx + query.length + 50);
                const snippet = (snippetStart > 0 ? '...' : '') +
                  content.slice(snippetStart, snippetEnd) +
                  (snippetEnd < content.length ? '...' : '');

                fileResults.push({
                  source: { type: 'code' },
                  sessionId: entry.sessionId,
                  messageId: entry.uuid,
                  snippet,
                  timestamp: new Date(entry.timestamp),
                });
              }
            }

            return fileResults;
          }),
        );

        for (const fileResults of batchResults) {
          results.push(...fileResults);
        }
      }
    } catch {
      // Directory may not exist
    }

    results.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
    return results.slice(0, limit);
  }
}

// --- Helper functions ---

function decodeProjectPath(projectDir: string): string {
  return projectDir.replace(/-/g, '/').replace(/^\//, '');
}

function extractContent(entry: ClaudeCodeMessage): string {
  if (!entry.message?.content) return '';

  if (typeof entry.message.content === 'string') {
    return entry.message.content;
  }

  if (Array.isArray(entry.message.content)) {
    return entry.message.content
      .map(item => {
        if (typeof item === 'string') return item;
        if (item?.type === 'text' && item?.text) return item.text;
        return JSON.stringify(item);
      })
      .join(' ');
  }

  return '';
}

async function parseJsonlFile(
  filePath: string,
  startDate?: string,
  endDate?: string,
): Promise<ClaudeCodeMessage[]> {
  const entries: ClaudeCodeMessage[] = [];

  try {
    const fileStream = createReadStream(filePath);
    const rl = createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      if (!line.trim()) continue;
      try {
        const msg: ClaudeCodeMessage = JSON.parse(line);

        if (startDate && msg.timestamp < startDate) continue;
        if (endDate && msg.timestamp > endDate) continue;

        entries.push(msg);
      } catch {
        // Skip malformed lines
      }
    }
  } catch {
    // File read error
  }

  return entries;
}

async function shouldSkipFile(
  filePath: string,
  startDate?: string,
  endDate?: string,
): Promise<boolean> {
  if (!startDate && !endDate) return false;

  try {
    const fileStats = await fs.stat(filePath);
    const fileModTime = fileStats.mtime.toISOString();
    const fileCreateTime = fileStats.birthtime.toISOString();

    const oldestPossibleTime = fileCreateTime < fileModTime ? fileCreateTime : fileModTime;
    const newestPossibleTime = fileModTime;

    if (endDate && oldestPossibleTime > endDate) return true;
    if (startDate && newestPossibleTime < startDate) return true;

    return false;
  } catch {
    return false; // Safe fallback: read the file
  }
}

// Re-export for backward compatibility and tests
export { decodeProjectPath, extractContent, parseJsonlFile, getTimeAgo };
