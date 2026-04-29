import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { describe, expect, test } from 'bun:test';
import { Agent } from '../agent/index.js';
import { defaultTools } from '../tools/index.js';
import { FileWriteTool } from '../tools/FileWriteTool.js';
import { SkillRegistry } from '../skills/registry.js';
import { ContextManager } from './context.js';
import { CostTracker } from './costTracker.js';
import { globalChangeset } from './changeset.js';

function createAgent(): Agent {
  return new Agent(
    {
      llmProvider: 'generic',
      apiKey: 'test-key',
      model: 'test-model',
      globalSkillsDir: '',
      localSkillsDir: '',
      maxToolIterations: 1,
      sandbox: true,
      contextWindow: 128000,
      trustLocalSkills: false,
    },
    defaultTools,
    new SkillRegistry(),
    new ContextManager(),
    new CostTracker('test-model')
  );
}

describe('session changeset commands', () => {
  test('Agent changeset summary includes file tool changes', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'minagent-changeset-test-'));
    const filePath = join(dir, 'created.txt');
    globalChangeset.clear();

    try {
      await FileWriteTool.execute({ file_path: filePath, content: 'hello' });
      const agent = createAgent();

      expect(agent.getChangesetSummary()).toContain(`A  ${filePath}`);
    } finally {
      globalChangeset.clear();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
