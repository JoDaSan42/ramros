import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ToolsTreeProvider } from '../../treeview/tools-tree-provider';
import {
  BagFileItem,
  BagFilesFolderItem,
  BagInfoItem,
  BagRecordItem,
  ExternalBagFolderItem,
  ToolsFolderItem
} from '../../treeview/bag-items';
import { BagSessionService } from '../../executor/bag-session-service';
import { TreeItemBase } from '../../treeview/base-tree-item';
import * as vscode from 'vscode';
import { getWorkspaceBagPaths, scanBagFolder } from '../../core/bag-discovery';
import { WorkspaceConfigService } from '../../core/workspace-config-service';
import { findWorkspaceBags, getBagEntriesForTests, __setTreeProviderForTests } from '../../extension';

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

  describe('bag entries threading', () => {
    it('appends a Files separator and the bag entries under Bag Files', async () => {
      const providerWithEntries = new ToolsTreeProvider(
        async () => [new BagFileItem('/x/a.db3')]
      );

      const children = await providerWithEntries.getChildren();
      const bagFilesFolder = children.find(
        c => c instanceof BagFilesFolderItem
      ) as BagFilesFolderItem;
      expect(bagFilesFolder).toBeDefined();

      const bagFilesChildren = await bagFilesFolder.getChildren();
      const filesSeparator = bagFilesChildren.find(
        c => c.contextValue === 'separator' && c.description === 'Files'
      );
      expect(filesSeparator).toBeDefined();

      const bagItem = bagFilesChildren.find(c => c.contextValue === 'bagFile');
      expect(bagItem).toBeInstanceOf(BagFileItem);
      expect((bagItem as BagFileItem).getBagPath()).toBe('/x/a.db3');

      // Files section must come after the existing recording/playback items.
      const separatorIndex = bagFilesChildren.indexOf(filesSeparator!);
      const bagInfoIndex = bagFilesChildren.findIndex(c => c.contextValue === 'bagInfo');
      expect(separatorIndex).toBeGreaterThan(bagInfoIndex);
    });

    it('threads the provider through ToolsFolderItem to BagFilesFolderItem', async () => {
      const toolsFolder = new ToolsFolderItem(async () => [new BagFileItem('/y/b.db3')]);
      const toolsChildren = await toolsFolder.getChildren();
      const bagFilesFolder = toolsChildren.find(
        c => c instanceof BagFilesFolderItem
      ) as BagFilesFolderItem;
      expect(bagFilesFolder).toBeDefined();

      const bagFilesChildren = await bagFilesFolder.getChildren();
      const bagItem = bagFilesChildren.find(c => c.contextValue === 'bagFile') as BagFileItem;
      expect(bagItem).toBeDefined();
      expect(bagItem.getBagPath()).toBe('/y/b.db3');
    });

    it('appends nothing when the provider yields an empty array', async () => {
      const providerWithNoEntries = new ToolsTreeProvider(async () => []);

      const children = await providerWithNoEntries.getChildren();
      const bagFilesFolder = children.find(
        c => c instanceof BagFilesFolderItem
      ) as BagFilesFolderItem;

      const bagFilesChildren = await bagFilesFolder.getChildren();
      expect(
        bagFilesChildren.some(c => c.contextValue === 'separator' && c.description === 'Files')
      ).toBe(false);
    });

    it('shows no Files section without a provider (existing behavior unchanged)', async () => {
      const children = await provider.getChildren();
      const bagFilesFolder = children.find(
        c => c instanceof BagFilesFolderItem
      ) as BagFilesFolderItem;

      const bagFilesChildren = await bagFilesFolder.getChildren();
      expect(
        bagFilesChildren.some(c => c.contextValue === 'separator' && c.description === 'Files')
      ).toBe(false);
    });
  });

  describe('getWorkspaceBagPaths', () => {
    it('returns only bag files inside workspace roots', async () => {
      const fakeWorkspace = {
        id: '/ws',
        name: 'ws',
        rootPath: { fsPath: '/ws' },
        srcPath: null,
        installPath: null,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: [],
        packages: [],
      };

      (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([
        { fsPath: '/ws/my.db3' },
        { fsPath: '/opt/other/location.mcap' },
      ]);

      const bags = await getWorkspaceBagPaths([fakeWorkspace as any]);
      expect(bags).toEqual(['/ws/my.db3']);
    });
  });

  describe('findWorkspaceBags', () => {
    it('finds bag files in workspace folders', async () => {
      const { RamrosTreeProvider } = await import('../../treeview/tree-provider');
      const { WorkspaceDetector } = await import('../../core/workspace-detector');
      const { DuplicatePackageDetector } = await import('../../core/duplicate-package-detector');
      const treeProviderForBags = new RamrosTreeProvider(
        new WorkspaceDetector(async () => []),
        new DuplicatePackageDetector(),
        undefined,
        false
      );
      __setTreeProviderForTests(treeProviderForBags);

      const fakeWorkspace = {
        id: '/ws',
        name: 'ws',
        rootPath: { fsPath: '/ws' },
        srcPath: null,
        installPath: null,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: [],
        packages: [],
      };
      jest.spyOn(treeProviderForBags, 'getWorkspaces').mockReturnValue([fakeWorkspace as any]);

      (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([
        { fsPath: '/ws/my.db3' },
        { fsPath: '/opt/other/location.mcap' },
      ]);

      const bags = await findWorkspaceBags();
      expect(bags).toContain('/ws/my.db3');
      expect(bags).not.toContain('/opt/other/location.mcap');
    });
  });

  describe('getBagEntries composition', () => {
    it('includes workspace bags as BagFileItem and external ramros.json folders with their bags', async () => {
      const workspaceDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramros-ws-'));
      const bagsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramros-bags-'));
      try {
        const externalBag = path.join(bagsDir, 'recording.db3');
        fs.writeFileSync(externalBag, 'bag');
        fs.writeFileSync(
          path.join(workspaceDir, 'ramros.json'),
          JSON.stringify({ bagFolders: [bagsDir] })
        );

        const { RamrosTreeProvider } = await import('../../treeview/tree-provider');
        const { WorkspaceDetector } = await import('../../core/workspace-detector');
        const { DuplicatePackageDetector } = await import('../../core/duplicate-package-detector');
        const treeProviderForEntries = new RamrosTreeProvider(
          new WorkspaceDetector(async () => []),
          new DuplicatePackageDetector(),
          undefined,
          false
        );
        __setTreeProviderForTests(treeProviderForEntries);

        const fakeWorkspace = {
          id: workspaceDir,
          name: 'ws',
          rootPath: { fsPath: workspaceDir },
          srcPath: null,
          installPath: null,
          buildPath: null,
          rosDistribution: null,
          isValid: true,
          errors: [],
          warnings: [],
          packages: []
        };
        jest.spyOn(treeProviderForEntries, 'getWorkspaces').mockReturnValue([fakeWorkspace as any]);

        (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([
          { fsPath: path.join(workspaceDir, 'ws-bag.db3') }
        ]);

        // Compose the entries exactly as getBagEntries does in extension.ts.
        const configService = new WorkspaceConfigService(
          () => treeProviderForEntries.getWorkspaces()[0]?.rootPath.fsPath
        );
        const entries: TreeItemBase[] = (await getWorkspaceBagPaths(treeProviderForEntries.getWorkspaces()))
          .map(bagPath => new BagFileItem(bagPath));
        for (const folder of await configService.getBagFolders()) {
          entries.push(new ExternalBagFolderItem(folder, scanBagFolder(folder)));
        }

        const workspaceBag = entries.find(
          e => e instanceof BagFileItem && e.getBagPath() === path.join(workspaceDir, 'ws-bag.db3')
        );
        expect(workspaceBag).toBeDefined();

        const externalFolder = entries.find(e => e instanceof ExternalBagFolderItem) as ExternalBagFolderItem;
        expect(externalFolder).toBeDefined();
        expect(externalFolder.getFolderPath()).toBe(bagsDir);
        const folderChildren = await externalFolder.getChildren();
        expect(folderChildren.map(c => (c as BagFileItem).getBagPath())).toContain(externalBag);

        // The exported composition used by the tools tree must yield the same entries.
        const exportedEntries = await getBagEntriesForTests();
        expect(exportedEntries).toHaveLength(2);
        expect((exportedEntries[0] as BagFileItem).getBagPath()).toBe(path.join(workspaceDir, 'ws-bag.db3'));
        expect((exportedEntries[1] as ExternalBagFolderItem).getFolderPath()).toBe(bagsDir);
        const exportedChildren = await (exportedEntries[1] as ExternalBagFolderItem).getChildren();
        expect(exportedChildren.map(c => (c as BagFileItem).getBagPath())).toContain(externalBag);
      } finally {
        fs.rmSync(workspaceDir, { recursive: true, force: true });
        fs.rmSync(bagsDir, { recursive: true, force: true });
        (vscode.workspace.findFiles as jest.Mock).mockReset();
        (vscode.workspace.findFiles as jest.Mock).mockResolvedValue([]);
      }
    });
  });
});
