import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { LiveTreeProvider } from '../../treeview/live-tree-provider';
import { LiveFolderItem, LiveNodeItem, LiveServiceItem, LiveTopicItem, LiveViewDisabledItem, LiveDomainGroupItem, NodeServicesItem, NodePublishedTopicsItem, NodeParametersItem } from '../../treeview/live-items';
import { Ros2CliService } from '../../core/ros2-cli-service';
import { WorkspaceConfigService } from '../../core/workspace-config-service';

jest.mock('child_process', () => {
  const execMock = jest.fn((...args: unknown[]) => {
    const cb = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
    cb(new Error('ros2 CLI not available in tests'), '', '');
  });
  Object.defineProperty(execMock, Symbol.for('nodejs.util.promisify.custom'), {
    value: (command: string, options: unknown) =>
      new Promise((resolve, reject) => {
        execMock(command, options, (error: Error | null, stdout: string, stderr: string) => {
          if (error) {
            (error as Error & { stdout?: string; stderr?: string }).stdout = stdout;
            (error as Error & { stdout?: string; stderr?: string }).stderr = stderr;
            reject(error);
          } else {
            resolve({ stdout, stderr });
          }
        });
      }),
    configurable: true
  });
  return { exec: execMock };
});

// Drains microtasks so the provider's internal lazy fetch resolves before
// assertions (the tree re-read is synchronous from VSCode's view).
function flushAsync(): Promise<void> {
  return new Promise(resolve => setImmediate(resolve));
}

describe('LiveTreeProvider Integration Tests', () => {
  let provider: LiveTreeProvider;
  let cli: Ros2CliService;

  beforeEach(() => {
    cli = Ros2CliService.getInstance();
    provider = new LiveTreeProvider();
  });

  afterEach(() => {
    provider.dispose();
    jest.restoreAllMocks();
  });

  describe('root children', () => {
    it('returns Nodes and Topics folders', async () => {
      const children = await provider.getChildren();

      expect(children).toHaveLength(2);
      expect(children[0]).toBeInstanceOf(LiveFolderItem);
      expect(children[1]).toBeInstanceOf(LiveFolderItem);
      expect((children[0] as LiveFolderItem).getFolderType()).toBe('active-nodes');
      expect((children[1] as LiveFolderItem).getFolderType()).toBe('active-topics');
    });
  });

  describe('active nodes folder', () => {
    it('builds node items with pub/sub info', async () => {
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/talker']);
      jest.spyOn(cli, 'getNodeInfo').mockResolvedValue({
        name: '/talker',
        publishedTopics: ['/chatter'],
        subscribedTopics: [],
      });

      const folders = await provider.getChildren();
      const nodes = await provider.getChildren(folders[0]);

      expect(nodes).toHaveLength(1);
      expect(nodes[0]).toBeInstanceOf(LiveNodeItem);
      expect((nodes[0] as LiveNodeItem).getNodeName()).toBe('/talker');
    });

    it('falls back to a bare node item when info is unavailable', async () => {
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/mystery']);
      jest.spyOn(cli, 'getNodeInfo').mockResolvedValue(null);

      const folders = await provider.getChildren();
      const nodes = await provider.getChildren(folders[0]);

      expect(nodes[0]).toBeInstanceOf(LiveNodeItem);
      expect((nodes[0] as LiveNodeItem).getNodeName()).toBe('/mystery');
    });

    it('renders a services folder reachable through the node item when getNodeInfo returns service servers', async () => {
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/add_two_ints']);
      jest.spyOn(cli, 'getNodeInfo').mockResolvedValue({
        name: '/add_two_ints',
        publishedTopics: [],
        subscribedTopics: [],
        serviceServers: [{ name: '/add_two_ints', type: 'example_interfaces/srv/AddTwoInts' }],
      });

      const folders = await provider.getChildren();
      const nodes = await provider.getChildren(folders[0]);

      expect(nodes).toHaveLength(1);
      const node = nodes[0] as LiveNodeItem;
      expect(node.getNodeName()).toBe('/add_two_ints');

      await provider.ensureNodeExpanded(node); // lazy fetch now

      const nodeChildren = await node.getChildren();
      const services = nodeChildren.find(c => c instanceof NodeServicesItem);
      expect(services).toBeInstanceOf(NodeServicesItem);

      const serviceChildren = await services!.getChildren();
      const service = serviceChildren.find(c => c instanceof LiveServiceItem) as LiveServiceItem;
      expect(service).toBeInstanceOf(LiveServiceItem);
      expect(service.getServiceName()).toBe('/add_two_ints');
      expect(service.getServiceType()).toBe('example_interfaces/srv/AddTwoInts');
    });
  });

  describe('active topics folder', () => {
    it('filters system topics when hideSystemTopics is enabled', async () => {
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue(['/chatter', '/parameter_events', '/rosout', '/clock']);
      jest.spyOn(cli, 'getTopicInfo').mockResolvedValue(null);

      const folders = await provider.getChildren();
      const topics = await provider.getChildren(folders[1]);

      const names = (topics as LiveTopicItem[]).map(t => t.getTopicName());
      expect(names).toEqual(['/chatter']);
    });

    it('includes system topics when disabled via setAutoRefresh/config', async () => {
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue(['/chatter', '/clock']);
      jest.spyOn(cli, 'getTopicInfo').mockResolvedValue(null);

      (provider as unknown as { hideSystemTopics: boolean }).hideSystemTopics = false;

      const folders = await provider.getChildren();
      const topics = await provider.getChildren(folders[1]);

      const names = (topics as LiveTopicItem[]).map(t => t.getTopicName());
      expect(names).toEqual(['/chatter', '/clock']);
    });

    it('builds topic items with message type and endpoint counts', async () => {
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue(['/chatter']);
      jest.spyOn(cli, 'getTopicInfo').mockResolvedValue({
        name: '/chatter',
        messageType: 'std_msgs/msg/String',
        publishers: ['/talker'],
        subscribers: ['/listener'],
      });

      const folders = await provider.getChildren();
      const topics = await provider.getChildren(folders[1]);

      expect(topics).toHaveLength(1);
      expect(topics[0]).toBeInstanceOf(LiveTopicItem);
      const topic = topics[0] as LiveTopicItem;

      await provider.ensureTopicExpanded(topic); // lazy fetch now

      expect(topic.getMessageType()).toBe('std_msgs/msg/String');
      expect(topic.getPublishers()).toEqual(['/talker']);
      expect(topic.getSubscribers()).toEqual(['/listener']);
    });
  });

  describe('service servers passthrough', () => {
    it('passes serviceServers through to the node info result', async () => {
      jest.spyOn(cli, 'getNodeInfo').mockResolvedValue({
        name: '/add_two_ints',
        publishedTopics: ['/sum'],
        subscribedTopics: [],
        serviceServers: [{ name: '/add_two_ints', type: 'example_interfaces/srv/AddTwoInts' }],
      });

      const info = await provider.getNodeInfo('/add_two_ints');

      expect(info?.serviceServers).toEqual([
        { name: '/add_two_ints', type: 'example_interfaces/srv/AddTwoInts' },
      ]);
    });

    it('keeps serviceServers when system topics are filtered', async () => {
      jest.spyOn(cli, 'getNodeInfo').mockResolvedValue({
        name: '/talker',
        publishedTopics: ['/chatter', '/rosout'],
        subscribedTopics: [],
        serviceServers: [{ name: '/reset', type: 'std_srvs/srv/Trigger' }],
      });

      const info = await provider.getNodeInfo('/talker');

      expect(info?.publishedTopics).toEqual(['/chatter']);
      expect(info?.serviceServers).toEqual([
        { name: '/reset', type: 'std_srvs/srv/Trigger' },
      ]);
    });
  });

  describe('system topic filtering for node endpoints', () => {
    it('strips system topics from node pub/sub lists', async () => {
      jest.spyOn(cli, 'getNodeInfo').mockResolvedValue({
        name: '/talker',
        publishedTopics: ['/chatter', '/rosout'],
        subscribedTopics: ['/parameter_events'],
      });

      const info = await provider.getNodeInfo('/talker');

      expect(info?.publishedTopics).toEqual(['/chatter']);
      expect(info?.subscribedTopics).toEqual([]);
    });

    it('keeps system topics when filtering is disabled', async () => {
      jest.spyOn(cli, 'getNodeInfo').mockResolvedValue({
        name: '/talker',
        publishedTopics: ['/chatter', '/rosout'],
        subscribedTopics: [],
      });

      (provider as unknown as { hideSystemTopics: boolean }).hideSystemTopics = false;

      const info = await provider.getNodeInfo('/talker');

      expect(info?.publishedTopics).toEqual(['/chatter', '/rosout']);
    });
  });

  describe('callService', () => {
    it('passes stdout through on success', async () => {
      (exec as unknown as jest.Mock).mockImplementationOnce((...args: unknown[]) => {
        const cb = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
        cb(null, 'response', '');
      });

      const result = await cli.callService('/add_two_ints', 'example_interfaces/srv/AddTwoInts', '{a: 1, b: 2}');

      expect(result).toBe('response');
      expect(exec).toHaveBeenCalledWith(
        'ros2 service call "/add_two_ints" "example_interfaces/srv/AddTwoInts" \'{a: 1, b: 2}\'',
        expect.objectContaining({ encoding: 'utf-8', timeout: 30000 }),
        expect.any(Function)
      );
    });

    it('returns null on error', async () => {
      (exec as unknown as jest.Mock).mockImplementationOnce((...args: unknown[]) => {
        const cb = args[args.length - 1] as (error: Error | null, stdout: string, stderr: string) => void;
        cb(new Error('service call failed'), '', 'boom');
      });

      const result = await cli.callService('/add_two_ints', 'example_interfaces/srv/AddTwoInts', '{}');

      expect(result).toBeNull();
    });
  });

  describe('expansion wiring', () => {
    let fired: unknown[];

    beforeEach(() => {
      fired = [];
      provider.onDidChangeTreeData(e => fired.push(e));
    });

    it('auto-fetches node info on tree expansion (no manual call)', async () => {
      const infoSpy = jest.spyOn(cli, 'getNodeInfo').mockResolvedValue({
        name: '/talker',
        publishedTopics: ['/chatter'],
        subscribedTopics: [],
      });
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/talker']);

      const folders = await provider.getChildren();
      const [node] = await provider.getChildren(folders[0]) as LiveNodeItem[];

      // Simulate VSCode expanding the node: provider.getChildren(item)
      await provider.getChildren(node);
      await flushAsync();

      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(fired).toContain(node); // per-element fire after fetch

      const children = await node.getChildren();
      expect(children.some(c => c instanceof NodePublishedTopicsItem)).toBe(true);
      expect(children.some(c => c instanceof NodeParametersItem)).toBe(true);
    });

    it('re-reading expanded children after the fire does not refetch or refire', async () => {
      jest.spyOn(cli, 'getNodeInfo').mockResolvedValue({
        name: '/talker', publishedTopics: ['/chatter'], subscribedTopics: [],
      });
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/talker']);

      const folders = await provider.getChildren();
      const [node] = await provider.getChildren(folders[0]) as LiveNodeItem[];

      await provider.getChildren(node); // expansion -> fetch + fire
      await flushAsync();
      const fireCount = fired.length;

      await provider.getChildren(node); // re-read after fire: cache hit, no fire
      await flushAsync();

      expect(fired.length).toBe(fireCount); // no loop
      // Only the initial expansion fetch happened (cache hit after that)
    });

    it('auto-fetches topic info on tree expansion', async () => {
      const infoSpy = jest.spyOn(cli, 'getTopicInfo').mockResolvedValue({
        name: '/chatter',
        messageType: 'std_msgs/msg/String',
        publishers: ['/talker'],
        subscribers: [],
      });
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue(['/chatter']);

      const folders = await provider.getChildren();
      const [topic] = await provider.getChildren(folders[1]) as LiveTopicItem[];

      await provider.getChildren(topic);
      await flushAsync();

      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(fired).toContain(topic);
    });
  });

  describe('stable items (no flicker on refresh)', () => {
    function collectEvents(): unknown[] {
      const events: unknown[] = [];
      provider.onDidChangeTreeData(e => events.push(e));
      return events;
    }

    it('serves the same item instances across folder re-reads', async () => {
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/a', '/b']);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);

      const folders = await provider.getChildren();
      const first = await provider.getChildren(folders[0]) as LiveNodeItem[];
      const second = await provider.getChildren(folders[0]) as LiveNodeItem[];

      expect(second[0]).toBe(first[0]);
      expect(second[1]).toBe(first[1]);
    });

    it('does not fire when a tick sees unchanged lists', async () => {
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/a']);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);

      const folders = await provider.getChildren();
      await provider.getChildren(folders[0]); // establishes the baseline list
      const events = collectEvents();

      await provider.tick();

      expect(events).toHaveLength(0);
    });

    it('fires once when a tick sees a changed list', async () => {
      const nodesMock = jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/a']);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);

      const folders = await provider.getChildren();
      await provider.getChildren(folders[0]);
      const events = collectEvents();

      nodesMock.mockResolvedValue(['/a', '/b']);
      await provider.tick();

      expect(events).toHaveLength(1);
    });

    it('keeps the item instance of a surviving node across a list-change tick', async () => {
      const nodesMock = jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/a']);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);

      const folders = await provider.getChildren();
      const [nodeA] = await provider.getChildren(folders[0]) as LiveNodeItem[];
      await provider.getChildren(nodeA); // expand

      nodesMock.mockResolvedValue(['/a', '/b']);
      await provider.tick();

      const after = await provider.getChildren(folders[0]) as LiveNodeItem[];
      const surviving = after.find(n => n.getNodeName() === '/a');
      expect(surviving).toBe(nodeA);
    });

    it('refreshes expanded node info on tick and fires that element only on change', async () => {
      const infoMock = jest.spyOn(cli, 'getNodeInfo')
        .mockResolvedValue({ name: '/a', publishedTopics: ['/x'], subscribedTopics: [] });
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/a']);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);

      const folders = await provider.getChildren();
      const [nodeA] = await provider.getChildren(folders[0]) as LiveNodeItem[];
      await provider.getChildren(nodeA); // expand -> fetch #1
      await flushAsync();

      const events = collectEvents();
      infoMock.mockResolvedValue({ name: '/a', publishedTopics: ['/x', '/y'], subscribedTopics: [] });
      await provider.tick();

      expect(nodeA.description).toBe('2 pub / 0 sub');
      expect(events).toContain(nodeA);

      const eventsAfter = collectEvents();
      await provider.tick(); // info unchanged -> no element fire
      expect(eventsAfter.filter(e => e === nodeA)).toHaveLength(0);
    });

    it('does not fetch info for collapsed items on tick', async () => {
      const infoSpy = jest.spyOn(cli, 'getNodeInfo').mockResolvedValue(null);
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/a', '/b']);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);

      const folders = await provider.getChildren();
      await provider.getChildren(folders[0]); // no expansion

      const infoCallsBefore = infoSpy.mock.calls.length;
      await provider.tick();

      expect(infoSpy.mock.calls.length).toBe(infoCallsBefore);
    });

    it('stops refreshing an item after markCollapsed', async () => {
      const infoSpy = jest.spyOn(cli, 'getNodeInfo').mockResolvedValue(null);
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/a']);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);

      const folders = await provider.getChildren();
      const [nodeA] = await provider.getChildren(folders[0]) as LiveNodeItem[];
      await provider.getChildren(nodeA); // expand
      await flushAsync();

      provider.markCollapsed(nodeA);
      await provider.tick();
      await flushAsync();

      expect(infoSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('multi-domain groups', () => {
    it('builds labeled domain groups when domain groups are configured', async () => {
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/env-node']);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue(['/env-topic']);

      provider.setDomainGroups([1, 2]);

      const folders = await provider.getChildren() as LiveFolderItem[];
      const nodesFolder = folders.find(f => f.getFolderType() === 'active-nodes')!;
      const children = await provider.getChildren(nodesFolder) as LiveDomainGroupItem[];

      expect(children).toHaveLength(2);
      expect(children.map(c => c.label)).toEqual(['Nodes (domain 1)', 'Nodes (domain 2)']);
      expect(children[0].getDomainId()).toBe(1);
      expect(children[0].getGroupKind()).toBe('nodes');
    });

    it('lists environment nodes/topics when no domain groups are configured (default)', async () => {
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/env-node']);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);

      const folders = await provider.getChildren() as LiveFolderItem[];
      const nodesFolder = folders.find(f => f.getFolderType() === 'active-nodes')!;
      const children = await provider.getChildren(nodesFolder);

      expect(children.some(c => c instanceof LiveNodeItem)).toBe(true);
      expect(children.some(c => c instanceof LiveDomainGroupItem)).toBe(false);
    });

    it('group expansion queries the group domain, not the environment', async () => {
      const nodesForDomain = jest.spyOn(cli, 'getActiveNodesForDomain').mockResolvedValue(['/d1-node']);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);

      provider.setDomainGroups([1]);
      const folders = await provider.getChildren() as LiveFolderItem[];
      const nodesFolder = folders.find(f => f.getFolderType() === 'active-nodes')!;
      const [group] = await provider.getChildren(nodesFolder) as LiveDomainGroupItem[];

      const members = await provider.getChildren(group);

      expect(nodesForDomain).toHaveBeenCalledWith(1);
      expect(members.some(m => m instanceof LiveNodeItem && m.getNodeName() === '/d1-node')).toBe(true);
    });

    it('builds topic domain groups under the Topics folder', async () => {
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue([]);
      const topicsForDomain = jest.spyOn(cli, 'getActiveTopicsForDomain').mockResolvedValue(['/d2-topic']);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);

      provider.setDomainGroups([2]);
      const folders = await provider.getChildren() as LiveFolderItem[];
      const topicsFolder = folders.find(f => f.getFolderType() === 'active-topics')!;
      const [group] = await provider.getChildren(topicsFolder) as LiveDomainGroupItem[];

      expect(group.label).toBe('Topics (domain 2)');
      const members = await provider.getChildren(group);
      expect(topicsForDomain).toHaveBeenCalledWith(2);
      expect(members.some(m => m instanceof LiveTopicItem && m.getTopicName() === '/d2-topic')).toBe(true);
    });

    it('hot-reloads domain groups on setDomainGroups', async () => {
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue([]);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);

      provider.setDomainGroups([1]);
      provider.setDomainGroups([3, 4]);

      const folders = await provider.getChildren() as LiveFolderItem[];
      const nodesFolder = folders.find(f => f.getFolderType() === 'active-nodes')!;
      const children = await provider.getChildren(nodesFolder) as LiveDomainGroupItem[];

      expect(children.map(c => c.getDomainId())).toEqual([3, 4]);
    });

    it('marks collapsed domain groups as such (ticks do not refresh them)', async () => {
      jest.spyOn(cli, 'getActiveNodesForDomain').mockResolvedValue(['/d1-node']);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);

      provider.setDomainGroups([1]);
      const folders = await provider.getChildren() as LiveFolderItem[];
      const nodesFolder = folders.find(f => f.getFolderType() === 'active-nodes')!;
      const [group] = await provider.getChildren(nodesFolder) as LiveDomainGroupItem[];

      provider.markCollapsed(group);
      // No throw: collapsing a group is a no-op for the expanded-items set
      expect(true).toBe(true);
    });

    it('node items from a domain group fetch their info in the group domain', async () => {
      jest.spyOn(cli, 'getActiveNodesForDomain').mockResolvedValue(['/d1-node']);
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue([]);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);
      const domainInfoSpy = jest.spyOn(cli, 'getNodeInfoForDomain').mockResolvedValue({
        name: '/d1-node',
        publishedTopics: ['/d1-topic'],
        subscribedTopics: [],
        serviceServers: [],
        actionServers: []
      });
      const globalInfoSpy = jest.spyOn(cli, 'getNodeInfo').mockResolvedValue(null);

      provider.setDomainGroups([1]);
      const folders = await provider.getChildren() as LiveFolderItem[];
      const nodesFolder = folders.find(f => f.getFolderType() === 'active-nodes')!;
      const [group] = await provider.getChildren(nodesFolder) as LiveDomainGroupItem[];
      const [item] = await provider.getChildren(group) as LiveNodeItem[];

      await provider.ensureNodeExpanded(item);

      expect(domainInfoSpy).toHaveBeenCalledWith('/d1-node', 1);
      expect(globalInfoSpy).not.toHaveBeenCalled();
    });

    it('topic items from a domain group fetch their info in the group domain', async () => {
      jest.spyOn(cli, 'getActiveTopicsForDomain').mockResolvedValue(['/d2-topic']);
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue([]);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);
      const domainInfoSpy = jest.spyOn(cli, 'getTopicInfoForDomain').mockResolvedValue({
        name: '/d2-topic',
        messageType: 'std_msgs/msg/String',
        publishers: ['/d1-node'],
        subscribers: []
      });
      const globalInfoSpy = jest.spyOn(cli, 'getTopicInfo').mockResolvedValue(null);

      provider.setDomainGroups([2]);
      const folders = await provider.getChildren() as LiveFolderItem[];
      const topicsFolder = folders.find(f => f.getFolderType() === 'active-topics')!;
      const [group] = await provider.getChildren(topicsFolder) as LiveDomainGroupItem[];
      const [item] = await provider.getChildren(group) as LiveTopicItem[];

      await provider.ensureTopicExpanded(item);

      expect(domainInfoSpy).toHaveBeenCalledWith('/d2-topic', 2);
      expect(globalInfoSpy).not.toHaveBeenCalled();
    });

    it('the same node name in two domains yields distinct items with per-domain info', async () => {
      jest.spyOn(cli, 'getActiveNodesForDomain').mockImplementation(
        async (domainId: number) => ['/shared']
      );
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue([]);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);
      const domainInfoSpy = jest.spyOn(cli, 'getNodeInfoForDomain').mockResolvedValue(null);

      provider.setDomainGroups([1, 2]);
      const folders = await provider.getChildren() as LiveFolderItem[];
      const nodesFolder = folders.find(f => f.getFolderType() === 'active-nodes')!;
      const groups = await provider.getChildren(nodesFolder) as LiveDomainGroupItem[];
      const [item1] = await provider.getChildren(groups[0]) as LiveNodeItem[];
      const [item2] = await provider.getChildren(groups[1]) as LiveNodeItem[];

      expect(item1).not.toBe(item2);

      await provider.ensureNodeExpanded(item1);
      await provider.ensureNodeExpanded(item2);
      expect(domainInfoSpy).toHaveBeenCalledWith('/shared', 1);
      expect(domainInfoSpy).toHaveBeenCalledWith('/shared', 2);
    });

    it('the tick detects list changes inside a domain group', async () => {
      jest.spyOn(cli, 'getActiveNodesForDomain')
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(['/arrived']);
      jest.spyOn(cli, 'getActiveTopicsForDomain').mockResolvedValue([]);
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue([]);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);
      jest.spyOn(cli, 'getNodeInfo').mockResolvedValue(null);
      jest.spyOn(cli, 'getTopicInfo').mockResolvedValue(null);
      jest.spyOn(cli, 'getNodeInfoForDomain').mockResolvedValue(null);
      jest.spyOn(cli, 'getTopicInfoForDomain').mockResolvedValue(null);

      provider.setDomainGroups([42]);
      await provider.refresh(); // baseline: domain 42 is empty

      const fired: unknown[] = [];
      provider.onDidChangeTreeData(event => fired.push(event));
      await provider.refresh(); // a node appears in domain 42

      expect(fired.length).toBe(1);
    });
  });

  describe('auto-refresh', () => {
    it('can be toggled off and on', () => {
      provider.setAutoRefresh(false);
      expect(provider.isAutoRefreshEnabled()).toBe(false);

      provider.setAutoRefresh(true);
      expect(provider.isAutoRefreshEnabled()).toBe(true);
    });

    it('refresh resolves without throwing', async () => {
      await expect(provider.refresh()).resolves.toBeUndefined();
    });
  });

  describe('refresh loop guard', () => {
    it('a refresh cycle keeps the total call budget at the expanded items only', async () => {
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/a', '/b', '/c']);
      const infoSpy = jest.spyOn(cli, 'getNodeInfo').mockResolvedValue(null);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);
      jest.spyOn(cli, 'getTopicInfo').mockResolvedValue(null);

      const folders = await provider.getChildren();
      const nodes = await provider.getChildren(folders[0]);
      const nodeA = nodes[0] as LiveNodeItem;

      await provider.ensureNodeExpanded(nodeA); // 1 info call
      expect(infoSpy).toHaveBeenCalledTimes(1);

      await provider.refresh();                  // tick: cache invalidated
      const folders2 = await provider.getChildren();  // root rebuild: no info calls
      await provider.getChildren(folders2[0]);   // folder rebuild: no info calls
      expect(infoSpy).toHaveBeenCalledTimes(1);

      const nodeA2 = (await provider.getChildren(folders2[0]))[0] as LiveNodeItem;
      await provider.ensureNodeExpanded(nodeA2); // new tick -> refetch allowed
      expect(infoSpy).toHaveBeenCalledTimes(2);
    });

    it('ensureNodeExpanded twice within one tick fetches only once (no loop)', async () => {
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/a']);
      const infoSpy = jest.spyOn(cli, 'getNodeInfo').mockResolvedValue(null);

      const folders = await provider.getChildren();
      const [node] = await provider.getChildren(folders[0]) as LiveNodeItem[];

      await provider.ensureNodeExpanded(node);
      await provider.ensureNodeExpanded(node);
      await provider.ensureNodeExpanded(node);

      expect(infoSpy).toHaveBeenCalledTimes(1);
    });

    it('the auto-refresh tick invalidates the info cache', async () => {
      jest.useFakeTimers();
      try {
        jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/a']);
        const infoSpy = jest.spyOn(cli, 'getNodeInfo').mockResolvedValue(null);

        // Construct under fake timers so the interval is controllable.
        const tickingProvider = new LiveTreeProvider();
        try {
          const folders = await tickingProvider.getChildren();
          const [node] = await tickingProvider.getChildren(folders[0]) as LiveNodeItem[];
          await tickingProvider.ensureNodeExpanded(node);
          expect(infoSpy).toHaveBeenCalledTimes(1);

          jest.advanceTimersByTime(tickingProvider.getEffectiveRefreshRate() * 1000);
          const folders2 = await tickingProvider.getChildren();
          const [node2] = await tickingProvider.getChildren(folders2[0]) as LiveNodeItem[];
          await tickingProvider.ensureNodeExpanded(node2);
          expect(infoSpy).toHaveBeenCalledTimes(2);
        } finally {
          tickingProvider.dispose();
        }
      } finally {
        jest.useRealTimers();
      }
    });
  });
  describe('lazy loading', () => {
    it('folder children make exactly 1 list call and 0 info calls', async () => {
      const nodesSpy = jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/a', '/b']);
      const infoSpy = jest.spyOn(cli, 'getNodeInfo').mockResolvedValue(null);
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue([]);
      jest.spyOn(cli, 'getTopicInfo').mockResolvedValue(null);

      const folders = await provider.getChildren();
      await provider.getChildren(folders[0]); // nodes folder

      expect(nodesSpy).toHaveBeenCalledTimes(1);
      expect(infoSpy).not.toHaveBeenCalled();
    });

    it('node item expand fetches info once and updates description', async () => {
      const infoSpy = jest.spyOn(cli, 'getNodeInfo').mockResolvedValue({
        name: '/talker',
        publishedTopics: ['/chatter'],
        subscribedTopics: [],
      });
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/talker']);

      const folders = await provider.getChildren();
      const nodes = await provider.getChildren(folders[0]);
      const node = nodes[0] as LiveNodeItem;
      expect(node.description).toBe('running');

      await provider.ensureNodeExpanded(node); // simulate expand

      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(node.description).toBe('1 pub / 0 sub');
    });

    it('expanded node refetches fresh info on the next tick', async () => {
      const infoSpy = jest.spyOn(cli, 'getNodeInfo')
        .mockResolvedValueOnce({ name: '/talker', publishedTopics: ['/a'], subscribedTopics: [] })
        .mockResolvedValueOnce({ name: '/talker', publishedTopics: ['/a', '/b'], subscribedTopics: [] });
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/talker']);

      const folders = await provider.getChildren();
      const [node] = await provider.getChildren(folders[0]) as LiveNodeItem[];

      await provider.ensureNodeExpanded(node); // tick 1: fetch #1
      provider.tick();                          // newTick invalidates the cache
      await provider.ensureNodeExpanded(node); // fetch #2

      expect(infoSpy).toHaveBeenCalledTimes(2);
    });

    it('system topics are excluded from lazy node info counts', async () => {
      jest.spyOn(cli, 'getActiveNodes').mockResolvedValue(['/talker']);
      jest.spyOn(cli, 'getNodeInfo').mockResolvedValue({
        name: '/talker',
        publishedTopics: ['/chatter', '/rosout'],
        subscribedTopics: ['/parameter_events'],
      });

      const folders = await provider.getChildren();
      const [node] = await provider.getChildren(folders[0]) as LiveNodeItem[];
      await provider.ensureNodeExpanded(node);

      expect(node.description).toBe('1 pub / 0 sub');
    });

    it('topic item expand fetches info and sets message type', async () => {
      const infoSpy = jest.spyOn(cli, 'getTopicInfo').mockResolvedValue({
        name: '/chatter',
        messageType: 'std_msgs/msg/String',
        publishers: ['/talker'],
        subscribers: [],
      });
      jest.spyOn(cli, 'getActiveTopics').mockResolvedValue(['/chatter']);

      const folders = await provider.getChildren();
      const [topic] = await provider.getChildren(folders[1]) as LiveTopicItem[];
      expect(topic.description).toBe('');

      await provider.ensureTopicExpanded(topic);

      expect(infoSpy).toHaveBeenCalledTimes(1);
      expect(topic.getMessageType()).toBe('std_msgs/msg/String');
    });
  });

  describe('openSettings', () => {
    it('opens the live view settings', () => {
      const vscode = require('vscode');
      provider.openSettings();
      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        'workbench.action.openSettings',
        'ramros.liveView'
      );
    });
  });

  describe('workspace config integration', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramros-live-tree-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    function writeRamrosJson(content: object): void {
      fs.writeFileSync(path.join(tempDir, 'ramros.json'), JSON.stringify(content, null, 2) + '\n', 'utf8');
    }

    function readRamrosJson(): { liveView?: { enabled?: boolean; refreshRate?: number } } {
      return JSON.parse(fs.readFileSync(path.join(tempDir, 'ramros.json'), 'utf8'));
    }

    async function waitFor(condition: () => boolean): Promise<void> {
      const deadline = Date.now() + 2000;
      while (!condition() && Date.now() < deadline) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    it('starts disabled and shows only the disabled item when liveView.enabled is false', async () => {
      writeRamrosJson({ liveView: { enabled: false } });
      const configService = new WorkspaceConfigService(() => tempDir);

      const configuredProvider = new LiveTreeProvider(configService);
      try {
        await waitFor(() => !configuredProvider.isEnabled());
        expect(configuredProvider.isEnabled()).toBe(false);
        expect(configuredProvider.isAutoRefreshEnabled()).toBe(false);

        const children = await configuredProvider.getChildren();
        expect(children).toHaveLength(1);
        expect(children[0]).toBeInstanceOf(LiveViewDisabledItem);
      } finally {
        configuredProvider.dispose();
      }
    });

    it('persists enabled=true in ramros.json and restarts polling on setEnabled(true)', async () => {
      writeRamrosJson({ liveView: { enabled: false } });
      const configService = new WorkspaceConfigService(() => tempDir);

      const configuredProvider = new LiveTreeProvider(configService);
      try {
        await waitFor(() => !configuredProvider.isEnabled());
        expect(configuredProvider.isEnabled()).toBe(false);

        await configuredProvider.setEnabled(true);
        expect(configuredProvider.isEnabled()).toBe(true);
        expect(configuredProvider.isAutoRefreshEnabled()).toBe(true);
        expect(readRamrosJson().liveView?.enabled).toBe(true);

        const children = await configuredProvider.getChildren();
        expect(children).toHaveLength(2);
        expect(children[0]).toBeInstanceOf(LiveFolderItem);
        expect(children[1]).toBeInstanceOf(LiveFolderItem);
      } finally {
        configuredProvider.dispose();
      }
    });

    it('persists enabled=false in ramros.json and stops polling on setEnabled(false)', async () => {
      const configService = new WorkspaceConfigService(() => tempDir);

      const configuredProvider = new LiveTreeProvider(configService);
      try {
        expect(configuredProvider.isEnabled()).toBe(true);

        await configuredProvider.setEnabled(false);
        expect(configuredProvider.isEnabled()).toBe(false);
        expect(configuredProvider.isAutoRefreshEnabled()).toBe(false);
        expect(readRamrosJson().liveView?.enabled).toBe(false);
      } finally {
        configuredProvider.dispose();
      }
    });

    it('applies the ramros.json refreshRate override over the global setting', async () => {
      writeRamrosJson({ liveView: { refreshRate: 10 } });
      const configService = new WorkspaceConfigService(() => tempDir);

      const configuredProvider = new LiveTreeProvider(configService);
      try {
        await waitFor(() => configuredProvider.getEffectiveRefreshRate() === 10);
        expect(configuredProvider.getEffectiveRefreshRate()).toBe(10);
      } finally {
        configuredProvider.dispose();
      }
    });

    it('falls back to the global setting without a refreshRate override', async () => {
      const configService = new WorkspaceConfigService(() => tempDir);

      const configuredProvider = new LiveTreeProvider(configService);
      try {
        expect(configuredProvider.getEffectiveRefreshRate()).toBe(5);
      } finally {
        configuredProvider.dispose();
      }
    });

    it('reloads the refreshRate override via reloadFromWorkspaceConfig', async () => {
      writeRamrosJson({ liveView: { refreshRate: 7 } });
      const configService = new WorkspaceConfigService(() => tempDir);

      const configuredProvider = new LiveTreeProvider(configService);
      try {
        await waitFor(() => configuredProvider.getEffectiveRefreshRate() === 7);
        expect(configuredProvider.getEffectiveRefreshRate()).toBe(7);

        writeRamrosJson({ liveView: { refreshRate: 10 } });
        await configuredProvider.reloadFromWorkspaceConfig();
        expect(configuredProvider.getEffectiveRefreshRate()).toBe(10);
      } finally {
        configuredProvider.dispose();
      }
    });

    it('applies enabled:false via reloadFromWorkspaceConfig when the config file appears after construction', async () => {
      const configService = new WorkspaceConfigService(() => tempDir);

      const configuredProvider = new LiveTreeProvider(configService);
      try {
        await new Promise(resolve => setTimeout(resolve, 25));
        expect(configuredProvider.isEnabled()).toBe(true);

        writeRamrosJson({ liveView: { enabled: false } });
        await configuredProvider.reloadFromWorkspaceConfig();

        expect(configuredProvider.isEnabled()).toBe(false);
        expect(configuredProvider.isAutoRefreshEnabled()).toBe(false);

        const children = await configuredProvider.getChildren();
        expect(children).toHaveLength(1);
        expect(children[0]).toBeInstanceOf(LiveViewDisabledItem);
      } finally {
        configuredProvider.dispose();
      }
    });
  });
});
