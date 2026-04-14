import * as path from 'path';
import * as fs from 'fs';
import { WorkspaceDetector, WorkspaceInfo } from '../../core/workspace-detector';
import { RosEnvironmentService } from '../../core/ros-environment';
import * as vscode from 'vscode';

const FIXTURES_ROOT = path.resolve(__dirname, '../../../test-fixtures');

describe('WorkspaceDetector Integration Tests', () => {
  let detector: WorkspaceDetector;
  let originalFs: any;

  const mockGetDistributions = async () => {
    const service = new RosEnvironmentService();
    return service.detectInstallations();
  };

  beforeEach(() => {
    detector = new WorkspaceDetector(mockGetDistributions);
    // Store original vscode.workspace.fs
    originalFs = (vscode.workspace as any).fs;
  });

  afterEach(() => {
    // Restore original fs
    (vscode.workspace as any).fs = originalFs;
  });

  describe('detectWorkspaces', () => {
    it('detects single valid workspace', async () => {
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
      
      // Mock vscode.workspace.workspaceFolders
      const mockWorkspaceFolders = [{
        uri: { fsPath: validWorkspacePath },
        name: 'workspace-valid',
        index: 0
      }];

      (vscode.workspace as any).workspaceFolders = mockWorkspaceFolders;
      (vscode.workspace as any).fs = {
        stat: async (uri: any) => {
          const filePath = uri.fsPath || uri.path;
          const stat = fs.statSync(filePath);
          return {
            type: stat.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File,
            ctime: stat.ctimeMs,
            mtime: stat.mtimeMs,
            size: stat.size
          };
        }
      };

      const workspaces = await detector.detectWorkspaces();

      expect(workspaces).toHaveLength(1);
      expect(workspaces[0].name).toBe('workspace-valid');
      expect(workspaces[0].srcPath).not.toBeNull();
      expect(workspaces[0].installPath).not.toBeNull();
    });

    it('detects empty folders as valid workspaces', async () => {
      const emptyWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-empty');
      
      const mockWorkspaceFolders = [{
        uri: { fsPath: emptyWorkspacePath },
        name: 'workspace-empty',
        index: 0
      }];

      (vscode.workspace as any).workspaceFolders = mockWorkspaceFolders;
      (vscode.workspace as any).fs = {
        stat: jest.fn().mockRejectedValue(new Error('File not found'))
      };

      const workspaces = await detector.detectWorkspaces();

      expect(workspaces).toHaveLength(1);
      expect(workspaces[0].isValid).toBe(true);
      expect(workspaces[0].warnings.some(w => w.includes('Empty workspace'))).toBe(true);
    });

    it('validates src folder presence', async () => {
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
      
      const mockWorkspaceFolders = [{
        uri: { fsPath: validWorkspacePath },
        name: 'workspace-valid',
        index: 0
      }];

      (vscode.workspace as any).workspaceFolders = mockWorkspaceFolders;
      (vscode.workspace as any).fs = {
        stat: async (uri: any) => {
          const filePath = uri.fsPath || uri.path;
          const stat = fs.statSync(filePath);
          return {
            type: stat.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File,
            ctime: stat.ctimeMs,
            mtime: stat.mtimeMs,
            size: stat.size
          };
        }
      };

      const workspaces = await detector.detectWorkspaces();
      
      expect(workspaces).toHaveLength(1);
      expect(workspaces[0].srcPath?.fsPath).toContain('src');
    });

    it('validates install folder presence', async () => {
      const noSrcWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-no-src');
      
      const mockWorkspaceFolders = [{
        uri: { fsPath: noSrcWorkspacePath },
        name: 'workspace-no-src',
        index: 0
      }];

      (vscode.workspace as any).workspaceFolders = mockWorkspaceFolders;
      (vscode.workspace as any).fs = {
        stat: async (uri: any) => {
          const filePath = uri.fsPath || uri.path;
          try {
            const stat = fs.statSync(filePath);
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

      const workspaces = await detector.detectWorkspaces();
      
      expect(workspaces).toHaveLength(1);
      expect(workspaces[0].installPath).not.toBeNull();
      expect(workspaces[0].srcPath).toBeNull();
    });
  });

  describe('validateWorkspace', () => {
    it('generates warnings for unbuilt workspace', async () => {
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
      
      const workspace: WorkspaceInfo = {
        id: validWorkspacePath,
        name: 'workspace-valid',
        rootPath: { fsPath: validWorkspacePath } as any,
        srcPath: { fsPath: path.join(validWorkspacePath, 'src') } as any,
        installPath: { fsPath: path.join(validWorkspacePath, 'install') } as any,
        buildPath: null,
        rosDistribution: null,
        isValid: false,
        errors: [],
        warnings: []
      };

      await detector.validateWorkspace(workspace);

      expect(workspace.isValid).toBe(true);
      expect(workspace.errors).toHaveLength(0);
    });

    it('generates warnings for empty workspace', async () => {
      const emptyWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-empty');
      
      const workspace: WorkspaceInfo = {
        id: emptyWorkspacePath,
        name: 'workspace-empty',
        rootPath: { fsPath: emptyWorkspacePath } as any,
        srcPath: null,
        installPath: null,
        buildPath: null,
        rosDistribution: null,
        isValid: false,
        errors: [],
        warnings: []
      };

      await detector.validateWorkspace(workspace);

      expect(workspace.isValid).toBe(true);
      expect(workspace.warnings.length).toBeGreaterThan(0);
      expect(workspace.warnings[0]).toContain('Empty workspace');
    });

    it('creates workspace info with all paths', async () => {
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
      
      const mockWorkspaceFolders = [{
        uri: { fsPath: validWorkspacePath },
        name: 'workspace-valid',
        index: 0
      }];

      (vscode.workspace as any).workspaceFolders = mockWorkspaceFolders;
      (vscode.workspace as any).fs = {
        stat: async (uri: any) => {
          const filePath = uri.fsPath || uri.path;
          const stat = fs.statSync(filePath);
          return {
            type: stat.isDirectory() ? vscode.FileType.Directory : vscode.FileType.File,
            ctime: stat.ctimeMs,
            mtime: stat.mtimeMs,
            size: stat.size
          };
        }
      };

      const workspaces = await detector.detectWorkspaces();
      
      expect(workspaces).toHaveLength(1);
      const ws = workspaces[0];
      expect(ws.id).toBe(validWorkspacePath);
      expect(ws.name).toBe('workspace-valid');
      expect(ws.rootPath.fsPath).toBe(validWorkspacePath);
      expect(ws.srcPath?.fsPath).toBe(path.join(validWorkspacePath, 'src'));
      expect(ws.installPath?.fsPath).toBe(path.join(validWorkspacePath, 'install'));
    });
  });
});
