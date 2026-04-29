export function parseApprovalInput(input: string): boolean | null {
  const normalized = input.trim().toLowerCase();

  if (normalized === 'y' || normalized === 'yes') {
    return true;
  }

  if (normalized === 'n' || normalized === 'no') {
    return false;
  }

  return null;
}

interface SubmitState {
  isProcessing: boolean;
  hasPendingApproval: boolean;
}

export function shouldIgnoreSubmit({ isProcessing, hasPendingApproval }: SubmitState): boolean {
  return isProcessing && !hasPendingApproval;
}
