export interface FileChange {
  filePath: string;
  action: 'created' | 'modified' | 'deleted';
  originalContent: string | null;
  newContent: string | null;
  timestamp: string;
}

/**
 * Tracks all file modifications across a session.
 * This enables session-level undo, audit logs, and PR generation.
 */
export class ChangesetTracker {
  private changes: FileChange[] = [];

  record(change: FileChange): void {
    // If the file was modified before, merge with the original
    const existing = this.changes.find(
      (c) => c.filePath === change.filePath && c.action !== 'deleted'
    );
    if (existing && change.action === 'modified') {
      existing.newContent = change.newContent;
      existing.timestamp = change.timestamp;
      return;
    }
    this.changes.push(change);
  }

  list(): FileChange[] {
    return [...this.changes];
  }

  getModifiedFiles(): string[] {
    return this.changes
      .filter((c) => c.action === 'modified' || c.action === 'created')
      .map((c) => c.filePath);
  }

  getGitStyleDiff(): string {
    const lines: string[] = [];
    for (const change of this.changes) {
      if (change.action === 'created') {
        lines.push(`A  ${change.filePath}`);
      } else if (change.action === 'modified') {
        lines.push(`M  ${change.filePath}`);
      } else if (change.action === 'deleted') {
        lines.push(`D  ${change.filePath}`);
      }
    }
    return lines.join('\n') || '(no changes yet)';
  }

  getDetailedDiff(): string {
    const lines: string[] = [];
    for (const change of this.changes) {
      lines.push(`\n=== ${change.filePath} (${change.action}) ===`);
      if (change.originalContent !== null && change.newContent !== null) {
        const oldLines = change.originalContent.split('\n');
        const newLines = change.newContent.split('\n');
        let i = 0, j = 0;
        while (i < oldLines.length || j < newLines.length) {
          if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
            i++; j++; continue;
          }
          let found = false;
          for (let lookAhead = 1; lookAhead <= 3 && !found; lookAhead++) {
            if (i + lookAhead < oldLines.length && j < newLines.length && oldLines[i + lookAhead] === newLines[j]) {
              for (let k = 0; k < lookAhead; k++) lines.push(`- ${oldLines[i + k]}`);
              i += lookAhead; found = true;
            } else if (i < oldLines.length && j + lookAhead < newLines.length && oldLines[i] === newLines[j + lookAhead]) {
              for (let k = 0; k < lookAhead; k++) lines.push(`+ ${newLines[j + k]}`);
              j += lookAhead; found = true;
            }
          }
          if (!found) {
            if (i < oldLines.length) { lines.push(`- ${oldLines[i]}`); i++; }
            else if (j < newLines.length) { lines.push(`+ ${newLines[j]}`); j++; }
          }
        }
      } else if (change.newContent !== null) {
        lines.push(change.newContent.slice(0, 2000));
      }
    }
    return lines.join('\n') || '(no changes yet)';
  }

  clear(): void {
    this.changes = [];
  }
}

export const globalChangeset = new ChangesetTracker();
