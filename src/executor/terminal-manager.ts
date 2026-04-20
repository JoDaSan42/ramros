import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceInfo } from '../core/workspace-detector';

export interface BuildOptions {
  useSymlinkInstall?: boolean;
  cleanFirst?: boolean;
  packageName?: string;
}

export class TerminalManager implements vscode.Disposable {
  private readonly terminals = new Map<string, vscode.Terminal>();
  
  async sourceWorkspace(workspace: WorkspaceInfo): Promise<void> {
    if (!workspace.installPath) {
      void vscode.window.showWarningMessage(
        `Workspace "${workspace.name}" has not been built yet. Please run "colcon build" first.`
      );
      return;
    }
    
    const setupBashPath = path.join(workspace.installPath.fsPath, 'setup.bash');
    
    if (!fs.existsSync(setupBashPath)) {
      void vscode.window.showWarningMessage(
        `Workspace "${workspace.name}" could not be sourced. setup.bash not found.`
      );
      return;
    }
    
    const terminalName = `ROS: ${workspace.name}`;
    
    let terminal = this.terminals.get(workspace.id);
    
    if (terminal) {
      terminal.dispose();
      this.terminals.delete(workspace.id);
    }
    
    terminal = vscode.window.createTerminal({
      name: terminalName
    });
    
    this.terminals.set(workspace.id, terminal);
    terminal.show();
    terminal.sendText(`source "${setupBashPath}"`);
  }
  
  async executeInTerminal(command: string, workspace: WorkspaceInfo): Promise<vscode.Terminal> {
    let terminal = this.terminals.get(workspace.id);
    
    if (!terminal || terminal.exitStatus !== undefined) {
      terminal = vscode.window.createTerminal({
        name: `ROS: ${workspace.name}`
      });
      this.terminals.set(workspace.id, terminal);
      
      if (workspace.installPath) {
        const setupBashPath = path.join(workspace.installPath.fsPath, 'setup.bash');
        if (fs.existsSync(setupBashPath)) {
          terminal.sendText(`source "${setupBashPath}"`);
        }
      }
    }
    
    terminal.show();
    terminal.sendText(command);
    
    return terminal;
  }
  
  async executeInNewTerminal(command: string, workspace: WorkspaceInfo, terminalName?: string): Promise<vscode.Terminal> {
    const name = terminalName || `ROS Run: ${new Date().toLocaleTimeString()}`;
    
    const terminal = vscode.window.createTerminal({
      name
    });
    
    terminal.show();
    
    if (workspace.installPath) {
      const setupBashPath = path.join(workspace.installPath.fsPath, 'setup.bash');
      if (fs.existsSync(setupBashPath)) {
        terminal.sendText(`source "${setupBashPath}" && ${command}`);
      } else {
        terminal.sendText(command);
      }
    } else {
      terminal.sendText(command);
    }
    
    return terminal;
  }
  
  async buildWorkspace(workspace: WorkspaceInfo, options?: BuildOptions | string): Promise<vscode.Terminal> {
    const packageName = typeof options === 'string' ? options : options?.packageName;
    const useSymlinkInstall = typeof options === 'object' ? options?.useSymlinkInstall : false;
    const cleanFirst = typeof options === 'object' ? options?.cleanFirst : false;
    
    const commands: string[] = [];
    
    if (cleanFirst) {
      const workspaceRoot = workspace.rootPath.fsPath;
      commands.push(`rm -rf ${workspaceRoot}/build ${workspaceRoot}/log ${workspaceRoot}/install`);
    }
    
    let buildCommand = 'colcon build';
    
    if (packageName) {
      buildCommand += ` --packages-select ${packageName}`;
    }
    
    if (useSymlinkInstall) {
      buildCommand += ' --symlink-install';
    }
    
    commands.push(buildCommand);
    
    for (const command of commands) {
      await this.executeInTerminal(command, workspace);
    }
    
    return this.terminals.get(workspace.id)!;
  }
  
  dispose(): void {
    for (const terminal of this.terminals.values()) {
      terminal.dispose();
    }
    this.terminals.clear();
  }
}
