import * as vscode from 'vscode';
import { WorkspaceInfo, WorkspaceDetector } from '../core/workspace-detector';
import { DuplicatePackageDetector, PackageConflict } from '../core/duplicate-package-detector';
import { TreeItemBase, WorkspaceRootItem, ConflictsItem } from './tree-items';

export class RamrosTreeProvider implements vscode.TreeDataProvider<TreeItemBase> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItemBase | undefined | null | void> = new vscode.EventEmitter();
  readonly onDidChangeTreeData: vscode.Event<TreeItemBase | undefined | null | void> = this._onDidChangeTreeData.event;
  
  private workspaces: WorkspaceInfo[] = [];
  private conflicts: PackageConflict[] = [];
  
  constructor(
    private readonly workspaceDetector: WorkspaceDetector,
    private readonly duplicateDetector: DuplicatePackageDetector
  ) {}
  
  async refresh(): Promise<void> {
    await this.loadWorkspaces();
    this._onDidChangeTreeData.fire();
  }
  
  private async loadWorkspaces(): Promise<void> {
    this.workspaces = await this.workspaceDetector.detectWorkspaces();
    
    for (const workspace of this.workspaces) {
      await this.workspaceDetector.validateWorkspace(workspace);
    }
    
    this.conflicts = await this.duplicateDetector.detectDuplicates(this.workspaces);
  }
  
  getTreeItem(element: TreeItemBase): vscode.TreeItem {
    return element;
  }
  
  async getChildren(element?: TreeItemBase): Promise<TreeItemBase[]> {
    if (!element) {
      await this.loadWorkspaces();
      
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
