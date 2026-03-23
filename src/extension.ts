import * as vscode from 'vscode';
import { RosEnvironmentService } from './core/ros-environment';
import { WorkspaceDetector } from './core/workspace-detector';
import { DuplicatePackageDetector } from './core/duplicate-package-detector';
import { CacheManager } from './cache/cache-manager';
import { RamrosTreeProvider } from './treeview/tree-provider';
import { TerminalManager } from './executor/terminal-manager';

let cacheManager: CacheManager;
let terminalManager: TerminalManager;
let treeProvider: RamrosTreeProvider;

export async function activate(context: vscode.ExtensionContext) {
  console.log('RAMROS Extension activated');
  
  const rosEnvironmentService = new RosEnvironmentService();
  
  cacheManager = new CacheManager((message) => {
    console.log(`[Cache] ${message}`);
  });
  
  const workspaceDetector = new WorkspaceDetector(
    () => rosEnvironmentService.detectInstallations()
  );
  
  const duplicateDetector = new DuplicatePackageDetector();
  
  terminalManager = new TerminalManager();
  
  treeProvider = new RamrosTreeProvider(workspaceDetector, duplicateDetector);
  
  const treeView = vscode.window.createTreeView('ramrosExplorer', {
    treeDataProvider: treeProvider,
    showCollapseAll: true
  });
  
  context.subscriptions.push(
    treeView,
    cacheManager,
    terminalManager,
    
    vscode.commands.registerCommand('ramros.refreshWorkspaces', async () => {
      await treeProvider.refresh();
      vscode.window.showInformationMessage('Workspaces refreshed');
    }),
    
    vscode.commands.registerCommand('ramros.sourceWorkspace', async () => {
      const workspaces = treeProvider.getWorkspaces();
      
      if (workspaces.length === 0) {
        vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }
      
      let selectedWorkspace: typeof workspaces[0];
      
      if (workspaces.length === 1) {
        selectedWorkspace = workspaces[0];
      } else {
        const workspaceNames = workspaces.map(w => w.name);
        const selected = await vscode.window.showQuickPick(workspaceNames, {
          placeHolder: 'Select a workspace to source'
        });
        
        if (!selected) return;
        
        selectedWorkspace = workspaces.find(w => w.name === selected)!;
      }
      
      await terminalManager.sourceWorkspace(selectedWorkspace);
    }),
    
    vscode.commands.registerCommand('ramros.buildWorkspace', async () => {
      const workspaces = treeProvider.getWorkspaces();
      
      if (workspaces.length === 0) {
        vscode.window.showWarningMessage('No ROS2 workspaces found');
        return;
      }
      
      let selectedWorkspace: typeof workspaces[0];
      
      if (workspaces.length === 1) {
        selectedWorkspace = workspaces[0];
      } else {
        const workspaceNames = workspaces.map(w => w.name);
        const selected = await vscode.window.showQuickPick(workspaceNames, {
          placeHolder: 'Select a workspace to build'
        });
        
        if (!selected) return;
        
        selectedWorkspace = workspaces.find(w => w.name === selected)!;
      }
      
      await terminalManager.buildWorkspace(selectedWorkspace);
    })
  );
  
  await treeProvider.refresh();
}

export function deactivate() {
  console.log('RAMROS Extension deactivated');
}
