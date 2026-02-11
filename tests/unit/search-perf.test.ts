import { describe, it, expect } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { ClaudeCodeSource } from '../../src/sources/claude-code';

describe('Local Search Performance Optimizations', () => {
  let tempDir: string;

  // Helper to create a fake .claude directory with JSONL sessions
  const setupTestDir = async (sessionCount: number, messagesPerSession: number) => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-perf-test-'));
    const projectDir = path.join(tempDir, 'projects', '-test-project');
    await fs.mkdir(projectDir, { recursive: true });

    for (let s = 0; s < sessionCount; s++) {
      const sessionId = `session-${s}`;
      const lines: string[] = [];

      for (let m = 0; m < messagesPerSession; m++) {
        const entry = {
          parentUuid: null,
          isSidechain: false,
          userType: 'external',
          cwd: '/test',
          sessionId,
          version: '1.0',
          type: m % 2 === 0 ? 'user' : 'assistant',
          message: {
            role: m % 2 === 0 ? 'user' : 'assistant',
            content: m === 0 ? `needle in session ${s}` : `other message ${m} in session ${s}`,
          },
          uuid: `uuid-${s}-${m}`,
          timestamp: new Date(Date.now() - (sessionCount - s) * 60000 - m * 1000).toISOString(),
        };
        lines.push(JSON.stringify(entry));
      }

      await fs.writeFile(path.join(projectDir, `${sessionId}.jsonl`), lines.join('\n'));
    }

    return tempDir;
  };

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  describe('Early termination', () => {
    it('should respect the limit parameter', async () => {
      await setupTestDir(10, 5);
      const source = new ClaudeCodeSource(tempDir);

      const results = await source.search({ query: 'needle', limit: 3 });

      expect(results.length).toBeLessThanOrEqual(3);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should return all results when under limit', async () => {
      await setupTestDir(5, 5);
      const source = new ClaudeCodeSource(tempDir);

      const results = await source.search({ query: 'needle', limit: 100 });

      // Each session has 1 message with "needle"
      expect(results.length).toBe(5);
    });
  });

  describe('Parallel file processing', () => {
    it('should process multiple files and find results across them', async () => {
      await setupTestDir(20, 3);
      const source = new ClaudeCodeSource(tempDir);

      const results = await source.search({ query: 'needle', limit: 50 });

      // Each of 20 sessions has 1 "needle" message
      expect(results.length).toBe(20);
    });

    it('should return results sorted by timestamp (newest first)', async () => {
      await setupTestDir(10, 3);
      const source = new ClaudeCodeSource(tempDir);

      const results = await source.search({ query: 'needle', limit: 50 });

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.timestamp.getTime()).toBeGreaterThanOrEqual(
          results[i]!.timestamp.getTime()
        );
      }
    });

    it('should handle empty sessions gracefully', async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-perf-test-'));
      const projectDir = path.join(tempDir, 'projects', '-test-project');
      await fs.mkdir(projectDir, { recursive: true });

      // Create an empty JSONL file
      await fs.writeFile(path.join(projectDir, 'empty-session.jsonl'), '');

      // Create one with data
      const entry = {
        parentUuid: null,
        isSidechain: false,
        userType: 'external',
        cwd: '/test',
        sessionId: 'has-data',
        version: '1.0',
        type: 'user',
        message: { role: 'user', content: 'findme' },
        uuid: 'uuid-1',
        timestamp: new Date().toISOString(),
      };
      await fs.writeFile(
        path.join(projectDir, 'has-data.jsonl'),
        JSON.stringify(entry)
      );

      const source = new ClaudeCodeSource(tempDir);
      const results = await source.search({ query: 'findme', limit: 10 });

      expect(results.length).toBe(1);
      expect(results[0]!.snippet).toContain('findme');
    });
  });

  describe('Snippet generation', () => {
    it('should generate snippets around the match', async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-perf-test-'));
      const projectDir = path.join(tempDir, 'projects', '-test-project');
      await fs.mkdir(projectDir, { recursive: true });

      const longContent = 'a'.repeat(100) + 'FINDME' + 'b'.repeat(100);
      const entry = {
        parentUuid: null,
        isSidechain: false,
        userType: 'external',
        cwd: '/test',
        sessionId: 'snippet-test',
        version: '1.0',
        type: 'user',
        message: { role: 'user', content: longContent },
        uuid: 'uuid-snippet',
        timestamp: new Date().toISOString(),
      };
      await fs.writeFile(
        path.join(projectDir, 'snippet-test.jsonl'),
        JSON.stringify(entry)
      );

      const source = new ClaudeCodeSource(tempDir);
      const results = await source.search({ query: 'FINDME', limit: 10 });

      expect(results.length).toBe(1);
      expect(results[0]!.snippet).toContain('FINDME');
      // Snippet should be truncated, not the full content
      expect(results[0]!.snippet.length).toBeLessThan(longContent.length);
      expect(results[0]!.snippet).toMatch(/^\.\.\./);
      expect(results[0]!.snippet).toMatch(/\.\.\.$/);
    });
  });

  describe('Date filtering with file skip', () => {
    it('should filter results by date range', async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'claude-perf-test-'));
      const projectDir = path.join(tempDir, 'projects', '-test-project');
      await fs.mkdir(projectDir, { recursive: true });

      const oldEntry = {
        parentUuid: null,
        isSidechain: false,
        userType: 'external',
        cwd: '/test',
        sessionId: 'old-session',
        version: '1.0',
        type: 'user',
        message: { role: 'user', content: 'old needle' },
        uuid: 'uuid-old',
        timestamp: '2024-01-01T00:00:00.000Z',
      };

      const newEntry = {
        parentUuid: null,
        isSidechain: false,
        userType: 'external',
        cwd: '/test',
        sessionId: 'new-session',
        version: '1.0',
        type: 'user',
        message: { role: 'user', content: 'new needle' },
        uuid: 'uuid-new',
        timestamp: '2026-01-15T00:00:00.000Z',
      };

      await fs.writeFile(
        path.join(projectDir, 'old-session.jsonl'),
        JSON.stringify(oldEntry)
      );
      await fs.writeFile(
        path.join(projectDir, 'new-session.jsonl'),
        JSON.stringify(newEntry)
      );

      const source = new ClaudeCodeSource(tempDir);
      const results = await source.search({
        query: 'needle',
        startDate: '2026-01-01',
        limit: 10,
      });

      expect(results.length).toBe(1);
      expect(results[0]!.snippet).toContain('new needle');
    });
  });
});
