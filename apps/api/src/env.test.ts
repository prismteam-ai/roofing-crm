import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

describe('loadEnv', () => {
  it('defaults and blanks', () => {
    const e = loadEnv({ PIPELINE_MCP_URL: '', OPENAI_API_KEY: '' });
    expect(e.PORT).toBe(8080);
    expect(e.PIPELINE_MCP_URL).toBeUndefined();
    expect(e.OPENAI_API_KEY).toBeUndefined();
  });
  it('rejects bad url', () => {
    expect(() => loadEnv({ PIPELINE_MCP_URL: 'not a url' })).toThrow();
  });
});
