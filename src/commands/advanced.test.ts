import { describe, expect, test } from 'bun:test';
import { actCommand, planCommand } from './advanced.js';

function createCommandContext() {
  let mode = 'default';

  return {
    agent: {
      setPermissionMode(nextMode: typeof mode) {
        mode = nextMode;
      },
      getPermissionMode() {
        return mode;
      },
    },
    tools: {},
    skills: {},
    cwd: process.cwd(),
  } as any;
}

describe('permission mode commands', () => {
  test('/plan updates the active agent permission mode', async () => {
    const ctx = createCommandContext();

    await planCommand.execute('', ctx);

    expect(ctx.agent.getPermissionMode()).toBe('plan');
  });

  test('/act updates the active agent permission mode', async () => {
    const ctx = createCommandContext();
    await planCommand.execute('', ctx);

    await actCommand.execute('', ctx);

    expect(ctx.agent.getPermissionMode()).toBe('default');
  });
});
