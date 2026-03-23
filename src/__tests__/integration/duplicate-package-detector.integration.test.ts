import * as path from 'path';
import { DuplicatePackageDetector } from '../../core/duplicate-package-detector';
import { WorkspaceInfo } from '../../core/workspace-detector';

const FIXTURES_ROOT = path.resolve(__dirname, '../../../test-fixtures');

describe('DuplicatePackageDetector Integration Tests', () => {
  let detector: DuplicatePackageDetector;

  beforeEach(() => {
    detector = new DuplicatePackageDetector();
  });

  afterEach(() => {
    detector.clearCache();
  });

  describe('scanWorkspace', () => {
    it('handle empty workspaces', async () => {
      const workspace: WorkspaceInfo = {
        id: '/empty-ws',
        name: 'empty',
        rootPath: { fsPath: '/empty-ws' } as any,
        srcPath: null,
        installPath: null,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      const packages = await detector.scanWorkspace(workspace);

      expect(packages).toHaveLength(0);
    });

    it('handle missing src folder', async () => {
      const workspace: WorkspaceInfo = {
        id: '/no-src-ws',
        name: 'no-src',
        rootPath: { fsPath: '/no-src-ws' } as any,
        srcPath: null,
        installPath: { fsPath: '/no-src-ws/install' } as any,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      const packages = await detector.scanWorkspace(workspace);

      expect(packages).toHaveLength(0);
    });

    it('parse package.xml correctly', async () => {
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
      
      const workspace: WorkspaceInfo = {
        id: validWorkspacePath,
        name: 'workspace-valid',
        rootPath: { fsPath: validWorkspacePath } as any,
        srcPath: { fsPath: path.join(validWorkspacePath, 'src') } as any,
        installPath: { fsPath: path.join(validWorkspacePath, 'install') } as any,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      const packages = await detector.scanWorkspace(workspace);

      expect(packages).toHaveLength(1);
      expect(packages[0].name).toBe('my_package');
      expect(packages[0].workspaceId).toBe(validWorkspacePath);
    });
  });

  describe('detectDuplicates', () => {
    it('allow unique package names', async () => {
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
      
      const workspace: WorkspaceInfo = {
        id: validWorkspacePath,
        name: 'workspace-valid',
        rootPath: { fsPath: validWorkspacePath } as any,
        srcPath: { fsPath: path.join(validWorkspacePath, 'src') } as any,
        installPath: { fsPath: path.join(validWorkspacePath, 'install') } as any,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      const conflicts = await detector.detectDuplicates([workspace]);

      expect(conflicts).toHaveLength(0);
    });

    it('detect duplicates in same workspace', async () => {
      const duplicatesPath = path.join(FIXTURES_ROOT, 'workspace-duplicates');
      
      const workspace: WorkspaceInfo = {
        id: duplicatesPath,
        name: 'workspace-duplicates',
        rootPath: { fsPath: duplicatesPath } as any,
        srcPath: { fsPath: path.join(duplicatesPath, 'src') } as any,
        installPath: { fsPath: path.join(duplicatesPath, 'install') } as any,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      const conflicts = await detector.detectDuplicates([workspace]);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].packageName).toBe('pkg_a');
      expect(conflicts[0].type).toBe('same-workspace');
      expect(conflicts[0].locations.length).toBe(2);
    });

    it('detect cross-workspace conflicts', async () => {
      const ws1Path = path.join(FIXTURES_ROOT, 'multi-workspace/ws1');
      const ws2Path = path.join(FIXTURES_ROOT, 'multi-workspace/ws2');
      
      const workspace1: WorkspaceInfo = {
        id: ws1Path,
        name: 'ws1',
        rootPath: { fsPath: ws1Path } as any,
        srcPath: { fsPath: path.join(ws1Path, 'src') } as any,
        installPath: { fsPath: path.join(ws1Path, 'install') } as any,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      const workspace2: WorkspaceInfo = {
        id: ws2Path,
        name: 'ws2',
        rootPath: { fsPath: ws2Path } as any,
        srcPath: { fsPath: path.join(ws2Path, 'src') } as any,
        installPath: { fsPath: path.join(ws2Path, 'install') } as any,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      const conflicts = await detector.detectDuplicates([workspace1, workspace2]);

      expect(conflicts).toHaveLength(1);
      expect(conflicts[0].packageName).toBe('pkg_a');
      expect(conflicts[0].type).toBe('cross-workspace');
      expect(conflicts[0].locations.length).toBe(2);
    });
  });

  describe('validateNewPackageName', () => {
    it('validate new package name (unique)', async () => {
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
      
      const workspace: WorkspaceInfo = {
        id: validWorkspacePath,
        name: 'workspace-valid',
        rootPath: { fsPath: validWorkspacePath } as any,
        srcPath: { fsPath: path.join(validWorkspacePath, 'src') } as any,
        installPath: { fsPath: path.join(validWorkspacePath, 'install') } as any,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      const result = await detector.validateNewPackageName(
        'new_unique_package',
        validWorkspacePath,
        [workspace]
      );

      expect(result.isValid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.warning).toBeUndefined();
    });

    it('validate new package name (duplicate in same WS)', async () => {
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
      
      const workspace: WorkspaceInfo = {
        id: validWorkspacePath,
        name: 'workspace-valid',
        rootPath: { fsPath: validWorkspacePath } as any,
        srcPath: { fsPath: path.join(validWorkspacePath, 'src') } as any,
        installPath: { fsPath: path.join(validWorkspacePath, 'install') } as any,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      const result = await detector.validateNewPackageName(
        'my_package', // Already exists
        validWorkspacePath,
        [workspace]
      );

      expect(result.isValid).toBe(false);
      expect(result.error).toContain('my_package');
    });

    it('validate new package name (duplicate in other WS)', async () => {
      const ws1Path = path.join(FIXTURES_ROOT, 'multi-workspace/ws1');
      
      const workspace1: WorkspaceInfo = {
        id: ws1Path,
        name: 'ws1',
        rootPath: { fsPath: ws1Path } as any,
        srcPath: { fsPath: path.join(ws1Path, 'src') } as any,
        installPath: { fsPath: path.join(ws1Path, 'install') } as any,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      // Create a workspace3 without pkg_a
      const workspace3Path = path.join(FIXTURES_ROOT, 'workspace-valid');
      const workspace3: WorkspaceInfo = {
        id: workspace3Path,
        name: 'ws3',
        rootPath: { fsPath: workspace3Path } as any,
        srcPath: { fsPath: path.join(workspace3Path, 'src') } as any,
        installPath: { fsPath: path.join(workspace3Path, 'install') } as any,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      // Try to add pkg_a to ws3 (already exists in ws1)
      const result = await detector.validateNewPackageName(
        'pkg_a',
        workspace3Path,
        [workspace1, workspace3]
      );

      expect(result.isValid).toBe(true); // Allowed but with warning
      expect(result.warning).toContain('pkg_a');
      expect(result.warning).toContain('ws1');
    });
  });

  describe('isPackageNameUnique', () => {
    it('cache scan results', async () => {
      const validWorkspacePath = path.join(FIXTURES_ROOT, 'workspace-valid');
      
      const workspace: WorkspaceInfo = {
        id: validWorkspacePath,
        name: 'workspace-valid',
        rootPath: { fsPath: validWorkspacePath } as any,
        srcPath: { fsPath: path.join(validWorkspacePath, 'src') } as any,
        installPath: { fsPath: path.join(validWorkspacePath, 'install') } as any,
        buildPath: null,
        rosDistribution: null,
        isValid: true,
        errors: [],
        warnings: []
      };

      // First scan populates cache
      await detector.scanWorkspace(workspace);

      // Check uniqueness (uses cache)
      const isUnique = await detector.isPackageNameUnique('my_package', validWorkspacePath);
      expect(isUnique).toBe(false);

      const isUniqueNew = await detector.isPackageNameUnique('new_package', validWorkspacePath);
      expect(isUniqueNew).toBe(true);
    });
  });
});
