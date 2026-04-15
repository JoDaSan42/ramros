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
}
