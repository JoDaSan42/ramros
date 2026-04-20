import * as vscode from 'vscode';
import { TreeItemBase, LiveFolderItem, LiveNodeItem, LiveTopicItem } from './tree-items';
import { execSync } from 'child_process';

export class LiveTreeProvider implements vscode.TreeDataProvider<TreeItemBase> {
  private _onDidChangeTreeData: vscode.EventEmitter<TreeItemBase | undefined | null | void> = new vscode.EventEmitter();
  readonly onDidChangeTreeData: vscode.Event<TreeItemBase | undefined | null | void> = this._onDidChangeTreeData.event;

  private monitoredTopics: Map<string, NodeJS.Timeout> = new Map();
  private topicHzRates: Map<string, number> = new Map();
  private autoRefreshInterval: NodeJS.Timeout | null = null;
  private refreshRate: number;

  constructor() {
    const config = vscode.workspace.getConfiguration('ramros.liveView');
    this.refreshRate = config.get<number>('refreshRate') || 5;
    this.startAutoRefresh();
    
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('ramros.liveView.refreshRate')) {
        const newConfig = vscode.workspace.getConfiguration('ramros.liveView');
        this.refreshRate = newConfig.get<number>('refreshRate') || 5;
        this.startAutoRefresh();
        void vscode.window.showInformationMessage(`ROS2 Live view refresh rate updated to ${this.refreshRate} seconds`);
      }
    });
  }

  private startAutoRefresh(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }
    this.autoRefreshInterval = setInterval(() => {
      this._onDidChangeTreeData.fire(undefined);
    }, this.refreshRate * 1000);
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
        return nodes.map(name => new LiveNodeItem(name));
      } else if (folderType === 'active-topics') {
        const topics = this.getActiveTopics();
        return topics.map(name => new LiveTopicItem(name, this.topicHzRates.get(name)));
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

  startMonitoringTopic(topicName: string): void {
    if (this.monitoredTopics.has(topicName)) {
      return;
    }

    const interval = setInterval(() => {
      this.measureTopicHz(topicName);
    }, 2000);

    this.monitoredTopics.set(topicName, interval);
    this.measureTopicHz(topicName);
  }

  stopMonitoringTopic(topicName: string): void {
    const interval = this.monitoredTopics.get(topicName);
    if (interval) {
      clearInterval(interval);
      this.monitoredTopics.delete(topicName);
      this.topicHzRates.delete(topicName);
      this._onDidChangeTreeData.fire(undefined);
    }
  }

  isMonitoring(topicName: string): boolean {
    return this.monitoredTopics.has(topicName);
  }

  getHzRate(topicName: string): number | undefined {
    return this.topicHzRates.get(topicName);
  }

  private measureTopicHz(topicName: string): void {
    try {
      const output = execSync(`ros2 topic hz ${topicName} --window 2`, { 
        encoding: 'utf-8', 
        timeout: 3000,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      const lines = output.split('\n');
      for (const line of lines) {
        if (line.includes('average rate:')) {
          const match = line.match(/average rate:\s+([\d.]+)/);
          if (match && match[1]) {
            const hz = parseFloat(match[1]);
            this.topicHzRates.set(topicName, hz);
            this._onDidChangeTreeData.fire(undefined);
            break;
          }
        }
      }
    } catch (error) {
      console.error(`Failed to measure Hz for topic ${topicName}`, error);
    }
  }

  dispose(): void {
    for (const interval of this.monitoredTopics.values()) {
      clearInterval(interval);
    }
    this.monitoredTopics.clear();
    this.topicHzRates.clear();
    
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }
}
