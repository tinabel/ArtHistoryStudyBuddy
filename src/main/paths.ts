// Pure path normalisation for user-typed file paths (quotes, shell-escaped spaces, ~).
import * as os from 'node:os';
import * as path from 'node:path';

export function normalizePath(typedPath: string): string {
  const cleaned = typedPath.trim().replace(/^["']|["']$/g, '').replace(/\\ /g, ' ');
  return cleaned.startsWith('~') ? path.join(os.homedir(), cleaned.slice(1)) : cleaned;
}
