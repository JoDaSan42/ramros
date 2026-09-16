import * as vscode from 'vscode';
import { PackageConflict } from '../core/duplicate-package-detector';
import { TreeItemBase } from './base-tree-item';

export class ConflictsItem extends TreeItemBase {
  constructor(private readonly conflicts: PackageConflict[]) {
    super('Package Conflicts', vscode.TreeItemCollapsibleState.Collapsed);
    
    this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('notificationsErrorIcon'));
    this.description = `${conflicts.length} conflicts`;
    this.tooltip = new vscode.MarkdownString('Package name conflicts detected');
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return this.conflicts.map(conflict => new ConflictItem(conflict));
  }
}

class ConflictItem extends TreeItemBase {
  constructor(private readonly conflict: PackageConflict) {
    super(conflict.packageName, vscode.TreeItemCollapsibleState.Expanded);
    
    this.iconPath = new vscode.ThemeIcon(
      conflict.type === 'same-workspace' ? 'error' : 'warning'
    );
    
    this.description = `(${conflict.type.replace('-', ' ')})`;
    
    this.tooltip = new vscode.MarkdownString(
      `**${conflict.packageName}**\n\n` +
      `Type: ${conflict.type}\n\n` +
      `Locations:\n` +
      conflict.locations.map(l => `- ${l.workspaceId}`).join('\n')
    );
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return this.conflict.locations.map(
      loc => new LocationItem(loc.workspaceId, loc.packagePath)
    );
  }
}

class LocationItem extends TreeItemBase {
  constructor(workspaceId: string, packagePath: string) {
    super(packagePath, vscode.TreeItemCollapsibleState.None);
    
    this.description = workspaceId;
    this.iconPath = new vscode.ThemeIcon('file');
    this.tooltip = new vscode.MarkdownString(`Path: ${packagePath}`);
  }
  
  getChildren(): Promise<TreeItemBase[]> {
    return Promise.resolve([]);
  }
}
