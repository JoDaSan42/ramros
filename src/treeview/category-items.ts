import * as vscode from 'vscode';
import { PackageInfo, NodeInfo, InterfaceInfo, LaunchFileInfo } from '../core/package-discovery';
import { TreeItemBase } from './base-tree-item';

export class CategoryNodesFolderItem extends TreeItemBase {
  constructor(private readonly packages: PackageInfo[]) {
    super('Nodes', vscode.TreeItemCollapsibleState.Expanded);
    
    const allNodes = packages.flatMap(pkg => pkg.nodes);
    this.description = `(${allNodes.length})`;
    this.iconPath = new vscode.ThemeIcon('broadcast');
    this.contextValue = 'categoryNodesFolder';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    const allNodes = this.packages.flatMap(pkg => 
      pkg.nodes.map(node => new CategoryNodeItem(node))
    );
    return allNodes;
  }
}

export class CategoryNodeItem extends TreeItemBase {
  constructor(private readonly node: NodeInfo) {
    super(node.name, vscode.TreeItemCollapsibleState.None);
    
    this.description = `(${node.packageName})`;
    this.iconPath = new vscode.ThemeIcon('broadcast');
    this.contextValue = 'node';
    this.command = { command: 'vscode.open', title: 'Open File', arguments: [vscode.Uri.file(node.path)] };
    this.tooltip = new vscode.MarkdownString(`Package: ${node.packageName}`);
  }
  
  getNodeInfo(): NodeInfo {
    return this.node;
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}

export class CategoryInterfacesFolderItem extends TreeItemBase {
  constructor(private readonly packages: PackageInfo[]) {
    super('Interfaces', vscode.TreeItemCollapsibleState.Expanded);
    
    const allInterfaces = packages.flatMap(pkg => pkg.interfaces);
    this.description = `(${allInterfaces.length})`;
    this.iconPath = new vscode.ThemeIcon('link');
    this.contextValue = 'categoryInterfacesFolder';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    const children: TreeItemBase[] = [];
    
    for (const pkg of this.packages) {
      const messages = pkg.interfaces.filter(i => i.type === 'message');
      const services = pkg.interfaces.filter(i => i.type === 'service');
      const actions = pkg.interfaces.filter(i => i.type === 'action');
      
      if (messages.length > 0) {
        children.push(new CategoryInterfaceGroupItem(`Messages (${pkg.name})`, messages, pkg.name));
      }
      
      if (services.length > 0) {
        children.push(new CategoryInterfaceGroupItem(`Services (${pkg.name})`, services, pkg.name));
      }
      
      if (actions.length > 0) {
        children.push(new CategoryInterfaceGroupItem(`Actions (${pkg.name})`, actions, pkg.name));
      }
    }
    
    return children;
  }
}

export class CategoryInterfaceGroupItem extends TreeItemBase {
  constructor(
    groupName: string,
    private readonly interfaces: InterfaceInfo[],
    private readonly packageName: string
  ) {
    super(groupName, vscode.TreeItemCollapsibleState.Collapsed);
    
    this.description = `(${interfaces.length})`;
    this.iconPath = new vscode.ThemeIcon('files');
    this.contextValue = 'interfaceGroup';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return this.interfaces.map(iface => new CategoryInterfaceFileItem(iface, this.packageName));
  }
}

export class CategoryInterfaceFileItem extends TreeItemBase {
  constructor(
    private readonly iface: InterfaceInfo,
    private readonly packageName: string
  ) {
    super(iface.name, vscode.TreeItemCollapsibleState.None);
    
    const extension = this.getInterfaceExtension(iface.type);
    this.description = `.${extension} (${packageName})`;
    this.iconPath = new vscode.ThemeIcon('symbol-interface');
    this.contextValue = 'interfaceFile';
    this.command = { command: 'vscode.open', title: 'Open File', arguments: [vscode.Uri.file(iface.path)] };
    
    this.updateTooltip();
  }
  
  private getInterfaceExtension(type: string): string {
    switch (type) {
      case 'message': return 'msg';
      case 'service': return 'srv';
      case 'action': return 'action';
      default: return 'interface';
    }
  }
  
  private updateTooltip(): void {
    const lines: string[] = [
      `**${this.iface.name}**`,
      '',
      `Type: ${this.iface.type}`,
      `Package: ${this.packageName}`,
      '',
      `**Fields (${this.iface.fields.length}):**`,
    ];
    
    this.iface.fields.forEach(f => {
      const arrayInfo = f.isArray ? (f.arraySize !== undefined ? `[${f.arraySize}]` : '[]') : '';
      lines.push(`- ${f.type}${arrayInfo} ${f.name}`);
    });
    
    this.tooltip = new vscode.MarkdownString(lines.join('\n'));
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}

export class CategoryLaunchFilesFolderItem extends TreeItemBase {
  constructor(private readonly packages: PackageInfo[]) {
    super('Launch Files', vscode.TreeItemCollapsibleState.Expanded);
    
    const allLaunchFiles = packages.flatMap(pkg => pkg.launchFiles);
    this.description = `(${allLaunchFiles.length})`;
    this.iconPath = new vscode.ThemeIcon('rocket');
    this.contextValue = 'categoryLaunchFilesFolder';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    const allLaunchFiles = this.packages.flatMap(pkg => 
      pkg.launchFiles.map(file => new CategoryLaunchFileItem(file, pkg.name))
    );
    return allLaunchFiles;
  }
}

export class CategoryLaunchFileItem extends TreeItemBase {
  constructor(
    private readonly file: LaunchFileInfo,
    private readonly packageName: string
  ) {
    super(file.name, vscode.TreeItemCollapsibleState.None);
    
    this.description = `(${packageName})`;
    this.iconPath = new vscode.ThemeIcon('rocket');
    this.contextValue = 'launchFile';
    this.command = { command: 'vscode.open', title: 'Open File', arguments: [vscode.Uri.file(file.path)] };
    
    this.tooltip = new vscode.MarkdownString(`**${this.file.name}**\n\nPackage: ${packageName}\nPath: ${file.path}`);
  }
  
  getLaunchFileInfo(): LaunchFileInfo {
    return this.file;
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}
