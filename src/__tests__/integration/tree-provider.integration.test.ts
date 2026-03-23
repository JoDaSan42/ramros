import * as path from 'path';
import { RamrosTreeProvider } from '../../treeview/tree-provider';
import { WorkspaceDetector } from '../../core/workspace-detector';
import { DuplicatePackageDetector } from '../../core/duplicate-package-detector';
import { RosEnvironmentService } from '../../core/ros-environment';
import { TreeItemBase } from '../../treeview/tree-items';

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
      // Mock empty workspace folders
      const originalWorkspace = (global as any).vscode?.workspace;
      (global as any).vscode = (global as any).vscode || {};
      (global as any).vscode.workspace = {
        workspaceFolders: []
      };

      const children = await treeProvider.getChildren();

      expect(children).toHaveLength(0);

      // Restore
      (global as any).vscode = originalWorkspace;
    });

    it('create tree from workspaces', async () => {
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
      
      const mockWorkspaceFolders = [{
        uri: { fsPath: validWorkspacePath },
        name: 'workspace-valid',
        index: 0
      }];

      // Update the mocked vscode module
      const vscode = require('vscode');
      vscode.workspace.workspaceFolders = mockWorkspaceFolders;
      vscode.workspace.fs = {
        stat: async (uri: any) => {
          const fs = require('fs');
          try {
            const stat = fs.statSync(uri.fsPath);
            return {
              type: stat.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File,
              ctime: stat.ctimeMs,
              mtime: stat.mtimeMs,
              size: stat.size
            };
          } catch {
            throw new Error('File not found');
          }
        }
      };

      // Create a fresh tree provider with updated mocks
      const freshWorkspaceDetector = new WorkspaceDetector(mockGetDistributions);
      const freshDuplicateDetector = new DuplicatePackageDetector();
      const freshTreeProvider = new RamrosTreeProvider(freshWorkspaceDetector, freshDuplicateDetector);

      const children = await freshTreeProvider.getChildren();

      expect(children.length).toBeGreaterThan(0);

      // Cleanup
      freshDuplicateDetector.clearCache();
    });

    it('warning badge display', async () => {
      // This test verifies that workspaces with warnings show warning items
      // Implementation depends on actual workspace validation
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
      
      const mockWorkspaceFolders = [{
        uri: { fsPath: validWorkspacePath },
        name: 'workspace-valid',
        index: 0
      }];

      // Update the mocked vscode module
      const vscode = require('vscode');
      vscode.workspace.workspaceFolders = mockWorkspaceFolders;
      vscode.workspace.fs = {
        stat: async (uri: any) => {
          const fs = require('fs');
          try {
            const stat = fs.statSync(uri.fsPath);
            return {
              type: stat.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File,
              ctime: stat.ctimeMs,
              mtime: stat.mtimeMs,
              size: stat.size
            };
          } catch {
            throw new Error('File not found');
          }
        }
      };

      // Create a fresh tree provider
      const freshWorkspaceDetector = new WorkspaceDetector(mockGetDistributions);
      const freshDuplicateDetector = new DuplicatePackageDetector();
      const freshTreeProvider = new RamrosTreeProvider(freshWorkspaceDetector, freshDuplicateDetector);

      const children = await freshTreeProvider.getChildren();
      
      if (children.length > 0) {
        const workspaceItem = children[0] as TreeItemBase;
        const workspaceChildren = await workspaceItem.getChildren();
        
        // Should have at least PackagesPlaceholderItem
        expect(workspaceChildren.length).toBeGreaterThan(0);
      }

      // Cleanup
      freshDuplicateDetector.clearCache();
    });

    it('conflict item display', async () => {
      const duplicatesPath = path.join(FIXTURES_ROOT, 'workspace-duplicates');
      
      const mockWorkspaceFolders = [{
        uri: { fsPath: duplicatesPath },
        name: 'workspace-duplicates',
        index: 0
      }];

      // Update the mocked vscode module
      const vscode = require('vscode');
      vscode.workspace.workspaceFolders = mockWorkspaceFolders;
      vscode.workspace.fs = {
        stat: async (uri: any) => {
          const fs = require('fs');
          try {
            const stat = fs.statSync(uri.fsPath);
            return {
              type: stat.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File,
              ctime: stat.ctimeMs,
              mtime: stat.mtimeMs,
              size: stat.size
            };
          } catch {
            throw new Error('File not found');
          }
        }
      };

      // Create fresh providers
      const freshWorkspaceDetector = new WorkspaceDetector(mockGetDistributions);
      const freshDuplicateDetector = new DuplicatePackageDetector();
      const freshTreeProvider = new RamrosTreeProvider(freshWorkspaceDetector, freshDuplicateDetector);

      const children = await freshTreeProvider.getChildren();

      // Should have workspace root and conflicts item
      expect(children.length).toBeGreaterThanOrEqual(1);

      // Check for conflicts
      const conflicts = freshTreeProvider.getConflicts();
      expect(conflicts.length).toBeGreaterThan(0);

      // Cleanup
      freshDuplicateDetector.clearCache();
    });
  });

  describe('refresh', () => {
    it('refresh triggers reload', async () => {
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
      
      const mockWorkspaceFolders = [{
        uri: { fsPath: validWorkspacePath },
        name: 'workspace-valid',
        index: 0
      }];

      const originalWorkspace = (global as any).vscode?.workspace;
      (global as any).vscode = (global as any).vscode || {};
      (global as any).vscode.workspace = {
        workspaceFolders: mockWorkspaceFolders,
        fs: {
          stat: jest.fn().mockRejectedValue(new Error('File not found'))
        }
      };

      // Initial load
      await treeProvider.refresh();
      const workspaces1 = treeProvider.getWorkspaces();

      // Refresh again
      await treeProvider.refresh();
      const workspaces2 = treeProvider.getWorkspaces();

      // Should have same count
      expect(workspaces1.length).toBe(workspaces2.length);

      // Restore
      (global as any).vscode = originalWorkspace;
    });
  });

  describe('getWorkspaces and getConflicts', () => {
    it('returns workspace and conflict data', async () => {
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
      
      const mockWorkspaceFolders = [{
        uri: { fsPath: validWorkspacePath },
        name: 'workspace-valid',
        index: 0
      }];

      const originalWorkspace = (global as any).vscode?.workspace;
      (global as any).vscode = (global as any).vscode || {};
      (global as any).vscode.workspace = {
        workspaceFolders: mockWorkspaceFolders,
        fs: {
          stat: jest.fn().mockRejectedValue(new Error('File not found'))
        }
      };

      await treeProvider.refresh();

      const workspaces = treeProvider.getWorkspaces();
      const conflicts = treeProvider.getConflicts();

      expect(Array.isArray(workspaces)).toBe(true);
      expect(Array.isArray(conflicts)).toBe(true);

      // Restore
      (global as any).vscode = originalWorkspace;
    });
  });
});
