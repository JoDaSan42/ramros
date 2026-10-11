import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { exec } from 'child_process';
import { LiveTreeProvider } from '../../treeview/live-tree-provider';
import { LiveFolderItem, LiveNodeItem, LiveTopicItem, LiveViewDisabledItem } from '../../treeview/live-items';
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
        { encoding: 'utf-8', timeout: 30000 },
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
  });
});
