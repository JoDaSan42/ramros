import { describe, before, after, it } from 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

const EXTENSION_ID = 'ramros-team.ramros';
const TEST_WORKSPACE_NAME = 'ramros-e2e-test-workspace';

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

describe('Package Creation Wizard E2E Tests', () => {
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

  describe('Create Empty Package', () => {
    it('should create an empty package via command', async () => {
      const packageName = `e2e_${testSuffix}_empty_pkg`;
      
      await vscode.commands.executeCommand('ramros.createPackage', {
        packageName,
        description: 'E2E test empty package',
        authorName: 'E2E Test',
        authorEmail: 'e2e@test.com',
        license: 'MIT',
        buildType: 'ament_cmake',
        template: 'empty',
        dependencies: []
      });

      const packagePath = path.join(workspaceFolder.uri.fsPath, 'src', packageName);
      assert.ok(fs.existsSync(packagePath), `Package directory not created at ${packagePath}`);
      assert.ok(fs.existsSync(path.join(packagePath, 'CMakeLists.txt')), 'CMakeLists.txt not created');
      assert.ok(fs.existsSync(path.join(packagePath, 'package.xml')), 'package.xml not created');
    });
  });

  describe('Create Minimal C++ Package', () => {
    it('should create a C++ package with node', async () => {
      const packageName = `e2e_${testSuffix}_cpp_pkg`;
      const nodeName = 'cpp_node';
      
      await vscode.commands.executeCommand('ramros.createPackage', {
        packageName,
        description: 'E2E test C++ package',
        authorName: 'E2E Test',
        authorEmail: 'e2e@test.com',
        license: 'Apache-2.0',
        buildType: 'ament_cmake',
        template: 'minimal-cpp',
        nodeName,
        dependencies: ['rclcpp', 'std_msgs'],
        includeTemplateNode: true
      });

      const packagePath = path.join(workspaceFolder.uri.fsPath, 'src', packageName);
      assert.ok(fs.existsSync(packagePath), `Package directory not created at ${packagePath}`);
      assert.ok(fs.existsSync(path.join(packagePath, 'src', `${nodeName}.cpp`)), 'C++ node file not created');
      assert.ok(fs.existsSync(path.join(packagePath, 'include', `${nodeName}.hpp`)), 'Header file not created');
      assert.ok(fs.existsSync(path.join(packagePath, 'launch', 'example_launch.py')), 'Launch file not created');
      
      const nodeContent = fs.readFileSync(path.join(packagePath, 'src', `${nodeName}.cpp`), 'utf-8');
      assert.ok(nodeContent.includes('#include "rclcpp/rclcpp.hpp"'), 'C++ includes missing');
      assert.ok(nodeContent.includes('class E2e') && nodeContent.includes('CppPkgNode'), 'Node class not found');
      assert.ok(nodeContent.includes('rclcpp::init(argc, argv)'), 'rclcpp::init missing');
    });
  });

  describe('Create Minimal Python Package', () => {
    it('should create a Python package with node', async () => {
      const packageName = `e2e_${testSuffix}_py_pkg`;
      const nodeName = 'py_node';
      
      await vscode.commands.executeCommand('ramros.createPackage', {
        packageName,
        description: 'E2E test Python package',
        authorName: 'E2E Test',
        authorEmail: 'e2e@test.com',
        license: 'MIT',
        buildType: 'ament_python',
        template: 'minimal-python',
        nodeName,
        dependencies: ['rclpy', 'std_msgs'],
        includeTemplateNode: true
      });

      const packagePath = path.join(workspaceFolder.uri.fsPath, 'src', packageName);
      assert.ok(fs.existsSync(packagePath), `Package directory not created at ${packagePath}`);
      assert.ok(fs.existsSync(path.join(packagePath, packageName, `${nodeName}.py`)), 'Python node file not created');
      assert.ok(fs.existsSync(path.join(packagePath, 'setup.py')), 'setup.py not created');
      assert.ok(fs.existsSync(path.join(packagePath, 'launch', 'example_launch.py')), 'Launch file not created');
      
      const nodeContent = fs.readFileSync(path.join(packagePath, packageName, `${nodeName}.py`), 'utf-8');
      assert.ok(nodeContent.includes('import rclpy'), 'rclpy import missing');
      assert.ok(nodeContent.includes('class E2e') && nodeContent.includes('PyPkgNode'), 'Node class not found');
      assert.ok(nodeContent.includes('def main(args=None)'), 'main function not found');
    });
  });

  describe('Create Standard Hybrid Package', () => {
    it('should create a hybrid C++/Python package', async () => {
      const packageName = `e2e_${testSuffix}_standard_pkg`;
      const nodeName = 'std_node';
      
      await vscode.commands.executeCommand('ramros.createPackage', {
        packageName,
        description: 'E2E test standard package',
        authorName: 'E2E Test',
        authorEmail: 'e2e@test.com',
        license: 'Apache-2.0',
        buildType: 'ament_cmake',
        template: 'standard',
        nodeName,
        dependencies: ['rclcpp', 'rclpy', 'std_msgs'],
        includeTemplateNode: true
      });

      const packagePath = path.join(workspaceFolder.uri.fsPath, 'src', packageName);
      assert.ok(fs.existsSync(packagePath), `Package directory not created at ${packagePath}`);
      assert.ok(fs.existsSync(path.join(packagePath, 'src', `${nodeName}.cpp`)), 'C++ node file not created');
      assert.ok(fs.existsSync(path.join(packagePath, packageName, `${nodeName}.py`)), 'Python node file not created');
      assert.ok(fs.existsSync(path.join(packagePath, 'CMakeLists.txt')), 'CMakeLists.txt not created');
      assert.ok(fs.existsSync(path.join(packagePath, 'setup.py')), 'setup.py not created');
    });
  });

  describe('Create Python Package Without Template Node', () => {
    it('should create an empty Python package without node files', async () => {
      const packageName = `e2e_${testSuffix}_empty_py_pkg`;
      
      await vscode.commands.executeCommand('ramros.createPackage', {
        packageName,
        description: 'E2E test empty Python package',
        authorName: 'E2E Test',
        authorEmail: 'e2e@test.com',
        license: 'MIT',
        buildType: 'ament_python',
        template: 'minimal-python',
        dependencies: ['rclpy'],
        includeTemplateNode: false
      });

      const packagePath = path.join(workspaceFolder.uri.fsPath, 'src', packageName);
      assert.ok(fs.existsSync(packagePath), `Package directory not created at ${packagePath}`);
      assert.ok(!fs.existsSync(path.join(packagePath, packageName, `${packageName}.py`)), 'Python node file should not be created');
      assert.ok(fs.existsSync(path.join(packagePath, 'setup.py')), 'setup.py should be created');
      assert.ok(fs.existsSync(path.join(packagePath, 'setup.cfg')), 'setup.cfg should be created');
      assert.ok(fs.existsSync(path.join(packagePath, packageName, '__init__.py')), '__init__.py should be created');
    });
  });

  describe('Package Validation', () => {
    it('should prevent duplicate packages', async () => {
      const packageName = `e2e_${testSuffix}_duplicate_pkg`;
      
      await vscode.commands.executeCommand('ramros.createPackage', {
        packageName,
        description: 'First package',
        authorName: 'E2E Test',
        authorEmail: 'e2e@test.com',
        license: 'MIT',
        buildType: 'ament_cmake',
        template: 'empty',
        dependencies: []
      });

      try {
        await vscode.commands.executeCommand('ramros.createPackage', {
          packageName,
          description: 'Duplicate package',
          authorName: 'E2E Test',
          authorEmail: 'e2e@test.com',
          license: 'MIT',
          buildType: 'ament_cmake',
          template: 'empty',
          dependencies: []
        });
        assert.fail('Should have thrown error for duplicate package');
      } catch (error: any) {
        assert.ok(error.message.includes('already exists'), `Unexpected error: ${error.message}`);
      }
    });
  });

  describe('Create Interface Package', () => {
    it('should create an interface package with messages', async () => {
      const packageName = `e2e_${testSuffix}_interface_pkg`;
      
      await vscode.commands.executeCommand('ramros.createPackage', {
        packageName,
        description: 'E2E test interface package',
        authorName: 'E2E Test',
        authorEmail: 'e2e@test.com',
        license: 'Apache-2.0',
        buildType: 'ament_cmake',
        template: 'interface',
        dependencies: ['std_msgs'],
        interfaces: [
          { type: 'message', name: 'SensorData', definition: 'int32 id\nfloat64 value\nstring name' },
          { type: 'message', name: 'Status', definition: 'bool active\nint32 code' }
        ]
      });

      const packagePath = path.join(workspaceFolder.uri.fsPath, 'src', packageName);
      assert.ok(fs.existsSync(packagePath), `Package directory not created at ${packagePath}`);
      assert.ok(fs.existsSync(path.join(packagePath, 'CMakeLists.txt')), 'CMakeLists.txt not created');
      assert.ok(fs.existsSync(path.join(packagePath, 'package.xml')), 'package.xml not created');
      assert.ok(fs.existsSync(path.join(packagePath, 'msg')), 'msg directory not created');
      assert.ok(fs.existsSync(path.join(packagePath, 'msg', 'SensorData.msg')), 'SensorData.msg not created');
      assert.ok(fs.existsSync(path.join(packagePath, 'msg', 'Status.msg')), 'Status.msg not created');

      const cmakeContent = fs.readFileSync(path.join(packagePath, 'CMakeLists.txt'), 'utf-8');
      assert.ok(cmakeContent.includes('find_package(rosidl_default_generators REQUIRED)'), 'rosidl_default_generators find_package missing');
      assert.ok(cmakeContent.includes('rosidl_generate_interfaces(${PROJECT_NAME}'), 'rosidl_generate_interfaces call missing');
      assert.ok(cmakeContent.includes('msg/SensorData.msg'), 'SensorData.msg reference missing in CMakeLists');
      assert.ok(cmakeContent.includes('msg/Status.msg'), 'Status.msg reference missing in CMakeLists');

      const packageXmlContent = fs.readFileSync(path.join(packagePath, 'package.xml'), 'utf-8');
      assert.ok(packageXmlContent.includes('<buildtool_depend>rosidl_default_generators</buildtool_depend>'), 'rosidl_default_generators buildtool_depend missing');
      assert.ok(packageXmlContent.includes('<exec_depend>rosidl_default_runtime</exec_depend>'), 'rosidl_default_runtime exec_depend missing');
      assert.ok(packageXmlContent.includes('<member_of_group>rosidl_interface_packages</member_of_group>'), 'rosidl_interface_packages member missing');

      const sensorDataContent = fs.readFileSync(path.join(packagePath, 'msg', 'SensorData.msg'), 'utf-8');
      assert.ok(sensorDataContent.includes('int32 id'), 'SensorData field id missing');
      assert.ok(sensorDataContent.includes('float64 value'), 'SensorData field value missing');
      assert.ok(sensorDataContent.includes('string name'), 'SensorData field name missing');
    });

    it('should create an interface package with services', async () => {
      const packageName = `e2e_${testSuffix}_service_pkg`;
      
      await vscode.commands.executeCommand('ramros.createPackage', {
        packageName,
        description: 'E2E test service package',
        authorName: 'E2E Test',
        authorEmail: 'e2e@test.com',
        license: 'MIT',
        buildType: 'ament_cmake',
        template: 'interface',
        dependencies: [],
        interfaces: [
          { type: 'service', name: 'ComputeSum', definition: 'int32 a\nint32 b\n---\nint32 sum' }
        ]
      });

      const packagePath = path.join(workspaceFolder.uri.fsPath, 'src', packageName);
      assert.ok(fs.existsSync(packagePath), `Package directory not created at ${packagePath}`);
      assert.ok(fs.existsSync(path.join(packagePath, 'srv')), 'srv directory not created');
      assert.ok(fs.existsSync(path.join(packagePath, 'srv', 'ComputeSum.srv')), 'ComputeSum.srv not created');

      const srvContent = fs.readFileSync(path.join(packagePath, 'srv', 'ComputeSum.srv'), 'utf-8');
      assert.ok(srvContent.includes('int32 a'), 'Service request field a missing');
      assert.ok(srvContent.includes('int32 b'), 'Service request field b missing');
      assert.ok(srvContent.includes('---'), 'Service separator missing');
      assert.ok(srvContent.includes('int32 sum'), 'Service response field sum missing');

      const cmakeContent = fs.readFileSync(path.join(packagePath, 'CMakeLists.txt'), 'utf-8');
      assert.ok(cmakeContent.includes('srv/ComputeSum.srv'), 'ComputeSum.srv reference missing in CMakeLists');
    });

    it('should create an interface package with actions', async () => {
      const packageName = `e2e_${testSuffix}_action_pkg`;
      
      await vscode.commands.executeCommand('ramros.createPackage', {
        packageName,
        description: 'E2E test action package',
        authorName: 'E2E Test',
        authorEmail: 'e2e@test.com',
        license: 'Apache-2.0',
        buildType: 'ament_cmake',
        template: 'interface',
        dependencies: ['action_msgs'],
        interfaces: [
          { type: 'action', name: 'NavigateToPose', definition: 'geometry_msgs/PoseStamped pose\n---\nduration elapsed_time\nfloat64 distance_traveled\n---\nbool success\nstring error_message' }
        ]
      });

      const packagePath = path.join(workspaceFolder.uri.fsPath, 'src', packageName);
      assert.ok(fs.existsSync(packagePath), `Package directory not created at ${packagePath}`);
      assert.ok(fs.existsSync(path.join(packagePath, 'action')), 'action directory not created');
      assert.ok(fs.existsSync(path.join(packagePath, 'action', 'NavigateToPose.action')), 'NavigateToPose.action not created');

      const actionContent = fs.readFileSync(path.join(packagePath, 'action', 'NavigateToPose.action'), 'utf-8');
      assert.ok(actionContent.includes('geometry_msgs/PoseStamped pose'), 'Action goal missing');
      assert.ok(actionContent.includes('duration elapsed_time'), 'Action feedback missing');
      assert.ok(actionContent.includes('bool success'), 'Action result missing');

      const cmakeContent = fs.readFileSync(path.join(packagePath, 'CMakeLists.txt'), 'utf-8');
      assert.ok(cmakeContent.includes('action/NavigateToPose.action'), 'NavigateToPose.action reference missing in CMakeLists');
    });

    it('should create an interface package with mixed interface types', async () => {
      const packageName = `e2e_${testSuffix}_mixed_interface_pkg`;
      
      await vscode.commands.executeCommand('ramros.createPackage', {
        packageName,
        description: 'E2E test mixed interface package',
        authorName: 'E2E Test',
        authorEmail: 'e2e@test.com',
        license: 'MIT',
        buildType: 'ament_cmake',
        template: 'interface',
        dependencies: ['std_msgs', 'geometry_msgs'],
        interfaces: [
          { type: 'message', name: 'CustomMessage', definition: 'int32 id' },
          { type: 'service', name: 'CustomService', definition: 'int32 input\n---\nint32 output' },
          { type: 'action', name: 'CustomAction', definition: 'int32 goal\n---\nint32 feedback\n---\nbool result' }
        ]
      });

      const packagePath = path.join(workspaceFolder.uri.fsPath, 'src', packageName);
      assert.ok(fs.existsSync(packagePath), `Package directory not created at ${packagePath}`);
      assert.ok(fs.existsSync(path.join(packagePath, 'msg', 'CustomMessage.msg')), 'CustomMessage.msg not created');
      assert.ok(fs.existsSync(path.join(packagePath, 'srv', 'CustomService.srv')), 'CustomService.srv not created');
      assert.ok(fs.existsSync(path.join(packagePath, 'action', 'CustomAction.action')), 'CustomAction.action not created');

      const cmakeContent = fs.readFileSync(path.join(packagePath, 'CMakeLists.txt'), 'utf-8');
      assert.ok(cmakeContent.includes('msg/CustomMessage.msg'), 'CustomMessage.msg reference missing');
      assert.ok(cmakeContent.includes('srv/CustomService.srv'), 'CustomService.srv reference missing');
      assert.ok(cmakeContent.includes('action/CustomAction.action'), 'CustomAction.action reference missing');
    });
  });
});
