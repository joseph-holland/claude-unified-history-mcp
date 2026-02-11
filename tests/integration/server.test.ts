import { describe, it, expect } from '@jest/globals';
import { spawn } from 'child_process';
import * as path from 'path';

describe('MCP Server Integration Tests', () => {
  const serverPath = path.join(__dirname, '..', '..', 'dist', 'index.js');

  // Helper function to send requests to the server
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendRequest = (request: any, timeout = 5000): Promise<any> => {
    return new Promise((resolve, reject) => {
      const server = spawn('node', [serverPath], {
        stdio: 'pipe'
      });

      let output = '';

      server.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      server.stderr?.on('data', (_data: Buffer) => {
        // ignore stderr
      });

      server.on('close', () => {
        try {
          const lines = output.trim().split('\n');
          const jsonLine = lines.find(line => line.startsWith('{'));

          if (jsonLine) {
            const response = JSON.parse(jsonLine);
            resolve(response);
          } else {
            reject(new Error(`No JSON response found. Output: ${output}`));
          }
        } catch (error) {
          reject(new Error(`Failed to parse response: ${error}. Output: ${output}`));
        }
      });

      server.on('error', (error: Error) => {
        reject(error);
      });

      if (server.stdin) {
        server.stdin.write(JSON.stringify(request) + '\n');
        server.stdin.end();
      }

      setTimeout(() => {
        server.kill();
        reject(new Error('Request timeout'));
      }, timeout);
    });
  };

  describe('Server Startup and Basic Functionality', () => {
    it('should start and respond to tools/list request', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      };

      const response = await sendRequest(request);

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        result: expect.objectContaining({
          tools: expect.arrayContaining([
            expect.objectContaining({
              name: 'get_conversation'
            }),
            expect.objectContaining({
              name: 'search_conversations'
            }),
            expect.objectContaining({
              name: 'list_projects'
            }),
            expect.objectContaining({
              name: 'list_sessions'
            })
          ])
        })
      });
    });

    it('should have source parameter on list_projects', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {}
      };

      const response = await sendRequest(request);
      const listProjectsTool = response.result.tools.find(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (t: any) => t.name === 'list_projects'
      );

      expect(listProjectsTool).toBeDefined();
      expect(listProjectsTool.inputSchema.properties.source).toBeDefined();
      expect(listProjectsTool.inputSchema.properties.source.enum).toContain('code');
      expect(listProjectsTool.inputSchema.properties.source.enum).toContain('cloud');
      expect(listProjectsTool.inputSchema.properties.source.enum).toContain('all');
    });

    it('should handle list_projects tool call', async () => {
      // Scans all projects on disk - needs longer timeout with real data
      const request = {
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: {
          name: 'list_projects',
          arguments: {}
        }
      };

      const response = await sendRequest(request, 15000);

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 2,
        result: expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.any(String)
            })
          ])
        })
      });

      const projects = JSON.parse(response.result.content[0].text);
      expect(Array.isArray(projects)).toBe(true);
    }, 20000);

    it('should handle get_conversation tool call', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: {
          name: 'get_conversation',
          arguments: {
            sessionId: 'non-existent-session-id'
          }
        }
      };

      const response = await sendRequest(request);

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 3,
        result: expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.any(String)
            })
          ])
        })
      });

      const result = JSON.parse(response.result.content[0].text);
      expect(result).toHaveProperty('error');
    });
  });

  describe('Tool Validation and Error Handling', () => {
    it('should return error for missing required parameters', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'search_conversations',
          arguments: {}
        }
      };

      const response = await sendRequest(request);

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 4,
        result: expect.objectContaining({
          isError: true,
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: 'Error: Search query is required'
            })
          ])
        })
      });
    });

    it('should return error for unknown tool', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'unknown_tool',
          arguments: {}
        }
      };

      const response = await sendRequest(request);

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 5,
        result: expect.objectContaining({
          isError: true,
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: 'Error: Unknown tool: unknown_tool'
            })
          ])
        })
      });
    });

    it('should handle search_conversations with valid query', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'search_conversations',
          arguments: {
            query: 'test',
            limit: 5
          }
        }
      };

      const response = await sendRequest(request);

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 6,
        result: expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.any(String)
            })
          ])
        })
      });

      const result = JSON.parse(response.result.content[0].text);
      expect(result).toHaveProperty('results');
      expect(result).toHaveProperty('sources_searched');
      expect(Array.isArray(result.results)).toBe(true);
    });

    it('should handle list_sessions tool call', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: {
          name: 'list_sessions',
          arguments: {}
        }
      };

      const response = await sendRequest(request);

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 7,
        result: expect.objectContaining({
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: expect.any(String)
            })
          ])
        })
      });

      const result = JSON.parse(response.result.content[0].text);
      expect(result).toHaveProperty('sessions');
      expect(result).toHaveProperty('pagination');
      expect(Array.isArray(result.sessions)).toBe(true);
    });

    it('should return error for get_conversation without sessionId', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: {
          name: 'get_conversation',
          arguments: {}
        }
      };

      const response = await sendRequest(request);

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: 8,
        result: expect.objectContaining({
          isError: true,
          content: expect.arrayContaining([
            expect.objectContaining({
              type: 'text',
              text: 'Error: sessionId is required'
            })
          ])
        })
      });
    });
  });

  describe('Source Filtering', () => {
    it('should accept source filter on list_projects', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'list_projects',
          arguments: {
            source: 'code'
          }
        }
      };

      const response = await sendRequest(request);

      expect(response.jsonrpc).toBe('2.0');
      expect(response.result).toBeDefined();

      const projects = JSON.parse(response.result.content[0].text);
      expect(Array.isArray(projects)).toBe(true);
    });

    it('should accept source filter on list_sessions', async () => {
      const request = {
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'list_sessions',
          arguments: {
            source: 'code'
          }
        }
      };

      const response = await sendRequest(request, 15000);

      const result = JSON.parse(response.result.content[0].text);
      expect(result).toHaveProperty('sessions');
      expect(result).toHaveProperty('pagination');
    }, 20000);
  });
});
