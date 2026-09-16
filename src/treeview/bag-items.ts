import * as vscode from 'vscode';
import * as path from 'path';
import { TreeItemBase } from './base-tree-item';
import { BagSessionService } from '../executor/bag-session-service';

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
    if (!isRecording) {
      BagSessionService.getInstance().setRecordingTerminal(null);
      BagSessionService.getInstance().setRecordingPaused(false);
    }
  }
  
  static getIsRecording(): boolean {
    return BagSessionService.getInstance().isRecording;
  }
  
  static get isPaused(): boolean {
    return BagSessionService.getInstance().isRecordingPaused;
  }
  
  updateToStopState(): void {
    const paused = BagRecordItem.isPaused;
    this.label = 'Recording...';
    this.iconPath = new vscode.ThemeIcon('record-small');
    this.description = paused ? '$(debug-pause) Paused' : '$(sync~spin) Active';
    this.tooltip = paused ? 'Recording paused' : 'Currently recording';
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
    BagSessionService.getInstance().setRecordingPaused(isPaused);
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
    BagSessionService.getInstance().setSelectedBagPath(filePath);
  }
  
  static getSelectedBag(): string | null {
    return BagSessionService.getInstance().selectedBagPath;
  }
  
  updateForSelectedBag(): void {
    const selected = BagSessionService.getInstance().selectedBagPath;
    if (selected) {
      this.description = path.basename(selected);
      this.tooltip = `Selected: ${selected}`;
    } else {
      this.description = '';
      this.tooltip = 'Select and open a bag file for playback';
    }
  }
}

export class BagPlayControlItem extends TreeItemBase {
  constructor() {
    super('▶️ Play', vscode.TreeItemCollapsibleState.None);
    this.updateLabelAndIcon();
    this.contextValue = 'bagPlayControl';
    this.command = { command: 'ramros.bag.playPause', title: 'Play/Pause' };
    this.tooltip = 'Start or pause bag playback';
  }
  
  updateLabelAndIcon(): void {
    const session = BagSessionService.getInstance();
    if (!session.isPlaying) {
      this.label = 'Play';
      this.iconPath = new vscode.ThemeIcon('play');
    } else if (session.isPlaybackPaused) {
      this.label = 'Resume';
      this.iconPath = new vscode.ThemeIcon('play');
    } else {
      this.label = 'Pause';
      this.iconPath = new vscode.ThemeIcon('debug-pause');
    }
  }
  
  static setPlayingState(_isPlaying: boolean, isPaused: boolean): void {
    BagSessionService.getInstance().setPlaybackPaused(isPaused);
  }
  
  static getIsPlaying(): boolean {
    return BagSessionService.getInstance().isPlaying;
  }
  
  static getIsPaused(): boolean {
    return BagSessionService.getInstance().isPlaybackPaused;
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
  constructor() {
    super('Loop: Off', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('discard');
    this.contextValue = 'bagLoop';
    this.command = { command: 'ramros.bag.toggleLoop', title: 'Toggle Loop' };
    this.tooltip = 'Enable or disable looping playback';
    this.updateLabel();
  }
  
  static setLoopingState(isLooping: boolean): void {
    BagSessionService.getInstance().setPlaybackLooping(isLooping);
  }
  
  static getIsLooping(): boolean {
    return BagSessionService.getInstance().isPlaybackLooping;
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
