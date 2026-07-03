import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { BuildFilePatcher } from '../../wizard/build-file-patcher';

describe('BuildFilePatcher', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'build-patcher-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe('readWithBackup', () => {
    it('reads file content and returns backup', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(filePath, 'hello world');
      const { content, backup } = BuildFilePatcher.readWithBackup(filePath);
      expect(content).toBe('hello world');
      expect(backup).toBe('hello world');
    });
  });

  describe('writeWithRollback', () => {
    it('writes new content successfully', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(filePath, 'original');
      BuildFilePatcher.writeWithRollback(filePath, 'updated', 'original');
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('updated');
    });

    it('rolls back to backup on write failure', () => {
      const filePath = path.join(tmpDir, 'test.txt');
      fs.writeFileSync(filePath, 'original');

      // Make the file read-only to force a write failure
      fs.chmodSync(filePath, 0o444);

      expect(() => BuildFilePatcher.writeWithRollback(filePath, 'updated', 'original')).toThrow();
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('original');

      // Restore permissions for cleanup
      fs.chmodSync(filePath, 0o644);
    });
  });

  describe('addCmakeDependency', () => {
    it('does nothing if file does not exist', () => {
      BuildFilePatcher.addCmakeDependency(path.join(tmpDir, 'nonexistent'), 'rclcpp');
      // Should not throw
    });

    it('adds find_package after ament_cmake', () => {
      const cmakePath = path.join(tmpDir, 'CMakeLists.txt');
      fs.writeFileSync(cmakePath, 'find_package(ament_cmake REQUIRED)\nament_package()\n');
      BuildFilePatcher.addCmakeDependency(cmakePath, 'rclcpp');
      const content = fs.readFileSync(cmakePath, 'utf-8');
      expect(content).toContain('find_package(rclcpp REQUIRED)');
      expect(content).toContain('find_package(ament_cmake REQUIRED)');
    });

    it('does not add duplicate dependency', () => {
      const cmakePath = path.join(tmpDir, 'CMakeLists.txt');
      fs.writeFileSync(cmakePath, 'find_package(ament_cmake REQUIRED)\nfind_package(rclcpp REQUIRED)\n');
      const original = fs.readFileSync(cmakePath, 'utf-8');
      BuildFilePatcher.addCmakeDependency(cmakePath, 'rclcpp');
      expect(fs.readFileSync(cmakePath, 'utf-8')).toBe(original);
    });

    it('does nothing if ament_cmake anchor not found', () => {
      const cmakePath = path.join(tmpDir, 'CMakeLists.txt');
      fs.writeFileSync(cmakePath, 'ament_package()\n');
      const original = fs.readFileSync(cmakePath, 'utf-8');
      BuildFilePatcher.addCmakeDependency(cmakePath, 'rclcpp');
      expect(fs.readFileSync(cmakePath, 'utf-8')).toBe(original);
    });
  });

  describe('addCmakeExecutable', () => {
    it('does nothing if file does not exist', () => {
      BuildFilePatcher.addCmakeExecutable(path.join(tmpDir, 'nonexistent'), 'my_node', []);
    });

    it('adds executable block before install(DIRECTORIES', () => {
      const cmakePath = path.join(tmpDir, 'CMakeLists.txt');
      fs.writeFileSync(cmakePath, 'find_package(ament_cmake REQUIRED)\ninstall(DIRECTORY launch DESTINATION share/\${PROJECT_NAME})\nament_package()\n');
      BuildFilePatcher.addCmakeExecutable(cmakePath, 'my_node', ['rclcpp']);
      const content = fs.readFileSync(cmakePath, 'utf-8');
      expect(content).toContain('add_executable(my_node src/my_node.cpp)');
      expect(content).toContain('ament_target_dependencies(my_node rclcpp)');
      expect(content).toContain('install(TARGETS my_node');
    });

    it('adds executable block before ament_package as fallback', () => {
      const cmakePath = path.join(tmpDir, 'CMakeLists.txt');
      fs.writeFileSync(cmakePath, 'find_package(ament_cmake REQUIRED)\nament_package()\n');
      BuildFilePatcher.addCmakeExecutable(cmakePath, 'my_node', []);
      const content = fs.readFileSync(cmakePath, 'utf-8');
      expect(content).toContain('add_executable(my_node src/my_node.cpp)');
      expect(content).toContain('ament_package()');
    });

    it('does not add duplicate executable', () => {
      const cmakePath = path.join(tmpDir, 'CMakeLists.txt');
      fs.writeFileSync(cmakePath, 'add_executable(my_node src/my_node.cpp)\nament_package()\n');
      const original = fs.readFileSync(cmakePath, 'utf-8');
      BuildFilePatcher.addCmakeExecutable(cmakePath, 'my_node', []);
      expect(fs.readFileSync(cmakePath, 'utf-8')).toBe(original);
    });

    it('handles empty dependencies list', () => {
      const cmakePath = path.join(tmpDir, 'CMakeLists.txt');
      fs.writeFileSync(cmakePath, 'ament_package()\n');
      BuildFilePatcher.addCmakeExecutable(cmakePath, 'my_node', []);
      const content = fs.readFileSync(cmakePath, 'utf-8');
      expect(content).toContain('ament_target_dependencies(my_node)');
      expect(content).not.toContain('ament_target_dependencies(my_node )');
    });
  });

  describe('addPythonEntryPoint', () => {
    it('does nothing if file does not exist', () => {
      BuildFilePatcher.addPythonEntryPoint(path.join(tmpDir, 'nonexistent'), 'my_node', 'my_pkg');
    });

    it('adds entry to existing console_scripts', () => {
      const setupPath = path.join(tmpDir, 'setup.py');
      fs.writeFileSync(setupPath, "entry_points={'console_scripts': ['existing = pkg.existing:main']},\nzip_safe=True,\n");
      BuildFilePatcher.addPythonEntryPoint(setupPath, 'my_node', 'my_pkg');
      const content = fs.readFileSync(setupPath, 'utf-8');
      expect(content).toContain("'my_node = my_pkg.my_node:main'");
      expect(content).toContain('existing = pkg.existing:main');
    });

    it('creates console_scripts block when zip_safe exists', () => {
      const setupPath = path.join(tmpDir, 'setup.py');
      fs.writeFileSync(setupPath, 'zip_safe=True,\n');
      BuildFilePatcher.addPythonEntryPoint(setupPath, 'my_node', 'my_pkg');
      const content = fs.readFileSync(setupPath, 'utf-8');
      expect(content).toContain("'my_node = my_pkg.my_node:main'");
      expect(content).toContain('console_scripts');
    });

    it('does not add duplicate entry point', () => {
      const setupPath = path.join(tmpDir, 'setup.py');
      const existing = "entry_points={'console_scripts': ['my_node = my_pkg.my_node:main']},\nzip_safe=True,\n";
      fs.writeFileSync(setupPath, existing);
      const original = fs.readFileSync(setupPath, 'utf-8');
      BuildFilePatcher.addPythonEntryPoint(setupPath, 'my_node', 'my_pkg');
      expect(fs.readFileSync(setupPath, 'utf-8')).toBe(original);
    });

    it('handles entries without trailing comma', () => {
      const setupPath = path.join(tmpDir, 'setup.py');
      fs.writeFileSync(setupPath, "entry_points={'console_scripts': ['existing = pkg.existing:main']},\nzip_safe=True,\n");
      BuildFilePatcher.addPythonEntryPoint(setupPath, 'new_node', 'my_pkg');
      const content = fs.readFileSync(setupPath, 'utf-8');
      expect(content).toContain("'new_node = my_pkg.new_node:main'");
      expect(content).toContain('existing = pkg.existing:main');
    });
  });

  describe('addPackageXmlDependency', () => {
    it('does nothing if file does not exist', () => {
      BuildFilePatcher.addPackageXmlDependency(path.join(tmpDir, 'nonexistent'), 'rclcpp');
    });

    it('adds depend after build_export_depend', () => {
      const xmlPath = path.join(tmpDir, 'package.xml');
      fs.writeFileSync(xmlPath, '<package>\n  <description>Test</description>\n  <build_export_depend>rclcpp</build_export_depend>\n</package>');
      BuildFilePatcher.addPackageXmlDependency(xmlPath, 'std_msgs');
      const content = fs.readFileSync(xmlPath, 'utf-8');
      expect(content).toContain('<depend>std_msgs</depend>');
      expect(content).toContain('<build_export_depend>rclcpp</build_export_depend>');
    });

    it('adds depend after description as fallback', () => {
      const xmlPath = path.join(tmpDir, 'package.xml');
      fs.writeFileSync(xmlPath, '<package>\n  <description>Test</description>\n</package>');
      BuildFilePatcher.addPackageXmlDependency(xmlPath, 'std_msgs');
      const content = fs.readFileSync(xmlPath, 'utf-8');
      expect(content).toContain('<depend>std_msgs</depend>');
    });

    it('does not add duplicate dependency', () => {
      const xmlPath = path.join(tmpDir, 'package.xml');
      const original = '<package>\n  <description>Test</description>\n  <depend>std_msgs</depend>\n</package>';
      fs.writeFileSync(xmlPath, original);
      BuildFilePatcher.addPackageXmlDependency(xmlPath, 'std_msgs');
      expect(fs.readFileSync(xmlPath, 'utf-8')).toBe(original);
    });
  });

  describe('addCmakeInterfaceRegistration', () => {
    it('does nothing if file does not exist', () => {
      BuildFilePatcher.addCmakeInterfaceRegistration(path.join(tmpDir, 'nonexistent'), 'message', 'MyMsg');
    });

    it('adds message to existing rosidl block', () => {
      const cmakePath = path.join(tmpDir, 'CMakeLists.txt');
      fs.writeFileSync(cmakePath, 'rosidl_generate_interfaces(${PROJECT_NAME}\n  "msg/Existing.msg"\n)\nament_package()\n');
      BuildFilePatcher.addCmakeInterfaceRegistration(cmakePath, 'message', 'MyMsg');
      const content = fs.readFileSync(cmakePath, 'utf-8');
      expect(content).toContain('"msg/MyMsg.msg"');
      expect(content).toContain('"msg/Existing.msg"');
    });

    it('creates new rosidl block before ament_package', () => {
      const cmakePath = path.join(tmpDir, 'CMakeLists.txt');
      fs.writeFileSync(cmakePath, 'ament_package()\n');
      BuildFilePatcher.addCmakeInterfaceRegistration(cmakePath, 'service', 'MySrv');
      const content = fs.readFileSync(cmakePath, 'utf-8');
      expect(content).toContain('"srv/MySrv.srv"');
      expect(content).toContain('rosidl_generate_interfaces');
      expect(content).toContain('ament_package()');
    });

    it('does not add duplicate interface', () => {
      const cmakePath = path.join(tmpDir, 'CMakeLists.txt');
      fs.writeFileSync(cmakePath, 'rosidl_generate_interfaces(${PROJECT_NAME}\n  "msg/MyMsg.msg"\n)\nament_package()\n');
      const original = fs.readFileSync(cmakePath, 'utf-8');
      BuildFilePatcher.addCmakeInterfaceRegistration(cmakePath, 'message', 'MyMsg');
      expect(fs.readFileSync(cmakePath, 'utf-8')).toBe(original);
    });

    it('handles action interface type', () => {
      const cmakePath = path.join(tmpDir, 'CMakeLists.txt');
      fs.writeFileSync(cmakePath, 'ament_package()\n');
      BuildFilePatcher.addCmakeInterfaceRegistration(cmakePath, 'action', 'MyAction');
      const content = fs.readFileSync(cmakePath, 'utf-8');
      expect(content).toContain('"action/MyAction.action"');
    });
  });
});
