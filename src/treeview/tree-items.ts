import * as vscode from 'vscode';
import * as path from 'path';
import { WorkspaceInfo } from '../core/workspace-detector';
import { PackageConflict } from '../core/duplicate-package-detector';
import { PackageInfo, NodeInfo, InterfaceInfo, LaunchFileInfo, ParameterInfo, TopicEndpointInfo } from '../core/package-discovery';
import { execSync } from 'child_process';

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
      new ToolItem('rqt_graph', 'rqt_graph', 'git-compare'),
      new BagFilesFolderItem()
    ];
  }
}

export class BagFilesFolderItem extends TreeItemBase {
  private static bagInfoItemInstance: BagInfoItem | null = null;
  private static loopItemInstance: BagLoopItem | null = null;
  private static playControlItemInstance: BagPlayControlItem | null = null;
  
  constructor() {
    super('Bag Files', vscode.TreeItemCollapsibleState.Expanded);
    this.iconPath = new vscode.ThemeIcon('archive');
    this.contextValue = 'bagFilesFolder';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    const items: TreeItemBase[] = [
      new SeparatorItem('Recording')
    ];
    
    if (BagRecordItem.getIsRecording()) {
      const pauseResumeItem = new BagPauseResumeRecordingItem();
      if (BagRecordItem.isPaused) {
        pauseResumeItem.updateToResumeState();
      } else {
        pauseResumeItem.updateToPauseState();
      }
      items.push(pauseResumeItem);
      items.push(new BagStopRecordingItem());
    } else {
      items.push(new BagRecordItem());
    }
    
    items.push(new SeparatorItem('Playback'));
    items.push(new BagPlayItem());
    
    // Add Play/Pause control when bag is selected
    if (BagPlayItem.getSelectedBag()) {
      if (!BagFilesFolderItem.playControlItemInstance) {
        BagFilesFolderItem.playControlItemInstance = new BagPlayControlItem();
      }
      BagFilesFolderItem.playControlItemInstance.updateLabelAndIcon();
      items.push(BagFilesFolderItem.playControlItemInstance);
      
      // Add stop control when playing
      if (BagPlayControlItem.getIsPlaying()) {
        items.push(new BagStopItem());
      }
    }
    
    // Create or reuse the Loop item and update its label
    if (!BagFilesFolderItem.loopItemInstance) {
      BagFilesFolderItem.loopItemInstance = new BagLoopItem();
    }
    BagFilesFolderItem.loopItemInstance.updateLabel();
    items.push(BagFilesFolderItem.loopItemInstance);
    
    // Create or reuse the BagInfoItem
    if (!BagFilesFolderItem.bagInfoItemInstance) {
      BagFilesFolderItem.bagInfoItemInstance = new BagInfoItem();
    }
    items.push(BagFilesFolderItem.bagInfoItemInstance);
    
    return items;
  }
  
  static resetInstances(): void {
    BagFilesFolderItem.bagInfoItemInstance = null;
    BagFilesFolderItem.loopItemInstance = null;
    BagFilesFolderItem.playControlItemInstance = null;
  }
  
  static getBagInfoItem(): BagInfoItem | null {
    return BagFilesFolderItem.bagInfoItemInstance;
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

export class BagRecordItem extends TreeItemBase {
  private static isRecording: boolean = false;
  public static isPaused: boolean = false;
  
  constructor() {
    super('Start Recording', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('record');
    this.contextValue = 'bagRecord';
    this.command = { command: 'ramros.bag.startRecording', title: 'Start Recording' };
    this.tooltip = 'Start recording a rosbag file';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
  
  static setRecordingState(isRecording: boolean): void {
    BagRecordItem.isRecording = isRecording;
  }
  
  static getIsRecording(): boolean {
    return BagRecordItem.isRecording;
  }
  
  updateToStopState(): void {
    this.label = 'Recording...';
    this.iconPath = new vscode.ThemeIcon('record-small');
    this.description = BagRecordItem.isPaused ? '$(debug-pause) Paused' : '$(sync~spin) Active';
    this.tooltip = BagRecordItem.isPaused ? 'Recording paused' : 'Currently recording';
    this.command = undefined;
  }
  
  resetToStartState(): void {
    this.label = 'Start Recording';
    this.description = '';
    this.iconPath = new vscode.ThemeIcon('record');
    this.command = { command: 'ramros.bag.startRecording', title: 'Start Recording' };
    this.tooltip = 'Start recording a rosbag file';
  }
  
  static setPausedState(isPaused: boolean): void {
    BagRecordItem.isPaused = isPaused;
  }
}

export class BagPauseResumeRecordingItem extends TreeItemBase {
  constructor() {
    super('Pause Recording', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('debug-pause');
    this.contextValue = 'bagPauseResumeRecording';
    this.command = { command: 'ramros.bag.pauseResumeRecording', title: 'Pause/Resume Recording' };
    this.tooltip = 'Pause or resume the current recording';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
  
  updateToResumeState(): void {
    this.label = 'Resume Recording';
    this.iconPath = new vscode.ThemeIcon('play');
  }
  
  updateToPauseState(): void {
    this.label = 'Pause Recording';
    this.iconPath = new vscode.ThemeIcon('debug-pause');
  }
}

export class BagStopRecordingItem extends TreeItemBase {
  constructor() {
    super('Stop Recording', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('stop');
    this.contextValue = 'bagStopRecording';
    this.command = { command: 'ramros.bag.stopRecording', title: 'Stop Recording' };
    this.tooltip = 'Stop the current recording';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}

export class BagPlayItem extends TreeItemBase {
  private static selectedBagFile: string | null = null;
  
  constructor() {
    super('Open Bag File', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('folder-opened');
    this.contextValue = 'bagPlay';
    this.command = { command: 'ramros.bag.selectFile', title: 'Select Bag File' };
    this.tooltip = 'Select and open a bag file for playback';
    this.updateForSelectedBag();
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
  
  static setSelectedBag(filePath: string | null): void {
    BagPlayItem.selectedBagFile = filePath;
  }
  
  static getSelectedBag(): string | null {
    return BagPlayItem.selectedBagFile;
  }
  
  updateForSelectedBag(): void {
    if (BagPlayItem.selectedBagFile) {
      this.description = path.basename(BagPlayItem.selectedBagFile);
      this.tooltip = `Selected: ${BagPlayItem.selectedBagFile}`;
    } else {
      this.description = '';
      this.tooltip = 'Select and open a bag file for playback';
    }
  }
}

export class BagPlayControlItem extends TreeItemBase {
  private static isPlaying: boolean = false;
  private static isPaused: boolean = false;
  
  constructor() {
    super('▶️ Play', vscode.TreeItemCollapsibleState.None);
    this.updateLabelAndIcon();
    this.contextValue = 'bagPlayControl';
    this.command = { command: 'ramros.bag.playPause', title: 'Play/Pause' };
    this.tooltip = 'Start or pause bag playback';
  }
  
  updateLabelAndIcon(): void {
    if (!BagPlayControlItem.isPlaying) {
      this.label = 'Play';
      this.iconPath = new vscode.ThemeIcon('play');
    } else if (BagPlayControlItem.isPaused) {
      this.label = 'Resume';
      this.iconPath = new vscode.ThemeIcon('play');
    } else {
      this.label = 'Pause';
      this.iconPath = new vscode.ThemeIcon('debug-pause');
    }
  }
  
  static setPlayingState(isPlaying: boolean, isPaused: boolean): void {
    BagPlayControlItem.isPlaying = isPlaying;
    BagPlayControlItem.isPaused = isPaused;
  }
  
  static getIsPlaying(): boolean {
    return BagPlayControlItem.isPlaying;
  }
  
  static getIsPaused(): boolean {
    return BagPlayControlItem.isPaused;
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}

export class BagStopItem extends TreeItemBase {
  constructor() {
    super('Stop', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('stop');
    this.contextValue = 'bagStopControl';
    this.command = { command: 'ramros.bag.stop', title: 'Stop Playback' };
    this.tooltip = 'Stop bag playback';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}

export class BagPauseResumePlaybackItem extends TreeItemBase {
  constructor() {
    super('Pause', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('debug-pause');
    this.contextValue = 'bagPauseResumePlayback';
    this.command = { command: 'ramros.bag.playPause', title: 'Pause/Resume Playback' };
    this.tooltip = 'Pause or resume the current playback';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
  
  updateToResumeState(): void {
    this.label = 'Resume';
    this.iconPath = new vscode.ThemeIcon('play');
  }
  
  updateToPauseState(): void {
    this.label = 'Pause';
    this.iconPath = new vscode.ThemeIcon('debug-pause');
  }
}

export class BagLoopItem extends TreeItemBase {
  private static isLooping: boolean = false;
  
  constructor() {
    super('Loop: Off', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('discard');
    this.contextValue = 'bagLoop';
    this.command = { command: 'ramros.bag.toggleLoop', title: 'Toggle Loop' };
    this.tooltip = 'Enable or disable looping playback';
    this.updateLabel();
  }
  
  static setLoopingState(isLooping: boolean): void {
    BagLoopItem.isLooping = isLooping;
  }
  
  static getIsLooping(): boolean {
    return BagLoopItem.isLooping;
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
  
  updateLabel(): void {
    const isLooping = BagLoopItem.getIsLooping();
    this.label = isLooping ? 'Loop: On' : 'Loop: Off';
    this.iconPath = new vscode.ThemeIcon(isLooping ? 'refresh' : 'arrow-right');
    this.description = '';
  }
}

export class BagInfoItem extends TreeItemBase {
  private infoText: string = 'No bag file selected';
  private bagFilePath: string | null = null;
  
  constructor() {
    super('Bag Info', vscode.TreeItemCollapsibleState.Collapsed);
    this.iconPath = new vscode.ThemeIcon('info');
    this.contextValue = 'bagInfo';
    this.tooltip = 'Information about the selected bag file';
  }
  
  setInfo(info: string, bagPath: string): void {
    this.bagFilePath = bagPath;
    this.infoText = info;
    this.description = path.basename(bagPath);
  }
  
  clearInfo(): void {
    this.bagFilePath = null;
    this.infoText = 'No bag file selected';
    this.description = '';
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    if (!this.bagFilePath) {
      return [new BagInfoLineItem('No bag file selected')];
    }
    
    // First item is always the bag file path
    const children: BagInfoLineItem[] = [
      new BagInfoLineItem(`📦 ${this.bagFilePath}`, true)
    ];
    
    // Then add parsed info lines
    if (this.infoText && this.infoText !== 'No bag file selected') {
      const lines = this.infoText.split('\n').filter(line => line.trim().length > 0);
      for (const line of lines) {
        children.push(new BagInfoLineItem(line));
      }
    }
    
    return children;
  }
}

export class BagInfoLineItem extends TreeItemBase {
  constructor(text: string, isHeader: boolean = false) {
    super(text, vscode.TreeItemCollapsibleState.None);
    this.iconPath = isHeader ? new vscode.ThemeIcon('archive') : undefined;
    this.contextValue = 'bagInfoLine';
    if (isHeader) {
      this.resourceUri = vscode.Uri.file(text);
    }
  }
  
  async getChildren(): Promise<TreeItemBase[]> {
    return [];
  }
}

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
    const publishers: TopicEndpointInfo[] = [];
    try {
      const output = execSync(`ros2 topic info ${this.topicName} --verbose`, { encoding: 'utf-8', timeout: 5000 });
      const lines = output.split('\n');
      let section: 'none' | 'publishers' | 'subscribers' = 'none';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine.startsWith('Publisher count:')) {
          section = 'publishers';
          continue;
        } else if (trimmedLine.startsWith('Subscription count:')) {
          section = 'subscribers';
          continue;
        } else if (section === 'publishers' && trimmedLine.startsWith('Node name:')) {
          const nodeName = trimmedLine.replace('Node name:', '').trim();
          if (nodeName) {
            publishers.push({
              topicName: this.topicName,
              messageType: '',
              nodeName: nodeName,
              nodeNamespace: ''
            });
          }
        }
      }
    } catch (error) {
      console.error(`Failed to get publishers for ${this.topicName}`, error);
    }
    
    return publishers.map(pub => new TopicEndpointItem(pub, 'publisher'));
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
    const subscribers: TopicEndpointInfo[] = [];
    try {
      const output = execSync(`ros2 topic info ${this.topicName} --verbose`, { encoding: 'utf-8', timeout: 5000 });
      const lines = output.split('\n');
      let section: 'none' | 'publishers' | 'subscribers' = 'none';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine.startsWith('Publisher count:')) {
          section = 'publishers';
          continue;
        } else if (trimmedLine.startsWith('Subscription count:')) {
          section = 'subscribers';
          continue;
        } else if (section === 'subscribers' && trimmedLine.startsWith('Node name:')) {
          const nodeName = trimmedLine.replace('Node name:', '').trim();
          if (nodeName) {
            subscribers.push({
              topicName: this.topicName,
              messageType: '',
              nodeName: nodeName,
              nodeNamespace: ''
            });
          }
        }
      }
    } catch (error) {
      console.error(`Failed to get subscribers for ${this.topicName}`, error);
    }
    
    return subscribers.map(sub => new TopicEndpointItem(sub, 'subscriber'));
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
