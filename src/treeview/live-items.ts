import * as vscode from 'vscode';
import { TopicEndpointInfo } from '../core/package-discovery';
import { Ros2CliService } from '../core/ros2-cli-service';
import { TreeItemBase } from './base-tree-item';

export class LiveFolderItem extends TreeItemBase {
  constructor(
    label: string,
    private readonly folderType: string
  ) {
    super(label, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon(folderType === 'active-nodes' ? 'broadcast' : 'symbol-event');
    this.contextValue = folderType === 'active-nodes' ? 'liveNodesFolder' : 'liveTopicsFolder';
  }
  
  getFolderType(): string {
    return this.folderType;
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}

export class LiveNodeItem extends TreeItemBase {
  constructor(
    private readonly nodeName: string,
    private readonly publishedTopics?: string[],
    private readonly subscribedTopics?: string[]
  ) {
    super(nodeName, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('broadcast', new vscode.ThemeColor('charts.green'));
    this.contextValue = 'liveNode';
    this.updateDisplay();
  }
  
  private updateDisplay(): void {
    const pubCount = this.publishedTopics?.length || 0;
    const subCount = this.subscribedTopics?.length || 0;
    if (pubCount > 0 || subCount > 0) {
      this.description = `${pubCount} pub / ${subCount} sub`;
    } else {
      this.description = 'running';
    }
  }
  
  getNodeName(): string {
    return this.nodeName;
  }
  
  getPublishedTopics(): string[] | undefined {
    return this.publishedTopics;
  }
  
  getSubscribedTopics(): string[] | undefined {
    return this.subscribedTopics;
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    const children: TreeItemBase[] = [];
    
    const pubCount = this.publishedTopics?.length || 0;
    const subCount = this.subscribedTopics?.length || 0;
    
    if (pubCount > 0) {
      children.push(new NodePublishedTopicsItem(this.nodeName, this.publishedTopics || []));
    }
    
    if (subCount > 0) {
      children.push(new NodeSubscribedTopicsItem(this.nodeName, this.subscribedTopics || []));
    }
    
    if (children.length === 0) {
      children.push(new NoEndpointsItem());
    }
    
    return children;
  }
}

export class NodePublishedTopicsItem extends TreeItemBase {
  constructor(nodeName: string, private readonly topics: string[]) {
    super(`Published Topics (${topics.length})`, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('charts.green'));
    this.tooltip = new vscode.MarkdownString(`**Topics published by ${nodeName}**\n\nCount: ${topics.length}`);
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return this.topics.map(topic => new TopicReferenceItem(topic, 'publisher'));
  }
}

export class NodeSubscribedTopicsItem extends TreeItemBase {
  constructor(nodeName: string, private readonly topics: string[]) {
    super(`Subscribed Topics (${topics.length})`, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('arrow-down', new vscode.ThemeColor('charts.blue'));
    this.tooltip = new vscode.MarkdownString(`**Topics subscribed by ${nodeName}**\n\nCount: ${topics.length}`);
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return this.topics.map(topic => new TopicReferenceItem(topic, 'subscriber'));
  }
}

export class TopicReferenceItem extends TreeItemBase {
  constructor(topicName: string, type: 'publisher' | 'subscriber') {
    super(topicName, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(
      type === 'publisher' ? 'arrow-up' : 'arrow-down',
      type === 'publisher' ? new vscode.ThemeColor('charts.green') : new vscode.ThemeColor('charts.blue')
    );
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}

export class NoEndpointsItem extends TreeItemBase {
  constructor() {
    super('No publishers or subscribers', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('info');
    this.description = '';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}

export class LiveTopicItem extends TreeItemBase {
  constructor(
    private readonly topicName: string,
    private readonly messageType?: string,
    private readonly publishers?: string[],
    private readonly subscribers?: string[]
  ) {
    super(topicName, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('symbol-event');
    this.contextValue = 'liveTopic';
    this.updateDisplay();
  }
  
  private updateDisplay(): void {
    const parts: string[] = [];
    if (this.messageType) parts.push(this.messageType);
    const pubCount = this.publishers?.length || 0;
    const subCount = this.subscribers?.length || 0;
    if (pubCount > 0 || subCount > 0) {
      parts.push(`${pubCount} pub / ${subCount} sub`);
    }
    this.description = parts.join(' • ');
  }
  
  getTopicName(): string {
    return this.topicName;
  }
  
  getMessageType(): string | undefined {
    return this.messageType;
  }
  
  getPublishers(): string[] | undefined {
    return this.publishers;
  }
  
  getSubscribers(): string[] | undefined {
    return this.subscribers;
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    const children: TreeItemBase[] = [
      new TopicMessageTypeItem(this.topicName, this.messageType)
    ];
    
    const pubCount = this.publishers?.length || 0;
    const subCount = this.subscribers?.length || 0;
    
    children.push(new TopicPublishersItem(this.topicName, pubCount));
    children.push(new TopicSubscribersItem(this.topicName, subCount));
    
    return children;
  }
}

export class TopicMessageTypeItem extends TreeItemBase {
  constructor(topicName: string, messageType?: string) {
    super('Message Type', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('symbol-interface');
    this.description = messageType || 'unknown';
    this.tooltip = new vscode.MarkdownString(`**Message Type**\n\nTopic: ${topicName}\nType: ${messageType || 'unknown'}`);
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}

export class TopicPublishersItem extends TreeItemBase {
  constructor(
    private readonly topicName: string,
    count: number
  ) {
    super(`Publishers (${count})`, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('arrow-up', new vscode.ThemeColor('charts.green'));
    this.contextValue = 'topicPublishers';
    this.tooltip = new vscode.MarkdownString(`**Publishers on ${topicName}**\n\nCount: ${count}`);
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    const cli = Ros2CliService.getInstance();
    const publishers = await cli.getTopicPublishers(this.topicName);
    
    return publishers.map(pub => new TopicEndpointItem({
      topicName: this.topicName,
      messageType: '',
      nodeName: pub.nodeName,
      nodeNamespace: pub.nodeNamespace,
    }, 'publisher'));
  }
}

export class TopicSubscribersItem extends TreeItemBase {
  constructor(
    private readonly topicName: string,
    count: number
  ) {
    super(`Subscribers (${count})`, vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('arrow-down', new vscode.ThemeColor('charts.blue'));
    this.contextValue = 'topicSubscribers';
    this.tooltip = new vscode.MarkdownString(`**Subscribers on ${topicName}**\n\nCount: ${count}`);
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    const cli = Ros2CliService.getInstance();
    const subscribers = await cli.getTopicSubscribers(this.topicName);
    
    return subscribers.map(sub => new TopicEndpointItem({
      topicName: this.topicName,
      messageType: '',
      nodeName: sub.nodeName,
      nodeNamespace: sub.nodeNamespace,
    }, 'subscriber'));
  }
}

export class TopicEndpointItem extends TreeItemBase {
  constructor(
    private readonly endpoint: TopicEndpointInfo,
    type: 'publisher' | 'subscriber'
  ) {
    super(endpoint.nodeName || 'Unknown Node', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon(
      type === 'publisher' ? 'arrow-up' : 'arrow-down',
      type === 'publisher' ? new vscode.ThemeColor('charts.green') : new vscode.ThemeColor('charts.blue')
    );
    this.description = endpoint.nodeNamespace || '';
    this.tooltip = new vscode.MarkdownString(
      `**${type === 'publisher' ? 'Publisher' : 'Subscriber'}**\n\n` +
      `Node: ${endpoint.nodeName || 'Unknown'}\n` +
      `Namespace: ${endpoint.nodeNamespace || '/'}\n` +
      `Topic: ${endpoint.topicName}`
    );
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}

export class TopicFrequencyItem extends TreeItemBase {
  constructor(topicName: string, frequency?: number) {
    super('Frequency', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('pulse');
    this.description = frequency !== undefined ? `${frequency.toFixed(1)} Hz` : 'measuring...';
    
    let color = 'description.foreground';
    if (frequency !== undefined) {
      color = frequency > 10 ? 'charts.green' : frequency > 1 ? 'charts.yellow' : 'charts.red';
    }
    this.iconPath = new vscode.ThemeIcon('pulse', new vscode.ThemeColor(color));
    
    this.tooltip = new vscode.MarkdownString(
      `**Frequency**\n\nTopic: ${topicName}\n` +
      `Rate: ${frequency !== undefined ? frequency.toFixed(1) + ' Hz' : 'N/A'}`
    );
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}
