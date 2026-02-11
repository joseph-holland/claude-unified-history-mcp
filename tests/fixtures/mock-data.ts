import type { ClaudeCodeMessage, Project, Session, SearchResult } from '../../src/types';

export const mockClaudeMessage: ClaudeCodeMessage = {
  parentUuid: null,
  isSidechain: false,
  userType: "external",
  cwd: "/Users/test/project",
  sessionId: "test-session-123",
  version: "1.0.33",
  type: "user",
  message: {
    role: "user",
    content: "Fix the bug in the authentication module"
  },
  uuid: "msg-uuid-123",
  timestamp: "2025-06-30T10:00:00.000Z",
  requestId: "req-123"
};

export const mockAssistantMessage: ClaudeCodeMessage = {
  parentUuid: "msg-uuid-123",
  isSidechain: false,
  userType: "external",
  cwd: "/Users/test/project",
  sessionId: "test-session-123",
  version: "1.0.33",
  type: "assistant",
  message: {
    role: "assistant",
    content: [
      {
        type: "text",
        text: "I'll help you fix the authentication bug. Let me first examine the code."
      }
    ],
    model: "claude-sonnet-4-20250514",
    usage: {
      input_tokens: 10,
      output_tokens: 20,
    }
  },
  uuid: "msg-uuid-456",
  timestamp: "2025-06-30T10:00:05.000Z",
  requestId: "req-456"
};

export const mockProject: Project = {
  id: "code_Users/test/project",
  name: "Users/test/project",
  path: "Users/test/project",
  source: { type: 'code' },
  sessionCount: 5,
  messageCount: 150,
  lastActivity: new Date("2025-06-30T10:00:00.000Z"),
};

export const mockSession: Session = {
  id: "test-session-123",
  source: { type: 'code' },
  projectId: "code_Users/test/project",
  projectName: "Users/test/project",
  createdAt: new Date("2025-06-30T09:00:00.000Z"),
  updatedAt: new Date("2025-06-30T10:00:00.000Z"),
  messageCount: 10,
};

export const mockSearchResult: SearchResult = {
  source: { type: 'code' },
  sessionId: "test-session-123",
  messageId: "msg-uuid-123",
  snippet: "Fix the bug in the authentication module",
  timestamp: new Date("2025-06-30T10:00:00.000Z"),
};

export const mockJsonlContent = `{"parentUuid":null,"isSidechain":false,"userType":"external","cwd":"/Users/test/project","sessionId":"test-session-123","version":"1.0.33","type":"user","message":{"role":"user","content":"Fix the bug in the authentication module"},"uuid":"msg-uuid-123","timestamp":"2025-06-30T10:00:00.000Z"}
{"parentUuid":"msg-uuid-123","isSidechain":false,"userType":"external","cwd":"/Users/test/project","sessionId":"test-session-123","version":"1.0.33","type":"assistant","message":{"id":"msg_assistant_123","type":"message","role":"assistant","model":"claude-sonnet-4-20250514","content":[{"type":"text","text":"I'll help you fix the authentication bug. Let me first examine the code."}],"usage":{"input_tokens":10,"output_tokens":20}},"uuid":"msg-uuid-456","timestamp":"2025-06-30T10:00:05.000Z"}`;
