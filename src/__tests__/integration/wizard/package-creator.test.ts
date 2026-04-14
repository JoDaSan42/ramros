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
      expect(fs.existsSync(path.join(packagePath, 'include/cpp_node.hpp'))).toBe(true);
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

      expect(content).toContain('class my_py_node');
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
});
