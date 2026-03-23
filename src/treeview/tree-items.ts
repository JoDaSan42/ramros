import * as vscode from 'vscode';
import { WorkspaceInfo } from '../core/workspace-detector';
import { PackageConflict } from '../core/duplicate-package-detector';

export abstract class TreeItemBase extends vscode.TreeItem {
  abstract getChildren(): Promise<TreeItemBase[]>;
}

export class WorkspaceRootItem extends TreeItemBase {
  constructor(private readonly workspace: WorkspaceInfo) {
    super(workspace.name, vscode.TreeItemCollapsibleState.Expanded);
    
    this.id = workspace.id;
    this.description = workspace.rosDistribution?.name 
      ? `(ros2/${workspace.rosDistribution.name})` 
      : '(no ROS distro)';
    
    this.iconPath = new vscode.ThemeIcon('folder');
    this.contextValue = 'workspaceRoot';
    
    this.updateTooltip();
  }
  
  getChildren(): Promise<TreeItemBase[]> {
    const children: TreeItemBase[] = [];
    
    if (this.workspace.warnings.length > 0 || this.workspace.errors.length > 0) {
      children.push(new WarningsItem(this.workspace));
    }
    
    children.push(new PackagesPlaceholderItem());
    
    return Promise.resolve(children);
  }
  
  private updateTooltip(): void {
    const lines: string[] = [
      `**${this.workspace.name}**`,
      '',
      `Path: ${this.workspace.rootPath.fsPath}`,
      '',
    ];
    
    if (this.workspace.rosDistribution) {
      lines.push(`ROS Distribution: ${this.workspace.rosDistribution.name}`);
    }
    
    if (this.workspace.warnings.length > 0) {
      lines.push('', `⚠️ Warnings: ${this.workspace.warnings.length}`);
      this.workspace.warnings.forEach(w => lines.push(`  - ${w}`));
    }
    
    if (this.workspace.errors.length > 0) {
      lines.push('', `❌ Errors: ${this.workspace.errors.length}`);
      this.workspace.errors.forEach(e => lines.push(`  - ${e}`));
    }
    
    this.tooltip = new vscode.MarkdownString(lines.join('\n'));
  }
}

export class WarningsItem extends TreeItemBase {
  constructor(private readonly workspace: WorkspaceInfo) {
    super('Warnings', vscode.TreeItemCollapsibleState.Expanded);
    
    this.iconPath = new vscode.ThemeIcon(
      workspace.errors.length > 0 ? 'error' : 'warning',
      new vscode.ThemeColor('notificationsWarningIcon')
    );
    
    this.description = `${workspace.warnings.length + workspace.errors.length} issues`;
  }
  
  getChildren(): Promise<TreeItemBase[]> {
    const items: TreeItemBase[] = [];
    
    for (const error of this.workspace.errors) {
      items.push(new MessageItem(error, 'error'));
    }
    
    for (const warning of this.workspace.warnings) {
      items.push(new MessageItem(warning, 'warning'));
    }
    
    return Promise.resolve(items);
  }
}

class MessageItem extends TreeItemBase {
  constructor(message: string, type: 'error' | 'warning') {
    super(message, vscode.TreeItemCollapsibleState.None);
    
    this.iconPath = new vscode.ThemeIcon(
      type === 'error' ? 'error' : 'warning'
    );
    
    this.contextValue = 'message';
  }
  
  getChildren(): Promise<TreeItemBase[]> {
    return Promise.resolve([]);
  }
}

export class PackagesPlaceholderItem extends TreeItemBase {
  constructor() {
    super('Packages', vscode.TreeItemCollapsibleState.Collapsed);
    
    this.description = '(coming in v2.0)';
    this.iconPath = new vscode.ThemeIcon('package');
    this.contextValue = 'packagesPlaceholder';
  }
  
  getChildren(): Promise<TreeItemBase[]> {
    return Promise.resolve([]);
  }
}

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
