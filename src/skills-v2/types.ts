/**
 * Skill system v2 types — progressive disclosure, scoped invocation,
 * lifecycle management, and background curation.
 */

export interface SkillMetadata {
  name: string;
  description: string;
  version?: string;
  platforms?: string[];
  tags?: string[];
  category?: string;
}

export interface Skill {
  metadata: SkillMetadata;
  content: string;
  dir: string;
  linkedFiles: string[];
}

export interface SkillIndexEntry {
  name: string;
  description: string;
  category?: string;
}

export interface SkillLoadResult {
  success: boolean;
  name: string;
  description: string;
  content: string;
  skillDir: string;
  linkedFiles: string[];
  setupNeeded?: boolean;
  setupNote?: string;
}

export type SkillAction =
  | 'create'
  | 'patch'
  | 'edit'
  | 'delete'
  | 'write_file'
  | 'remove_file';

export type SkillScopeMode = 'turn' | 'session';

export interface SkillScope {
  skillName: string;
  invocationId: string;
  mode: SkillScopeMode;
  enteredAt: string;
  exitedAt?: string;
  exitReason?: string;
}

export interface UsageRecord {
  useCount: number;
  viewCount: number;
  patchCount: number;
  lastUsedAt: string | null;
  lastViewedAt: string | null;
  lastPatchedAt: string | null;
  createdAt: string;
  state: 'active' | 'stale' | 'archived';
  pinned: boolean;
  archivedAt: string | null;
}

export interface CuratorState {
  lastRunAt: string | null;
  lastRunDurationSeconds: number | null;
  lastRunSummary: string | null;
  paused: boolean;
  runCount: number;
}

export interface CuratorConfig {
  enabled: boolean;
  intervalHours: number;
  minIdleHours: number;
  staleAfterDays: number;
  archiveAfterDays: number;
}

export interface SkillManageArgs {
  action: SkillAction;
  name: string;
  content?: string;
  category?: string;
  filePath?: string;
  fileContent?: string;
  oldString?: string;
  newString?: string;
  replaceAll?: boolean;
}

export interface SkillViewArgs {
  name: string;
  filePath?: string;
}

export interface SkillsListArgs {
  category?: string;
}

export const VALID_SKILL_NAME_RE = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const MAX_SKILL_NAME_LEN = 64;
export const MAX_DESCRIPTION_LEN = 1024;
export const MAX_CONTENT_LEN = 100_000;
export const MAX_SUPPORTING_FILE_SIZE = 1_048_576; // 1 MiB
export const ALLOWED_SUPPORTING_DIRS = new Set([
  'references',
  'templates',
  'scripts',
  'assets',
]);
