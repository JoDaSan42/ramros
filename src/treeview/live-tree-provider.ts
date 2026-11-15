import * as vscode from 'vscode';
import { TreeItemBase } from './base-tree-item';
import { LiveFolderItem, LiveNodeItem, LiveTopicItem, LiveViewDisabledItem, LiveDomainGroupItem } from './live-items';
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

  // Stable-item state (anti-flicker): items are created once per name and
  // reused across ticks, so VSCode keeps expansion state and re-renders
  // without flicker. Full refreshes fire only on actual list changes.
  // Items are keyed by `domain|name` so the same entity name in two domain
  // groups gets two independent items (and two independent info states).
  private readonly nodeItems = new Map<string, LiveNodeItem>();
  private readonly topicItems = new Map<string, LiveTopicItem>();
  private readonly expandedNodes = new Set<LiveNodeItem>();
  private readonly expandedTopics = new Set<LiveTopicItem>();
  private readonly nodeInfoSignature = new Map<string, string>();
  private readonly topicInfoSignature = new Map<string, string>();
  private lastNodeNames: string[] | null = null;
  private lastTopicNames: string[] | null = null;
  private readonly lastDomainLists = new Map<number, { nodes: string[]; topics: string[] }>();
  private readonly nodesFolder = new LiveFolderItem('Nodes', 'active-nodes');
  private readonly topicsFolder = new LiveFolderItem('Topics', 'active-topics');
  private domainGroups: number[] = [];
  private readonly domainGroupItems = new Map<string, LiveDomainGroupItem>();

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
        void this.tick();
      }, this.getEffectiveRefreshRate() * 1000);
    }
  }

  /**
   * One auto-refresh tick: fetches the node/topic lists, fires a full refresh
   * only when a list changed, and refreshes info for expanded items with a
   * per-element fire only when the info actually changed. Collapsed items are
   * not fetched (call budget stays at the expanded items).
   */
  async tick(): Promise<void> {
    if (this.disposed) {
      return;
    }

    // Lazy info caches are only valid until the next tick, so they are
    // cleared before anything else (re-expansion after a tick refetches).
    this.nodeInfoCache.newTick();
    this.topicInfoCache.newTick();

    // Domain-grouped view: change detection runs per domain (a change in any
    // group's list fires the full refresh); the flat environment lists are
    // not rendered in this mode.
    if (this.domainGroups.length > 0) {
      await this.tickGrouped();
      return;
    }

    // 1) Detect list changes (this is what a full refresh is for).
    const nodeNames = await this.getActiveNodes();
    let topicNames = await this.getActiveTopics();
    if (this.hideSystemTopics) {
      topicNames = topicNames.filter(name => !this.isSystemTopic(name));
    }

    const haveBaseline = this.lastNodeNames !== null || this.lastTopicNames !== null;
    const listChanged = haveBaseline &&
      (!listsEqual(this.lastNodeNames ?? [], nodeNames) ||
        !listsEqual(this.lastTopicNames ?? [], topicNames));

    this.lastNodeNames = nodeNames;
    this.lastTopicNames = topicNames;
    this.pruneStaleState(nodeNames, topicNames);

    // 2) Refresh info for expanded items (fresh data each tick), firing per
    // element only when the info actually changed.
    await Promise.all([
      ...[...this.expandedNodes].map(item => this.refreshExpandedNode(item)),
      ...[...this.expandedTopics].map(item => this.refreshExpandedTopic(item)),
    ]);

    // 3) Full refresh (rebuild) only when a list actually changed. VSCode
    // re-reads everything, but items are stable instances, so expansion
    // state is preserved and the re-render is not a flicker.
    if (listChanged) {
      this._onDidChangeTreeData.fire(null);
    }
  }

  /**
   * Auto-refresh tick for the domain-grouped view: change detection per
   * domain (a change in any group's node or topic list fires one full
   * refresh), then fresh info for expanded domain-scoped items.
   */
  private async tickGrouped(): Promise<void> {
    let listChanged = false;
    await Promise.all(this.domainGroups.map(async domainId => {
      const [nodes, topics] = await Promise.all([
        this.cli.getActiveNodesForDomain(domainId),
        this.cli.getActiveTopicsForDomain(domainId)
      ]);
      const filteredTopics = this.hideSystemTopics
        ? topics.filter(name => !this.isSystemTopic(name))
        : topics;
      const previous = this.lastDomainLists.get(domainId);
      if (previous &&
          (!listsEqual(previous.nodes, nodes) || !listsEqual(previous.topics, filteredTopics))) {
        listChanged = true;
      }
      this.lastDomainLists.set(domainId, { nodes, topics: filteredTopics });
      this.pruneDomainItemsForList(domainId, nodes, filteredTopics);
    }));

    await Promise.all([
      ...[...this.expandedNodes].map(item => this.refreshExpandedNode(item)),
      ...[...this.expandedTopics].map(item => this.refreshExpandedTopic(item)),
    ]);

    if (listChanged) {
      this._onDidChangeTreeData.fire(null);
    }
  }

  async refresh(): Promise<void> {
    await this.tick();
  }

  /**
   * Removes an item from the expanded set (VSCode collapsed it): ticks stop
   * fetching info for it until it is expanded again.
   */
  markCollapsed(item: LiveNodeItem | LiveTopicItem | LiveDomainGroupItem): void {
    if (item instanceof LiveNodeItem) {
      this.expandedNodes.delete(item);
    } else if (item instanceof LiveTopicItem) {
      this.expandedTopics.delete(item);
    }
    // LiveDomainGroupItem: its members are refreshed lazily via the group's
    // own list call; no per-item expanded tracking beyond that.
  }

  /**
   * Configures the multi-domain live view groups (from the
   * ramros.liveView.domainIds setting). Empty list = flat environment view.
   * Domain-scoped items from removed groups are dropped so their next
   * rendering rebuilds with the new grouping.
   */
  setDomainGroups(domainIds: number[]): void {
    this.domainGroups = [...domainIds];
    this.pruneDomainScopedItems();
    this._onDidChangeTreeData.fire(null);
  }

  /** Domain ids currently configured for the grouped live view. */
  getDomainGroups(): number[] {
    return [...this.domainGroups];
  }

  /**
   * Stable group item per (domain, kind) pair.
   */
  private getOrCreateDomainGroup(domainId: number, kind: 'nodes' | 'topics'): LiveDomainGroupItem {
    const key = `${kind}:${domainId}`;
    let item = this.domainGroupItems.get(key);
    if (!item) {
      item = new LiveDomainGroupItem(`${kind === 'nodes' ? 'Nodes' : 'Topics'} (domain ${domainId})`, domainId, kind);
      this.domainGroupItems.set(key, item);
    }
    return item;
  }

  /**
   * Members of a domain group: regular node/topic items fetched with the
   * group's domain env (independent of the global default). The items carry
   * the group's domain so their info fetches query the same domain.
   */
  private async getDomainGroupChildren(group: LiveDomainGroupItem): Promise<TreeItemBase[]> {
    const domainId = group.getDomainId();
    if (group.getGroupKind() === 'nodes') {
      const names = await this.cli.getActiveNodesForDomain(domainId);
      return names.map(name => this.getOrCreateNodeItem(name, domainId));
    }
    let topicNames = await this.cli.getActiveTopicsForDomain(domainId);
    if (this.hideSystemTopics) {
      topicNames = topicNames.filter(name => !this.isSystemTopic(name));
    }
    return topicNames.map(name => this.getOrCreateTopicItem(name, domainId));
  }

  /**
   * Tick-time info refresh for an expanded node: fetch fresh info, apply it,
   * and fire for the element only when its visible info changed. Domain
   * group items are queried in their own domain.
   */
  private async refreshExpandedNode(item: LiveNodeItem): Promise<void> {
    const key = this.itemKey(item.getNodeName(), item.getDomainId());
    const info = await this.fetchNodeInfoForItem(item);
    // Write through to the cache so subsequent tree re-reads (ensureNodeExpanded
    // cache hits) apply the fresh info instead of a stale earlier snapshot.
    this.nodeInfoCache.set(key, info);
    const signature = JSON.stringify(info ?? {});
    if (this.nodeInfoSignature.get(key) !== signature) {
      this.nodeInfoSignature.set(key, signature);
      item.applyInfo(info ?? {});
      this._onDidChangeTreeData.fire(item);
    }
  }

  /**
   * Tick-time info refresh for an expanded topic. See refreshExpandedNode.
   */
  private async refreshExpandedTopic(item: LiveTopicItem): Promise<void> {
    const key = this.itemKey(item.getTopicName(), item.getDomainId());
    const info = await this.fetchTopicInfoForItem(item);
    // Write-through (see refreshExpandedNode).
    this.topicInfoCache.set(key, info);
    const signature = JSON.stringify(info ?? {});
    if (this.topicInfoSignature.get(key) !== signature) {
      this.topicInfoSignature.set(key, signature);
      item.applyInfo(info ?? {});
      this._onDidChangeTreeData.fire(item);
    }
  }

  /** Info fetch routed by the item's domain (group domain or global env). */
  private async fetchNodeInfoForItem(item: LiveNodeItem): Promise<NodeInfo | null> {
    const domainId = item.getDomainId();
    return domainId === undefined
      ? this.getNodeInfo(item.getNodeName())
      : this.cli.getNodeInfoForDomain(item.getNodeName(), domainId);
  }

  /** Info fetch routed by the item's domain. See fetchNodeInfoForItem. */
  private async fetchTopicInfoForItem(item: LiveTopicItem): Promise<TopicInfo | null> {
    const domainId = item.getDomainId();
    return domainId === undefined
      ? this.getTopicInfo(item.getTopicName())
      : this.cli.getTopicInfoForDomain(item.getTopicName(), domainId);
  }

  /**
   * Lazily loads node info on expand: fetches once per cache lifetime, applies
   * it to the item and — only after a real fetch — fires for that element so
   * VSCode re-renders the updated description. Records the info signature so
   * tick refreshes only fire on actual change. Domain group items are
   * queried in their own domain.
   */
  async ensureNodeExpanded(item: LiveNodeItem): Promise<void> {
    if (this.disposed) {
      return;
    }
    const key = this.itemKey(item.getNodeName(), item.getDomainId());
    let info = this.nodeInfoCache.get(key);
    let fetched = false;
    if (info === undefined) {
      info = await this.fetchNodeInfoForItem(item);
      this.nodeInfoCache.set(key, info);
      fetched = true;
    }
    item.applyInfo(info ?? {});
    if (fetched) {
      this.nodeInfoSignature.set(key, JSON.stringify(info ?? {}));
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
    const key = this.itemKey(item.getTopicName(), item.getDomainId());
    let info = this.topicInfoCache.get(key);
    let fetched = false;
    if (info === undefined) {
      info = await this.fetchTopicInfoForItem(item);
      this.topicInfoCache.set(key, info);
      fetched = true;
    }
    item.applyInfo(info ?? {});
    if (fetched) {
      this.topicInfoSignature.set(key, JSON.stringify(info ?? {}));
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
      // Stable folder instances: root re-reads never invalidate the folders,
      // so VSCode keeps their expansion state too.
      return [this.nodesFolder, this.topicsFolder];
    }

    if (element instanceof LiveFolderItem) {
      const folderType = element.getFolderType();

      if (folderType === 'active-nodes') {
        // Domain groups configured: one labeled group per domain instead of
        // a flat environment list.
        if (this.domainGroups.length > 0) {
          return this.domainGroups.map(id => this.getOrCreateDomainGroup(id, 'nodes'));
        }
        const nodes = await this.getActiveNodes();
        this.lastNodeNames = nodes;
        // Stable instances: one item per node name, reused across re-reads
        // and ticks. Lazy: items may be name-only; info loads on expand.
        return nodes.map(name => this.getOrCreateNodeItem(name));
      } else if (folderType === 'active-topics') {
        if (this.domainGroups.length > 0) {
          return this.domainGroups.map(id => this.getOrCreateDomainGroup(id, 'topics'));
        }
        let topicNames = await this.getActiveTopics();
        if (this.hideSystemTopics) {
          topicNames = topicNames.filter(name => !this.isSystemTopic(name));
        }
        this.lastTopicNames = topicNames;
        return topicNames.map(name => this.getOrCreateTopicItem(name));
      }
    }

    if (element instanceof LiveDomainGroupItem) {
      return this.getDomainGroupChildren(element);
    }

    // If VSCode expands (or re-reads) a name-only item, remember it as
    // expanded (ticks refresh it) and trigger the lazy info fetch. The
    // per-element fire updates the description once the info arrives;
    // repeated re-reads within a tick are cache hits.
    if (element instanceof LiveNodeItem) {
      this.expandedNodes.add(element);
      void this.ensureNodeExpanded(element);
    } else if (element instanceof LiveTopicItem) {
      this.expandedTopics.add(element);
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

  /**
   * Stable item key: domain-scoped entities (domain group members) are
   * distinct from flat environment entities with the same name.
   */
  private itemKey(name: string, domainId?: number): string {
    return `${domainId ?? 'env'}|${name}`;
  }

  /**
   * Returns the stable item for a node name, creating it only on first sight.
   */
  private getOrCreateNodeItem(name: string, domainId?: number): LiveNodeItem {
    const key = this.itemKey(name, domainId);
    let item = this.nodeItems.get(key);
    if (!item) {
      item = new LiveNodeItem(name, undefined, domainId);
      this.nodeItems.set(key, item);
    }
    return item;
  }

  /**
   * Returns the stable item for a topic name. See getOrCreateNodeItem.
   */
  private getOrCreateTopicItem(name: string, domainId?: number): LiveTopicItem {
    const key = this.itemKey(name, domainId);
    let item = this.topicItems.get(key);
    if (!item) {
      item = new LiveTopicItem(name, undefined, domainId);
      this.topicItems.set(key, item);
    }
    return item;
  }

  /**
   * Removes stale items/signatures/expanded markers for names that left the
   * lists (keeps the stable maps from growing unbounded across sessions).
   * Domain-scoped items are pruned per domain list (tickGrouped) and on
   * group changes instead, since the flat lists say nothing about them.
   */
  private pruneStaleState(nodeNames: string[], topicNames: string[]): void {
    const nodeSet = new Set(nodeNames);
    for (const [key, item] of [...this.nodeItems.entries()]) {
      if (item.getDomainId() !== undefined) {
        continue;
      }
      if (!nodeSet.has(item.getNodeName())) {
        this.nodeItems.delete(key);
        this.nodeInfoSignature.delete(key);
        this.expandedNodes.delete(item);
      }
    }
    const topicSet = new Set(topicNames);
    for (const [key, item] of [...this.topicItems.entries()]) {
      if (item.getDomainId() !== undefined) {
        continue;
      }
      if (!topicSet.has(item.getTopicName())) {
        this.topicItems.delete(key);
        this.topicInfoSignature.delete(key);
        this.expandedTopics.delete(item);
      }
    }
  }

  /**
   * Drops domain-scoped items of one domain whose names left that domain's
   * list (called from tickGrouped with the fresh list).
   */
  private pruneDomainItemsForList(domainId: number, nodeNames: string[], topicNames: string[]): void {
    const nodeSet = new Set(nodeNames);
    for (const [key, item] of [...this.nodeItems.entries()]) {
      if (item.getDomainId() === domainId && !nodeSet.has(item.getNodeName())) {
        this.nodeItems.delete(key);
        this.nodeInfoSignature.delete(key);
        this.expandedNodes.delete(item);
      }
    }
    const topicSet = new Set(topicNames);
    for (const [key, item] of [...this.topicItems.entries()]) {
      if (item.getDomainId() === domainId && !topicSet.has(item.getTopicName())) {
        this.topicItems.delete(key);
        this.topicInfoSignature.delete(key);
        this.expandedTopics.delete(item);
      }
    }
  }

  /**
   * Drops every domain-scoped item, group item and baseline (called when the
   * domain grouping changes; the next rendering rebuilds from scratch).
   */
  private pruneDomainScopedItems(): void {
    for (const [key, item] of [...this.nodeItems.entries()]) {
      if (item.getDomainId() !== undefined) {
        this.nodeItems.delete(key);
        this.nodeInfoSignature.delete(key);
        this.expandedNodes.delete(item);
      }
    }
    for (const [key, item] of [...this.topicItems.entries()]) {
      if (item.getDomainId() !== undefined) {
        this.topicItems.delete(key);
        this.topicInfoSignature.delete(key);
        this.expandedTopics.delete(item);
      }
    }
    this.domainGroupItems.clear();
    this.lastDomainLists.clear();
  }

  dispose(): void {
    this.disposed = true;
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
      this.autoRefreshInterval = null;
    }
  }
}

/**
 * Order-insensitive list comparison: same members means unchanged.
 */
function listsEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  const set = new Set(a);
  for (const item of b) {
    if (!set.has(item)) {
      return false;
    }
  }
  return true;
}
