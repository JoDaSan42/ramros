import { describe, before, after, it } from 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const EXTENSION_ID = 'ramros-team.ramros';
const TEST_WORKSPACE_NAME = 'ramros-add-node-e2e';

async function waitForExtensionActivation(timeoutMs = 15000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    if (ext && ext.isActive) {
      return;
    }
    try {
      await vscode.commands.executeCommand('setContext', 'ramros.active', true);
    } catch (err) {
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  const ext = vscode.extensions.getExtension(EXTENSION_ID);
  if (!ext || !ext.isActive) {
    console.warn('Extension did not activate, but continuing anyway...');
  }
}

describe('Add Node to Package E2E Tests', () => {
  let tempDir: string;
  let workspaceFolder: vscode.WorkspaceFolder;
  const testSuffix = Date.now().toString();

  before(async function() {
    this.timeout(20000);
    await waitForExtensionActivation();
    
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), TEST_WORKSPACE_NAME));
    const wsPath = path.join(tempDir, 'test_ws');
    fs.mkdirSync(wsPath, { recursive: true });
    fs.mkdirSync(path.join(wsPath, 'src'), { recursive: true });
    
    workspaceFolder = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
      ? vscode.workspace.workspaceFolders[0]
      : { uri: vscode.Uri.file(wsPath), name: 'test_ws', index: 0 };
  });

  after(async () => {
    await vscode.commands.executeCommand('workbench.action.closeAllEditors');
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('Add C++ Node to Existing Package', () => {
    let packagePath: string;

    before(async function() {
      this.timeout(10000);
      const packageName = `cpp_base_pkg_${testSuffix}`;
      
      await vscode.commands.executeCommand('ramros.createPackage', {
        packageName,
        description: 'Base C++ package for add node tests',
        authorName: 'E2E Test',
        authorEmail: 'e2e@test.com',
        license: 'Apache-2.0',
        buildType: 'ament_cmake',
        template: 'minimal-cpp',
        nodeName: 'original_node',
        dependencies: ['rclcpp', 'std_msgs'],
        includeTemplateNode: true
      });

      packagePath = path.join(workspaceFolder.uri.fsPath, 'src', packageName);
    });

    it('should add a new C++ node with template via command', async function() {
      this.timeout(10000);
      const newNodeName = 'added_cpp_node';
      
      await vscode.commands.executeCommand('ramros.addNodeToPackage', {
        packageName: `cpp_base_pkg_${testSuffix}`,
        nodeType: 'node',
        language: 'cpp',
        nodeName: newNodeName,
        template: true,
        dependencies: ['rclcpp', 'std_msgs']
      });

      assert.ok(fs.existsSync(path.join(packagePath, 'src', `${newNodeName}.cpp`)), 'C++ node file not created');
      assert.ok(fs.existsSync(path.join(packagePath, 'include', `cpp_base_pkg_${testSuffix}`, `${newNodeName}.hpp`)), 'Header file not created');
      
      const cmakeContent = fs.readFileSync(path.join(packagePath, 'CMakeLists.txt'), 'utf-8');
      assert.ok(cmakeContent.includes(`add_executable(${newNodeName}`), 'CMakeLists.txt not updated with add_executable');
      assert.ok(cmakeContent.includes(`ament_target_dependencies(${newNodeName}`), 'CMakeLists.txt not updated with ament_target_dependencies');
      
      const nodeContent = fs.readFileSync(path.join(packagePath, 'src', `${newNodeName}.cpp`), 'utf-8');
      assert.ok(nodeContent.includes('#include "rclcpp/rclcpp.hpp"'), 'C++ includes missing');
      assert.ok(nodeContent.includes('class AddedCppNodeNode'), 'Node class not found');
    });

    it('should add an empty C++ node without template', async function() {
      this.timeout(10000);
      const emptyNodeName = 'empty_cpp_node';
      
      await vscode.commands.executeCommand('ramros.addNodeToPackage', {
        packageName: `cpp_base_pkg_${testSuffix}`,
        nodeType: 'node',
        language: 'cpp',
        nodeName: emptyNodeName,
        template: false,
        dependencies: []
      });

      assert.ok(fs.existsSync(path.join(packagePath, 'src', `${emptyNodeName}.cpp`)), 'Empty C++ node file not created');
      
      const nodeContent = fs.readFileSync(path.join(packagePath, 'src', `${emptyNodeName}.cpp`), 'utf-8');
      assert.ok(!nodeContent.includes('class EmptyCppNodeNode'), 'Empty node should not contain template class');
    });
  });

  describe('Add Python Node to Existing Package', () => {
    let packagePath: string;
    let pythonPackageName: string;

    before(async function() {
      this.timeout(10000);
      pythonPackageName = `py_base_pkg_${testSuffix}`;
      
      await vscode.commands.executeCommand('ramros.createPackage', {
        packageName: pythonPackageName,
        description: 'Base Python package for add node tests',
        authorName: 'E2E Test',
        authorEmail: 'e2e@test.com',
        license: 'MIT',
        buildType: 'ament_python',
        template: 'minimal-python',
        nodeName: 'original_py_node',
        dependencies: ['rclpy', 'std_msgs'],
        includeTemplateNode: true
      });

      packagePath = path.join(workspaceFolder.uri.fsPath, 'src', pythonPackageName);
    });

    it('should add a new Python node with template via command', async function() {
      this.timeout(10000);
      const newNodeName = 'added_py_node';
      
      await vscode.commands.executeCommand('ramros.addNodeToPackage', {
        packageName: pythonPackageName,
        nodeType: 'node',
        language: 'python',
        nodeName: newNodeName,
        template: true,
        dependencies: ['rclpy', 'std_msgs']
      });

      assert.ok(fs.existsSync(path.join(packagePath, pythonPackageName, `${newNodeName}.py`)), 'Python node file not created');
      
      const setupContent = fs.readFileSync(path.join(packagePath, 'setup.py'), 'utf-8');
      assert.ok(setupContent.includes(`${newNodeName} = ${pythonPackageName}.${newNodeName}:main`), 'setup.py not updated with entry point');
      
      const nodeContent = fs.readFileSync(path.join(packagePath, pythonPackageName, `${newNodeName}.py`), 'utf-8');
      assert.ok(nodeContent.includes('import rclpy'), 'rclpy import missing');
      assert.ok(nodeContent.includes('class AddedPyNodeNode'), 'Node class not found');
    });

    it('should add an empty Python node without template', async function() {
      this.timeout(10000);
      const emptyNodeName = 'empty_py_node';
      
      await vscode.commands.executeCommand('ramros.addNodeToPackage', {
        packageName: pythonPackageName,
        nodeType: 'node',
        language: 'python',
        nodeName: emptyNodeName,
        template: false,
        dependencies: []
      });

      assert.ok(fs.existsSync(path.join(packagePath, pythonPackageName, `${emptyNodeName}.py`)), 'Empty Python node file not created');
      
      const nodeContent = fs.readFileSync(path.join(packagePath, pythonPackageName, `${emptyNodeName}.py`), 'utf-8');
      assert.ok(!nodeContent.includes('class EmptyPyNodeNode'), 'Empty node should not contain template class');
    });
  });

  describe('Add Interface to Existing Package', () => {
    let packagePath: string;
    let interfacePackageName: string;

    before(async function() {
      this.timeout(10000);
      interfacePackageName = `interface_base_pkg_${testSuffix}`;
      
      await vscode.commands.executeCommand('ramros.createPackage', {
        packageName: interfacePackageName,
        description: 'Base interface package for add interface tests',
        authorName: 'E2E Test',
        authorEmail: 'e2e@test.com',
        license: 'Apache-2.0',
        buildType: 'ament_cmake',
        template: 'interface',
        dependencies: ['std_msgs'],
        interfaces: []
      });

      packagePath = path.join(workspaceFolder.uri.fsPath, 'src', interfacePackageName);
    });

    it('should add a message interface via command', async function() {
      this.timeout(10000);
      
      await vscode.commands.executeCommand('ramros.addNodeToPackage', {
        packageName: interfacePackageName,
        nodeType: 'interface',
        interfaceType: 'message',
        interfaceName: 'AddedMessage',
        definition: 'string name\nint32 value'
      });

      assert.ok(fs.existsSync(path.join(packagePath, 'msg', 'AddedMessage.msg')), 'Message file not created');
      
      const msgContent = fs.readFileSync(path.join(packagePath, 'msg', 'AddedMessage.msg'), 'utf-8');
      assert.ok(msgContent.includes('string name'), 'Message field name missing');
      assert.ok(msgContent.includes('int32 value'), 'Message field value missing');
      
      const cmakeContent = fs.readFileSync(path.join(packagePath, 'CMakeLists.txt'), 'utf-8');
      assert.ok(cmakeContent.includes('msg/AddedMessage.msg'), 'CMakeLists.txt not updated with message');
    });

    it('should add a service interface via command', async function() {
      this.timeout(10000);
      
      await vscode.commands.executeCommand('ramros.addNodeToPackage', {
        packageName: interfacePackageName,
        nodeType: 'interface',
        interfaceType: 'service',
        interfaceName: 'AddedService',
        definition: 'float64 a\nfloat64 b\n---\nfloat64 sum'
      });

      assert.ok(fs.existsSync(path.join(packagePath, 'srv', 'AddedService.srv')), 'Service file not created');
      
      const srvContent = fs.readFileSync(path.join(packagePath, 'srv', 'AddedService.srv'), 'utf-8');
      assert.ok(srvContent.includes('float64 a'), 'Service request field a missing');
      assert.ok(srvContent.includes('---'), 'Service separator missing');
      assert.ok(srvContent.includes('float64 sum'), 'Service response field missing');
      
      const cmakeContent = fs.readFileSync(path.join(packagePath, 'CMakeLists.txt'), 'utf-8');
      assert.ok(cmakeContent.includes('srv/AddedService.srv'), 'CMakeLists.txt not updated with service');
    });

    it('should add an action interface via command', async function() {
      this.timeout(10000);
      
      await vscode.commands.executeCommand('ramros.addNodeToPackage', {
        packageName: interfacePackageName,
        nodeType: 'interface',
        interfaceType: 'action',
        interfaceName: 'AddedAction',
        definition: 'string goal\n---\nfloat32 feedback\n---\nbool result'
      });

      assert.ok(fs.existsSync(path.join(packagePath, 'action', 'AddedAction.action')), 'Action file not created');
      
      const actionContent = fs.readFileSync(path.join(packagePath, 'action', 'AddedAction.action'), 'utf-8');
      assert.ok(actionContent.includes('string goal'), 'Action goal missing');
      assert.ok(actionContent.includes('float32 feedback'), 'Action feedback missing');
      assert.ok(actionContent.includes('bool result'), 'Action result missing');
      
      const cmakeContent = fs.readFileSync(path.join(packagePath, 'CMakeLists.txt'), 'utf-8');
      assert.ok(cmakeContent.includes('action/AddedAction.action'), 'CMakeLists.txt not updated with action');
    });
  });

  describe('Add Node with Additional Dependencies', () => {
    let packagePath: string;
    let depsPackageName: string;

    before(async function() {
      this.timeout(10000);
      depsPackageName = `deps_pkg_${testSuffix}`;
      
      await vscode.commands.executeCommand('ramros.createPackage', {
        packageName: depsPackageName,
        description: 'Package for dependency tests',
        authorName: 'E2E Test',
        authorEmail: 'e2e@test.com',
        license: 'MIT',
        buildType: 'ament_cmake',
        template: 'minimal-cpp',
        nodeName: 'base_node',
        dependencies: ['rclcpp'],
        includeTemplateNode: true
      });

      packagePath = path.join(workspaceFolder.uri.fsPath, 'src', depsPackageName);
    });

    it('should update package.xml with additional dependencies', async function() {
      this.timeout(10000);
      
      await vscode.commands.executeCommand('ramros.addNodeToPackage', {
        packageName: depsPackageName,
        nodeType: 'node',
        language: 'cpp',
        nodeName: 'dep_test_node',
        template: true,
        dependencies: ['geometry_msgs', 'sensor_msgs', 'rclcpp', 'std_msgs']
      });

      const packageXmlContent = fs.readFileSync(path.join(packagePath, 'package.xml'), 'utf-8');
      assert.ok(packageXmlContent.includes('<depend>geometry_msgs</depend>'), 'geometry_msgs dependency not added');
      assert.ok(packageXmlContent.includes('<depend>sensor_msgs</depend>'), 'sensor_msgs dependency not added');
    });
  });
});
