// Pure path normalisation for user-typed file paths (quotes, shell-escaped spaces, ~).
import * as os from 'node:os';
import * as path from 'node:path';

/** True when `file` is `folder` itself or lies inside it (both already absolute, with links resolved). */
export const isInsideFolder = (file: string, folder: string): boolean => {
  const relative = path.relative(folder, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

export function normalizePath(typedPath: string): string {
  const cleaned = typedPath.trim().replace(/^["']|["']$/g, '').replace(/\\ /g, ' ');
  return cleaned.startsWith('~') ? path.join(os.homedir(), cleaned.slice(1)) : cleaned;
}
