import type { Command } from './types.js';
import { loadPersistentConfig, setPersistentConfig } from '../utils/configStore.js';

const CONFIG_KEYS = [
  'MINA_PROVIDER',
  'MINA_API_KEY',
  'MINA_MODEL',
  'MINA_BASE_URL',
  'MINA_CONTEXT_WINDOW',
  'MINA_INPUT_PRICE',
  'MINA_OUTPUT_PRICE',
  'MINA_PERMISSION_MODE',
  'MINA_THEME',
  'MINA_SANDBOX',
  'MINA_REASONING',
  'MINA_TRUST_LOCAL_SKILLS',
];

export const configCommand: Command = {
  name: 'config',
  description: 'Show or set configuration values',
  execute: async (args, ctx) => {
    const parts = args.trim().split(/\s+/);

    // Show all
    if (!args.trim()) {
      const persistent = loadPersistentConfig();
      const lines = ['Current configuration:'];
      for (const key of CONFIG_KEYS) {
        const envVal = process.env[key];
        const persistVal = persistent[key];
        const display = key === 'MINA_API_KEY' && envVal
          ? envVal.slice(0, 4) + '...' + envVal.slice(-4)
          : (envVal || persistVal || '(not set)');
        const source = envVal ? '(env)' : persistVal ? '(persistent)' : '';
        lines.push(`  ${key}=${display} ${source}`);
      }
      lines.push('\nSet via: /config KEY VALUE  (persisted to ~/.minagent/config.json)');
      lines.push('Or: export KEY=value  (session-only)');
      return lines.join('\n');
    }

    // Set a key (persistent)
    if (parts.length >= 2) {
      const key = parts[0]!;
      const value = parts.slice(1).join(' ');
      if (!CONFIG_KEYS.includes(key)) {
        return `Error: Unknown config key "${key}". Valid: ${CONFIG_KEYS.join(', ')}`;
      }
      process.env[key] = value;
      setPersistentConfig(key, value);
      ctx.agent.reloadConfig();
      return `Set and persisted ${key}=${key === 'MINA_API_KEY' ? value.slice(0, 4) + '...' : value}`;
    }

    return 'Usage: /config [KEY VALUE]\nWithout args: show all config.';
  },
};
