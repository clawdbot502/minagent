import type { Message, ToolCall, ToolResult } from '../types.js';
import type { Config } from '../config.js';
import type { PermissionMode } from '../utils/permissions.js';
import type { ToolRegistry } from '../tools/types.js';
import type { SkillRegistry } from '../skills/registry.js';
import type { ContextManager } from '../utils/context.js';
import type { CostTracker } from '../utils/costTracker.js';
import { createLLMClient } from './llm.js';
import { executeToolCalls } from './toolExecutor.js';
import { shouldAskPermission } from '../utils/permissions.js';
import { DESTRUCTIVE_TOOLS } from '../tools/index.js';
import { recordMessage } from '../state/session.js';
import { shouldCompact, compactMessages, estimateTokens } from '../utils/compaction.js';
import { classifyLLMError } from '../utils/llmErrors.js';
import { ChangesetTracker } from '../utils/changeset.js';
import { readFileSync } from 'fs';
import { spawnSync } from 'child_process';

export interface AgentCallbacks {
  onStreamChunk: (text: string) => void;
  onReasoning?: (text: string) => void;
  onToolCalls: (calls: ToolCall[]) => void;
  onToolResults: (results: ToolResult[]) => void;
  onPermissionRequest: (toolName: string, args: Record<string, unknown>) => Promise<boolean>;
  onPlanRequest?: (calls: ToolCall[]) => Promise<boolean>;
  onUserQuestion?: (question: string, options?: string[]) => Promise<string>;
  onComplete: () => void;
  onError: (err: string) => void;
  onCompaction?: (summary: string) => void;
}

export class Agent {
  private messages: Message[] = [];
  private config: Config;
  private tools: ToolRegistry;
  private skills: SkillRegistry;
  private contextManager: ContextManager;
  private costTracker: CostTracker;
  private llm: ReturnType<typeof createLLMClient>;
  private activeSkill: string | null = null;
  private permissionMode: PermissionMode;
  private changeset: ChangesetTracker;

  constructor(
    config: Config,
    tools: ToolRegistry,
    skills: SkillRegistry,
    contextManager: ContextManager,
    costTracker: CostTracker
  ) {
    this.config = config;
    this.tools = tools;
    this.skills = skills;
    this.contextManager = contextManager;
    this.costTracker = costTracker;
    this.llm = createLLMClient(config);
    this.permissionMode = (process.env.MINA_PERMISSION_MODE as PermissionMode) || 'default';
    this.changeset = new ChangesetTracker();
  }

  getMessages(): Message[] {
    return this.messages;
  }

  setMessages(messages: Message[]): void {
    this.messages = messages;
  }

  setActiveSkill(skillName: string | null): void {
    this.activeSkill = skillName;
  }

  getActiveSkill(): string | null {
    return this.activeSkill;
  }

  setPermissionMode(mode: PermissionMode): void {
    this.permissionMode = mode;
    process.env.MINA_PERMISSION_MODE = mode;
  }

  getPermissionMode(): PermissionMode {
    return this.permissionMode;
  }

  getContextFilePaths(): string[] {
    return this.contextManager.list().map((f) => f.path);
  }

  getCostSummary(): string {
    return this.costTracker.getSummary();
  }

  addContextFile(filePath: string): string {
    try {
      const resolved = require('path').resolve(process.cwd(), filePath);
      const content = readFileSync(resolved, 'utf-8');
      this.contextManager.add({ path: filePath, content });
      return `Added ${filePath} to context (${content.length} chars)`;
    } catch (err: any) {
      return `Error: could not read ${filePath} — ${err.message}`;
    }
  }

  removeContextFile(filePath: string): string {
    const removed = this.contextManager.remove(filePath);
    return removed ? `Removed ${filePath} from context.` : `${filePath} was not in context.`;
  }

  listContextFiles(): string {
    const files = this.contextManager.list();
    if (files.length === 0) return 'No files in context. Use /add <filepath> to add files.';
    return files.map((f) => `  ${f.path} (${f.content.length} chars)`).join('\n');
  }

  private buildSystemPrompt(): string {
    let systemPrompt = `You are MinAgent, a highly capable AI coding assistant with access to tools. You help users write, edit, debug, and understand code.

## Tool Usage Guidelines

**Exploration (always do this first):**
- Use GrepTool to search for symbols, functions, or patterns across the codebase
- Use FileReadTool to read specific files. It returns line numbers — use them for precise edits
- Use TreeTool to understand directory structure
- Use GlobTool to find files matching a pattern
- Use LsTool to list directory contents

**Making changes:**
- Use FileEditTool for precise replacements in existing files. The old_string must be EXACT and UNIQUE in the file
- Use FileWriteTool for creating new files or complete rewrites
- When making multiple edits to the same file, prefer multiple FileEditTool calls in one batch
- After edits, verify by reading the changed sections back with FileReadTool
- Run tests with BashTool after making changes: run the test command appropriate for the project

**Other tools:**
- Use BashTool for git operations, running commands, builds, and tests
- Use WebFetchTool to read documentation from URLs
- Use AgentTool for parallel or independent sub-tasks
- Use AskUserTool when you need clarification from the user

**Important rules:**
- Always check if a file exists before writing to it (use FileReadTool or LsTool)
- Prefer reading files before editing them
- Do not make assumptions about code — read it first
- When the user mentions @filename, the file is automatically added to context
- Use /plan mode when making risky changes; the user will approve all tools at once
- Report what you changed and why, concisely

Current working directory: ${process.cwd()}
Shell: ${process.env.SHELL || 'unknown'}
Platform: ${process.platform}
Node/Bun version: ${process.version}`;

    if (this.activeSkill) {
      const skillPrompt = this.skills.getSystemPrompt(this.activeSkill);
      if (skillPrompt) {
        systemPrompt = skillPrompt + `\n\nCurrent working directory: ${process.cwd()}`;
      }
    }

    // Inject context files into system prompt
    const contextPrompt = this.contextManager.getContextPrompt();
    if (contextPrompt) {
      systemPrompt += '\n' + contextPrompt;
    }

    // Inject workspace summary for context-aware assistance
    const workspaceSummary = this.buildWorkspaceSummary();
    if (workspaceSummary) {
      systemPrompt += '\n\n' + workspaceSummary;
    }

    // Inject git status for code-aware assistance
    const gitStatus = spawnSync('git', ['status', '--short'], { cwd: process.cwd(), encoding: 'utf-8' });
    if (gitStatus.status === 0 && gitStatus.stdout.trim()) {
      systemPrompt += `\n\nCurrent git status:\n${gitStatus.stdout.trim()}`;
    }

    const gitLog = spawnSync('git', ['log', '--oneline', '-3'], { cwd: process.cwd(), encoding: 'utf-8' });
    if (gitLog.status === 0 && gitLog.stdout.trim()) {
      systemPrompt += `\n\nRecent commits:\n${gitLog.stdout.trim()}`;
    }

    return systemPrompt;
  }

  private buildWorkspaceSummary(): string {
    const lines: string[] = [];
    const cwd = process.cwd();

    // Detect project type and read key config files
    const configFiles: { file: string; label: string }[] = [
      { file: 'package.json', label: 'Node.js' },
      { file: 'Cargo.toml', label: 'Rust' },
      { file: 'go.mod', label: 'Go' },
      { file: 'pyproject.toml', label: 'Python' },
      { file: 'setup.py', label: 'Python' },
      { file: 'requirements.txt', label: 'Python' },
      { file: 'Gemfile', label: 'Ruby' },
      { file: 'pom.xml', label: 'Java (Maven)' },
      { file: 'build.gradle', label: 'Java (Gradle)' },
      { file: 'CMakeLists.txt', label: 'C/C++' },
      { file: 'Dockerfile', label: 'Docker' },
      { file: 'docker-compose.yml', label: 'Docker Compose' },
      { file: 'tsconfig.json', label: 'TypeScript' },
    ];

    let projectType = '';
    for (const { file, label } of configFiles) {
      try {
        const content = readFileSync(require('path').join(cwd, file), 'utf-8');
        if (!projectType) projectType = label;
        // Only include essential info to save tokens
        if (file === 'package.json') {
          const pkg = JSON.parse(content);
          lines.push(`Project: ${pkg.name || 'unknown'} (${pkg.description || 'no description'})`);
          if (pkg.scripts) {
            const scripts = Object.keys(pkg.scripts).slice(0, 8).join(', ');
            lines.push(`Scripts: ${scripts}`);
          }
          // Detect test framework
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };
          const testFrameworks = Object.keys(deps).filter((d) =>
            ['jest', 'vitest', 'mocha', 'jasmine', 'ava', 'tap', 'playwright', 'cypress'].includes(d)
          );
          if (testFrameworks.length > 0) {
            lines.push(`Test framework: ${testFrameworks.join(', ')}`);
          }
        } else if (file === 'Cargo.toml') {
          const nameMatch = content.match(/^name\s*=\s*"([^"]+)"/m);
          lines.push(`Project: ${nameMatch?.[1] || 'Rust project'}`);
          lines.push('Test command: cargo test');
        } else if (file === 'go.mod') {
          const moduleMatch = content.match(/^module\s+(\S+)/m);
          lines.push(`Project: ${moduleMatch?.[1] || 'Go project'}`);
          lines.push('Test command: go test ./...');
        } else if (file === 'pyproject.toml') {
          lines.push('Python project');
          if (content.includes('pytest')) lines.push('Test command: pytest');
          else if (content.includes('unittest')) lines.push('Test command: python -m unittest');
        }
      } catch {
        // File doesn't exist
      }
    }

    if (!projectType) {
      // Try to infer from file extensions
      const ls = spawnSync('ls', ['-1'], { cwd, encoding: 'utf-8' });
      if (ls.status === 0) {
        const files = ls.stdout.split('\n').filter(Boolean).slice(0, 20);
        lines.push(`Workspace files: ${files.join(', ')}`);
      }
    }

    // README summary
    try {
      const readme = readFileSync(require('path').join(cwd, 'README.md'), 'utf-8');
      const firstSection = readme.split('\n## ')[0]?.slice(0, 800);
      if (firstSection) {
        lines.push(`README excerpt:\n${firstSection}`);
      }
    } catch {
      // No README
    }

    if (lines.length === 0) return '';
    return 'Workspace summary:\n' + lines.join('\n');
  }

  async sendMessage(content: string, callbacks: AgentCallbacks): Promise<void> {
    // Parse @mentions and auto-add files to context
    const { cleanedContent, addedFiles } = this.parseMentions(content);
    if (addedFiles.length > 0) {
      callbacks.onStreamChunk(`[Auto-added to context: ${addedFiles.join(', ')}]\n`);
    }

    this.messages.push({ role: 'user', content: cleanedContent });
    recordMessage({ role: 'user', content: cleanedContent });

    // Refresh context files that changed externally
    const refreshed = this.contextManager.refreshChangedFiles();
    if (refreshed.length > 0) {
      callbacks.onStreamChunk(`[Context files refreshed: ${refreshed.join(', ')}]\n`);
    }

    const systemPrompt = this.buildSystemPrompt();

    const MAX_RETRIES = 3;
    let attempt = 0;
    let lastError: any;

    while (attempt <= MAX_RETRIES) {
      try {
        await this.runLoop(systemPrompt, callbacks);
        return;
      } catch (err: any) {
        lastError = err;
        const classified = classifyLLMError(err);
        attempt++;

        if (!classified.retryable || attempt > MAX_RETRIES) {
          callbacks.onError(classified.userMessage);
          return;
        }

        // Auto-compact on context length errors
        if (classified.type === 'context_length') {
          const oldLength = this.messages.length;
          this.messages = compactMessages(this.messages);
          callbacks.onStreamChunk(`\n[${classified.userMessage} ${oldLength} → ${this.messages.length} messages]\n`);
        } else {
          callbacks.onStreamChunk(`\n[${classified.userMessage} Retrying in ${classified.suggestedWaitMs}ms... (${attempt}/${MAX_RETRIES})]\n`);
        }

        await new Promise((r) => setTimeout(r, classified.suggestedWaitMs));
      }
    }

    callbacks.onError(lastError?.message || String(lastError));
  }

  private parseMentions(content: string): { cleanedContent: string; addedFiles: string[] } {
    const mentionRegex = /@([a-zA-Z0-9_\-./~]+)/g;
    const addedFiles: string[] = [];
    const cleanedContent = content.replace(mentionRegex, (match, filePath) => {
      try {
        const resolved = require('path').resolve(process.cwd(), filePath);
        const fileContent = readFileSync(resolved, 'utf-8');
        this.contextManager.add({ path: filePath, content: fileContent });
        addedFiles.push(filePath);
        return match; // keep the mention in the message
      } catch {
        return match; // file not found, leave as-is
      }
    });
    return { cleanedContent, addedFiles };
  }

  private async runLoop(systemPrompt: string, callbacks: AgentCallbacks): Promise<void> {
    let iteration = 0;

    while (iteration < this.config.maxToolIterations) {
      iteration++;

      const stream = this.llm.stream(this.messages, this.tools, systemPrompt);
      let assistantContent = '';
      let assistantToolCalls: ToolCall[] | undefined;

      for await (const chunk of stream) {
        if (chunk.content) {
          assistantContent += chunk.content;
          callbacks.onStreamChunk(chunk.content);
        }
        if (chunk.reasoning) {
          callbacks.onReasoning?.(chunk.reasoning);
        }
        if (chunk.toolCalls) {
          assistantToolCalls = chunk.toolCalls;
        }
        if (chunk.done) {
          callbacks.onComplete();
        }
      }

      const assistantMsg: Message = {
        role: 'assistant',
        content: assistantContent,
        toolCalls: assistantToolCalls,
      };

      // Estimate and record token usage
      const inputTokens = estimateTokens(this.messages) + Math.ceil((systemPrompt?.length || 0) / 4);
      const outputTokens = estimateTokens([assistantMsg]);
      this.costTracker.recordUsage(inputTokens, outputTokens);

      this.messages.push(assistantMsg);
      recordMessage(assistantMsg);

      if (!assistantToolCalls || assistantToolCalls.length === 0) {
        break;
      }

      callbacks.onToolCalls(assistantToolCalls);

      // Interactive user questions are handled by the host UI instead of
      // returning a placeholder string and letting the model continue.
      const interactiveResults: ToolResult[] = [];
      const remainingToolCalls: ToolCall[] = [];

      for (const tc of assistantToolCalls) {
        if (tc.name === 'AskUserTool' && callbacks.onUserQuestion) {
          const question = typeof tc.arguments.question === 'string'
            ? tc.arguments.question
            : 'The agent needs your input.';
          const options = Array.isArray(tc.arguments.options)
            ? tc.arguments.options.filter((option): option is string => typeof option === 'string')
            : undefined;
          const answer = await callbacks.onUserQuestion(question, options);
          interactiveResults.push({
            toolCallId: tc.id,
            name: tc.name,
            output: answer,
            error: false,
          });
        } else {
          remainingToolCalls.push(tc);
        }
      }

      // Permission checks
      const approvedCalls: ToolCall[] = [];
      const deniedCalls: ToolCall[] = [];

      if (this.permissionMode === 'plan' && remainingToolCalls.length > 0 && callbacks.onPlanRequest) {
        // Plan mode: ask for entire batch at once
        const planApproved = await callbacks.onPlanRequest(remainingToolCalls);
        if (planApproved) {
          approvedCalls.push(...remainingToolCalls);
        } else {
          deniedCalls.push(...remainingToolCalls);
        }
      } else {
        for (const tc of remainingToolCalls) {
          const isDestructive = DESTRUCTIVE_TOOLS.has(tc.name);
          if (shouldAskPermission(tc.name, { mode: this.permissionMode as any, rules: [] }, isDestructive)) {
            const approved = await callbacks.onPermissionRequest(tc.name, tc.arguments);
            if (approved) {
              approvedCalls.push(tc);
            } else {
              deniedCalls.push(tc);
            }
          } else {
            approvedCalls.push(tc);
          }
        }
      }

      // Execute approved tools
      let results: ToolResult[] = [...interactiveResults];
      if (approvedCalls.length > 0) {
        results.push(...await executeToolCalls(approvedCalls, this.tools));
      }

      // Add denied results
      for (const tc of deniedCalls) {
        results.push({
          toolCallId: tc.id,
          name: tc.name,
          output: 'Permission denied by user.',
          error: true,
        });
      }

      callbacks.onToolResults(results);

      for (const result of results) {
        const msg: Message = {
          role: 'tool',
          content: result.output,
          toolCallId: result.toolCallId,
        };
        this.messages.push(msg);
        recordMessage(msg);
      }

      // Auto-compaction when context grows too large
      if (shouldCompact(this.messages, this.config)) {
        const oldLength = this.messages.length;
        this.messages = compactMessages(this.messages);
        const notice = `[Context compacted: ${oldLength} messages → ${this.messages.length} messages]`;
        callbacks.onCompaction?.(notice);
      }
    }
  }

  getChangesetSummary(): string {
    return this.changeset.getGitStyleDiff();
  }

  getChangesetDiff(): string {
    return this.changeset.getDetailedDiff();
  }

  recordChange(filePath: string, action: 'created' | 'modified' | 'deleted', originalContent: string | null, newContent: string | null): void {
    this.changeset.record({
      filePath,
      action,
      originalContent,
      newContent,
      timestamp: new Date().toISOString(),
    });
  }

  clear(): void {
    this.messages = [];
    this.activeSkill = null;
    this.changeset.clear();
  }
}
