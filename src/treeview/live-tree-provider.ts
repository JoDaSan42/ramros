import * as vscode from 'vscode';
import { TreeItemBase } from './base-tree-item';
import { LiveFolderItem, LiveNodeItem, LiveTopicItem, LiveViewDisabledItem } from './live-items';
import { Ros2CliService, NodeInfo, TopicInfo } from '../core/ros2-cli-service';
import { LiveInfoCache } from '../core/live-info-cache';
import { WorkspaceConfigService } from '../core/workspace-config-service';

export class LiveTreeProvider implements vscode.TreeDataProvider<TreeItemBase> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItemBase | undefined | null | void> = new vscode.EventEmitter();
  readonly onDidChangeTreeData: vscode.Event<TreeItemBase | undefined | null | void> = this._onDidChangeTreeData.event;

  private autoRefreshInterval: NodeJS.Timeout | null = null;
  private refreshRate: number;
  private configRefreshRate?: number;
  private enabled: boolean = true;
  private autoRefreshEnabled: boolean = true;
  private disposed: boolean = false;
  private hideSystemTopics: boolean;
  private readonly cli = Ros2CliService.getInstance();
  private readonly nodeInfoCache = new LiveInfoCache<NodeInfo | null>();
  private readonly topicInfoCache = new LiveInfoCache<TopicInfo | null>();

  private readonly SYSTEM_TOPICS = ['/parameter_events', '/rosout', '/clock'];

  constructor(private readonly configService?: WorkspaceConfigService) {
    const config = vscode.workspace.getConfiguration('ramros.liveView');
    this.refreshRate = config.get<number>('refreshRate') || 5;
    this.hideSystemTopics = config.get<boolean>('hideSystemTopics', true);
    this.startAutoRefresh();
    
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('ramros.liveView.refreshRate')) {
        const newConfig = vscode.workspace.getConfiguration('ramros.liveView');
        this.refreshRate = newConfig.get<number>('refreshRate') || 5;
        if (this.configRefreshRate !== undefined) {
          void vscode.window.showInformationMessage('ramros.json overrides the refresh rate');
        } else {
          this.startAutoRefresh();
          void vscode.window.showInformationMessage(`ROS2 Live view refresh rate updated to ${this.refreshRate} seconds`);
        }
      } else if (e.affectsConfiguration('ramros.liveView.hideSystemTopics')) {
        const newConfig = vscode.workspace.getConfiguration('ramros.liveView');
        this.hideSystemTopics = newConfig.get<boolean>('hideSystemTopics', true);
        void this.refresh();
      }
    });

    if (this.configService) {
      void this.reloadFromWorkspaceConfig();
    }
  }

  private isSystemTopic(topicName: string): boolean {
    return this.SYSTEM_TOPICS.includes(topicName);
  }

  isAutoRefreshEnabled(): boolean {
    return this.autoRefreshEnabled;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    this.enabled = enabled;
    this.setAutoRefresh(enabled);
    if (this.configService) {
      await this.configService.setLiveViewConfig({ enabled });
    }
    this._onDidChangeTreeData.fire(null);
  }

  async reloadFromWorkspaceConfig(): Promise<void> {
    if (!this.configService || this.disposed) {
      return;
    }
    const liveViewConfig = await this.configService.getLiveViewConfig();
    if (this.disposed) {
      return;
    }
    const liveViewEnabled = liveViewConfig.enabled;
    if (liveViewEnabled !== undefined) {
      this.enabled = liveViewEnabled;
      this.setAutoRefresh(liveViewEnabled);
    }
    if (liveViewConfig.refreshRate !== undefined && liveViewConfig.refreshRate > 0) {
      this.configRefreshRate = liveViewConfig.refreshRate;
    } else {
      this.configRefreshRate = undefined;
    }
    this.startAutoRefresh();
    this._onDidChangeTreeData.fire(null);
  }

  getEffectiveRefreshRate(): number {
    return this.configRefreshRate ?? this.refreshRate;
  }

  setAutoRefresh(enabled: boolean): void {
    this.autoRefreshEnabled = enabled;
    if (this.autoRefreshEnabled) {
      this.startAutoRefresh();
    } else {
      if (this.autoRefreshInterval) {
        clearInterval(this.autoRefreshInterval);
        this.autoRefreshInterval = null;
      }
    }
  }

  openSettings(): void {
    void vscode.commands.executeCommand('workbench.action.openSettings', 'ramros.liveView');
  }

  private startAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }
    if (this.autoRefreshEnabled) {
      this.autoRefreshInterval = setInterval(() => {
        this.tick();
      }, this.getEffectiveRefreshRate() * 1000);
    }
  }

  /**
   * One auto-refresh tick: lazy info caches are only valid until the next
   * tick, so they are cleared before the tree re-reads its folders.
   */
  tick(): void {
    this.nodeInfoCache.newTick();
    this.topicInfoCache.newTick();
    this._onDidChangeTreeData.fire(null);
  }

  async refresh(): Promise<void> {
    this.tick();
  }

  /**
   * Lazily loads node info on expand: fetches once per tick (cache hit skips
   * the call), applies it to the item and — only after a real fetch — fires
   * for that element so VSCode re-renders the updated description.
   */
  async ensureNodeExpanded(item: LiveNodeItem): Promise<void> {
    if (this.disposed) {
      return;
    }
    const name = item.getNodeName();
    let info = this.nodeInfoCache.get(name);
    let fetched = false;
    if (info === undefined) {
      info = await this.getNodeInfo(name);
      this.nodeInfoCache.set(name, info);
      fetched = true;
    }
    item.applyInfo(info ?? {});
    if (fetched) {
      this._onDidChangeTreeData.fire(item);
    }
  }

  /**
   * Lazily loads topic info on expand. See ensureNodeExpanded.
   */
  async ensureTopicExpanded(item: LiveTopicItem): Promise<void> {
    if (this.disposed) {
      return;
    }
    const name = item.getTopicName();
    let info = this.topicInfoCache.get(name);
    let fetched = false;
    if (info === undefined) {
      info = await this.getTopicInfo(name);
      this.topicInfoCache.set(name, info);
      fetched = true;
    }
    item.applyInfo(info ?? {});
    if (fetched) {
      this._onDidChangeTreeData.fire(item);
    }
  }

  getTreeItem(element: TreeItemBase): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItemBase): Promise<TreeItemBase[]> {
    if (!element) {
      if (!this.isEnabled()) {
        return [new LiveViewDisabledItem()];
      }
      return [
        new LiveFolderItem('Nodes', 'active-nodes'),
        new LiveFolderItem('Topics', 'active-topics')
      ];
    }

    if (element instanceof LiveFolderItem) {
      const folderType = element.getFolderType();

      if (folderType === 'active-nodes') {
        const nodes = await this.getActiveNodes();
        // Lazy: items are name-only here; info loads on expand
        // (ensureNodeExpanded) and is cached until the next tick.
        return nodes.map(name => new LiveNodeItem(name));
      } else if (folderType === 'active-topics') {
        let topicNames = await this.getActiveTopics();
        if (this.hideSystemTopics) {
          topicNames = topicNames.filter(name => !this.isSystemTopic(name));
        }
        return topicNames.map(name => new LiveTopicItem(name));
      }
    }

    // If VSCode expands (or re-reads) a name-only item, trigger the lazy
    // info fetch. The per-element fire updates the description once the
    // info arrives; repeated re-reads within a tick are cache hits.
    if (element instanceof LiveNodeItem) {
      void this.ensureNodeExpanded(element);
    } else if (element instanceof LiveTopicItem) {
      void this.ensureTopicExpanded(element);
    }

    return element.getChildren();
  }

  getParent?(): vscode.ProviderResult<TreeItemBase> {
    return null;
  }

  async getActiveNodes(): Promise<string[]> {
    return this.cli.getActiveNodes();
  }

  async getActiveTopics(): Promise<string[]> {
    return this.cli.getActiveTopics();
  }

  async getTopicInfo(topicName: string): Promise<import('../core/ros2-cli-service').TopicInfo | null> {
    return this.cli.getTopicInfo(topicName);
  }
   
  async getNodeInfo(nodeName: string): Promise<import('../core/ros2-cli-service').NodeInfo | null> {
    const info = await this.cli.getNodeInfo(nodeName);
    if (!info) {
      return null;
    }

    if (this.hideSystemTopics) {
      return {
        ...info,
        publishedTopics: info.publishedTopics.filter(name => !this.isSystemTopic(name)),
        subscribedTopics: info.subscribedTopics.filter(name => !this.isSystemTopic(name)),
      };
    }

    return info;
  }

  dispose(): void {
    this.disposed = true;
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }
}
