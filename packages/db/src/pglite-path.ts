import fs from "node:fs";
import path from "node:path";

/**
 * Resolves a relative PGlite data path against the workspace root (the
 * directory containing pnpm-workspace.yaml), so every package and the web
 * app share the same embedded database file.
 */
export function resolvePglitePath(p: string): string {
  if (p === "memory") return p;
  const resolved = path.isAbsolute(p) ? p : path.join(findWorkspaceRoot(), p);
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function findWorkspaceRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}
