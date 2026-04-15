import * as vscode from 'vscode';
import { WorkspaceInfo, WorkspaceDetector } from '../core/workspace-detector';
import { DuplicatePackageDetector, PackageConflict } from '../core/duplicate-package-detector';
import { PackageDiscoveryService } from '../core/package-discovery';
import { TreeItemBase, WorkspaceRootItem, ConflictsItem } from './tree-items';

export class RamrosTreeProvider implements vscode.TreeDataProvider<TreeItemBase> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItemBase | undefined | null | void> = new vscode.EventEmitter();
  readonly onDidChangeTreeData: vscode.Event<TreeItemBase | undefined | null | void> = this._onDidChangeTreeData.event;
  
  private workspaces: WorkspaceInfo[] = [];
  private conflicts: PackageConflict[] = [];
  private packageDiscovery: PackageDiscoveryService;
  private autoRefreshInterval: NodeJS.Timeout | undefined;
  private readonly AUTO_REFRESH_MS = 3000;
  private fileWatcher: vscode.FileSystemWatcher | undefined;
  
  constructor(
    private readonly workspaceDetector: WorkspaceDetector,
    private readonly duplicateDetector: DuplicatePackageDetector,
    packageDiscovery?: PackageDiscoveryService,
    enableAutoRefresh: boolean = true
  ) {
    this.packageDiscovery = packageDiscovery || new PackageDiscoveryService();
    void this.initialize();
    if (enableAutoRefresh) {
      this.startAutoRefresh();
      this.setupFileWatcher();
    }
  }
  
  private async initialize(): Promise<void> {
    await this.loadWorkspaces();
  }
  
  async refresh(): Promise<void> {
    this.packageDiscovery.clearCache();
    await this.loadWorkspaces(true);
    this._onDidChangeTreeData.fire(undefined);
  }
  
  private startAutoRefresh(): void {
    this.autoRefreshInterval = setInterval(() => {
      void this.loadWorkspacesSilent();
    }, this.AUTO_REFRESH_MS);
  }
  
  private async loadWorkspacesSilent(): Promise<void> {
    this.packageDiscovery.clearCache();
    const newWorkspaces = await this.workspaceDetector.detectWorkspaces(true);
    
    for (const workspace of newWorkspaces) {
      await this.workspaceDetector.validateWorkspace(workspace);
    }
    
    const newConflicts = await this.duplicateDetector.detectDuplicates(newWorkspaces);
    
    const oldPackageCount = this.workspaces.reduce((sum, w) => sum + (w.packages?.length || 0), 0);
    const newPackageCount = newWorkspaces.reduce((sum, w) => sum + (w.packages?.length || 0), 0);
    
    const hasChanged = 
      newWorkspaces.length !== this.workspaces.length ||
      oldPackageCount !== newPackageCount ||
      JSON.stringify(this.workspaces.map(w => w.packages?.map(p => p.name).sort())) !== 
      JSON.stringify(newWorkspaces.map(w => w.packages?.map(p => p.name).sort()));
    
    if (hasChanged) {
      this.workspaces = newWorkspaces;
      this.conflicts = newConflicts;
      this._onDidChangeTreeData.fire();
    }
  }
  
  private async loadWorkspaces(forceRefresh: boolean = false): Promise<void> {
    this.workspaces = await this.workspaceDetector.detectWorkspaces(forceRefresh);
    
    for (const workspace of this.workspaces) {
      await this.workspaceDetector.validateWorkspace(workspace);
    }
    
    this.conflicts = await this.duplicateDetector.detectDuplicates(this.workspaces);
  }
  
  public stopAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = undefined;
    }
    if (this.fileWatcher) {
      this.fileWatcher.dispose();
      this.fileWatcher = undefined;
    }
  }
  
  private setupFileWatcher(): void {
    const workspaceFolders = vscode.workspace.workspaceFolders || [];
    if (workspaceFolders.length === 0) return;
    
    const watchers: vscode.FileSystemWatcher[] = [];
    
    for (const folder of workspaceFolders) {
      const srcPattern = new vscode.RelativePattern(folder, 'src/**/package.xml');
      const watcher = vscode.workspace.createFileSystemWatcher(srcPattern);
      watchers.push(watcher);
      
      watcher.onDidCreate(() => this.refresh());
      watcher.onDidDelete(() => this.refresh());
      watcher.onDidChange(() => this.refresh());
    }
    
    this.fileWatcher = watchers[0];
  }
  
  getTreeItem(element: TreeItemBase): vscode.TreeItem {
    return element;
  }
  
  async getChildren(element?: TreeItemBase): Promise<TreeItemBase[]> {
    if (!element) {
      const rootItems: TreeItemBase[] = [];
      
      for (const workspace of this.workspaces) {
        rootItems.push(new WorkspaceRootItem(workspace));
      }
      
      if (this.conflicts.length > 0) {
        rootItems.push(new ConflictsItem(this.conflicts));
      }
      
      return rootItems;
    }
    
    return element.getChildren();
  }
  
  getWorkspaces(): WorkspaceInfo[] {
    return [...this.workspaces];
  }
  
  getConflicts(): PackageConflict[] {
    return [...this.conflicts];
  }
}
