import * as vscode from 'vscode';
import { runCreatePackageWizard, runAddToPackageWizard } from '../../../wizard/package-wizard';
import { PackageCreator } from '../../../wizard/package-creator';
import { WorkspaceInfo } from '../../../core/workspace-detector';
import { PackageInfo } from '../../../core/package-discovery';
import * as fs from 'fs';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  mkdirSync: jest.fn(),
}));

const workspaceFolder = {
  uri: { fsPath: '/tmp/fake-ws' },
};

function makeWorkspace(overrides: Partial<WorkspaceInfo> = {}): WorkspaceInfo {
  return {
    id: '/tmp/fake-ws',
    name: 'fake-ws',
    rootPath: { fsPath: '/tmp/fake-ws' } as any,
    srcPath: { fsPath: '/tmp/fake-ws/src' } as any,
    installPath: null,
    buildPath: null,
    rosDistribution: null,
    isValid: true,
    errors: [],
    warnings: [],
    packages: [],
    ...overrides,
  };
}

function makePackage(): PackageInfo {
  return {
    name: 'my_pkg',
    path: '/tmp/fake-ws/src/my_pkg',
    version: '0.0.0',
    description: '',
    maintainers: [],
    license: 'MIT',
    buildType: 'ament_cmake',
    packageType: 'cpp',
    dependencies: [],
    nodes: [],
    interfaces: [],
    launchFiles: [],
  };
}

describe('package-wizard', () => {
  let packageCreator: PackageCreator;
  let refresh: jest.Mock;
  let showInputBox: jest.Mock;
  let showQuickPick: jest.Mock;
  let showInformationMessage: jest.Mock;
  let showWarningMessage: jest.Mock;
  let showErrorMessage: jest.Mock;

  beforeEach(() => {
    packageCreator = {
      createPackage: jest.fn().mockResolvedValue(undefined),
      addNodeToPackage: jest.fn().mockResolvedValue(undefined),
      addInterfaceToPackage: jest.fn().mockResolvedValue(undefined),
    } as unknown as PackageCreator;

    refresh = jest.fn().mockResolvedValue(undefined);

    showInputBox = vscode.window.showInputBox as unknown as jest.Mock;
    showQuickPick = vscode.window.showQuickPick as unknown as jest.Mock;
    showInformationMessage = vscode.window.showInformationMessage as unknown as jest.Mock;
    showWarningMessage = vscode.window.showWarningMessage as unknown as jest.Mock;
    showErrorMessage = vscode.window.showErrorMessage as unknown as jest.Mock;

    jest.clearAllMocks();
    (vscode.workspace as any).workspaceFolders = [workspaceFolder];
  });

  describe('runCreatePackageWizard', () => {
    it('reports an error when no folder is open', async () => {
      (vscode.workspace as any).workspaceFolders = undefined;

      await runCreatePackageWizard({
        packageCreator,
        getWorkspaces: () => [makeWorkspace()],
        refresh,
      });

      expect(showErrorMessage).toHaveBeenCalledWith('Please open a folder in VSCode first');
      expect(packageCreator.createPackage).not.toHaveBeenCalled();
    });

    it('aborts when the package name is cancelled', async () => {
      showInputBox.mockResolvedValueOnce(undefined);

      await runCreatePackageWizard({
        packageCreator,
        getWorkspaces: () => [makeWorkspace()],
        refresh,
      });

      expect(packageCreator.createPackage).not.toHaveBeenCalled();
    });

    it('creates a python package with defaults', async () => {
      // packageName, description, authorName, authorEmail, nodeName, deps
      showInputBox
        .mockResolvedValueOnce('my_pkg')       // package name
        .mockResolvedValueOnce('A ROS2 package') // description
        .mockResolvedValueOnce('Jane Doe')     // author name
        .mockResolvedValueOnce('jane@example.com') // author email
        .mockResolvedValueOnce('my_node')      // node name
        .mockResolvedValueOnce('');            // deps (accept defaults)

      showQuickPick
        .mockResolvedValueOnce({ label: 'python' })          // package type
        .mockResolvedValueOnce({ label: 'Apache-2.0' })      // license
        .mockResolvedValueOnce({ label: 'yes' });            // include template

      await runCreatePackageWizard({
        packageCreator,
        getWorkspaces: () => [makeWorkspace()],
        refresh,
      });

      expect(packageCreator.createPackage).toHaveBeenCalledTimes(1);
      const [root, config] = (packageCreator.createPackage as jest.Mock).mock.calls[0];
      expect(root).toBe('/tmp/fake-ws');
      expect(config).toMatchObject({
        packageName: 'my_pkg',
        template: 'minimal-python',
        buildType: 'ament_python',
        nodeName: 'my_node',
        dependencies: ['rclpy', 'std_msgs'],
      });
      expect(refresh).toHaveBeenCalled();
      expect(showInformationMessage).toHaveBeenCalled();
    });

    it('surfaces creation failures as an error message', async () => {
      (packageCreator.createPackage as jest.Mock).mockRejectedValueOnce(new Error('boom'));

      showInputBox
        .mockResolvedValueOnce('my_pkg')
        .mockResolvedValueOnce('desc')
        .mockResolvedValueOnce('Jane')
        .mockResolvedValueOnce('jane@example.com')
        .mockResolvedValueOnce('my_node')
        .mockResolvedValueOnce('');

      showQuickPick
        .mockResolvedValueOnce({ label: 'cpp' })
        .mockResolvedValueOnce({ label: 'MIT' })
        .mockResolvedValueOnce({ label: 'yes' });

      await runCreatePackageWizard({
        packageCreator,
        getWorkspaces: () => [makeWorkspace()],
        refresh,
      });

      expect(showErrorMessage).toHaveBeenCalledWith('Failed to create package: boom');
      expect(refresh).not.toHaveBeenCalled();
    });

    it('errors when there is no workspace even though a folder is open', async () => {
      showInputBox
        .mockResolvedValueOnce('my_pkg')
        .mockResolvedValueOnce('desc')
        .mockResolvedValueOnce('Jane')
        .mockResolvedValueOnce('jane@example.com')
        .mockResolvedValueOnce('my_node')
        .mockResolvedValueOnce('');

      showQuickPick
        .mockResolvedValueOnce({ label: 'cpp' })
        .mockResolvedValueOnce({ label: 'MIT' })
        .mockResolvedValueOnce({ label: 'yes' });

      await runCreatePackageWizard({
        packageCreator,
        getWorkspaces: () => [],
        refresh,
      });

      expect(showErrorMessage).toHaveBeenCalledWith(
        'Failed to create package: No workspace found. Please open a folder in VSCode first.'
      );
    });
  });

  describe('runAddToPackageWizard', () => {
    it('adds an interface when that option is chosen', async () => {
      showQuickPick
        .mockResolvedValueOnce({ label: 'interface' })      // add type
        .mockResolvedValueOnce({ label: 'message' })        // interface type
        .mockResolvedValueOnce({ label: 'no' });            // add another field?
      showInputBox
        .mockResolvedValueOnce('MyMessage')                 // interface name
        .mockResolvedValueOnce('string')                    // field type
        .mockResolvedValueOnce('data');                     // field name

      await runAddToPackageWizard(makePackage(), {
        packageCreator,
        refresh,
      });

      expect(packageCreator.addInterfaceToPackage).toHaveBeenCalledWith(
        '/tmp/fake-ws/src/my_pkg',
        'my_pkg',
        expect.objectContaining({ type: 'message', name: 'MyMessage' })
      );
      expect(refresh).toHaveBeenCalled();
    });

    it('adds a cpp node to a cpp package', async () => {
      showQuickPick
        .mockResolvedValueOnce({ label: 'node' })            // add type
        .mockResolvedValueOnce({ label: 'yes' });            // include template
      showInputBox
        .mockResolvedValueOnce('my_node')                    // node name
        .mockResolvedValueOnce('');                          // deps

      await runAddToPackageWizard(makePackage(), {
        packageCreator,
        refresh,
      });

      expect(packageCreator.addNodeToPackage).toHaveBeenCalledWith(
        '/tmp/fake-ws/src/my_pkg',
        'my_pkg',
        expect.objectContaining({
          nodeType: 'cpp',
          nodeName: 'my_node',
          includeTemplateNode: true,
        })
      );
      expect(refresh).toHaveBeenCalled();
    });

    it('errors for an unrecognised package type', async () => {
      showQuickPick.mockResolvedValueOnce({ label: 'node' });
      const unknownPkg = { ...makePackage(), packageType: 'empty' } as PackageInfo;

      await runAddToPackageWizard(unknownPkg, {
        packageCreator,
        refresh,
      });

      expect(showErrorMessage).toHaveBeenCalledWith('Package type not recognized');
      expect(packageCreator.addNodeToPackage).not.toHaveBeenCalled();
    });

    it('does nothing when add-type selection is cancelled', async () => {
      showQuickPick.mockResolvedValueOnce(undefined);

      await runAddToPackageWizard(makePackage(), {
        packageCreator,
        refresh,
      });

      expect(packageCreator.addNodeToPackage).not.toHaveBeenCalled();
      expect(packageCreator.addInterfaceToPackage).not.toHaveBeenCalled();
    });

    it('surfaces node-addition failures', async () => {
      (packageCreator.addNodeToPackage as jest.Mock).mockRejectedValueOnce(new Error('nope'));

      showQuickPick
        .mockResolvedValueOnce({ label: 'node' })
        .mockResolvedValueOnce({ label: 'no' });
      showInputBox
        .mockResolvedValueOnce('my_node')
        .mockResolvedValueOnce('');

      await runAddToPackageWizard(makePackage(), {
        packageCreator,
        refresh,
      });

      expect(showErrorMessage).toHaveBeenCalledWith('Failed to add node: nope');
    });
  });
});
