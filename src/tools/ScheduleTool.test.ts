import { describe, it, expect, beforeEach, afterEach } from 'bun:test';
import { ScheduleTool } from './ScheduleTool.js';

describe('ScheduleTool', () => {
  let taskIds: string[] = [];

  beforeEach(async () => {
    // Clear any existing tasks from previous tests
    const listResult = await ScheduleTool.execute({ action: 'list' });
    if (listResult.includes('Active scheduled tasks:')) {
      // This is a simplified cleanup - in real use, we'd track task IDs better
    }
  });

  afterEach(async () => {
    // Clean up any remaining tasks
    for (const taskId of taskIds) {
      try {
        await ScheduleTool.execute({ action: 'stop', taskId });
      } catch {
        // Ignore cleanup errors
      }
    }
    taskIds = [];
  });

  it('should list active tasks (empty)', async () => {
    const result = await ScheduleTool.execute({ action: 'list' });
    expect(result).toContain('No active scheduled tasks');
  });

  it('should start a new task', async () => {
    const result = await ScheduleTool.execute({
      action: 'start',
      intervalSeconds: 5,
      command: 'echo "test"',
    });
    expect(result).toContain('Task');
    expect(result).toContain('started');
    expect(result).toContain('every 5s');
    
    // Extract task ID for cleanup
    const match = result.match(/(task-\d+)/);
    if (match) {
      taskIds.push(match[1]);
    }
  });

  it('should start a task with maxRuns', async () => {
    const result = await ScheduleTool.execute({
      action: 'start',
      intervalSeconds: 1,
      command: 'echo "limited"',
      maxRuns: 2,
    });
    expect(result).toContain('max 2 runs');
    
    // Extract task ID for cleanup (though it will auto-stop)
    const match = result.match(/(task-\d+)/);
    if (match) {
      taskIds.push(match[1]);
    }
  });

  it('should list active tasks after starting one', async () => {
    const startResult = await ScheduleTool.execute({
      action: 'start',
      intervalSeconds: 10,
      command: 'echo "test"',
    });
    
    const match = startResult.match(/(task-\d+)/);
    expect(match).toBeTruthy();
    
    const taskId = match![1];
    taskIds.push(taskId);

    const listResult = await ScheduleTool.execute({ action: 'list' });
    expect(listResult).toContain('Active scheduled tasks:');
    expect(listResult).toContain(taskId);
  });

  it('should stop a task', async () => {
    const startResult = await ScheduleTool.execute({
      action: 'start',
      intervalSeconds: 10,
      command: 'echo "test"',
    });
    
    const match = startResult.match(/(task-\d+)/);
    expect(match).toBeTruthy();
    
    const taskId = match![1];

    const stopResult = await ScheduleTool.execute({ action: 'stop', taskId });
    expect(stopResult).toContain('stopped');

    const listResult = await ScheduleTool.execute({ action: 'list' });
    expect(listResult).not.toContain(taskId);
  });

  it('should require intervalSeconds for start action', async () => {
    const result = await ScheduleTool.execute({
      action: 'start',
      command: 'echo "test"',
    });
    expect(result).toContain('Error');
    expect(result).toContain('intervalSeconds');
  });

  it('should require command for start action', async () => {
    const result = await ScheduleTool.execute({
      action: 'start',
      intervalSeconds: 5,
    });
    expect(result).toContain('Error');
    expect(result).toContain('command');
  });

  it('should require taskId for stop action', async () => {
    const result = await ScheduleTool.execute({ action: 'stop' });
    expect(result).toContain('Error');
    expect(result).toContain('taskId');
  });

  it('should handle invalid task ID for stop', async () => {
    const result = await ScheduleTool.execute({ action: 'stop', taskId: 'non-existent-task' });
    expect(result).toContain('Error');
    expect(result).toContain('not found');
  });
});
