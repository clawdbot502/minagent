import { z } from 'zod';
import type { Tool } from './types.js';

// Store active timers and their cleanup functions
const activeTasks = new Map<string, () => void>();

export const ScheduleToolSchema = z.object({
  action: z.enum(['start', 'stop', 'list']).describe('Action to perform'),
  taskId: z.string().optional().describe('Task ID (required for stop)'),
  intervalSeconds: z.number()
    .min(1)
    .max(86400)
    .optional()
    .describe('Interval in seconds for recurring tasks (1-86400, required for start)'),
  command: z.string().optional().describe('Command to execute (required for start)'),
  maxRuns: z.number().min(1).optional().describe('Maximum number of runs (optional, runs indefinitely if not specified)'),
});

export const ScheduleTool: Tool<typeof ScheduleToolSchema> = {
  name: 'ScheduleTool',
  description: '[DESTRUCTIVE] Schedule and manage timed tasks. Can start recurring tasks that run commands at intervals, stop running tasks, and list active tasks.',
  schema: ScheduleToolSchema,
  async execute(args) {
    const { action } = args;

    if (action === 'list') {
      if (activeTasks.size === 0) {
        return 'No active scheduled tasks.';
      }
      const tasksList = Array.from(activeTasks.keys())
        .map(id => `  - ID: ${id}`)
        .join('\n');
      return `Active scheduled tasks:\n${tasksList}`;
    }

    if (action === 'stop') {
      if (!args.taskId) {
        return 'Error: taskId is required for stop action.';
      }
      const cleanup = activeTasks.get(args.taskId);
      if (!cleanup) {
        return `Error: Task ID "${args.taskId}" not found.`;
      }
      cleanup();
      return `Task "${args.taskId}" stopped.`;
    }

    if (action === 'start') {
      if (!args.intervalSeconds || !args.command) {
        return 'Error: intervalSeconds and command are required for start action.';
      }

      const taskId = `task-${Date.now()}`;
      const intervalMs = args.intervalSeconds * 1000;
      let runCount = 0;
      let isStopped = false;
      let nextTimeoutId: ReturnType<typeof setTimeout> | null = null;

      const cleanup = () => {
        isStopped = true;
        if (nextTimeoutId) {
          clearTimeout(nextTimeoutId);
          nextTimeoutId = null;
        }
        activeTasks.delete(taskId);
      };

      const runTask = async () => {
        if (isStopped) return;

        try {
          const { spawn } = await import('child_process');
          const child = spawn(args.command!, {
            shell: true,
            timeout: 60000,
            env: process.env,
            cwd: process.cwd(),
          });

          const exitCode = await new Promise<number>((resolve, reject) => {
            child.on('error', reject);
            child.on('close', (code) => resolve(code ?? 0));
          });

          runCount++;
          console.log(`[Schedule] Task ${taskId} run #${runCount} completed. Exit code: ${exitCode}`);

          if (args.maxRuns && runCount >= args.maxRuns) {
            console.log(`[Schedule] Task ${taskId} reached max runs (${args.maxRuns}). Stopping.`);
            cleanup();
          }
        } catch (error) {
          console.error(`[Schedule] Task ${taskId} error:`, error);
          cleanup();
        }
      };

      const scheduleNext = () => {
        if (isStopped) return;
        nextTimeoutId = setTimeout(async () => {
          await runTask();
          if (!isStopped) {
            scheduleNext();
          }
        }, intervalMs);
      };

      // Register cleanup immediately so stop works even during first run
      activeTasks.set(taskId, cleanup);

      // Run immediately, then schedule subsequent runs after each completion
      runTask().then(() => {
        if (!isStopped) {
          scheduleNext();
        }
      });

      return `Task "${taskId}" started. Will execute "${args.command}" every ${args.intervalSeconds}s${args.maxRuns ? ` (max ${args.maxRuns} runs)` : ''}.\nUse taskId "${taskId}" to stop it with action=stop.`;
    }

    return 'Error: Unknown action.';
  },
};
