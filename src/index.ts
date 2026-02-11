#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js';
import type { ConversationSource } from './sources/index.js';
import { ClaudeCodeSource } from './sources/claude-code.js';
import { ClaudeApiSource } from './sources/claude-api.js';
import { createCloudSession } from './auth/session.js';
import { listProjects } from './tools/list-projects.js';
import { listSessions } from './tools/list-sessions.js';
import { getConversation } from './tools/get-conversation.js';
import { searchConversations } from './tools/search.js';
import type { SourceType } from './types.js';

const server = new Server(
  {
    name: 'claude-unified-history-mcp',
    version: '2.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

// Initialize sources
const sources: ConversationSource[] = [new ClaudeCodeSource()];

const cloudSession = createCloudSession();
if (cloudSession) {
  sources.push(new ClaudeApiSource(cloudSession));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createResponse = (data: any) => ({
  content: [{
    type: 'text' as const,
    text: JSON.stringify(data),
  }],
});

const sourceEnum = ['code', 'cloud', 'all'] as const;

const tools: Tool[] = [
  {
    name: 'list_projects',
    description: 'List all projects with Claude conversation history from both Claude Code terminal sessions and claude.ai synced conversations.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: [...sourceEnum],
          description: "Filter by source: 'code' (terminal), 'cloud' (claude.ai/mobile/desktop), or 'all' (default: 'all')",
        },
      },
    },
  },
  {
    name: 'list_sessions',
    description: 'List conversation sessions with filtering. Supports both Claude Code terminal sessions and claude.ai synced conversations.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          enum: [...sourceEnum],
          description: "Filter by source (default: 'all')",
        },
        projectPath: {
          type: 'string',
          description: 'Filter by project path (code source)',
        },
        projectId: {
          type: 'string',
          description: 'Filter by project ID (cloud source)',
        },
        startDate: {
          type: 'string',
          description: 'Start date in ISO format or YYYY-MM-DD',
        },
        endDate: {
          type: 'string',
          description: 'End date in ISO format or YYYY-MM-DD',
        },
        timezone: {
          type: 'string',
          description: 'IANA timezone (e.g., "America/New_York", "UTC"). Defaults to system timezone.',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 50)',
          default: 50,
        },
        offset: {
          type: 'number',
          description: 'Pagination offset',
          default: 0,
        },
      },
    },
  },
  {
    name: 'get_conversation',
    description: 'Retrieve full conversation by session ID. Auto-detects source if not specified (tries local first, then cloud).',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: {
          type: 'string',
          description: 'Session/conversation ID',
        },
        source: {
          type: 'string',
          enum: ['code', 'cloud'],
          description: 'Hint for source routing (auto-detect if omitted)',
        },
        messageTypes: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['user', 'assistant', 'system'],
          },
          description: "Filter by message types (default: ['user', 'assistant'])",
        },
        limit: {
          type: 'number',
          description: 'Max messages (default: 100)',
          default: 100,
        },
        offset: {
          type: 'number',
          description: 'Pagination offset',
          default: 0,
        },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'search_conversations',
    description: 'Search across all conversation content from both Claude Code terminal sessions and claude.ai synced conversations. Results are merged by timestamp.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search terms',
        },
        source: {
          type: 'string',
          enum: [...sourceEnum],
          description: "Filter by source (default: 'all')",
        },
        projectPath: {
          type: 'string',
          description: 'Filter by project path (code source)',
        },
        projectId: {
          type: 'string',
          description: 'Filter by project ID (cloud source)',
        },
        startDate: {
          type: 'string',
          description: 'Start date in ISO format or YYYY-MM-DD',
        },
        endDate: {
          type: 'string',
          description: 'End date in ISO format or YYYY-MM-DD',
        },
        timezone: {
          type: 'string',
          description: 'IANA timezone (e.g., "America/New_York", "UTC"). Defaults to system timezone.',
        },
        limit: {
          type: 'number',
          description: 'Max results (default: 30)',
          default: 30,
        },
      },
      required: ['query'],
    },
  },
];

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'list_projects': {
        const result = await listProjects(sources, {
          source: (args?.source as SourceType | 'all') ?? 'all',
        });
        return createResponse(result);
      }

      case 'list_sessions': {
        const result = await listSessions(sources, {
          source: (args?.source as SourceType | 'all') ?? 'all',
          projectPath: args?.projectPath as string | undefined,
          projectId: args?.projectId as string | undefined,
          startDate: args?.startDate as string | undefined,
          endDate: args?.endDate as string | undefined,
          timezone: args?.timezone as string | undefined,
          limit: (args?.limit as number | undefined) ?? 50,
          offset: (args?.offset as number | undefined) ?? 0,
        });
        return createResponse(result);
      }

      case 'get_conversation': {
        const sessionId = args?.sessionId as string;
        if (!sessionId) {
          throw new Error('sessionId is required');
        }
        const result = await getConversation(sources, {
          sessionId,
          source: args?.source as SourceType | undefined,
          messageTypes: args?.messageTypes as string[] | undefined,
          limit: (args?.limit as number | undefined) ?? 100,
          offset: (args?.offset as number | undefined) ?? 0,
        });
        if (!result) {
          return createResponse({ error: 'Conversation not found', sessionId });
        }
        return createResponse(result);
      }

      case 'search_conversations': {
        const query = args?.query as string;
        if (!query) {
          throw new Error('Search query is required');
        }
        const result = await searchConversations(sources, {
          query,
          source: (args?.source as SourceType | 'all') ?? 'all',
          projectPath: args?.projectPath as string | undefined,
          projectId: args?.projectId as string | undefined,
          startDate: args?.startDate as string | undefined,
          endDate: args?.endDate as string | undefined,
          timezone: args?.timezone as string | undefined,
          limit: (args?.limit as number | undefined) ?? 30,
        });
        return createResponse(result);
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      content: [{
        type: 'text' as const,
        text: `Error: ${errorMessage}`,
      }],
      isError: true,
    };
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Claude Unified History MCP Server started');

  const cloudEnabled = sources.some(s => s.type === 'cloud');
  console.error(`Sources: code${cloudEnabled ? ', cloud' : ''}`);
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
