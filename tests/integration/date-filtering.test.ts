import { describe, it, expect } from '@jest/globals';
import { spawn } from 'child_process';
import * as path from 'path';

describe('Date Filtering Performance Tests', () => {
  const serverPath = path.join(__dirname, '..', '..', 'dist', 'index.js');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sendRequest = (request: any, timeout = 10000): Promise<any> => {
    return new Promise((resolve, reject) => {
      const server = spawn('node', [serverPath], {
        stdio: 'pipe'
      });

      let output = '';

      const timeoutId = setTimeout(() => {
        server.kill();
        reject(new Error(`Request timed out after ${timeout}ms`));
      }, timeout);

      server.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });

      server.stderr?.on('data', (_data: Buffer) => {
        // ignore stderr
      });

      server.on('close', () => {
        clearTimeout(timeoutId);
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
        clearTimeout(timeoutId);
        reject(error);
      });

      if (server.stdin) {
        server.stdin.write(JSON.stringify(request) + '\n');
        server.stdin.end();
      }
    });
  };

  it('should handle date-filtered list_sessions requests efficiently', async () => {
    const startTime = Date.now();

    const request = {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'list_sessions',
        arguments: {
          startDate: '2025-06-25',
          endDate: '2025-06-26',
          limit: 50
        }
      }
    };

    const response = await sendRequest(request);

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(response).toHaveProperty('result');
    expect(response.result).toHaveProperty('content');

    // Response should be reasonably fast
    expect(duration).toBeLessThan(5000);
  });

  it('should return search results with source tags', async () => {
    const request = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'search_conversations',
        arguments: {
          query: 'test',
          limit: 10
        }
      }
    };

    const response = await sendRequest(request);

    expect(response).toHaveProperty('result');

    const result = JSON.parse(response.result.content[0].text);
    expect(result).toHaveProperty('results');
    expect(result).toHaveProperty('sources_searched');
    expect(Array.isArray(result.sources_searched)).toBe(true);
  });

  it('should handle queries for date ranges with no data efficiently', async () => {
    const startTime = Date.now();

    const request = {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'list_sessions',
        arguments: {
          startDate: '2030-01-01',
          endDate: '2030-01-31',
          limit: 100
        }
      }
    };

    const response = await sendRequest(request);

    const endTime = Date.now();
    const duration = endTime - startTime;

    expect(response).toHaveProperty('result');

    const result = JSON.parse(response.result.content[0].text);
    expect(result).toHaveProperty('sessions');
    expect(result).toHaveProperty('pagination');
    expect(Array.isArray(result.sessions)).toBe(true);
    expect(result.sessions.length).toBe(0);

    // Should be very fast when no files need to be read
    expect(duration).toBeLessThan(2000);
  });
});
