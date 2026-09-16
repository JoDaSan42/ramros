import { ToolsTreeProvider } from '../../treeview/tools-tree-provider';
import { BagFilesFolderItem, BagInfoItem, BagRecordItem } from '../../treeview/bag-items';
import { BagSessionService } from '../../executor/bag-session-service';

describe('ToolsTreeProvider Integration Tests', () => {
  let provider: ToolsTreeProvider;

  beforeEach(() => {
    BagFilesFolderItem.resetInstances();
    BagSessionService.getInstance().setRecordingTerminal(null);
    BagSessionService.getInstance().clearBagInfo();
    BagSessionService.getInstance().setSelectedBagPath(null);
    provider = new ToolsTreeProvider();
  });

  afterEach(() => {
    BagFilesFolderItem.resetInstances();
    BagSessionService.getInstance().setRecordingTerminal(null);
    BagSessionService.getInstance().clearBagInfo();
    BagSessionService.getInstance().setSelectedBagPath(null);
    jest.restoreAllMocks();
  });

  describe('getChildren', () => {
    it('returns the tools folder children at the root', async () => {
      const children = await provider.getChildren();
      const labels = children.map(c => c.label);
      expect(labels).toContain('RVIZ2');
      expect(labels).toContain('rqt_graph');
      expect(labels).toContain('Bag Files');
    });

    it('delegates to element.getChildren for non-root elements', async () => {
      const folder = new BagFilesFolderItem();
      const children = await provider.getChildren(folder);
      expect(Array.isArray(children)).toBe(true);
    });
  });

  describe('getTreeItem', () => {
    it('returns the element unchanged', () => {
      const folder = new BagFilesFolderItem();
      expect(provider.getTreeItem(folder)).toBe(folder);
    });
  });

  describe('getBagRecordItem', () => {
    it('creates and caches a record item', () => {
      const first = provider.getBagRecordItem();
      const second = provider.getBagRecordItem();
      expect(first).toBe(second);
    });

    it('shows the stop state while recording is active', () => {
      const mockTerminal = { dispose: jest.fn() } as any;
      BagSessionService.getInstance().setRecordingTerminal(mockTerminal);

      provider.getBagRecordItem();
      const item = provider.getBagRecordItem();
      expect(item.label).toBe('Recording...');
    });

    it('resets to start state when not recording', () => {
      BagSessionService.getInstance().setRecordingTerminal({ dispose: jest.fn() } as any);
      provider.getBagRecordItem();

      BagSessionService.getInstance().setRecordingTerminal(null);
      const item = provider.getBagRecordItem();
      expect(item.label).toBe('Start Recording');
    });
  });

  describe('setBagInfo', () => {
    it('stores info on the bag info item when present', async () => {
      // Populate the cached BagInfoItem instance via a folder expansion.
      await new BagFilesFolderItem().getChildren();
      const bagInfoItem = BagFilesFolderItem.getBagInfoItem();
      expect(bagInfoItem).not.toBeNull();

      await provider.setBagInfo('topic: /chatter', '/tmp/bag.db3');
      expect(bagInfoItem!.description).toBe('bag.db3');
    });

    it('resolves even when no info item exists', async () => {
      BagFilesFolderItem.resetInstances();
      await expect(provider.setBagInfo('info', '/tmp/bag.db3')).resolves.toBeUndefined();
    });

    it('keeps bag info after control items are reset (e.g. stop playback)', async () => {
      await provider.setBagInfo('topic: /chatter', '/tmp/bag.db3');

      // bag.stop calls resetInstances(), which used to wipe the info.
      BagFilesFolderItem.resetInstances();

      const folder = new BagFilesFolderItem();
      const children = await folder.getChildren();
      const infoItem = children.find(
        c => c.contextValue === 'bagInfo'
      ) as BagInfoItem;

      expect(infoItem).toBeDefined();
      expect(infoItem.description).toBe('bag.db3');

      const lines = await infoItem.getChildren();
      const labels = lines.map(l => l.label);
      expect(labels.some(l => String(l).includes('/tmp/bag.db3'))).toBe(true);
      expect(labels.some(l => String(l).includes('topic: /chatter'))).toBe(true);
    });

    it('survives a full resetInstances cycle and re-render', async () => {
      await provider.setBagInfo('info line', '/tmp/other.db3');
      BagFilesFolderItem.resetInstances();

      // A brand new BagInfoItem should still read from the session.
      const freshInfo = new BagInfoItem();
      expect(freshInfo.description).toBe('other.db3');
    });
  });

  describe('refresh', () => {
    it('resolves without throwing', async () => {
      await expect(provider.refresh()).resolves.toBeUndefined();
    });
  });
});
