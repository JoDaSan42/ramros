import { LiveTreeProvider } from '../../treeview/live-tree-provider';
import { LiveFolderItem, LiveNodeItem, LiveTopicItem } from '../../treeview/live-items';
import { Ros2CliService } from '../../core/ros2-cli-service';

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
      expect(topic.getMessageType()).toBe('std_msgs/msg/String');
      expect(topic.getPublishers()).toEqual(['/talker']);
      expect(topic.getSubscribers()).toEqual(['/listener']);
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
});
