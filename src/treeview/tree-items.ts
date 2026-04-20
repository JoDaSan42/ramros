import * as vscode from 'vscode';
import { WorkspaceInfo } from '../core/workspace-detector';
import { PackageConflict } from '../core/duplicate-package-detector';
import { PackageInfo, NodeInfo, InterfaceInfo, LaunchFileInfo, ParameterInfo, TopicEndpointInfo } from '../core/package-discovery';

export abstract class TreeItemBase extends vscode.TreeItem {
  abstract getChildren(): Promise<TreeItemBase[]>;
}

export class ToolsFolderItem extends TreeItemBase {
  constructor() {
    super('Tools', vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('tools');
    this.contextValue = 'toolsFolder';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [
      new ToolItem('RVIZ2', 'rviz2', 'vm'),
      new ToolItem('rqt_graph', 'rqt_graph', 'symbol-network'),
      new ToolItem('ros2 bag record', 'bag-record', 'record'),
      new ToolItem('ros2 bag play', 'bag-play', 'play-circle')
    ];
  }
}

export class SeparatorItem extends TreeItemBase {
  constructor(label: string) {
    super('', vscode.TreeItemCollapsibleState.None);
    this.label = '';
    this.iconPath = undefined;
    this.contextValue = 'separator';
    this.description = label;
    this.tooltip = undefined;
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}

export class ToolItem extends TreeItemBase {
  constructor(
    label: string,
    private readonly toolType: string,
    iconId: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(iconId);
    this.contextValue = 'tool';
    this.command = { command: `ramros.launchTool.${toolType}`, title: 'Launch Tool' };
  }
  
  getToolType(): string {
    return this.toolType;
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
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
  
  getWorkspace(): WorkspaceInfo {
    return this.workspace;
  }
  
  getChildren(): Promise<TreeItemBase[]> {
    const children: TreeItemBase[] = [];
    
    if (this.workspace.warnings.length > 0 || this.workspace.errors.length > 0) {
      children.push(new WarningsItem(this.workspace));
    }
    
    if (this.workspace.packages && this.workspace.packages.length > 0) {
      children.push(new PackagesFolderItem(this.workspace.packages));
    } else if (this.workspace.srcPath) {
      children.push(new PackagesPlaceholderItem());
    }
    
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
    
    this.description = '(no packages discovered)';
    this.iconPath = new vscode.ThemeIcon('package');
    this.contextValue = 'packagesPlaceholder';
  }
  
  getChildren(): Promise<TreeItemBase[]> {
    return Promise.resolve([]);
  }
}

export class PackagesFolderItem extends TreeItemBase {
  constructor(private readonly packages: PackageInfo[]) {
    super('Packages', vscode.TreeItemCollapsibleState.Expanded);
    
    this.description = `(${packages.length})`;
    this.iconPath = new vscode.ThemeIcon('folder-library');
    this.contextValue = 'packagesFolder';
    this.tooltip = new vscode.MarkdownString(`${packages.length} packages discovered`);
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return this.packages.map(pkg => new PackageItem(pkg));
  }
}

export class PackageItem extends TreeItemBase {
  constructor(private readonly pkg: PackageInfo) {
    super(pkg.name, vscode.TreeItemCollapsibleState.Collapsed);
    
    const versionBadge = pkg.version ? `v${pkg.version}` : '';
    const typeEmoji = this.getTypeEmoji(pkg.packageType);
    this.description = `${versionBadge} ${typeEmoji}`.trim();
    
    this.iconPath = new vscode.ThemeIcon('package');
    this.contextValue = 'package';
    
    this.updateTooltip();
  }
  
  getPackageInfo(): PackageInfo {
    return this.pkg;
  }
  
  private getTypeEmoji(type: string): string {
    const emojiMap: Record<string, string> = {
      'cpp': '⚙️',
      'python': '🐍',
      'mixed': '🔀',
      'interface': '📋',
      'empty': '📦'
    };
    return emojiMap[type] || '📦';
  }
  
  private updateTooltip(): void {
    const lines: string[] = [
      `**${this.pkg.name}**`,
      '',
      this.pkg.description || 'No description',
      '',
      `Version: ${this.pkg.version}`,
      `License: ${this.pkg.license}`,
      `Type: ${this.pkg.packageType}`,
      '',
      `Nodes: ${this.pkg.nodes.length}`,
      `Interfaces: ${this.pkg.interfaces.length}`,
      `Launch Files: ${this.pkg.launchFiles.length}`,
    ];
    this.tooltip = new vscode.MarkdownString(lines.join('\n'));
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    const children: TreeItemBase[] = [];
    
    if (this.pkg.nodes.length > 0) {
      children.push(new NodesFolderItem(this.pkg.nodes));
    }
    
    if (this.pkg.interfaces.length > 0) {
      children.push(new InterfacesFolderItem(this.pkg.interfaces));
    }
    
    if (this.pkg.launchFiles.length > 0) {
      children.push(new LaunchFilesFolderItem(this.pkg.launchFiles));
    }
    
    return children;
  }
}

export class NodesFolderItem extends TreeItemBase {
  constructor(private readonly nodes: NodeInfo[]) {
    super('Nodes', vscode.TreeItemCollapsibleState.Expanded);
    
    this.description = `(${nodes.length})`;
    this.iconPath = new vscode.ThemeIcon('broadcast');
    this.contextValue = 'nodesFolder';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return this.nodes.map(node => new NodeItem(node));
  }
}

export class NodeItem extends TreeItemBase {
  constructor(private readonly node: NodeInfo) {
    super(node.name, vscode.TreeItemCollapsibleState.Collapsed);
    
    this.description = node.language === 'cpp' ? '.cpp' : '.py';
    this.iconPath = new vscode.ThemeIcon('broadcast');
    this.contextValue = 'node';
    this.command = { command: 'vscode.open', title: 'Open File', arguments: [vscode.Uri.file(node.path)] };
    
    this.updateTooltip();
  }
  
  getNodeInfo(): NodeInfo {
    return this.node;
  }
  
  private updateTooltip(): void {
    const pubCount = this.node.publishers?.length || 0;
    const subCount = this.node.subscriptions?.length || 0;
    const paramCount = this.node.parameters?.length || 0;
    
    const lines: string[] = [
      `**${this.node.name}**`,
      '',
      `Package: ${this.node.packageName}`,
      `Language: ${this.node.language}`,
      `Executable: ${this.node.isExecutable ? 'Yes' : 'No'}`,
      '',
      `⬆️ Publishers: ${pubCount}`,
      `⬇️ Subscribers: ${subCount}`,
      `⚙️ Parameters: ${paramCount}`,
    ];
    
    if (this.node.publishers && this.node.publishers.length > 0) {
      lines.push('', `**Publishers:**`);
      this.node.publishers.forEach(pub => {
        lines.push(`- ${pub.topicName} (${pub.messageType})`);
      });
    }
    
    if (this.node.subscriptions && this.node.subscriptions.length > 0) {
      lines.push('', `**Subscriptions:**`);
      this.node.subscriptions.forEach(sub => {
        lines.push(`- ${sub.topicName} (${sub.messageType})`);
      });
    }
    
    if (this.node.parameters && this.node.parameters.length > 0) {
      lines.push('', `**Parameters:**`);
      this.node.parameters.forEach(p => {
        lines.push(`- ${p.name}${p.defaultValue !== undefined ? ` = ${p.defaultValue}` : ''}`);
      });
    }
    
    this.tooltip = new vscode.MarkdownString(lines.join('\n'));
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    const children: TreeItemBase[] = [];
    
    if (this.node.publishers && this.node.publishers.length > 0) {
      const pubItems = this.node.publishers.map(pub => new PublisherItem(pub));
      children.push(new NodeMetadataFolderItem('Publishers', pubItems, 'arrow-up'));
    }
    
    if (this.node.subscriptions && this.node.subscriptions.length > 0) {
      const subItems = this.node.subscriptions.map(sub => new SubscriberItem(sub));
      children.push(new NodeMetadataFolderItem('Subscribers', subItems, 'arrow-down'));
    }
    
    if (this.node.parameters && this.node.parameters.length > 0) {
      const paramItems = this.node.parameters.map(param => new ParameterItem(param));
      children.push(new NodeMetadataFolderItem('Parameters', paramItems, 'gear'));
    }
    
    return children;
  }
}

export class NodeMetadataFolderItem extends TreeItemBase {
  constructor(
    label: string,
    private readonly children: TreeItemBase[],
    iconId: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon(iconId);
    this.contextValue = `${label.toLowerCase()}Folder`;
    this.description = `(${children.length})`;
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return this.children;
  }
}

export class PublisherItem extends TreeItemBase {
  constructor(private readonly publisher: TopicEndpointInfo) {
    super(publisher.topicName, vscode.TreeItemCollapsibleState.None);
    
    this.description = `(${publisher.messageType})`;
    this.iconPath = new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('charts.green'));
    this.contextValue = 'publisher';
    this.tooltip = new vscode.MarkdownString(`**Publisher**\n\nTopic: ${publisher.topicName}\nType: ${publisher.messageType}`);
  }
  
  getTopicEndpointInfo(): TopicEndpointInfo {
    return this.publisher;
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}

export class SubscriberItem extends TreeItemBase {
  constructor(private readonly subscriber: TopicEndpointInfo) {
    super(subscriber.topicName, vscode.TreeItemCollapsibleState.None);
    
    this.description = `(${subscriber.messageType})`;
    this.iconPath = new vscode.ThemeIcon('arrow-down', new vscode.ThemeColor('charts.blue'));
    this.contextValue = 'subscriber';
    this.tooltip = new vscode.MarkdownString(`**Subscriber**\n\nTopic: ${subscriber.topicName}\nType: ${subscriber.messageType}`);
  }
  
  getTopicEndpointInfo(): TopicEndpointInfo {
    return this.subscriber;
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}

export class ParameterItem extends TreeItemBase {
  constructor(private readonly parameter: ParameterInfo) {
    super(parameter.name, vscode.TreeItemCollapsibleState.None);
    
    const defaultStr = parameter.defaultValue !== undefined ? `:= ${parameter.defaultValue}` : '';
    const typeStr = parameter.type ? ` (${parameter.type})` : '';
    this.description = `${defaultStr}${typeStr}`.trim();
    
    this.iconPath = new vscode.ThemeIcon('gear');
    this.contextValue = 'parameter';
    
    this.tooltip = new vscode.MarkdownString(
      `**Parameter**\n\nName: ${parameter.name}\n` +
      `Default: ${parameter.defaultValue ?? 'none'}\n` +
      `Type: ${parameter.type ?? 'auto-detect'}`
    );
  }
  
  getParameterInfo(): ParameterInfo {
    return this.parameter;
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}

export class InterfacesFolderItem extends TreeItemBase {
  constructor(private readonly interfaces: InterfaceInfo[]) {
    super('Interfaces', vscode.TreeItemCollapsibleState.Expanded);
    
    const msgCount = interfaces.filter(i => i.type === 'message').length;
    const srvCount = interfaces.filter(i => i.type === 'service').length;
    const actionCount = interfaces.filter(i => i.type === 'action').length;
    
    const parts: string[] = [];
    if (msgCount > 0) parts.push(`${msgCount} msg`);
    if (srvCount > 0) parts.push(`${srvCount} srv`);
    if (actionCount > 0) parts.push(`${actionCount} action`);
    
    this.description = `(${parts.join(', ')})`;
    this.iconPath = new vscode.ThemeIcon('link');
    this.contextValue = 'interfacesFolder';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    const children: TreeItemBase[] = [];
    
    const messages = this.interfaces.filter(i => i.type === 'message');
    const services = this.interfaces.filter(i => i.type === 'service');
    const actions = this.interfaces.filter(i => i.type === 'action');
    
    if (messages.length > 0) {
      children.push(new InterfaceGroupItem('Messages', messages));
    }
    
    if (services.length > 0) {
      children.push(new InterfaceGroupItem('Services', services));
    }
    
    if (actions.length > 0) {
      children.push(new InterfaceGroupItem('Actions', actions));
    }
    
    return children;
  }
}

export class InterfaceGroupItem extends TreeItemBase {
  constructor(
    groupName: string,
    private readonly interfaces: InterfaceInfo[]
  ) {
    super(groupName, vscode.TreeItemCollapsibleState.Collapsed);
    
    this.description = `(${interfaces.length})`;
    this.iconPath = new vscode.ThemeIcon('files');
    this.contextValue = 'interfaceGroup';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return this.interfaces.map(iface => new InterfaceFileItem(iface));
  }
}

export class InterfaceFileItem extends TreeItemBase {
  constructor(private readonly iface: InterfaceInfo) {
    super(iface.name, vscode.TreeItemCollapsibleState.None);
    
    const extension = this.getInterfaceExtension(iface.type);
    this.description = `.${extension}`;
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

export class LaunchFilesFolderItem extends TreeItemBase {
  constructor(private readonly launchFiles: LaunchFileInfo[]) {
    super('Launch Files', vscode.TreeItemCollapsibleState.Expanded);
    
    this.description = `(${launchFiles.length})`;
    this.iconPath = new vscode.ThemeIcon('rocket');
    this.contextValue = 'launchFilesFolder';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return this.launchFiles.map(file => new LaunchFileItem(file));
  }
}

export class LaunchFileItem extends TreeItemBase {
  constructor(private readonly file: LaunchFileInfo) {
    super(file.name, vscode.TreeItemCollapsibleState.None);
    
    this.iconPath = new vscode.ThemeIcon('rocket');
    this.contextValue = 'launchFile';
    this.command = { command: 'vscode.open', title: 'Open File', arguments: [vscode.Uri.file(file.path)] };
    
    this.tooltip = new vscode.MarkdownString(`**${this.file.name}**\n\nPath: ${this.file.path}`);
  }
  
  getLaunchFileInfo(): LaunchFileInfo {
    return this.file;
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
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
