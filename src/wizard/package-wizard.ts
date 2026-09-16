import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PackageCreator } from './package-creator';
import { PackageFormValidator } from './package-form-validator';
import { collectInterfaceDefinition, InterfaceDefinition } from './interface-collector';
import { WorkspaceInfo } from '../core/workspace-detector';
import { PackageInfo } from '../core/package-discovery';

export interface CreatePackageWizardContext {
  packageCreator: PackageCreator;
  getWorkspaces: () => WorkspaceInfo[];
  refresh: () => Promise<void>;
}

export interface AddToPackageWizardContext {
  packageCreator: PackageCreator;
  refresh: () => Promise<void>;
}

function parseDependencies(input: string | undefined, defaults: string[]): string[] {
  if (input && input.trim().length > 0) {
    return input.split(',').map(d => d.trim()).filter(d => d.length > 0);
  }
  return defaults;
}

async function collectInterfaceDefinitions(): Promise<InterfaceDefinition[]> {
  const interfaces: InterfaceDefinition[] = [];

  let shouldContinue = true;
  while (shouldContinue) {
    try {
      const result = await collectInterfaceDefinition();
      if (result) {
        interfaces.push(result);
        const ext = result.type === 'message' ? '.msg' : result.type === 'service' ? '.srv' : '.action';
        void vscode.window.showInformationMessage(`Created ${result.type} '${result.name}${ext}'`);

        const continueChoice = await vscode.window.showQuickPick([
          { label: 'add_another', description: 'Add another interface' },
          { label: 'finish', description: 'Finish and create package' }
        ], {
          placeHolder: 'What would you like to do next?'
        });
        shouldContinue = continueChoice?.label === 'add_another';
      } else {
        shouldContinue = false;
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Error adding interface: ${message}`);
      break;
    }
  }

  return interfaces;
}

export async function runCreatePackageWizard(context: CreatePackageWizardContext): Promise<void> {
  const { packageCreator, getWorkspaces, refresh } = context;
  const validator = new PackageFormValidator();

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    void vscode.window.showErrorMessage('Please open a folder in VSCode first');
    return;
  }

  const packageName = await vscode.window.showInputBox({
    prompt: 'Enter package name',
    placeHolder: 'my_package',
    validateInput: (value) => {
      const existingPackages = getWorkspaces().flatMap(w => w.name);
      const result = validator.validatePackageName(value || '', existingPackages);
      return result.isValid ? null : result.errors.join(', ');
    }
  });

  if (!packageName) return;

  const packageTypePick = await vscode.window.showQuickPick(
    [
      { label: 'python', description: 'Python package with minimal node', detail: 'Creates ament_python package' },
      { label: 'cpp', description: 'C++ package with minimal node', detail: 'Creates ament_cmake package' },
      { label: 'cpp-python', description: 'Package with both C++ and Python nodes', detail: 'Creates ament_cmake package' },
      { label: 'interface', description: 'Interface package for messages, services, or actions', detail: 'Creates interface package' }
    ],
    { placeHolder: 'Select package type' }
  );

  if (!packageTypePick) return;
  const packageType = packageTypePick.label;

  let template: 'empty' | 'minimal-cpp' | 'minimal-python' | 'standard' | 'interface';
  switch (packageType) {
    case 'python':
      template = 'minimal-python';
      break;
    case 'cpp':
      template = 'minimal-cpp';
      break;
    case 'cpp-python':
      template = 'standard';
      break;
    case 'interface':
      template = 'interface';
      break;
    default:
      template = 'minimal-python';
  }

  const description = await vscode.window.showInputBox({
    prompt: 'Enter package description',
    value: template === 'interface' ? 'Interface package for ROS2 messages, services, and actions' : 'A ROS2 package'
  }) || '';

  const authorName = await vscode.window.showInputBox({
    prompt: 'Enter author name',
    placeHolder: 'Your Name',
    value: ''
  }) || '';

  const authorEmail = await vscode.window.showInputBox({
    prompt: 'Enter author email',
    placeHolder: 'your.email@example.com',
    value: ''
  }) || '';

  const license = await vscode.window.showQuickPick(
    ['Apache-2.0', 'MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'GPL-3.0'],
    { placeHolder: 'Select license' }
  ) || 'Apache-2.0';

  let buildType: 'ament_cmake' | 'ament_python' | 'cmake' = 'ament_cmake';
  if (packageType === 'python') {
    buildType = 'ament_python';
  } else if (packageType === 'cpp' || packageType === 'cpp-python') {
    buildType = 'ament_cmake';
  } else if (packageType === 'interface') {
    buildType = 'ament_cmake';
  }

  let nodeName: string | undefined;
  let includeTemplateNode: boolean | undefined;

  if (packageType !== 'interface') {
    nodeName = await vscode.window.showInputBox({
      prompt: 'Enter node name',
      value: packageName
    });

    if (packageType === 'python' || packageType === 'cpp' || packageType === 'cpp-python') {
      const includeNodeChoice = await vscode.window.showQuickPick(
        [
          { label: 'yes', description: 'Create package with template node implementation' },
          { label: 'no', description: 'Create empty package without node' }
        ],
        { placeHolder: 'Include template node implementation?' }
      );
      includeTemplateNode = includeNodeChoice?.label === 'yes';
    }
  }

  let defaultDeps: string[] = [];
  if (packageType === 'cpp' || packageType === 'cpp-python') {
    defaultDeps = ['rclcpp', 'std_msgs'];
  } else if (packageType === 'python') {
    defaultDeps = ['rclpy', 'std_msgs'];
  }

  const depsInput = await vscode.window.showInputBox({
    prompt: 'Enter additional dependencies (comma-separated)',
    placeHolder: template === 'interface' ? 'std_msgs, geometry_msgs' : defaultDeps.join(', '),
    value: defaultDeps.join(', ')
  });

  const dependencies = parseDependencies(depsInput, defaultDeps);

  try {
    const workspaces = getWorkspaces();
    if (workspaces.length === 0) {
      throw new Error('No workspace found. Please open a folder in VSCode first.');
    }

    const targetWorkspace = workspaces[0];
    const srcPath = path.join(targetWorkspace.rootPath.fsPath, 'src');

    if (!fs.existsSync(srcPath)) {
      fs.mkdirSync(srcPath, { recursive: true });
    }

    let interfaces: InterfaceDefinition[] | undefined;

    if (template === 'interface') {
      interfaces = await collectInterfaceDefinitions();
      if (interfaces.length === 0) {
        void vscode.window.showWarningMessage('No interfaces defined. Creating empty interface package.');
      }
    }

    await packageCreator.createPackage(targetWorkspace.rootPath.fsPath, {
      packageName,
      description,
      authorName,
      authorEmail,
      license,
      buildType,
      template,
      nodeName,
      dependencies,
      interfaces,
      includeTemplateNode,
    });
    await refresh();
    void vscode.window.showInformationMessage(`Package '${packageName}' created successfully!`);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    void vscode.window.showErrorMessage(`Failed to create package: ${message}`);
  }
}

export async function runAddToPackageWizard(
  selectedPackage: PackageInfo,
  context: AddToPackageWizardContext
): Promise<void> {
  const { packageCreator, refresh } = context;
  const validator = new PackageFormValidator();

  const addType = await vscode.window.showQuickPick([
    { label: 'node', description: 'Add a new node (C++ or Python)' },
    { label: 'interface', description: 'Add a new interface (msg/srv/action)' }
  ], {
    placeHolder: 'What would you like to add?'
  });

  if (!addType) return;

  if (addType.label === 'interface') {
    const result = await collectInterfaceDefinition();
    if (!result) return;

    try {
      await packageCreator.addInterfaceToPackage(
        selectedPackage.path,
        selectedPackage.name,
        result
      );
      await refresh();
      void vscode.window.showInformationMessage(`Interface '${result.name}' added to package '${selectedPackage.name}'`);
      void vscode.window.showInformationMessage('Build workspace to compile');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      void vscode.window.showErrorMessage(`Failed to add interface: ${message}`);
    }

    return;
  }

  const isCppPackage = selectedPackage.packageType === 'cpp' || selectedPackage.packageType === 'mixed';
  const isPythonPackage = selectedPackage.packageType === 'python' || selectedPackage.packageType === 'mixed';

  let languageChoices: { label: string; description: string }[] = [];
  if (isCppPackage && isPythonPackage) {
    languageChoices = [
      { label: 'cpp', description: 'C++ node' },
      { label: 'python', description: 'Python node' }
    ];
  } else if (isCppPackage) {
    languageChoices = [{ label: 'cpp', description: 'C++ node' }];
  } else if (isPythonPackage) {
    languageChoices = [{ label: 'python', description: 'Python node' }];
  }

  if (languageChoices.length === 0) {
    void vscode.window.showErrorMessage('Package type not recognized');
    return;
  }

  const languagePick = languageChoices.length === 1
    ? languageChoices[0]
    : await vscode.window.showQuickPick(languageChoices, {
        placeHolder: 'Select node language'
      });

  if (!languagePick) return;

  const nodeName = await vscode.window.showInputBox({
    prompt: 'Enter node name',
    placeHolder: 'my_node',
    validateInput: (value) => validator.validateNodeNameInput(value)
  });

  if (!nodeName) return;

  const includeTemplate = await vscode.window.showQuickPick([
    { label: 'yes', description: 'Create node with template implementation' },
    { label: 'no', description: 'Create empty node file' }
  ], {
    placeHolder: 'Include template node implementation?'
  });

  const useTemplate = includeTemplate?.label === 'yes';

  const defaultDeps = languagePick.label === 'cpp'
    ? ['rclcpp', 'std_msgs']
    : ['rclpy', 'std_msgs'];

  const depsInput = await vscode.window.showInputBox({
    prompt: 'Enter additional dependencies (comma-separated)',
    placeHolder: defaultDeps.join(', '),
    value: defaultDeps.join(', ')
  });

  const dependencies = parseDependencies(depsInput, defaultDeps);

  try {
    await packageCreator.addNodeToPackage(selectedPackage.path, selectedPackage.name, {
      nodeType: languagePick.label as 'cpp' | 'python',
      nodeName,
      includeTemplateNode: useTemplate,
      dependencies
    });
    await refresh();
    void vscode.window.showInformationMessage(`Node '${nodeName}' added to package '${selectedPackage.name}'`);
    void vscode.window.showInformationMessage('Build workspace to compile');
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    void vscode.window.showErrorMessage(`Failed to add node: ${message}`);
  }
}
