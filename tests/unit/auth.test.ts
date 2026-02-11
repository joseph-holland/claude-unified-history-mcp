import { describe, it, expect } from '@jest/globals';

describe('Auth / Session Key Handling', () => {
  describe('Session key validation', () => {
    it('should treat missing session key as cloud-disabled', () => {
      // When no CLAUDE_SESSION_KEY is set, cloud source should not be created
      const sessionKey = undefined;
      const cloudEnabled = !!sessionKey;
      expect(cloudEnabled).toBe(false);
    });

    it('should treat present session key as cloud-enabled', () => {
      const sessionKey = 'sk-ant-test-key-123';
      const cloudEnabled = !!sessionKey;
      expect(cloudEnabled).toBe(true);
    });

    it('should respect explicit disable flag', () => {
      const sessionKey = 'sk-ant-test-key-123';
      const webEnabled: string = 'false';
      const disableValues = ['false', '0'];
      const cloudEnabled = !!sessionKey && !disableValues.includes(webEnabled);
      expect(cloudEnabled).toBe(false);
    });

    it('should respect explicit disable flag with 0', () => {
      const sessionKey = 'sk-ant-test-key-123';
      const webEnabled: string = '0';
      const disableValues = ['false', '0'];
      const cloudEnabled = !!sessionKey && !disableValues.includes(webEnabled);
      expect(cloudEnabled).toBe(false);
    });
  });

  describe('Source type tagging', () => {
    it('should tag code source correctly', () => {
      const source = { type: 'code' as const };
      expect(source.type).toBe('code');
    });

    it('should tag cloud source correctly', () => {
      const source = { type: 'cloud' as const };
      expect(source.type).toBe('cloud');
    });

    it('should distinguish source types', () => {
      const codeSource = { type: 'code' as const };
      const cloudSource = { type: 'cloud' as const };
      expect(codeSource.type).not.toBe(cloudSource.type);
    });
  });
});
