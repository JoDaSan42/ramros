import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { WorkspaceInfo } from './workspace-detector';

/**
 * Finds bag files that live inside one of the given ROS2 workspaces by
 * searching the VSCode workspace and keeping only matches under a
 * workspace root.
 */
export async function getWorkspaceBagPaths(workspaces: WorkspaceInfo[]): Promise<string[]> {
  const uris = await vscode.workspace.findFiles('**/*.{db3,mcap}', '**/{node_modules,build,install,log}/**');
  return uris.map(u => u.fsPath).filter(p => workspaces.some(w => p.startsWith(w.rootPath.fsPath)));
}

/**
 * Lists bag files (top level only, no recursion) in the given folder as
 * sorted absolute paths. Returns [] when the folder is missing or
 * unreadable.
 */
export function scanBagFolder(folderPath: string): string[] {
  try {
    const entries = fs.readdirSync(folderPath, { withFileTypes: true });
    return entries
      .filter(e => e.isFile() && (e.name.endsWith('.db3') || e.name.endsWith('.mcap')))
      .map(e => path.resolve(folderPath, e.name))
      .sort();
  } catch {
    return [];
  }
}
