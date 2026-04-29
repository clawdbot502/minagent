import { describe, expect, test } from 'bun:test';
import { parseApprovalInput, shouldIgnoreSubmit } from './approvalInput.js';

describe('parseApprovalInput', () => {
  test('accepts explicit yes and no responses', () => {
    expect(parseApprovalInput('y')).toBe(true);
    expect(parseApprovalInput('yes')).toBe(true);
    expect(parseApprovalInput('n')).toBe(false);
    expect(parseApprovalInput('no')).toBe(false);
  });

  test('treats unrelated text as an invalid approval response', () => {
    expect(parseApprovalInput('hi')).toBeNull();
    expect(parseApprovalInput('please continue')).toBeNull();
  });

  test('does not ignore submit while an approval prompt is pending', () => {
    expect(shouldIgnoreSubmit({ isProcessing: true, hasPendingApproval: true })).toBe(false);
    expect(shouldIgnoreSubmit({ isProcessing: true, hasPendingApproval: false })).toBe(true);
  });
});
