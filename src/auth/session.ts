import type { CloudOrganization } from '../types.js';

const CLAUDE_API_BASE = 'https://claude.ai';
const REQUEST_DELAY_MS = 100;

export class CloudSession {
  private sessionKey: string;
  private orgId: string | null = null;
  private available: boolean = true;
  private lastRequestTime: number = 0;

  constructor(sessionKey: string, orgId?: string) {
    this.sessionKey = sessionKey;
    if (orgId) {
      this.orgId = orgId;
    }
  }

  isAvailable(): boolean {
    return this.available;
  }

  markUnavailable(): void {
    this.available = false;
  }

  /**
   * Get the org ID, discovering it if not already known.
   */
  async getOrgId(): Promise<string | null> {
    if (this.orgId) {
      return this.orgId;
    }

    try {
      const orgs = await this.fetchApi<CloudOrganization[]>('/api/organizations');
      if (orgs && orgs.length > 0) {
        const firstOrg = orgs[0];
        if (firstOrg) {
          this.orgId = firstOrg.uuid;
          return this.orgId;
        }
      }
      console.error('No organizations found for session key');
      this.markUnavailable();
      return null;
    } catch (error) {
      console.error('Failed to discover org ID:', error);
      this.markUnavailable();
      return null;
    }
  }

  /**
   * Make an authenticated API request to claude.ai.
   */
  async fetchApi<T>(path: string): Promise<T | null> {
    if (!this.available) {
      return null;
    }

    // Rate limiting: ensure minimum delay between requests
    const now = Date.now();
    const elapsed = now - this.lastRequestTime;
    if (elapsed < REQUEST_DELAY_MS) {
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS - elapsed));
    }

    const url = `${CLAUDE_API_BASE}${path}`;
    let lastError: Error | null = null;

    // Retry with exponential backoff on 429
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        this.lastRequestTime = Date.now();
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Cookie': `sessionKey=${this.sessionKey}`,
            'Content-Type': 'application/json',
          },
          signal: AbortSignal.timeout(10000),
        });

        if (response.status === 401 || response.status === 403) {
          console.warn('Session key expired or invalid (HTTP ' + response.status + ')');
          this.markUnavailable();
          return null;
        }

        if (response.status === 429) {
          const backoff = Math.pow(2, attempt + 1) * 1000;
          console.warn(`Rate limited, backing off ${backoff}ms`);
          await new Promise(resolve => setTimeout(resolve, backoff));
          continue;
        }

        if (!response.ok) {
          console.warn(`API request failed: ${response.status} ${response.statusText}`);
          return null;
        }

        return await response.json() as T;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (lastError.name === 'TimeoutError' || lastError.name === 'AbortError') {
          console.warn('API request timed out');
          return null;
        }
        // Network error - retry
        if (attempt < 2) {
          const backoff = Math.pow(2, attempt + 1) * 1000;
          await new Promise(resolve => setTimeout(resolve, backoff));
        }
      }
    }

    console.warn('API request failed after retries:', lastError?.message);
    return null;
  }
}

/**
 * Create a CloudSession from environment variables, if configured.
 */
export function createCloudSession(): CloudSession | null {
  const sessionKey = process.env['CLAUDE_SESSION_KEY'];
  const orgId = process.env['CLAUDE_ORG_ID'];
  const webEnabled = process.env['CLAUDE_WEB_ENABLED'];

  if (!sessionKey) {
    return null;
  }

  // Explicit disable check
  if (webEnabled === 'false' || webEnabled === '0') {
    return null;
  }

  return new CloudSession(sessionKey, orgId);
}
