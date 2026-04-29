import { describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { loadConfig, validateConfig } from '../config.js';
import { configCommand } from './config.js';

async function withEnv<T>(patch: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(patch)) {
    previous.set(key, process.env[key]);
    const value = patch[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

describe('configuration bootstrap', () => {
  test('startup validation allows missing config so /config can bootstrap', async () => {
    await withEnv(
      {
        MINA_API_KEY: undefined,
        MINA_MODEL: undefined,
      },
      () => {
        expect(() => validateConfig(loadConfig())).not.toThrow();
      }
    );
  });

  test('/config refreshes the active agent client config', async () => {
    const home = mkdtempSync(join(tmpdir(), 'minagent-config-test-'));
    let reloaded = false;
    const ctx = {
      agent: {
        reloadConfig() {
          reloaded = true;
        },
      },
      tools: {},
      skills: {},
      cwd: process.cwd(),
    } as any;

    try {
      await withEnv({ MINA_CONFIG_DIR: home }, () => configCommand.execute('MINA_MODEL next-model', ctx));

      expect(reloaded).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  });
});
