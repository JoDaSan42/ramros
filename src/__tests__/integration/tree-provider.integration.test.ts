import * as path from 'path';
import { RamrosTreeProvider } from '../../treeview/tree-provider';
import { WorkspaceDetector, WorkspaceInfo } from '../../core/workspace-detector';
import { DuplicatePackageDetector } from '../../core/duplicate-package-detector';
import { RosEnvironmentService } from '../../core/ros-environment';
import { NodeItem } from '../../treeview/workspace-items';
import { NodeInfo, PackageInfo } from '../../core/package-discovery';

const FIXTURES_ROOT = path.resolve(__dirname, '../../../test-fixtures');

describe('RamrosTreeProvider Integration Tests', () => {
  let treeProvider: RamrosTreeProvider;
  let workspaceDetector: WorkspaceDetector;
  let duplicateDetector: DuplicatePackageDetector;
  const providersToCleanUp: RamrosTreeProvider[] = [];

  const mockGetDistributions = async () => {
    const service = new RosEnvironmentService();
    return service.detectInstallations();
  };

  beforeEach(() => {
    workspaceDetector = new WorkspaceDetector(mockGetDistributions);
    duplicateDetector = new DuplicatePackageDetector();
    treeProvider = new RamrosTreeProvider(workspaceDetector, duplicateDetector);
    providersToCleanUp.push(treeProvider);
  });

  afterEach(() => {
    for (const provider of providersToCleanUp) {
      provider.stopAutoRefresh();
    }
    providersToCleanUp.length = 0;
    duplicateDetector.clearCache();
  });

  describe('getChildren', () => {
    it('handle empty workspace list', async () => {
      const originalWorkspace = (global as any).vscode?.workspace;
      (global as any).vscode = (global as any).vscode || {};
      (global as any).vscode.workspace = {
        workspaceFolders: []
      };

      const children = await treeProvider.getChildren();

      expect(children).toHaveLength(0);

      (global as any).vscode = originalWorkspace;
    });
  });

  describe('getWorkspaces and getConflicts', () => {
    it('returns workspace and conflict data', async () => {
      const workspaces = treeProvider.getWorkspaces();
      const conflicts = treeProvider.getConflicts();

      expect(Array.isArray(workspaces)).toBe(true);
      expect(Array.isArray(conflicts)).toBe(true);
    });
  });

  describe('duplicate detection', () => {
    it('detects duplicate packages in workspace-duplicates', async () => {
      const duplicatesPath = path.join(FIXTURES_ROOT, 'workspace-duplicates');
      
      const mockWorkspaceFolders = [{
        uri: { fsPath: duplicatesPath },
        name: 'workspace-duplicates',
        index: 0
      }];

      const vscode = require('vscode');
      vscode.workspace.workspaceFolders = mockWorkspaceFolders;

      const freshDuplicateDetector = new DuplicatePackageDetector();
      const freshTreeProvider = new RamrosTreeProvider(
        new WorkspaceDetector(mockGetDistributions),
        freshDuplicateDetector
      );
      providersToCleanUp.push(freshTreeProvider);

      const workspaces = freshTreeProvider.getWorkspaces();
      const conflicts = freshTreeProvider.getConflicts();

      expect(Array.isArray(workspaces)).toBe(true);
      expect(Array.isArray(conflicts)).toBe(true);

      freshDuplicateDetector.clearCache();
    });
  });

  describe('sort mode', () => {
    it('defaults to byPackage and toggles between modes', () => {
      expect(treeProvider.getSortMode()).toBe('byPackage');
      treeProvider.toggleSortMode();
      expect(treeProvider.getSortMode()).toBe('byCategory');
      treeProvider.toggleSortMode();
      expect(treeProvider.getSortMode()).toBe('byPackage');
    });

    it('returns category folders for a workspace root in byCategory mode', async () => {
      const withPackages = {
        id: '/ws', name: 'ws',
        rootPath: { fsPath: '/ws' } as any,
        srcPath: { fsPath: '/ws/src' } as any,
        installPath: null, buildPath: null, rosDistribution: null,
        isValid: true, errors: [], warnings: [],
        packages: [
          {
            name: 'pkg', path: '/ws/src/pkg', version: '1.0.0', description: '',
            maintainers: [], license: 'MIT', buildType: 'ament_cmake', packageType: 'cpp',
            dependencies: [], nodes: [], interfaces: [], launchFiles: [],
          },
        ],
      };

      const stubDetector = {
        detectWorkspaces: jest.fn().mockResolvedValue([withPackages]),
        validateWorkspace: jest.fn().mockResolvedValue(undefined),
      } as unknown as WorkspaceDetector;

      const stubDuplicates = {
        detectDuplicates: jest.fn().mockResolvedValue([]),
        clearCache: jest.fn(),
      } as unknown as DuplicatePackageDetector;

      const provider = new RamrosTreeProvider(
        stubDetector,
        stubDuplicates,
        undefined,
        false
      );
      providersToCleanUp.push(provider);
      await provider.refresh();

      provider.toggleSortMode();
      const roots = await provider.getChildren();
      expect(roots).toHaveLength(1);

      const children = await provider.getChildren(roots[0]);
      const labels = children.map(c => c.label);
      expect(labels).toEqual(['Nodes', 'Interfaces', 'Launch Files']);
    });
  });

  describe('event-driven refresh', () => {
    it('stopAutoRefresh disposes without throwing', () => {
      expect(() => treeProvider.stopAutoRefresh()).not.toThrow();
      // Idempotent
      expect(() => treeProvider.stopAutoRefresh()).not.toThrow();
    });

    it('onWorkspaceFoldersChanged reconfigures watchers and refreshes', async () => {
      const vscode = require('vscode');
      vscode.workspace.workspaceFolders = [];
      await expect(treeProvider.onWorkspaceFoldersChanged()).resolves.toBeUndefined();
    });

    it('refresh resolves and clears caches', async () => {
      await expect(treeProvider.refresh()).resolves.toBeUndefined();
    });

    it('watches install/setup.bash so builds refresh the workspace state', async () => {
      const vscode = require('vscode');
      vscode.workspace.workspaceFolders = [
        { uri: { fsPath: '/tmp/ws' }, name: 'ws', index: 0 }
      ];
      const createWatcher = vscode.workspace.createFileSystemWatcher as jest.Mock;
      createWatcher.mockClear();

      await treeProvider.onWorkspaceFoldersChanged();

      const watchedPatterns = createWatcher.mock.calls.map(call => String(call[0].pattern));
      expect(watchedPatterns.some(p => p.includes('install/setup.bash'))).toBe(true);
      vscode.workspace.workspaceFolders = [];
    });

    it('detects installPath changes as a workspace change in the silent refresh', async () => {
      const os = require('os');
      const fs = require('fs');
      const vscode = require('vscode');
      const tmpRoot = fs.mkdtempSync(require('path').join(os.tmpdir(), 'ramros-ws-'));
      fs.mkdirSync(require('path').join(tmpRoot, 'src'), { recursive: true });

      vscode.workspace.workspaceFolders = [
        { uri: { fsPath: tmpRoot }, name: require('path').basename(tmpRoot), index: 0 }
      ];

      try {
        const provider = new RamrosTreeProvider(
          workspaceDetector, duplicateDetector, undefined, false
        );
        providersToCleanUp.push(provider);
        await new Promise(resolve => setTimeout(resolve, 50));

        const before = provider.getWorkspaces();
        expect(before).toHaveLength(1);
        expect(before[0].installPath).toBeNull();

        fs.mkdirSync(require('path').join(tmpRoot, 'install'), { recursive: true });

        const fsStat = vscode.workspace.fs.stat as jest.Mock;
        const realStat = async (uri: { fsPath: string }) => {
          if (fs.existsSync(uri.fsPath) && fs.statSync(uri.fsPath).isDirectory()) {
            return { type: 2 };
          }
          throw new Error('Not implemented');
        };
        fsStat.mockImplementation(realStat);

        const detector = new WorkspaceDetector(mockGetDistributions);
        const refreshed = await detector.detectWorkspaces(true);
        expect(refreshed[0].installPath?.fsPath).toBe(require('path').join(tmpRoot, 'install'));

        const signature = (workspaces: WorkspaceInfo[]) => workspaces.map(w => ({
          packages: w.packages?.map(p => p.name).sort(),
          installPath: w.installPath?.fsPath ?? null,
        }));
        expect(JSON.stringify(signature(before))).not.toBe(JSON.stringify(signature(refreshed)));
      } finally {
        vscode.workspace.workspaceFolders = [];
        fs.rmSync(tmpRoot, { recursive: true, force: true });
      }
    });
  });

  describe('getTreeItem', () => {
    it('returns the element unchanged', async () => {
      const roots = await treeProvider.getChildren();
      if (roots.length > 0) {
        expect(treeProvider.getTreeItem(roots[0])).toBe(roots[0]);
      }
    });
  });

  describe('resolveWorkspaceForLaunch', () => {
    it('resolves the workspace from a package tree item', async () => {
      const { resolveWorkspaceForLaunch } = await import('../../extension');
      const pkg: PackageInfo = {
        name: 'pkg', path: '/tmp/ws-a/src/pkg', version: '1.0.0', description: '',
        maintainers: [], license: 'MIT', buildType: 'ament_cmake', packageType: 'cpp',
        dependencies: [], nodes: [], interfaces: [], launchFiles: [],
      };
      const fakeItem = { getPackageInfo: () => pkg, getChildren: async () => [] } as any;
      const makeWs = (id: string): WorkspaceInfo => ({
        id, name: id,
        rootPath: { fsPath: `/tmp/${id}` } as any,
        srcPath: { fsPath: `/tmp/${id}/src` } as any,
        installPath: null, buildPath: null, rosDistribution: null,
        isValid: true, errors: [], warnings: [], packages: [],
      });
      const wsA = makeWs('ws-a');
      const wsB = makeWs('ws-b');
      const ws = resolveWorkspaceForLaunch(fakeItem, [wsA, wsB]);
      expect(ws?.id).toBe('ws-a');
    });

    it('returns undefined for unrelated items', async () => {
      const { resolveWorkspaceForLaunch } = await import('../../extension');
      const unrelated = { getChildren: async () => [] } as any;
      expect(resolveWorkspaceForLaunch(unrelated, [])).toBeUndefined();
      expect(resolveWorkspaceForLaunch(undefined, [])).toBeUndefined();
    });
  });

  describe('node service and action children', () => {
    const makeNodeWithServices = (): NodeInfo => ({
      name: 'my_node',
      path: '/ws/src/pkg/src/my_node.cpp',
      packageName: 'pkg',
      language: 'cpp',
      isExecutable: true,
      publishers: [],
      subscriptions: [],
      parameters: [],
      serviceServers: [{ name: '/my_service', serviceType: 'my_ns/srv/MyService' }],
      serviceClients: [],
      actionServers: [{ name: '/my_action', actionType: 'my_ns/action/MyAction' }],
      actionClients: [],
    });

    it('shows services and actions as node children', async () => {
      const nodeItem = new NodeItem(makeNodeWithServices());
      const children = await nodeItem.getChildren();
      const folderLabels = children.map(c => c.label);
      expect(folderLabels).toContain('Service Servers');
      expect(folderLabels).toContain('Action Servers');
      const srvFolder = children.find(c => c.label === 'Service Servers');
      const srvChildren = await srvFolder!.getChildren();
      expect(srvChildren.length).toBe(1);
      expect(srvChildren[0].description).toContain('my_ns/srv/MyService');
      const actFolder = children.find(c => c.label === 'Action Servers');
      const actChildren = await actFolder!.getChildren();
      expect(actChildren[0].label).toBe('/my_action');
    });
  });
});
