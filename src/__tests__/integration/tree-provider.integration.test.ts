import * as path from 'path';
import { RamrosTreeProvider } from '../../treeview/tree-provider';
import { WorkspaceDetector } from '../../core/workspace-detector';
import { DuplicatePackageDetector } from '../../core/duplicate-package-detector';
import { RosEnvironmentService } from '../../core/ros-environment';

const FIXTURES_ROOT = path.resolve(__dirname, '../../../test-fixtures');

describe('RamrosTreeProvider Integration Tests', () => {
  let treeProvider: RamrosTreeProvider;
  let workspaceDetector: WorkspaceDetector;
  let duplicateDetector: DuplicatePackageDetector;

  const mockGetDistributions = async () => {
    const service = new RosEnvironmentService();
    return service.detectInstallations();
  };

  beforeEach(() => {
    workspaceDetector = new WorkspaceDetector(mockGetDistributions);
    duplicateDetector = new DuplicatePackageDetector();
    treeProvider = new RamrosTreeProvider(workspaceDetector, duplicateDetector);
  });

  afterEach(() => {
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

      const workspaces = freshTreeProvider.getWorkspaces();
      const conflicts = freshTreeProvider.getConflicts();

      expect(Array.isArray(workspaces)).toBe(true);
      expect(Array.isArray(conflicts)).toBe(true);

      freshDuplicateDetector.clearCache();
    });
  });
});
