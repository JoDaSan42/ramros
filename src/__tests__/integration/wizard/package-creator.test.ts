import * as path from 'path';
import * as fs from 'fs';
import { PackageCreator } from '../../../wizard/package-creator';

describe('PackageCreator', () => {
  let creator: PackageCreator;
  let testWorkspace: string;

  beforeAll(() => {
    creator = new PackageCreator();
  });

  beforeEach(() => {
    testWorkspace = path.join(process.cwd(), 'test-fixtures', 'test-workspace');
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true });
    }
    fs.mkdirSync(testWorkspace, { recursive: true });
    fs.mkdirSync(path.join(testWorkspace, 'src'), { recursive: true });
  });

  afterAll(() => {
    if (fs.existsSync(testWorkspace)) {
      fs.rmSync(testWorkspace, { recursive: true });
    }
  });

  describe('createPackage - empty template', () => {
    it('should create a package from empty template', async () => {
      const config = {
        packageName: 'test_pkg',
        description: 'Test package',
        authorName: 'Test User',
        authorEmail: 'test@example.com',
        license: 'MIT',
        buildType: 'ament_cmake' as const,
        template: 'empty' as const,
        dependencies: [],
      };

      await creator.createPackage(testWorkspace, config);

      const packagePath = path.join(testWorkspace, 'src', 'test_pkg');
      expect(fs.existsSync(packagePath)).toBe(true);
      expect(fs.existsSync(path.join(packagePath, 'package.xml'))).toBe(true);
      expect(fs.existsSync(path.join(packagePath, 'CMakeLists.txt'))).toBe(true);
    });

    it('should substitute placeholders in package.xml', async () => {
      const config = {
        packageName: 'my_awesome_pkg',
        description: 'My awesome description',
        authorName: 'John Doe',
        authorEmail: 'john@example.com',
        license: 'Apache-2.0',
        buildType: 'ament_python' as const,
        template: 'empty' as const,
        dependencies: [],
      };

      await creator.createPackage(testWorkspace, config);

      const packageXmlPath = path.join(testWorkspace, 'src', 'my_awesome_pkg', 'package.xml');
      const content = fs.readFileSync(packageXmlPath, 'utf-8');

      expect(content).toContain('<name>my_awesome_pkg</name>');
      expect(content).toContain('<description>My awesome description</description>');
      expect(content).toContain('<maintainer email="john@example.com">John Doe</maintainer>');
      expect(content).toContain('<license>Apache-2.0</license>');
    });
  });

  describe('createPackage - minimal-cpp template', () => {
    it('should create a C++ package with node', async () => {
      const config = {
        packageName: 'cpp_node_pkg',
        description: 'C++ node package',
        authorName: 'Cpp Developer',
        authorEmail: 'cpp@example.com',
        license: 'BSD',
        buildType: 'ament_cmake' as const,
        template: 'minimal-cpp' as const,
        nodeName: 'cpp_node',
        dependencies: ['rclcpp', 'std_msgs'],
      };

      await creator.createPackage(testWorkspace, config);

      const packagePath = path.join(testWorkspace, 'src', 'cpp_node_pkg');
      expect(fs.existsSync(packagePath)).toBe(true);
      expect(fs.existsSync(path.join(packagePath, 'src/cpp_node_cpp.cpp'))).toBe(false);
      expect(fs.existsSync(path.join(packagePath, 'src/cpp_node.cpp'))).toBe(true);
      expect(fs.existsSync(path.join(packagePath, 'include/cpp_node_pkg/cpp_node.hpp'))).toBe(true);
      expect(fs.existsSync(path.join(packagePath, 'launch/example_launch.py'))).toBe(true);
    });

    it('should generate valid C++ code', async () => {
      const config = {
        packageName: 'test_cpp',
        description: 'Test',
        authorName: 'Test',
        authorEmail: 'test@test.com',
        license: 'MIT',
        buildType: 'ament_cmake' as const,
        template: 'minimal-cpp' as const,
        nodeName: 'my_node',
        dependencies: [],
      };

      await creator.createPackage(testWorkspace, config);

      const nodePath = path.join(testWorkspace, 'src', 'test_cpp', 'src', 'my_node.cpp');
      const content = fs.readFileSync(nodePath, 'utf-8');

      expect(content).toContain('class TestCppNode');
      expect(content).toContain('#include "rclcpp/rclcpp.hpp"');
      expect(content).toContain('rclcpp::init(argc, argv)');
    });
  });

  describe('createPackage - minimal-python template', () => {
    it('should create a Python package with node', async () => {
      const config = {
        packageName: 'py_node_pkg',
        description: 'Python node package',
        authorName: 'Python Dev',
        authorEmail: 'py@example.com',
        license: 'MIT',
        buildType: 'ament_python' as const,
        template: 'minimal-python' as const,
        nodeName: 'py_node',
        dependencies: ['rclpy', 'std_msgs'],
      };

      await creator.createPackage(testWorkspace, config);

      const packagePath = path.join(testWorkspace, 'src', 'py_node_pkg');
      expect(fs.existsSync(packagePath)).toBe(true);
      expect(fs.existsSync(path.join(packagePath, 'py_node_pkg/py_node.py'))).toBe(true);
      expect(fs.existsSync(path.join(packagePath, 'setup.py'))).toBe(true);
      expect(fs.existsSync(path.join(packagePath, 'launch/example_launch.py'))).toBe(true);
    });

    it('should generate valid Python code', async () => {
      const config = {
        packageName: 'test_py',
        description: 'Test',
        authorName: 'Test',
        authorEmail: 'test@test.com',
        license: 'MIT',
        buildType: 'ament_python' as const,
        template: 'minimal-python' as const,
        nodeName: 'my_py_node',
        dependencies: [],
      };

      await creator.createPackage(testWorkspace, config);

      const nodePath = path.join(testWorkspace, 'src', 'test_py', 'test_py', 'my_py_node.py');
      const content = fs.readFileSync(nodePath, 'utf-8');

      expect(content).toContain('class TestPyNode');
      expect(content).toContain('import rclpy');
      expect(content).toContain('def main(args=None)');
    });

    it('should create __init__.py file', async () => {
      const config = {
        packageName: 'init_test_pkg',
        description: 'Test',
        authorName: 'Test',
        authorEmail: 'test@test.com',
        license: 'MIT',
        buildType: 'ament_python' as const,
        template: 'minimal-python' as const,
        dependencies: [],
      };

      await creator.createPackage(testWorkspace, config);

      const initPath = path.join(testWorkspace, 'src', 'init_test_pkg', 'init_test_pkg', '__init__.py');
      expect(fs.existsSync(initPath)).toBe(true);
    });
  });

  describe('createPackage - standard template', () => {
    it('should create a hybrid C++/Python package', async () => {
      const config = {
        packageName: 'standard_pkg',
        description: 'Standard package',
        authorName: 'Full Stack Dev',
        authorEmail: 'fullstack@example.com',
        license: 'Apache-2.0',
        buildType: 'ament_cmake' as const,
        template: 'standard' as const,
        nodeName: 'std_node',
        dependencies: ['rclcpp', 'rclpy', 'std_msgs'],
      };

      await creator.createPackage(testWorkspace, config);

      const packagePath = path.join(testWorkspace, 'src', 'standard_pkg');
      expect(fs.existsSync(packagePath)).toBe(true);
      expect(fs.existsSync(path.join(packagePath, 'src/std_node.cpp'))).toBe(true);
      expect(fs.existsSync(path.join(packagePath, 'standard_pkg/std_node.py'))).toBe(true);
      expect(fs.existsSync(path.join(packagePath, 'CMakeLists.txt'))).toBe(true);
      expect(fs.existsSync(path.join(packagePath, 'setup.py'))).toBe(true);
    });
  });

  describe('createPackage - error handling', () => {
    it('should throw error if package already exists', async () => {
      const config = {
        packageName: 'existing_pkg',
        description: 'Test',
        authorName: 'Test',
        authorEmail: 'test@test.com',
        license: 'MIT',
        buildType: 'ament_cmake' as const,
        template: 'empty' as const,
        dependencies: [],
      };

      const packagePath = path.join(testWorkspace, 'src', 'existing_pkg');
      fs.mkdirSync(packagePath, { recursive: true });

      await expect(creator.createPackage(testWorkspace, config)).rejects.toThrow(
        "Package 'existing_pkg' already exists in workspace"
      );
    });

    it('should throw error if template not found', async () => {
      const config = {
        packageName: 'new_pkg',
        description: 'Test',
        authorName: 'Test',
        authorEmail: 'test@test.com',
        license: 'MIT',
        buildType: 'ament_cmake' as const,
        template: 'nonexistent' as any,
        dependencies: [],
      };

      await expect(creator.createPackage(testWorkspace, config)).rejects.toThrow(
        "Template 'nonexistent' not found"
      );
    });
  });

  describe('addNodeToPackage - C++ nodes', () => {
    let cppPackagePath: string;

    beforeEach(async () => {
      const config = {
        packageName: 'cpp_test_pkg',
        description: 'C++ test package',
        authorName: 'Test User',
        authorEmail: 'test@example.com',
        license: 'MIT',
        buildType: 'ament_cmake' as const,
        template: 'minimal-cpp' as const,
        nodeName: 'original_node',
        dependencies: ['rclcpp', 'std_msgs'],
      };

      await creator.createPackage(testWorkspace, config);
      cppPackagePath = path.join(testWorkspace, 'src', 'cpp_test_pkg');
    });

    it('should add a new C++ node with template', async () => {
      await creator.addNodeToPackage(cppPackagePath, 'cpp_test_pkg', {
        nodeType: 'cpp',
        nodeName: 'new_cpp_node',
        includeTemplateNode: true,
        dependencies: ['rclcpp', 'std_msgs'],
      });

      expect(fs.existsSync(path.join(cppPackagePath, 'src/new_cpp_node.cpp'))).toBe(true);
      expect(fs.existsSync(path.join(cppPackagePath, 'include/cpp_test_pkg/new_cpp_node.hpp'))).toBe(true);

      const cmakeContent = fs.readFileSync(path.join(cppPackagePath, 'CMakeLists.txt'), 'utf-8');
      expect(cmakeContent).toContain('add_executable(new_cpp_node src/new_cpp_node.cpp)');
      expect(cmakeContent).toContain('ament_target_dependencies(new_cpp_node rclcpp std_msgs)');
      expect(cmakeContent).toContain('install(TARGETS new_cpp_node');
    });

    it('should add an empty C++ node without template', async () => {
      await creator.addNodeToPackage(cppPackagePath, 'cpp_test_pkg', {
        nodeType: 'cpp',
        nodeName: 'empty_cpp_node',
        includeTemplateNode: false,
        dependencies: [],
      });

      expect(fs.existsSync(path.join(cppPackagePath, 'src/empty_cpp_node.cpp'))).toBe(true);
      const nodeContent = fs.readFileSync(path.join(cppPackagePath, 'src/empty_cpp_node.cpp'), 'utf-8');
      expect(nodeContent).not.toContain('class EmptyCppNodeNode');
    });

    it('should update package.xml with new dependencies', async () => {
      await creator.addNodeToPackage(cppPackagePath, 'cpp_test_pkg', {
        nodeType: 'cpp',
        nodeName: 'dep_test_node',
        includeTemplateNode: true,
        dependencies: ['geometry_msgs', 'sensor_msgs'],
      });

      const packageXmlContent = fs.readFileSync(path.join(cppPackagePath, 'package.xml'), 'utf-8');
      expect(packageXmlContent).toContain('<depend>geometry_msgs</depend>');
      expect(packageXmlContent).toContain('<depend>sensor_msgs</depend>');
    });

    it('should generate valid C++ code for added node', async () => {
      await creator.addNodeToPackage(cppPackagePath, 'cpp_test_pkg', {
        nodeType: 'cpp',
        nodeName: 'template_node',
        includeTemplateNode: true,
        dependencies: ['rclcpp', 'std_msgs'],
      });

      const nodePath = path.join(cppPackagePath, 'src/template_node.cpp');
      const content = fs.readFileSync(nodePath, 'utf-8');

      expect(content).toContain('class TemplateNodeNode');
      expect(content).toContain('#include "rclcpp/rclcpp.hpp"');
      expect(content).toContain('#include "std_msgs/msg/string.hpp"');
      expect(content).toContain('rclcpp::init(argc, argv)');
    });
  });

  describe('addNodeToPackage - Python nodes', () => {
    let pythonPackagePath: string;

    beforeEach(async () => {
      const config = {
        packageName: 'py_test_pkg',
        description: 'Python test package',
        authorName: 'Test User',
        authorEmail: 'test@example.com',
        license: 'MIT',
        buildType: 'ament_python' as const,
        template: 'minimal-python' as const,
        nodeName: 'original_py_node',
        dependencies: ['rclpy', 'std_msgs'],
      };

      await creator.createPackage(testWorkspace, config);
      pythonPackagePath = path.join(testWorkspace, 'src', 'py_test_pkg');
    });

    it('should add a new Python node with template', async () => {
      await creator.addNodeToPackage(pythonPackagePath, 'py_test_pkg', {
        nodeType: 'python',
        nodeName: 'new_py_node',
        includeTemplateNode: true,
        dependencies: ['rclpy', 'std_msgs'],
      });

      expect(fs.existsSync(path.join(pythonPackagePath, 'py_test_pkg/new_py_node.py'))).toBe(true);

      const setupContent = fs.readFileSync(path.join(pythonPackagePath, 'setup.py'), 'utf-8');
      expect(setupContent).toContain("'new_py_node = py_test_pkg.new_py_node:main'");
    });

    it('should add an empty Python node without template', async () => {
      await creator.addNodeToPackage(pythonPackagePath, 'py_test_pkg', {
        nodeType: 'python',
        nodeName: 'empty_py_node',
        includeTemplateNode: false,
        dependencies: [],
      });

      expect(fs.existsSync(path.join(pythonPackagePath, 'py_test_pkg/empty_py_node.py'))).toBe(true);
      const nodeContent = fs.readFileSync(path.join(pythonPackagePath, 'py_test_pkg/empty_py_node.py'), 'utf-8');
      expect(nodeContent).not.toContain('class empty_py_node');
    });

    it('should update package.xml with new dependencies', async () => {
      await creator.addNodeToPackage(pythonPackagePath, 'py_test_pkg', {
        nodeType: 'python',
        nodeName: 'dep_test_py_node',
        includeTemplateNode: true,
        dependencies: ['geometry_msgs', 'nav_msgs'],
      });

      const packageXmlContent = fs.readFileSync(path.join(pythonPackagePath, 'package.xml'), 'utf-8');
      expect(packageXmlContent).toContain('<depend>geometry_msgs</depend>');
      expect(packageXmlContent).toContain('<depend>nav_msgs</depend>');
    });

    it('should generate valid Python code for added node', async () => {
      await creator.addNodeToPackage(pythonPackagePath, 'py_test_pkg', {
        nodeType: 'python',
        nodeName: 'template_py_node',
        includeTemplateNode: true,
        dependencies: ['rclpy', 'std_msgs'],
      });

      const nodePath = path.join(pythonPackagePath, 'py_test_pkg', 'template_py_node.py');
      const content = fs.readFileSync(nodePath, 'utf-8');

      expect(content).toContain('class TemplatePyNodeNode');
      expect(content).toContain('import rclpy');
      expect(content).toContain('from std_msgs.msg import String');
      expect(content).toContain('def main(args=None)');
    });
  });

  describe('addInterfaceToPackage', () => {
    let interfacePackagePath: string;

    beforeEach(async () => {
      const config = {
        packageName: 'interface_test_pkg',
        description: 'Interface test package',
        authorName: 'Test User',
        authorEmail: 'test@example.com',
        license: 'MIT',
        buildType: 'ament_cmake' as const,
        template: 'interface' as const,
        dependencies: ['std_msgs'],
      };

      await creator.createPackage(testWorkspace, config);
      interfacePackagePath = path.join(testWorkspace, 'src', 'interface_test_pkg');
    });

    it('should add a message interface', async () => {
      await creator.addInterfaceToPackage(interfacePackagePath, 'interface_test_pkg', {
        type: 'message',
        name: 'TestMessage',
        definition: 'string name\nint32 value',
      });

      expect(fs.existsSync(path.join(interfacePackagePath, 'msg/TestMessage.msg'))).toBe(true);
      const msgContent = fs.readFileSync(path.join(interfacePackagePath, 'msg/TestMessage.msg'), 'utf-8');
      expect(msgContent).toContain('string name');
      expect(msgContent).toContain('int32 value');

      const cmakeContent = fs.readFileSync(path.join(interfacePackagePath, 'CMakeLists.txt'), 'utf-8');
      expect(cmakeContent).toContain('TestMessage.msg');
    });

    it('should add a service interface', async () => {
      await creator.addInterfaceToPackage(interfacePackagePath, 'interface_test_pkg', {
        type: 'service',
        name: 'TestService',
        definition: 'string request\n---\nbool response',
      });

      expect(fs.existsSync(path.join(interfacePackagePath, 'srv/TestService.srv'))).toBe(true);
      const srvContent = fs.readFileSync(path.join(interfacePackagePath, 'srv/TestService.srv'), 'utf-8');
      expect(srvContent).toContain('string request');
      expect(srvContent).toContain('---');
      expect(srvContent).toContain('bool response');

      const cmakeContent = fs.readFileSync(path.join(interfacePackagePath, 'CMakeLists.txt'), 'utf-8');
      expect(cmakeContent).toContain('TestService.srv');
    });

    it('should add an action interface', async () => {
      await creator.addInterfaceToPackage(interfacePackagePath, 'interface_test_pkg', {
        type: 'action',
        name: 'TestAction',
        definition: 'string goal\n---\nfloat32 feedback\n---\nbool result',
      });

      expect(fs.existsSync(path.join(interfacePackagePath, 'action/TestAction.action'))).toBe(true);
      const actionContent = fs.readFileSync(path.join(interfacePackagePath, 'action/TestAction.action'), 'utf-8');
      expect(actionContent).toContain('string goal');
      expect(actionContent).toContain('---');
      expect(actionContent).toContain('float32 feedback');
      expect(actionContent).toContain('---');
      expect(actionContent).toContain('bool result');

      const cmakeContent = fs.readFileSync(path.join(interfacePackagePath, 'CMakeLists.txt'), 'utf-8');
      expect(cmakeContent).toContain('TestAction.action');
    });

    it('should update CMakeLists.txt with rosidl_generate_interfaces', async () => {
      await creator.addInterfaceToPackage(interfacePackagePath, 'interface_test_pkg', {
        type: 'message',
        name: 'NewMessage',
        definition: 'int32 id',
      });

      const cmakeContent = fs.readFileSync(path.join(interfacePackagePath, 'CMakeLists.txt'), 'utf-8');
      expect(cmakeContent).toContain('rosidl_generate_interfaces(${PROJECT_NAME}');
      expect(cmakeContent).toContain('NewMessage.msg');
      expect(cmakeContent).toContain('ament_package()');
    });
  });
});
