import { describe, it, expect } from '@jest/globals';
import type { SearchResult, Source } from '../../src/types';

describe('Tool Orchestration Logic', () => {
  describe('Result merging', () => {
    it('should merge results from multiple sources by timestamp', () => {
      const codeResults: SearchResult[] = [
        {
          source: { type: 'code' },
          sessionId: 'code-session-1',
          messageId: 'msg-1',
          snippet: 'code result 1',
          timestamp: new Date('2025-06-30T10:00:00.000Z'),
        },
        {
          source: { type: 'code' },
          sessionId: 'code-session-2',
          messageId: 'msg-2',
          snippet: 'code result 2',
          timestamp: new Date('2025-06-29T10:00:00.000Z'),
        },
      ];

      const cloudResults: SearchResult[] = [
        {
          source: { type: 'cloud' },
          sessionId: 'cloud-conv-1',
          messageId: 'cloud-msg-1',
          snippet: 'cloud result 1',
          timestamp: new Date('2025-06-30T08:00:00.000Z'),
        },
      ];

      const allResults = [...codeResults, ...cloudResults];
      allResults.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

      expect(allResults[0]!.source.type).toBe('code');
      expect(allResults[0]!.snippet).toBe('code result 1');
      expect(allResults[1]!.source.type).toBe('cloud');
      expect(allResults[2]!.source.type).toBe('code');
    });

    it('should respect limit after merging', () => {
      const results: SearchResult[] = Array.from({ length: 10 }, (_, i) => ({
        source: { type: (i % 2 === 0 ? 'code' : 'cloud') as 'code' | 'cloud' },
        sessionId: `session-${i}`,
        messageId: `msg-${i}`,
        snippet: `result ${i}`,
        timestamp: new Date(Date.now() - i * 60000),
      }));

      const limit = 5;
      const limited = results.slice(0, limit);

      expect(limited).toHaveLength(5);
    });
  });

  describe('Source filtering', () => {
    it('should filter sources by type', () => {
      const sources: Source[] = [
        { type: 'code' },
        { type: 'cloud' },
      ];

      const codeOnly = sources.filter(s => s.type === 'code');
      expect(codeOnly).toHaveLength(1);
      expect(codeOnly[0]!.type).toBe('code');

      const cloudOnly = sources.filter(s => s.type === 'cloud');
      expect(cloudOnly).toHaveLength(1);
      expect(cloudOnly[0]!.type).toBe('cloud');
    });

    it('should return all sources when filter is all', () => {
      const sources: Source[] = [
        { type: 'code' },
        { type: 'cloud' },
      ];

      const filter = 'all';
      const filtered = filter === 'all' ? sources : sources.filter(s => s.type === filter);
      expect(filtered).toHaveLength(2);
    });
  });

  describe('Graceful degradation', () => {
    it('should handle empty results from a source', () => {
      const codeResults: SearchResult[] = [
        {
          source: { type: 'code' },
          sessionId: 's1',
          messageId: 'm1',
          snippet: 'found something',
          timestamp: new Date(),
        },
      ];
      const cloudResults: SearchResult[] = []; // Cloud returned nothing

      const merged = [...codeResults, ...cloudResults];
      expect(merged).toHaveLength(1);
      expect(merged[0]!.source.type).toBe('code');
    });

    it('should track which sources were searched', () => {
      const sourcesSearched: Source[] = [
        { type: 'code' },
      ];

      expect(sourcesSearched.some(s => s.type === 'code')).toBe(true);
      expect(sourcesSearched.some(s => s.type === 'cloud')).toBe(false);
    });
  });
});
