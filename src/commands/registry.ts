import type { Command, CommandRegistry, CommandContext } from './types.js';
import {
  gitStatusCommand, gitDiffCommand, gitDiffStagedCommand,
  gitLogCommand, gitCommitCommand, gitBranchCommand,
  gitCheckoutCommand, gitStashCommand, gitPushCommand,
} from './git.js';
import {
  gitResetCommand, gitMergeCommand, gitRebaseCommand,
  gitTagCommand, gitRemoteCommand, gitPullCommand, gitShowCommand,
  gitCherryPickCommand, gitBlameCommand, gitBisectCommand,
  gitStashPopCommand, gitStashListCommand,
} from './git-extended.js';
import {
  clearCommand, skillsCommand, defaultCommand, modelCommand,
  permissionsCommand, costCommand, helpCommand,
} from './system.js';
import { doctorCommand } from './doctor.js';
import { configCommand } from './config.js';
import { mcpCommand } from './mcp.js';
import {
  compactCommand, planCommand, actCommand, resumeCommand,
  tokensCommand, addCommand, dropCommand, contextCommand,
} from './advanced.js';
import {
  ghPrListCommand, ghPrViewCommand, ghPrCreateCommand,
  ghIssueListCommand, ghIssueViewCommand, ghRepoViewCommand,
} from './github.js';
import { undoCommand, redoCommand, historyCommand } from './undo.js';
import { themeCommand } from './theme.js';
import { versionCommand } from './version.js';
import { envCommand } from './env.js';
import { testCommand } from './test.js';
import { changesCommand } from './changes.js';
import { diffCommand } from './diff.js';
import { sessionsCommand } from './sessions.js';
import { formatCommand } from './format.js';

export function createCommandRegistry(): CommandRegistry {
  const registry = new Map<string, Command>();

  const commands: Command[] = [
    gitStatusCommand, gitDiffCommand, gitDiffStagedCommand,
    gitLogCommand, gitCommitCommand, gitBranchCommand,
    gitCheckoutCommand, gitStashCommand, gitPushCommand,
    gitResetCommand, gitMergeCommand, gitRebaseCommand,
    gitTagCommand, gitRemoteCommand, gitPullCommand, gitShowCommand,
    gitCherryPickCommand, gitBlameCommand, gitBisectCommand,
    gitStashPopCommand, gitStashListCommand,
    clearCommand, skillsCommand, defaultCommand, modelCommand,
    permissionsCommand, costCommand, helpCommand,
    doctorCommand, configCommand, mcpCommand,
    compactCommand, planCommand, actCommand, resumeCommand,
    tokensCommand, addCommand, dropCommand, contextCommand,
    ghPrListCommand, ghPrViewCommand, ghPrCreateCommand,
    ghIssueListCommand, ghIssueViewCommand, ghRepoViewCommand,
    undoCommand, redoCommand, historyCommand,
    themeCommand, versionCommand, envCommand,
    testCommand, changesCommand, diffCommand,
    sessionsCommand, formatCommand,
  ];

  for (const cmd of commands) {
    registry.set(cmd.name, cmd);
    if (cmd.aliases) {
      for (const alias of cmd.aliases) {
        registry.set(alias, cmd);
      }
    }
  }

  return registry;
}

export async function executeCommand(
  input: string,
  registry: CommandRegistry,
  ctx: CommandContext
): Promise<string | null> {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) return null;

  const spaceIdx = trimmed.indexOf(' ');
  const name = spaceIdx > 0 ? trimmed.slice(1, spaceIdx) : trimmed.slice(1);
  const args = spaceIdx > 0 ? trimmed.slice(spaceIdx + 1).trim() : '';

  const cmd = registry.get(name);
  if (!cmd) {
    return null;
  }

  return (await cmd.execute(args, ctx)) || '';
}

export * from './types.js';
