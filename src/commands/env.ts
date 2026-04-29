import type { Command } from './types.js';

export const envCommand: Command = {
  name: 'env',
  description: 'Show relevant environment variables',
  execute: async () => {
    const keys = [
      'MINA_PROVIDER',
      'MINA_MODEL',
      'MINA_API_KEY',
      'MINA_BASE_URL',
      'MINA_CONTEXT_WINDOW',
      'MINA_INPUT_PRICE',
      'MINA_OUTPUT_PRICE',
      'MINA_PERMISSION_MODE',
      'MINA_THEME',
      'MINA_SANDBOX',
      'MINA_REASONING',
      'MINA_TRUST_LOCAL_SKILLS',
      'PATH',
      'HOME',
      'SHELL',
    ];
    const lines = ['Environment variables:'];
    for (const key of keys) {
      const val = process.env[key];
      const display = key === 'MINA_API_KEY' && val
        ? val.slice(0, 4) + '...' + val.slice(-4)
        : (val || '(not set)');
      lines.push(`  ${key}=${display}`);
    }
    return lines.join('\n');
  },
};
