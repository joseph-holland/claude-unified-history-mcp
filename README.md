# Claude Unified History MCP

Search all your Claude conversations in one place - terminal sessions from Claude Code and synced conversations from claude.ai (web, mobile, and desktop apps).

> Fork of [yudppp/claude-code-history-mcp](https://github.com/yudppp/claude-code-history-mcp). Original work by [@yudppp](https://github.com/yudppp).

## Features

- **Unified search** across Claude Code terminal sessions AND claude.ai conversations
- **Source tagging** - every result tagged with `code` or `cloud` so you know where it came from
- **Graceful degradation** - works with just Claude Code history, adding cloud is optional
- **Timezone-aware** date filtering with automatic system timezone detection
- **Pagination** for efficient handling of large conversation histories

## Quick Start

### Claude Code history only (no config needed)

```json
{
  "mcpServers": {
    "claude-history": {
      "command": "npx",
      "args": ["claude-unified-history-mcp"]
    }
  }
}
```

### With claude.ai conversations

```json
{
  "mcpServers": {
    "claude-history": {
      "command": "npx",
      "args": ["claude-unified-history-mcp"],
      "env": {
        "CLAUDE_SESSION_KEY": "your-session-key-here"
      }
    }
  }
}
```

## Getting Your Session Key

1. Go to [claude.ai](https://claude.ai) and log in
2. Create a bookmarklet with this code:

```javascript
javascript:(()=>{const c=document.cookie.split(';').map(c=>c.trim()).find(c=>c.startsWith('sessionKey='));if(c){const k=c.split('=')[1];navigator.clipboard.writeText(k);alert('Session key copied to clipboard!')}else{alert('sessionKey not found. Make sure you are logged into claude.ai')}})()
```

3. Click the bookmarklet while on claude.ai
4. Paste the key into your MCP config

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `CLAUDE_SESSION_KEY` | No | Session key from claude.ai cookies |
| `CLAUDE_ORG_ID` | No | Auto-discovered if not provided |
| `CLAUDE_WEB_ENABLED` | No | Set to `false` to disable cloud source even with key present |

## Tools

### `list_projects`

List all projects with conversation history from both sources.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `source` | `code \| cloud \| all` | `all` | Filter by source |

### `list_sessions`

List conversation sessions with filtering and pagination.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `source` | `code \| cloud \| all` | `all` | Filter by source |
| `projectPath` | `string` | - | Filter by project (code) |
| `projectId` | `string` | - | Filter by project (cloud) |
| `startDate` | `string` | - | ISO date or YYYY-MM-DD |
| `endDate` | `string` | - | ISO date or YYYY-MM-DD |
| `timezone` | `string` | system | IANA timezone |
| `limit` | `number` | `50` | Max results |
| `offset` | `number` | `0` | Pagination offset |

### `get_conversation`

Retrieve full conversation by ID. Auto-detects source (tries local first, then cloud).

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `sessionId` | `string` | **required** | Session/conversation ID |
| `source` | `code \| cloud` | auto | Hint for routing |
| `messageTypes` | `string[]` | `["user", "assistant"]` | Filter messages |
| `limit` | `number` | `100` | Max messages |
| `offset` | `number` | `0` | Pagination offset |

### `search_conversations`

Search across all conversation content. Results merged by timestamp, tagged with source.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `query` | `string` | **required** | Search terms |
| `source` | `code \| cloud \| all` | `all` | Filter by source |
| `projectPath` | `string` | - | Filter by project (code) |
| `projectId` | `string` | - | Filter by project (cloud) |
| `startDate` | `string` | - | ISO date or YYYY-MM-DD |
| `endDate` | `string` | - | ISO date or YYYY-MM-DD |
| `timezone` | `string` | system | IANA timezone |
| `limit` | `number` | `30` | Max results |

**Response format:**
```json
{
  "results": [
    {
      "source": { "type": "code" },
      "sessionId": "abc-123",
      "messageId": "msg-456",
      "snippet": "...context around match...",
      "timestamp": "2025-06-30T10:00:00.000Z"
    }
  ],
  "sources_searched": [
    { "type": "code" },
    { "type": "cloud" }
  ]
}
```

## Example Workflows

### Daily work review

```
1. list_projects → see active projects
2. list_sessions with today's date → find today's sessions
3. get_conversation for specific session → read the details
```

### Cross-platform search

```
1. search_conversations with query "API design" → find everywhere you discussed it
2. Results tagged with source (code/cloud) → know if it was a terminal session or web chat
3. get_conversation for the relevant session → full context
```

## Architecture

```
src/
├── index.ts                    # MCP server entry, tool registration
├── types.ts                    # Shared interfaces
├── sources/
│   ├── index.ts                # Source interface
│   ├── claude-code.ts          # Local ~/.claude/projects/*.jsonl
│   └── claude-api.ts           # claude.ai API client
├── tools/
│   ├── list-projects.ts        # Both sources
│   ├── list-sessions.ts        # Both sources, tagged
│   ├── get-conversation.ts     # Route by source
│   └── search.ts               # Unified search, merged results
├── auth/
│   └── session.ts              # Session key handling, org discovery
└── utils/
    └── date.ts                 # Timezone utilities
```

## Data Sources

- **code**: Reads `.jsonl` files from `~/.claude/projects/` (Claude Code terminal sessions)
- **cloud**: Calls claude.ai API endpoints (web, mobile, desktop app conversations)

## Error Handling

| Scenario | Behavior |
|----------|----------|
| No session key | Cloud source disabled, code-only results |
| Invalid/expired session key | Warning logged, cloud disabled for session |
| API rate limit (429) | Exponential backoff, retry 3x |
| Network timeout | 10s timeout, graceful fallback |
| Missing ~/.claude directory | Empty results for code source |

The server never crashes on source failures. Partial results are returned with metadata indicating which sources were searched.

## Troubleshooting

**Cloud source not working?**
- Check that `CLAUDE_SESSION_KEY` is set correctly
- Session keys expire - get a fresh one from the bookmarklet
- Check server stderr for auth warnings

**No results from code source?**
- Verify `~/.claude/projects/` exists and contains `.jsonl` files
- Claude Code creates these automatically during terminal sessions

**Slow queries?**
- Use date filtering to narrow the search window
- Use `source: 'code'` or `source: 'cloud'` to search only one source
- Reduce `limit` for faster responses

## License

MIT

## Attribution

This project is a fork of [yudppp/claude-code-history-mcp](https://github.com/yudppp/claude-code-history-mcp). Original work by [@yudppp](https://github.com/yudppp).
