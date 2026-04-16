import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface InterfaceDefinition {
  type: 'message' | 'service' | 'action';
  name: string;
  definition: string;
}

interface PackageConfig {
  packageName: string;
  description: string;
  authorName: string;
  authorEmail: string;
  license: string;
  buildType: 'ament_cmake' | 'ament_python' | 'cmake';
  template: 'empty' | 'minimal-cpp' | 'minimal-python' | 'standard' | 'interface';
  nodeName?: string;
  dependencies: string[];
  interfaces?: InterfaceDefinition[];
  includeTemplateNode?: boolean;
}

interface AddNodeConfig {
  nodeType: 'cpp' | 'python';
  nodeName: string;
  includeTemplateNode: boolean;
  dependencies?: string[];
}

export class PackageCreator {
  private readonly templateDir: string;

  constructor(extensionPath?: string) {
    if (extensionPath && fs.existsSync(path.join(extensionPath, 'test-fixtures', 'packages'))) {
      this.templateDir = path.join(extensionPath, 'test-fixtures', 'packages');
    } else if (fs.existsSync(path.join(process.cwd(), 'test-fixtures', 'packages'))) {
      this.templateDir = path.join(process.cwd(), 'test-fixtures', 'packages');
    } else {
      this.templateDir = path.join(__dirname, '..', '..', '..', 'test-fixtures', 'packages');
    }

    if (!fs.existsSync(this.templateDir)) {
      throw new Error('Template directory not found. Please ensure test-fixtures/packages exists.');
    }
  }

  async createPackage(workspaceRoot: string, config: PackageConfig): Promise<void> {
    const srcPath = path.join(workspaceRoot, 'src');
    const packagePath = path.join(srcPath, config.packageName);

    if (fs.existsSync(packagePath)) {
      throw new Error(`Package '${config.packageName}' already exists in workspace`);
    }

    if (!fs.existsSync(srcPath)) {
      fs.mkdirSync(srcPath, { recursive: true });
    }

    if (config.template === 'interface') {
      await this.createInterfacePackage(workspaceRoot, config);
      return;
    }

    if (config.template !== 'empty' && !this.isRos2Available()) {
      const templatePath = path.join(this.templateDir, `template-${config.template}`);
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template '${config.template}' not found`);
      }
    }

    const maintainerEmail = config.authorEmail || 'developer@example.com';
    const maintainerName = config.authorName || 'Developer';

    const depsForCommand = config.dependencies.filter(d => d !== 'rosidl_default_generators');
    
    const args = ['pkg', 'create', config.packageName];
    
    if (config.description) {
      args.push('--description', `"${config.description}"`);
    }
    if (config.license) {
      args.push('--license', `"${config.license}"`);
    }
    args.push('--build-type', config.buildType);
    args.push('--maintainer-email', `"${maintainerEmail}"`);
    args.push('--maintainer-name', `"${maintainerName}"`);
    args.push('--destination-directory', `"${srcPath}"`);
    
    if (depsForCommand.length > 0) {
      args.push('--dependencies', ...depsForCommand);
    }

    if (config.nodeName && config.template !== 'empty') {
      args.push('--node-name', `"${config.nodeName}"`);
    }

    try {
      execSync(`source /opt/ros/humble/setup.bash && ros2 ${args.join(' ')}`, { stdio: 'pipe', shell: '/bin/bash' });
      
      if (config.nodeName && (config.template === 'minimal-python' || config.template === 'minimal-cpp' || config.template === 'standard')) {
        const includeNode = config.includeTemplateNode ?? true;
        
        if (includeNode) {
          await this.replaceWithTemplateNode(packagePath, config);
          await this.writeLaunchFile(packagePath, config.packageName, config.nodeName);
        } else {
          await this.removeGeneratedNodeFiles(packagePath, config);
        }
      }
      
      return;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create package: ${message}`);
    }
  }

  private async replaceWithTemplateNode(packagePath: string, config: PackageConfig): Promise<void> {
    const isCpp = config.template === 'minimal-cpp' || config.template === 'standard';
    const isPython = config.template === 'minimal-python' || config.template === 'standard';
    
    const nodeName = config.nodeName || config.packageName;
    
    if (isCpp) {
      await this.replaceWithCppTemplateNode(packagePath, config, nodeName);
    }
    
    if (isPython) {
      await this.replaceWithPythonTemplateNode(packagePath, config, nodeName);
    }
  }
  
  private async replaceWithCppTemplateNode(packagePath: string, config: PackageConfig, nodeName: string): Promise<void> {
    const cppClassName = this.toPascalCase(config.packageName) + 'Node';
    
    const cppSrcDir = path.join(packagePath, 'src');
    const includeDir = path.join(packagePath, 'include', config.packageName);
    
    if (!fs.existsSync(cppSrcDir)) fs.mkdirSync(cppSrcDir, { recursive: true });
    if (!fs.existsSync(includeDir)) fs.mkdirSync(includeDir, { recursive: true });
    
    const cppContent = `#include "rclcpp/rclcpp.hpp"
#include "std_msgs/msg/string.hpp"

using namespace std::chrono_literals;

class ${cppClassName} : public rclcpp::Node
{
public:
  ${cppClassName}()
  : Node("${nodeName}")
  {
    publisher_ = this->create_publisher<std_msgs::msg::String>("topic", 10);
    timer_ = this->create_wall_timer(
      500ms,
      [this]() { this->timer_callback(); });
  }

private:
  void timer_callback()
  {
    static int64_t count = 0;
    auto message = std_msgs::msg::String();
    message.data = "Hello World: " + std::to_string(++count);
    RCLCPP_INFO(this->get_logger(), "Publishing: '%s'", message.data.c_str());
    publisher_->publish(message);
  }

  rclcpp::TimerBase::SharedPtr timer_;
  rclcpp::Publisher<std_msgs::msg::String>::SharedPtr publisher_;
};

int main(int argc, char * argv[])
{
  rclcpp::init(argc, argv);
  rclcpp::spin(std::make_shared<${cppClassName}>());
  rclcpp::shutdown();
  return 0;
}
`;
    fs.writeFileSync(path.join(cppSrcDir, `${nodeName}.cpp`), cppContent);
    
    const headerGuard = config.packageName.toUpperCase().replace(/-/g, '_');
    const hppContent = `#ifndef ${headerGuard}_NODE_HPP
#define ${headerGuard}_NODE_HPP

#endif // ${headerGuard}_NODE_HPP
`;
    fs.writeFileSync(path.join(includeDir, `${nodeName}.hpp`), hppContent);
  }
  
  private async replaceWithPythonTemplateNode(packagePath: string, config: PackageConfig, nodeName: string): Promise<void> {
    const pythonClassName = this.toPascalCase(config.packageName) + 'Node';
    const pythonPackageDir = path.join(packagePath, config.packageName);
    
    if (!fs.existsSync(pythonPackageDir)) {
      fs.mkdirSync(pythonPackageDir, { recursive: true });
    }
    
    const pyContent = `import rclpy
from rclpy.node import Node
from std_msgs.msg import String


class ${pythonClassName}(Node):

    def __init__(self):
        super().__init__('${nodeName}')
        self.publisher_ = self.create_publisher(String, 'topic', 10)
        timer_period = 0.5
        self.timer = self.create_timer(timer_period, self.timer_callback)
        self.i = 0

    def timer_callback(self):
        msg = String()
        msg.data = f'Hello from ${config.packageName}: {self.i}'
        self.publisher_.publish(msg)
        self.get_logger().info(f'Publishing: {msg.data}')
        self.i += 1


def main(args=None):
    rclpy.init(args=args)
    node = ${pythonClassName}()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
`;
    
    const nodeFilePath = path.join(pythonPackageDir, `${nodeName}.py`);
    fs.writeFileSync(nodeFilePath, pyContent);
    
    const setupPath = path.join(packagePath, 'setup.py');
    if (!fs.existsSync(setupPath)) {
      const setupContent = `from setuptools import setup

package_name = '${config.packageName}'

setup(
    name=package_name,
    version='0.0.0',
    packages=[package_name],
    data_files=[
        ('share/' + package_name, ['package.xml']),
        ('share/ament_index/resource_index/packages',
            ['resource/' + package_name]),
    ],
    install_requires=['setuptools'],
    zip_safe=True,
    author='${config.authorName}',
    author_email='${config.authorEmail}',
    maintainer='${config.authorName}',
    maintainer_email='${config.authorEmail}',
    description='${config.description}',
    license='${config.license}',
    tests_require=['pytest'],
    entry_points={
        'console_scripts': [
            '${nodeName} = {package_name}.{nodeName}:main',
        ],
    },
)
`;
      const resourceDir = path.join(packagePath, 'resource');
      if (!fs.existsSync(resourceDir)) {
        fs.mkdirSync(resourceDir, { recursive: true });
      }
      fs.writeFileSync(path.join(resourceDir, config.packageName), '');
      fs.writeFileSync(setupPath, setupContent);
    }
  }
  
  private async writeLaunchFile(packagePath: string, packageName: string, nodeName: string): Promise<void> {
    const launchDir = path.join(packagePath, 'launch');
    if (!fs.existsSync(launchDir)) {
      fs.mkdirSync(launchDir, { recursive: true });
    }
    
    const launchContent = `from launch import LaunchDescription
from launch_ros.actions import Node


def generate_launch_description():
    return LaunchDescription([
        Node(
            package='${packageName}',
            executable='${nodeName}',
            name='${nodeName}',
            output='screen',
        )
    ])
`;
    fs.writeFileSync(path.join(launchDir, 'example_launch.py'), launchContent);
  }

  private async removeGeneratedNodeFiles(packagePath: string, config: PackageConfig): Promise<void> {
    const nodeName = config.nodeName || config.packageName;
    const isCpp = config.template === 'minimal-cpp' || config.template === 'standard';
    const isPython = config.template === 'minimal-python' || config.template === 'standard';
    
    if (isCpp) {
      const cppSrcDir = path.join(packagePath, 'src');
      const includeDir = path.join(packagePath, 'include', config.packageName);
      
      const cppNodeFile = path.join(cppSrcDir, `${nodeName}.cpp`);
      if (fs.existsSync(cppNodeFile)) {
        fs.unlinkSync(cppNodeFile);
      }
      
      const hppNodeFile = path.join(includeDir, `${nodeName}.hpp`);
      if (fs.existsSync(hppNodeFile)) {
        fs.unlinkSync(hppNodeFile);
      }
      
      if (fs.existsSync(includeDir) && fs.readdirSync(includeDir).length === 0) {
        fs.rmdirSync(includeDir);
      }
    }
    
    if (isPython) {
      const pythonPackageDir = path.join(packagePath, config.packageName);
      
      const nodeFilePath = path.join(pythonPackageDir, `${nodeName}.py`);
      if (fs.existsSync(nodeFilePath)) {
        fs.unlinkSync(nodeFilePath);
      }
      
      const initPath = path.join(pythonPackageDir, '__init__.py');
      if (!fs.existsSync(initPath)) {
        fs.writeFileSync(initPath, '');
      }
    }
    
    const launchDir = path.join(packagePath, 'launch');
    if (fs.existsSync(launchDir)) {
      const launchFilePath = path.join(launchDir, 'example_launch.py');
      if (fs.existsSync(launchFilePath)) {
        fs.unlinkSync(launchFilePath);
      }
      
      if (fs.readdirSync(launchDir).length === 0) {
        fs.rmdirSync(launchDir);
      }
    }
  }

  private async createInterfacePackage(workspaceRoot: string, config: PackageConfig): Promise<void> {
    const packagePath = path.join(workspaceRoot, 'src', config.packageName);

    if (fs.existsSync(packagePath)) {
      throw new Error(`Package '${config.packageName}' already exists in workspace`);
    }

    fs.mkdirSync(packagePath, { recursive: true });

    const templatePath = path.join(this.templateDir, 'template-interface');
    if (!fs.existsSync(templatePath)) {
      throw new Error('Interface template not found');
    }

    const userDeps = config.dependencies.filter(d => d !== 'ament_cmake' && d !== 'rosidl_default_generators');
    
    const cmakeDeps = userDeps.length > 0 ? userDeps.map(dep => `find_package(${dep} REQUIRED)`).join('\n') : '';
    
    const interfaceFiles: string[] = [];
    const depPackages: string[] = [];
    
    if (config.interfaces) {
      for (const iface of config.interfaces) {
        const fileName = `${iface.name}.${this.getInterfaceExtension(iface.type)}`;
        interfaceFiles.push(`"${iface.type === 'message' ? 'msg' : iface.type === 'service' ? 'srv' : 'action'}/${fileName}"`);
      }
      
      for (const dep of config.dependencies) {
        if (dep !== 'rosidl_default_generators' && !dep.startsWith('rosidl')) {
          depPackages.push(dep);
        }
      }
    }
    
    const rosidlGenerateBlock = interfaceFiles.length > 0
      ? `rosidl_generate_interfaces(\${PROJECT_NAME}
  ${interfaceFiles.join('\n  ')}
  ${depPackages.length > 0 ? `DEPENDENCIES ${depPackages.join(' ')}` : ''}
)`
      : '';

    await this.copyTemplate(templatePath, packagePath, config);

    let cmakeContent = fs.readFileSync(path.join(packagePath, 'CMakeLists.txt'), 'utf-8');
    cmakeContent = cmakeContent.replace('{{dependencies}}', cmakeDeps || '# No additional dependencies');
    cmakeContent = cmakeContent.replace('{{rosidl_generate_interfaces}}', rosidlGenerateBlock);
    fs.writeFileSync(path.join(packagePath, 'CMakeLists.txt'), cmakeContent);

    let packageXmlContent = fs.readFileSync(path.join(packagePath, 'package.xml'), 'utf-8');
    const depsXml = userDeps.map(dep => `  <depend>${dep}</depend>`).join('\n');
    packageXmlContent = packageXmlContent.replace('{{dependencies_xml}}', depsXml || '<!-- No additional dependencies -->');
    fs.writeFileSync(path.join(packagePath, 'package.xml'), packageXmlContent);

    if (config.interfaces && config.interfaces.length > 0) {
      await this.addInterfaceFiles(packagePath, config);
    }
  }

  private getInterfaceExtension(type: 'message' | 'service' | 'action'): string {
    switch (type) {
      case 'message': return 'msg';
      case 'service': return 'srv';
      case 'action': return 'action';
    }
  }

  private async addInterfaceFiles(packagePath: string, config: PackageConfig): Promise<void> {
    if (!config.interfaces || config.interfaces.length === 0) {
      return;
    }

    const msgDir = path.join(packagePath, 'msg');
    const srvDir = path.join(packagePath, 'srv');
    const actionDir = path.join(packagePath, 'action');

    for (const iface of config.interfaces) {
      let dir: string;
      let filePath: string;

      switch (iface.type) {
        case 'message':
          dir = msgDir;
          filePath = path.join(dir, `${iface.name}.msg`);
          break;
        case 'service':
          dir = srvDir;
          filePath = path.join(dir, `${iface.name}.srv`);
          break;
        case 'action':
          dir = actionDir;
          filePath = path.join(dir, `${iface.name}.action`);
          break;
      }

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(filePath, iface.definition);
    }
  }

  private async copyTemplate(
    source: string,
    target: string,
    config: PackageConfig
  ): Promise<void> {
    const items = fs.readdirSync(source);

    for (const item of items) {
      const sourcePath = path.join(source, item);
      const targetPath = path.join(target, item);
      const stat = fs.statSync(sourcePath);

      if (stat.isDirectory()) {
        if (item.startsWith('{{') && item.endsWith('}}')) {
          const dirName = this.replaceTemplate(item, config);
          const newTargetPath = path.join(target, dirName);
          fs.mkdirSync(newTargetPath, { recursive: true });
          await this.copyTemplate(sourcePath, newTargetPath, config);
        } else {
          const newTargetPath = targetPath;
          if (!fs.existsSync(newTargetPath)) {
            fs.mkdirSync(newTargetPath, { recursive: true });
          }
          await this.copyTemplate(sourcePath, newTargetPath, config);
        }
      } else {
        let content = fs.readFileSync(sourcePath, 'utf-8');

        if (item.endsWith('.py') || item.endsWith('.cpp') || item.endsWith('.hpp') ||
            item.endsWith('.txt') || item.endsWith('.xml') || item.endsWith('.md') ||
            item.endsWith('.cfg')) {
          content = this.replaceTemplate(content, config);
        }

        const targetFileName = this.replaceTemplate(item, config);

        const finalTargetPath = path.join(target, targetFileName);
        fs.writeFileSync(finalTargetPath, content);
      }
    }
  }

  private replaceTemplate(content: string, config: PackageConfig): string {
    const className = this.toPascalCase(config.packageName);
    const headerGuard = config.packageName.toUpperCase().replace(/-/g, '_');

    const replacements: Record<string, string> = {
      '{{package_name}}': config.packageName,
      '{{description}}': config.description,
      '{{author_name}}': config.authorName,
      '{{author_email}}': config.authorEmail,
      '{{license}}': config.license,
      '{{build_type}}': config.buildType,
      '{{node_name}}': config.nodeName || config.packageName,
      '{{ClassName}}': className,
      '{{HEADER_GUARD}}': headerGuard,
    };

    if (config.nodeName) {
      replacements['{{node_name_cpp}}'] = config.nodeName;
      replacements['{{node_name_python}}'] = config.nodeName;
      replacements['{{ClassNameCpp}}'] = `${className}Node`;
      replacements['{{ClassNamePython}}'] = `${className}Node`;
    }

    let result = content;
    for (const [placeholder, value] of Object.entries(replacements)) {
      result = result.split(placeholder).join(value);
    }

    return result;
  }

  private renameNodeFiles(packagePath: string, nodeName: string, extension: string): void {
    const extensions = ['', '_node'];

    for (const ext of extensions) {
      const oldName = ext ? `node${extension}` : `${nodeName}${extension}`;
      const newName = `${nodeName}${ext}${extension}`;

      const dirs = ['src', 'include', path.basename(packagePath)];

      for (const dir of dirs) {
        const oldPath = path.join(packagePath, dir, oldName);
        const newPath = path.join(packagePath, dir, newName);

        if (fs.existsSync(oldPath)) {
          fs.renameSync(oldPath, newPath);
        }
      }
    }
  }

  private toPascalCase(str: string): string {
    return str
      .split(/[-_]/)
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join('');
  }

  private isRos2Available(): boolean {
    try {
      execSync('ros2 --version', { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  async addNodeToPackage(
    packagePath: string,
    packageName: string,
    config: AddNodeConfig
  ): Promise<void> {
    if (config.nodeType === 'cpp') {
      await this.addCppNode(packagePath, packageName, config.nodeName, config.includeTemplateNode);
      
      const deps = config.dependencies || [];
      const defaultDeps = ['rclcpp', 'std_msgs'];
      const allDeps = [...new Set([...deps, ...defaultDeps])];
      
      this.updateCppCMakeLists(packagePath, config.nodeName, allDeps);
      this.addDependenciesToPackageXml(packagePath, allDeps);
      
    } else if (config.nodeType === 'python') {
      await this.addPythonNode(packagePath, packageName, config.nodeName, config.includeTemplateNode);
      
      const deps = config.dependencies || [];
      const defaultDeps = ['rclpy', 'std_msgs'];
      const allDeps = [...new Set([...deps, ...defaultDeps])];
      
      this.updatePythonSetupPy(packagePath, packageName, config.nodeName);
      this.addDependenciesToPackageXml(packagePath, allDeps);
    }
    
    if (config.includeTemplateNode) {
      await this.writeLaunchFile(packagePath, packageName, config.nodeName);
    }
  }

  private async addCppNode(
    packagePath: string,
    packageName: string,
    nodeName: string,
    includeTemplate: boolean
  ): Promise<void> {
    const cppSrcDir = path.join(packagePath, 'src');
    const includeDir = path.join(packagePath, 'include', packageName);
    
    if (!fs.existsSync(cppSrcDir)) fs.mkdirSync(cppSrcDir, { recursive: true });
    if (!fs.existsSync(includeDir)) fs.mkdirSync(includeDir, { recursive: true });
    
    const cppClassName = this.toPascalCase(nodeName) + 'Node';
    
    if (includeTemplate) {
      const cppContent = `#include "rclcpp/rclcpp.hpp"
#include "std_msgs/msg/string.hpp"

using namespace std::chrono_literals;

class ${cppClassName} : public rclcpp::Node
{
public:
  ${cppClassName}()
  : Node("${nodeName}")
  {
    publisher_ = this->create_publisher<std_msgs::msg::String>("topic", 10);
    timer_ = this->create_wall_timer(
      500ms,
      [this]() { this->timer_callback(); });
  }

private:
  void timer_callback()
  {
    static int64_t count = 0;
    auto message = std_msgs::msg::String();
    message.data = "Hello World: " + std::to_string(++count);
    RCLCPP_INFO(this->get_logger(), "Publishing: '%s'", message.data.c_str());
    publisher_->publish(message);
  }

  rclcpp::TimerBase::SharedPtr timer_;
  rclcpp::Publisher<std_msgs::msg::String>::SharedPtr publisher_;
};

int main(int argc, char * argv[])
{
  rclcpp::init(argc, argv);
  rclcpp::spin(std::make_shared<${cppClassName}>());
  rclcpp::shutdown();
  return 0;
}
`;
      fs.writeFileSync(path.join(cppSrcDir, `${nodeName}.cpp`), cppContent);
      
      const headerGuard = packageName.toUpperCase().replace(/-/g, '_');
      const hppContent = `#ifndef ${headerGuard}_NODE_HPP
#define ${headerGuard}_NODE_HPP

#endif // ${headerGuard}_NODE_HPP
`;
      fs.writeFileSync(path.join(includeDir, `${nodeName}.hpp`), hppContent);
    } else {
      const cppContent = `#include "rclcpp/rclcpp.hpp"

int main(int argc, char * argv[])
{
  rclcpp::init(argc, argv);
  rclcpp::shutdown();
  return 0;
}
`;
      fs.writeFileSync(path.join(cppSrcDir, `${nodeName}.cpp`), cppContent);
      
      const headerGuard = packageName.toUpperCase().replace(/-/g, '_');
      const hppContent = `#ifndef ${headerGuard}_NODE_HPP
#define ${headerGuard}_NODE_HPP

#endif // ${headerGuard}_NODE_HPP
`;
      fs.writeFileSync(path.join(includeDir, `${nodeName}.hpp`), hppContent);
    }
  }

  private async addPythonNode(
    packagePath: string,
    packageName: string,
    nodeName: string,
    includeTemplate: boolean
  ): Promise<void> {
    const pythonPackageDir = path.join(packagePath, packageName);
    
    if (!fs.existsSync(pythonPackageDir)) {
      fs.mkdirSync(pythonPackageDir, { recursive: true });
      fs.writeFileSync(path.join(pythonPackageDir, '__init__.py'), '');
    }
    
    const pythonClassName = this.toPascalCase(nodeName) + 'Node';
    
    if (includeTemplate) {
      const pyContent = `import rclpy
from rclpy.node import Node
from std_msgs.msg import String


class ${pythonClassName}(Node):

    def __init__(self):
        super().__init__('${nodeName}')
        self.publisher_ = self.create_publisher(String, 'topic', 10)
        timer_period = 0.5
        self.timer = self.create_timer(timer_period, self.timer_callback)
        self.i = 0

    def timer_callback(self):
        msg = String()
        msg.data = f'Hello from ${packageName}: {self.i}'
        self.publisher_.publish(msg)
        self.get_logger().info(f'Publishing: {msg.data}')
        self.i += 1


def main(args=None):
    rclpy.init(args=args)
    node = ${pythonClassName}()
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
`;
      fs.writeFileSync(path.join(pythonPackageDir, `${nodeName}.py`), pyContent);
    } else {
      const pyContent = `import rclpy
from rclpy.node import Node


def main(args=None):
    rclpy.init(args=args)
    node = Node('${nodeName}')
    rclpy.spin(node)
    node.destroy_node()
    rclpy.shutdown()


if __name__ == '__main__':
    main()
`;
      fs.writeFileSync(path.join(pythonPackageDir, `${nodeName}.py`), pyContent);
    }
  }

  private updateCppCMakeLists(
    packagePath: string,
    nodeName: string,
    dependencies: string[]
  ): void {
    const cmakePath = path.join(packagePath, 'CMakeLists.txt');
    let cmakeContent = fs.readFileSync(cmakePath, 'utf-8');
    
    for (const dep of dependencies) {
      const findPackagePattern = new RegExp(`find_package\\(${dep} REQUIRED\\)`, 'i');
      if (!findPackagePattern.test(cmakeContent)) {
        const findPackageLine = `find_package(${dep} REQUIRED)`;
        cmakeContent = cmakeContent.replace(
          /(find_package\(ament_cmake REQUIRED\))/,
          `$1\n${findPackageLine}`
        );
      }
    }
    
    const executablePattern = new RegExp(`add_executable\\(${nodeName}`, 'i');
    if (!executablePattern.test(cmakeContent)) {
      const executableBlock = `\nadd_executable(${nodeName} src/${nodeName}.cpp)\nament_target_dependencies(${nodeName} ${dependencies.join(' ')})\n\ninstall(TARGETS ${nodeName}\n  DESTINATION lib/\${PROJECT_NAME})\n`;
      
      const installPattern = /install\s*\(\s*DIRECTORIES?/i;
      if (installPattern.test(cmakeContent)) {
        cmakeContent = cmakeContent.replace(installPattern, executableBlock + '\ninstall(DIRECTORIES');
      } else {
        cmakeContent = cmakeContent.replace(
          /(ament_package\(\))/,
          `${executableBlock}\n$1`
        );
      }
    }
    
    fs.writeFileSync(cmakePath, cmakeContent);
  }

  private updatePythonSetupPy(
    packagePath: string,
    packageName: string,
    nodeName: string
  ): void {
    const setupPath = path.join(packagePath, 'setup.py');
    let setupContent = fs.readFileSync(setupPath, 'utf-8');
    
    const entryPointPattern = /console_scripts\s*:\s*\[/i;
    const newEntryPoint = `'${nodeName} = ${packageName}.${nodeName}:main'`;
    
    if (entryPointPattern.test(setupContent)) {
      const existingEntriesPattern = /console_scripts\s*:\s*\[([^\]]*)\]/i;
      const match = setupContent.match(existingEntriesPattern);
      
      if (match && match[1]) {
        const existingEntries = match[1].trim();
        if (existingEntries && !existingEntries.includes(nodeName)) {
          const updatedEntries = existingEntries.endsWith(',') 
            ? `${existingEntries}\n            ${newEntryPoint},`
            : `${existingEntries},\n            ${newEntryPoint},`;
          
          setupContent = setupContent.replace(
            existingEntriesPattern,
            `console_scripts: [\n            ${updatedEntries}\n        ]`
          );
        }
      }
    } else {
      const entryPointsBlock = `entry_points={
        'console_scripts': [
            ${newEntryPoint},
        ],
    },`;
      
      setupContent = setupContent.replace(
        /zip_safe=True,/,
        `zip_safe=True,\n    ${entryPointsBlock}`
      );
    }
    
    fs.writeFileSync(setupPath, setupContent);
  }

  private addDependenciesToPackageXml(
    packagePath: string,
    dependencies: string[]
  ): void {
    const packageXmlPath = path.join(packagePath, 'package.xml');
    let packageXmlContent = fs.readFileSync(packageXmlPath, 'utf-8');
    
    for (const dep of dependencies) {
      const dependPattern = new RegExp(`<depend>${dep}</depend>`, 'i');
      if (!dependPattern.test(packageXmlContent)) {
        const buildExportPattern = /(<build_export_depend>[^<]+<\/build_export_depend>)/i;
        if (buildExportPattern.test(packageXmlContent)) {
          packageXmlContent = packageXmlContent.replace(
            buildExportPattern,
            `$1\n  <depend>${dep}</depend>`
          );
        } else {
          const descriptionPattern = /(<description>[^<]*<\/description>)/i;
          packageXmlContent = packageXmlContent.replace(
            descriptionPattern,
            `$1\n  <depend>${dep}</depend>`
          );
        }
      }
    }
    
    fs.writeFileSync(packageXmlPath, packageXmlContent);
  }

  async addInterfaceToPackage(
    packagePath: string,
    packageName: string,
    interfaceDef: InterfaceDefinition,
    additionalDependencies?: string[]
  ): Promise<void> {
    const interfaceDir = this.getInterfaceDirectory(packagePath, interfaceDef.type);
    
    if (!fs.existsSync(interfaceDir)) {
      fs.mkdirSync(interfaceDir, { recursive: true });
    }
    
    const filePath = path.join(interfaceDir, `${interfaceDef.name}.${this.getInterfaceExtension(interfaceDef.type)}`);
    fs.writeFileSync(filePath, interfaceDef.definition);
    
    this.updateInterfaceCMakeLists(packagePath, interfaceDef);
    
    if (additionalDependencies && additionalDependencies.length > 0) {
      this.addDependenciesToPackageXml(packagePath, additionalDependencies);
    }
  }

  private getInterfaceDirectory(packagePath: string, type: 'message' | 'service' | 'action'): string {
    switch (type) {
      case 'message': return path.join(packagePath, 'msg');
      case 'service': return path.join(packagePath, 'srv');
      case 'action': return path.join(packagePath, 'action');
    }
  }

  private updateInterfaceCMakeLists(
    packagePath: string,
    newInterface: InterfaceDefinition
  ): void {
    const cmakePath = path.join(packagePath, 'CMakeLists.txt');
    let cmakeContent = fs.readFileSync(cmakePath, 'utf-8');
    
    const extension = this.getInterfaceExtension(newInterface.type);
    const newInterfaceFile = `"${newInterface.type === 'message' ? 'msg' : newInterface.type === 'service' ? 'srv' : 'action'}/${newInterface.name}.${extension}"`;
    
    const rosidlPattern = /(rosidl_generate_interfaces\(\$\{PROJECT_NAME\})([\s\S]*?)(\))/;
    const match = cmakeContent.match(rosidlPattern);
    
    if (match) {
      const existingFiles = match[2];
      if (!existingFiles.includes(newInterface.name)) {
        const updatedFiles = `${existingFiles.trim()}\n  ${newInterfaceFile}`;
        cmakeContent = cmakeContent.replace(
          rosidlPattern,
          `$1${updatedFiles}$3`
        );
      }
    } else {
      const rosidlBlock = `rosidl_generate_interfaces(\${PROJECT_NAME}
  ${newInterfaceFile}
  DEPENDENCIES builtin_interfaces
)`;
      
      cmakeContent = cmakeContent.replace(
        /(ament_package\(\))/,
        `${rosidlBlock}\n\n$1`
      );
    }
    
    fs.writeFileSync(cmakePath, cmakeContent);
  }
}
