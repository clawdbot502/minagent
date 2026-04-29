import { spawnSync } from 'child_process';
import { existsSync } from 'fs';
import type { Command } from './types.js';

function checkCmd(cmd: string, args: string[] = ['--version']): { ok: boolean; version: string } {
  const result = spawnSync(cmd, args, { encoding: 'utf-8' });
  if (result.error) return { ok: false, version: 'not found' };
  const firstLine = ((result.stdout || result.stderr || '').split('\n')[0] || '').trim();
  return { ok: true, version: firstLine };
}

export const doctorCommand: Command = {
  name: 'doctor',
  description: 'Run environment diagnostics',
  execute: async (_args, ctx) => {
    const lines: string[] = ['Environment Diagnostics'];
    lines.push('');

    // Node/Bun runtime
    const bun = checkCmd('bun', ['--version']);
    const node = checkCmd('node', ['--version']);
    if (bun.ok) {
      lines.push(`  Bun:     ${bun.version}`);
    } else if (node.ok) {
      lines.push(`  Node:    ${node.version}`);
    } else {
      lines.push('  Runtime: not found (need Bun or Node.js)');
    }

    // Git
    const git = checkCmd('git', ['--version']);
    lines.push(`  Git:     ${git.ok ? git.version : 'not found'}`);

    // Git repo
    const gitDir = spawnSync('git', ['rev-parse', '--git-dir'], { cwd: ctx.cwd, encoding: 'utf-8' });
    lines.push(`  Git repo: ${gitDir.status === 0 ? 'yes' : 'no'}`);

    // GitHub CLI
    const gh = checkCmd('gh', ['--version']);
    lines.push(`  gh CLI:  ${gh.ok ? gh.version.split('\n')[0] : 'not found'}`);

    // API config
    const provider = process.env.MINA_PROVIDER || 'generic';
    const model = process.env.MINA_MODEL || '(not set)';
    const hasKey = !!process.env.MINA_API_KEY;
    lines.push(`  Provider: ${provider}`);
    lines.push(`  Model:    ${model}`);
    lines.push(`  API Key:  ${hasKey ? 'set' : 'MISSING — set MINA_API_KEY'}`);
    if (process.env.MINA_BASE_URL) {
      lines.push(`  Base URL: ${process.env.MINA_BASE_URL}`);
    }

    // Config dirs
    const globalDir = `${process.env.HOME || '~'}/.minagent`;
    lines.push(`  Config:   ${existsSync(globalDir) ? globalDir : globalDir + ' (not created yet)'}`);

    // Permissions
    const mode = process.env.MINA_PERMISSION_MODE || 'default';
    lines.push(`  Perms:    ${mode}`);

    // ripgrep
    const rg = checkCmd('rg', ['--version']);
    lines.push(`  ripgrep:  ${rg.ok ? rg.version.split(' ')[0] : 'not found (needed by GrepTool)'}`);

    // MCP config
    const mcpPath = `${process.env.HOME || '~'}/.minagent/mcp.json`;
    lines.push(`  MCP:      ${existsSync(mcpPath) ? 'configured' : 'not configured'}`);

    // Theme
    const theme = process.env.MINA_THEME || 'default';
    lines.push(`  Theme:    ${theme}`);
    lines.push(`  Local skills: ${process.env.MINA_TRUST_LOCAL_SKILLS === 'true' ? 'trusted' : 'not trusted'}`);

    lines.push('');
    const allOk = (bun.ok || node.ok) && git.ok && hasKey && model !== '(not set)' && rg.ok;
    lines.push(allOk ? 'Status: ready' : 'Status: issues detected');

    return lines.join('\n');
  },
};
