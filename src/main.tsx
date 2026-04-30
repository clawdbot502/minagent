#!/usr/bin/env bun
import React from 'react';
import { render } from 'ink';
import { loadConfig, validateConfig } from './config.js';
import { defaultTools } from './tools/index.js';
import { SkillRegistry } from './skills/registry.js';
import { loadSkillsFromDir, type SkillLoadResult } from './skills/loader.js';
import { App } from './components/App.js';
import { applyPersistentConfig } from './utils/configStore.js';
import { existsSync } from 'fs';
import { runCurator } from './skills-v2/curator.js';

function reportSkillLoadIssues(label: string, result: SkillLoadResult): void {
  for (const duplicate of result.duplicates) {
    console.warn(`Warning: ${label} skill "${duplicate.name}" replaced an earlier skill (${duplicate.file}).`);
  }
  for (const error of result.errors) {
    console.warn(`Warning: could not load ${label} skill ${error.file}: ${error.message}`);
  }
}

async function main() {
  // Apply persistent config before loading so env vars are set
  applyPersistentConfig();
  const config = loadConfig();

  try {
    validateConfig(config);
  } catch (err: any) {
    console.error(err.message);
    process.exit(1);
  }

  const skills = new SkillRegistry();
  const globalResult = await loadSkillsFromDir(config.globalSkillsDir, skills);
  const localResult = config.trustLocalSkills
    ? await loadSkillsFromDir(config.localSkillsDir, skills)
    : { loaded: 0, errors: [], duplicates: [] };

  console.log('Starting MinAgent...');
  console.log(`Provider: ${config.llmProvider}, Model: ${config.model}`);
  reportSkillLoadIssues('global', globalResult);
  reportSkillLoadIssues('local', localResult);
  if (!config.trustLocalSkills && existsSync(config.localSkillsDir)) {
    console.warn('Local skills were not loaded. Set MINA_TRUST_LOCAL_SKILLS=true to trust and load ./skills.');
  }
  const totalSkills = globalResult.loaded + localResult.loaded;
  if (totalSkills > 0) {
    console.log(`Loaded ${totalSkills} skills.`);
  }
  // Background curator: run on startup if interval elapsed
  try {
    const curatorResult = runCurator();
    if (curatorResult.reviewed > 0) {
      console.log(`[Curator] Reviewed ${curatorResult.reviewed} skills, transitioned ${curatorResult.transitioned} to stale, archived ${curatorResult.archived}.`);
    }
  } catch {
    // ignore curator errors on startup
  }

  console.log('Type your message, or /help for commands');
  console.log('---');

  render(
    React.createElement(App, {
      config,
      tools: defaultTools,
      skills,
    })
  );
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
