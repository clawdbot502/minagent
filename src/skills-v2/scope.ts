import type { SkillScope, SkillScopeMode } from './types.js';
import { bumpUse } from './telemetry.js';

class SkillScopeManager {
  private scopes = new Map<string, SkillScope>();
  private idCounter = 0;
  private sessionContent = new Map<string, string>();

  enter(skillName: string, mode: SkillScopeMode, content?: string): string {
    const invocationId = `scope-${Date.now()}-${++this.idCounter}`;
    const scope: SkillScope = {
      skillName,
      invocationId,
      mode,
      enteredAt: new Date().toISOString(),
    };
    this.scopes.set(invocationId, scope);
    if (mode === 'session' && content) {
      this.sessionContent.set(skillName, content);
    }
    bumpUse(skillName);
    return invocationId;
  }

  exit(invocationId: string, reason = 'completed'): boolean {
    const scope = this.scopes.get(invocationId);
    if (!scope) return false;
    scope.exitedAt = new Date().toISOString();
    scope.exitReason = reason;
    this.scopes.set(invocationId, scope);
    if (scope.mode === 'session') {
      this.sessionContent.delete(scope.skillName);
    }
    return true;
  }

  activeScopes(): SkillScope[] {
    return Array.from(this.scopes.values()).filter((s) => !s.exitedAt);
  }

  isActive(skillName: string): boolean {
    return this.activeScopes().some((s) => s.skillName === skillName);
  }

  getActiveSkillNames(): string[] {
    return [...new Set(this.activeScopes().map((s) => s.skillName))];
  }

  getSessionContent(): Map<string, string> {
    return new Map(this.sessionContent);
  }

  exitAll(reason = 'cleanup'): void {
    for (const [id, scope] of this.scopes) {
      if (!scope.exitedAt) {
        this.exit(id, reason);
      }
    }
  }

  exitTurnScopes(): void {
    for (const [id, scope] of this.scopes) {
      if (!scope.exitedAt && scope.mode === 'turn') {
        this.exit(id, 'turn_completed');
      }
    }
  }
}

export const skillScopeManager = new SkillScopeManager();
