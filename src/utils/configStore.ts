import { readFileSync, writeFileSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

export interface PersistentConfig {
  [key: string]: string;
}

function getConfigDir(): string {
  return process.env.MINA_CONFIG_DIR || join(homedir(), '.minagent');
}

function getConfigPath(): string {
  return join(getConfigDir(), 'config.json');
}

function ensurePrivateDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true, mode: 0o700 });
  }
  try {
    chmodSync(path, 0o700);
  } catch {
    // Best effort on non-POSIX platforms
  }
}

function ensurePrivateFile(path: string): void {
  try {
    chmodSync(path, 0o600);
  } catch {
    // Best effort on non-POSIX platforms
  }
}

export function loadPersistentConfig(): PersistentConfig {
  const path = getConfigPath();
  if (!existsSync(path)) return {};
  try {
    const content = readFileSync(path, 'utf-8');
    return JSON.parse(content) as PersistentConfig;
  } catch {
    return {};
  }
}

export function savePersistentConfig(config: PersistentConfig): void {
  const path = getConfigPath();
  const dir = getConfigDir();
  ensurePrivateDir(dir);
  writeFileSync(path, JSON.stringify(config, null, 2), { encoding: 'utf-8', mode: 0o600 });
  ensurePrivateFile(path);
}

export function setPersistentConfig(key: string, value: string): void {
  const config = loadPersistentConfig();
  config[key] = value;
  savePersistentConfig(config);
}

export function getPersistentConfig(key: string): string | undefined {
  return loadPersistentConfig()[key];
}

/**
 * Apply persistent config to environment variables.
 * Called at startup so persistent settings take effect.
 */
export function applyPersistentConfig(): void {
  const config = loadPersistentConfig();
  for (const [key, value] of Object.entries(config)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}
