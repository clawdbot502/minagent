import { describe, expect, test } from 'bun:test';
import { createSubAgentConfig } from './AgentTool.js';

describe('createSubAgentConfig', () => {
  test('includes custom base URL from MINA_BASE_URL', () => {
    const config = createSubAgentConfig({
      MINA_PROVIDER: 'generic',
      MINA_API_KEY: 'key',
      MINA_MODEL: 'model',
      MINA_BASE_URL: 'http://127.0.0.1:11434/v1',
    });

    expect(config.baseUrl).toBe('http://127.0.0.1:11434/v1');
  });
});
