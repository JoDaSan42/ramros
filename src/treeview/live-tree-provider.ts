import * as vscode from 'vscode';
import { TreeItemBase, LiveFolderItem, LiveNodeItem, LiveTopicItem } from './tree-items';
import { execSync } from 'child_process';

interface TopicInfo {
  name: string;
  messageType: string;
  publishers: string[];
  subscribers: string[];
}

interface NodeInfo {
  name: string;
  publishedTopics: string[];
  subscribedTopics: string[];
}

export class LiveTreeProvider implements vscode.TreeDataProvider<TreeItemBase> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItemBase | undefined | null | void> = new vscode.EventEmitter();
  readonly onDidChangeTreeData: vscode.Event<TreeItemBase | undefined | null | void> = this._onDidChangeTreeData.event;

  private autoRefreshInterval: NodeJS.Timeout | null = null;
  private refreshRate: number;
  private autoRefreshEnabled: boolean = true;
  private hideSystemTopics: boolean;

  private readonly SYSTEM_TOPICS = ['/parameter_events', '/rosout'];

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
        this.refresh();
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

  private executeCommand(command: string): string[] {
    try {
      const output = execSync(command, { encoding: 'utf-8', timeout: 5000 });
      return output.split('\n').filter(line => line.trim().length > 0);
    } catch (error) {
      console.error(`Failed to execute command: ${command}`, error);
      return [];
    }
  }

  getActiveNodes(): string[] {
    return this.executeCommand('ros2 node list');
  }

  getActiveTopics(): string[] {
    return this.executeCommand('ros2 topic list');
  }

  getTopicInfo(topicName: string): TopicInfo | null {
    try {
      const output = execSync(`ros2 topic info ${topicName} --verbose`, { encoding: 'utf-8', timeout: 5000 });
      const lines = output.split('\n');
      
      let messageType = '';
      const publishers: string[] = [];
      const subscribers: string[] = [];
      
      let section: 'none' | 'publishers' | 'subscribers' = 'none';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine.startsWith('Type:')) {
          const match = trimmedLine.match(/Type:\s+(.+)/);
          if (match && match[1]) {
            messageType = match[1].trim();
          }
        } else if (trimmedLine.startsWith('Publisher count:')) {
          section = 'publishers';
          continue;
        } else if (trimmedLine.startsWith('Subscription count:')) {
          section = 'subscribers';
          continue;
        } else if (trimmedLine.startsWith('Node name:') && section === 'publishers') {
          const nodeName = trimmedLine.replace('Node name:', '').trim();
          if (nodeName) {
            publishers.push(nodeName);
          }
        } else if (trimmedLine.startsWith('Node name:') && section === 'subscribers') {
          const nodeName = trimmedLine.replace('Node name:', '').trim();
          if (nodeName) {
            subscribers.push(nodeName);
          }
        } else if (trimmedLine.startsWith('Endpoint type:')) {
          continue;
        } else if (trimmedLine === '') {
          continue;
        }
      }
      
      return {
        name: topicName,
        messageType,
        publishers,
        subscribers
      };
    } catch (error) {
      console.error(`Failed to get info for topic ${topicName}`, error);
      return null;
    }
  }
  
  getNodeInfo(nodeName: string): NodeInfo | null {
    try {
      let publishedTopics: string[] = [];
      let subscribedTopics: string[] = [];
      
      const output = execSync(`ros2 node info ${nodeName}`, { encoding: 'utf-8', timeout: 5000 });
      const lines = output.split('\n');
      
      let section: 'none' | 'subscribers' | 'publishers' = 'none';
      
      for (const line of lines) {
        const trimmedLine = line.trim();
        
        if (trimmedLine === 'Subscribers:') {
          section = 'subscribers';
          continue;
        } else if (trimmedLine === 'Publishers:') {
          section = 'publishers';
          continue;
        } else if (trimmedLine === 'Service Servers:' || trimmedLine === 'Service Clients:' || trimmedLine === 'Action Servers:' || trimmedLine === 'Action Clients:') {
          section = 'none';
          continue;
        } else if (section !== 'none' && trimmedLine.startsWith('/')) {
          const topicName = trimmedLine.split(':')[0].trim();
          if (topicName) {
            if (section === 'publishers') {
              publishedTopics.push(topicName);
            } else if (section === 'subscribers') {
              subscribedTopics.push(topicName);
            }
          }
        }
      }
      
      if (this.hideSystemTopics) {
        publishedTopics = publishedTopics.filter(name => !this.isSystemTopic(name));
        subscribedTopics = subscribedTopics.filter(name => !this.isSystemTopic(name));
      }
      
      return {
        name: nodeName,
        publishedTopics,
        subscribedTopics
      };
    } catch (error) {
      console.error(`Failed to get info for node ${nodeName}`, error);
      return null;
    }
  }

  dispose(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }
}
