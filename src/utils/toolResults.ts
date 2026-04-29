import type { ToolCall } from '../types.js';

export function getToolResultsKey(calls: ToolCall[] | undefined): string | null {
  if (!calls || calls.length === 0) {
    return null;
  }

  return calls.map((call) => call.id).join(',');
}
