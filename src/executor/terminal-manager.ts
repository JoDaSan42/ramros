import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceInfo } from '../core/workspace-detector';

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
  
  async buildWorkspace(workspace: WorkspaceInfo, packageName?: string): Promise<vscode.Terminal> {
    let command: string;
    
    if (packageName) {
      command = `colcon build --packages-select ${packageName}`;
    } else {
      command = 'colcon build';
    }
    
    return this.executeInTerminal(command, workspace);
  }
  
  dispose(): void {
    for (const terminal of this.terminals.values()) {
      terminal.dispose();
    }
    this.terminals.clear();
  }
}
