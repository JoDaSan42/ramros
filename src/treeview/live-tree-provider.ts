import * as vscode from 'vscode';
import { TreeItemBase, LiveFolderItem, LiveNodeItem, LiveTopicItem } from './tree-items';
import { Ros2CliService } from '../core/ros2-cli-service';

export class LiveTreeProvider implements vscode.TreeDataProvider<TreeItemBase> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItemBase | undefined | null | void> = new vscode.EventEmitter();
  readonly onDidChangeTreeData: vscode.Event<TreeItemBase | undefined | null | void> = this._onDidChangeTreeData.event;

  private autoRefreshInterval: NodeJS.Timeout | null = null;
  private refreshRate: number;
  private autoRefreshEnabled: boolean = true;
  private hideSystemTopics: boolean;
  private readonly cli = Ros2CliService.getInstance();

  private readonly SYSTEM_TOPICS = ['/parameter_events', '/rosout', '/clock'];

  constructor() {
    const config = vscode.workspace.getConfiguration('ramros.liveView');
    this.refreshRate = config.get<number>('refreshRate') || 5;
    this.hideSystemTopics = config.get<boolean>('hideSystemTopics', true);
    this.startAutoRefresh();
    
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('ramros.liveView.refreshRate')) {
        const newConfig = vscode.workspace.getConfiguration('ramros.liveView');
        this.refreshRate = newConfig.get<number>('refreshRate') || 5;
        this.startAutoRefresh();
        void vscode.window.showInformationMessage(`ROS2 Live view refresh rate updated to ${this.refreshRate} seconds`);
      } else if (e.affectsConfiguration('ramros.liveView.hideSystemTopics')) {
        const newConfig = vscode.workspace.getConfiguration('ramros.liveView');
        this.hideSystemTopics = newConfig.get<boolean>('hideSystemTopics', true);
        void this.refresh();
      }
    });
  }

  private isSystemTopic(topicName: string): boolean {
    return this.SYSTEM_TOPICS.includes(topicName);
  }

  isAutoRefreshEnabled(): boolean {
    return this.autoRefreshEnabled;
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
        this._onDidChangeTreeData.fire(null);
      }, this.refreshRate * 1000);
    }
  }

  async refresh(): Promise<void> {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: TreeItemBase): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: TreeItemBase): Promise<TreeItemBase[]> {
    if (!element) {
      return [
        new LiveFolderItem('Nodes', 'active-nodes'),
        new LiveFolderItem('Topics', 'active-topics')
      ];
    }

    if (element instanceof LiveFolderItem) {
      const folderType = element.getFolderType();
      
      if (folderType === 'active-nodes') {
        const nodes = this.getActiveNodes();
        return nodes.map(name => {
          const info = this.getNodeInfo(name);
          if (info) {
            return new LiveNodeItem(
              info.name,
              info.publishedTopics,
              info.subscribedTopics
            );
          }
          return new LiveNodeItem(name);
        });
      } else if (folderType === 'active-topics') {
        let topicNames = this.getActiveTopics();
        if (this.hideSystemTopics) {
          topicNames = topicNames.filter(name => !this.isSystemTopic(name));
        }
        return topicNames.map(name => {
          const info = this.getTopicInfo(name);
          if (info) {
            return new LiveTopicItem(
              info.name,
              info.messageType,
              info.publishers,
              info.subscribers
            );
          }
          return new LiveTopicItem(name);
        });
      }
    }

    return element.getChildren();
  }

  getParent?(): vscode.ProviderResult<TreeItemBase> {
    return null;
  }

  getActiveNodes(): string[] {
    return this.cli.getActiveNodes();
  }

  getActiveTopics(): string[] {
    return this.cli.getActiveTopics();
  }

  getTopicInfo(topicName: string): import('../core/ros2-cli-service').TopicInfo | null {
    return this.cli.getTopicInfo(topicName);
  }
   
  getNodeInfo(nodeName: string): import('../core/ros2-cli-service').NodeInfo | null {
    const info = this.cli.getNodeInfo(nodeName);
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
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }
}
