import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface PackageInfo {
  name: string;
  path: string;
  version: string;
  description: string;
  maintainers: Array<{ name: string; email: string }>;
  license: string;
  buildType: 'ament_cmake' | 'ament_python' | 'cmake';
  packageType: 'cpp' | 'python' | 'mixed' | 'interface' | 'empty';
  dependencies: Array<{ name: string; type: 'build' | 'exec' | 'test' }>;
  nodes: NodeInfo[];
  interfaces: InterfaceInfo[];
  launchFiles: LaunchFileInfo[];
}

export interface NodeInfo {
  name: string;
  path: string;
  packageName: string;
  language: 'cpp' | 'python';
  isExecutable: boolean;
  parameters?: ParameterInfo[];
  publishers?: TopicEndpointInfo[];
  subscriptions?: TopicEndpointInfo[];
  serviceServers?: ServiceInfo[];
  serviceClients?: ServiceInfo[];
  actionServers?: ActionInfo[];
  actionClients?: ActionInfo[];
}

export interface ParameterInfo {
  name: string;
  type?: string;
  defaultValue?: string;
}

export interface TopicEndpointInfo {
  topicName: string;
  messageType: string;
  nodeName?: string;
  nodeNamespace?: string;
  messageTypes?: string[];
}

export interface ServiceInfo {
  name: string;
  serviceType: string;
}

export interface ActionInfo {
  name: string;
  actionType: string;
}

export interface InterfaceInfo {
  type: 'message' | 'service' | 'action';
  name: string;
  path: string;
  fields: InterfaceFieldInfo[];
}

export interface InterfaceFieldInfo {
  name: string;
  type: string;
  isArray: boolean;
  arraySize?: number;
}

export interface LaunchFileInfo {
  name: string;
  path: string;
  packageName: string;
}

export interface InstalledPackageInfo extends PackageInfo {
  source: 'installed';
  installPath: string;
}

export type PackageInfoWithSource = PackageInfo | InstalledPackageInfo;


export class PackageDiscoveryService {
  private cache: Map<string, PackageInfo[]> = new Map();
  private installedPackagesCache: InstalledPackageInfo[] | null = null;

  async discoverInstalledPackages(): Promise<InstalledPackageInfo[]> {
    if (this.installedPackagesCache !== null) {
      return this.installedPackagesCache;
    }

    try {
      const { execSync } = await import('child_process');
      
      // Get all installed package names
      const pkgListOutput = execSync('ros2 pkg list', { encoding: 'utf-8' });
      const packageNames = pkgListOutput.split('\n').filter(line => line.trim().length > 0);

      // Get all executables with their package names
      const executablesOutput = execSync('ros2 pkg executables', { encoding: 'utf-8' });
      const executableLines = executablesOutput.split('\n').filter(line => line.trim().length > 0);
      
      // Map: packageName -> [executable1, executable2, ...]
      const packageExecutables = new Map<string, string[]>();
      for (const line of executableLines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2) {
          const packageName = parts[0];
          const executableName = parts[1];
          
          if (!packageExecutables.has(packageName)) {
            packageExecutables.set(packageName, []);
          }
          packageExecutables.get(packageName)!.push(executableName);
        }
      }

      // Build InstalledPackageInfo for each package
      const packages: InstalledPackageInfo[] = [];
      
      for (const pkgName of packageNames) {
        try {
          // Try to get package path via ros2 pkg prefix
          const prefixOutput = execSync(`ros2 pkg prefix ${pkgName}`, { encoding: 'utf-8' }).trim();
          
          const installPath = prefixOutput;
          const sharePath = path.join(installPath, 'share', pkgName);
          
          const nodes: NodeInfo[] = [];
          const executables = packageExecutables.get(pkgName) || [];
          
          for (const exe of executables) {
            nodes.push({
              name: exe,
              path: path.join(installPath, 'lib', pkgName, exe),
              packageName: pkgName,
              language: this.detectExecutableLanguage(path.join(installPath, 'lib', pkgName, exe)),
              isExecutable: true,
              parameters: [], // No parameter extraction for installed packages in Phase 1
            });
          }

          packages.push({
            name: pkgName,
            path: sharePath,
            installPath: installPath,
            source: 'installed',
            version: '',
            description: '',
            maintainers: [],
            license: '',
            buildType: 'ament_cmake',
            packageType: 'empty',
            dependencies: [],
            nodes: nodes.sort((a, b) => a.name.localeCompare(b.name)),
            interfaces: [],
            launchFiles: [],
          });
        } catch (error) {
          console.warn(`Failed to get info for installed package ${pkgName}:`, error);
        }
      }

      packages.sort((a, b) => a.name.localeCompare(b.name));
      this.installedPackagesCache = packages;
      return packages;
    } catch (error) {
      console.error('Failed to discover installed packages:', error);
      return [];
    }
  }

  private detectExecutableLanguage(executablePath: string): 'cpp' | 'python' {
    if (!fs.existsSync(executablePath)) {
      return 'cpp';
    }

    try {
      const fileOutput = execSync(`file "${executablePath}"`, { encoding: 'utf-8' });
      
      if (fileOutput.includes('Python') || fileOutput.includes('script')) {
        return 'python';
      }
      if (fileOutput.includes('ELF') || fileOutput.includes('executable')) {
        return 'cpp';
      }

      // Fallback: check file extension or first line
      if (executablePath.endsWith('.py')) {
        return 'python';
      }

      const firstLine = fs.readFileSync(executablePath, 'utf-8').split('\n')[0];
      if (firstLine.includes('python')) {
        return 'python';
      }

      return 'cpp';
    } catch {
      return 'cpp';
    }
  }

  async discoverPackages(workspaceSrcPath: string): Promise<PackageInfo[]> {
    const cached = this.cache.get(workspaceSrcPath);
    if (cached) {
      return cached;
    }

    if (!fs.existsSync(workspaceSrcPath)) {
      return [];
    }

    const packages: PackageInfo[] = [];
    const packageXmlPaths = await this.findPackageXmlFiles(workspaceSrcPath);

    for (const packageXmlPath of packageXmlPaths) {
      try {
        const packageInfo = await this.buildPackageInfo(packageXmlPath);
        packages.push(packageInfo);
      } catch (error) {
        console.warn(`Failed to parse package at ${packageXmlPath}:`, error);
      }
    }

    packages.sort((a, b) => a.name.localeCompare(b.name));
    this.cache.set(workspaceSrcPath, packages);
    return packages;
  }

  clearCache(): void {
    this.cache.clear();
  }

  private async findPackageXmlFiles(srcPath: string): Promise<string[]> {
    const packageXmlPaths: string[] = [];
    const items = fs.readdirSync(srcPath);

    for (const item of items) {
      const itemPath = path.join(srcPath, item);
      const stat = fs.statSync(itemPath);

      if (stat.isDirectory()) {
        if (item.startsWith('.')) {
          continue;
        }

        const packageXmlPath = path.join(itemPath, 'package.xml');
        if (fs.existsSync(packageXmlPath)) {
          packageXmlPaths.push(packageXmlPath);
        } else {
          const subResults = await this.findPackageXmlFiles(itemPath);
          packageXmlPaths.push(...subResults);
        }
      }
    }

    return packageXmlPaths;
  }

  private async buildPackageInfo(packageXmlPath: string): Promise<PackageInfo> {
    const packageDir = path.dirname(packageXmlPath);
    const xmlData = await this.parsePackageXml(packageXmlPath) || {};
    const packageType = this.detectPackageType(packageDir);
    const packageName = xmlData.name || path.basename(packageDir);
    const nodes = await this.findExecutableNodes(packageDir, packageType, packageName);
    const interfaces = await this.findInterfaceFiles(packageDir);
    const launchFiles = await this.findLaunchFiles(packageDir, packageName);

    return {
      name: xmlData.name || path.basename(packageDir),
      path: packageDir,
      version: xmlData.version || '0.0.0',
      description: xmlData.description || '',
      maintainers: xmlData.maintainers || [],
      license: xmlData.license || 'Unknown',
      buildType: xmlData.buildType || 'ament_cmake',
      packageType,
      dependencies: xmlData.dependencies || [],
      nodes,
      interfaces,
      launchFiles,
    };
  }

  async parsePackageXml(packageXmlPath: string): Promise<Partial<PackageInfo> | undefined> {
    if (!fs.existsSync(packageXmlPath)) {
      return undefined;
    }
    
    const content = fs.readFileSync(packageXmlPath, 'utf-8');
    
    const name = this.extractXmlTag(content, 'name');
    const version = this.extractXmlTag(content, 'version');
    const description = this.extractXmlTag(content, 'description');
    const license = this.extractXmlTag(content, 'license');
    
    const maintainers = this.extractMaintainers(content);
    const dependencies = this.extractDependencies(content);
    const buildType = this.extractBuildType(content);

    return {
      name: name || undefined,
      version: version || undefined,
      description: description || undefined,
      maintainers,
      license: license || undefined,
      buildType,
      dependencies,
    };
  }

  private extractXmlTag(content: string, tagName: string): string | null {
    const regex = new RegExp(`<${tagName}[^>]*>([^<]*)</${tagName}>`, 'i');
    const match = content.match(regex);
    return match ? match[1].trim() : null;
  }

  private extractMaintainers(content: string): Array<{ name: string; email: string }> {
    const maintainers: Array<{ name: string; email: string }> = [];
    const regex = /<maintainer\s+email="([^"]+)">([^<]+)<\/maintainer>/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      maintainers.push({
        email: match[1].trim(),
        name: match[2].trim(),
      });
    }

    return maintainers;
  }

  private extractDependencies(content: string): Array<{ name: string; type: 'build' | 'exec' | 'test' }> {
    const dependencies: Array<{ name: string; type: 'build' | 'exec' | 'test' }> = [];

    const buildtoolPatterns = ['buildtool_depend', 'build_depend'];
    const execPatterns = ['exec_depend', 'depend'];
    const testPatterns = ['test_depend'];

    for (const pattern of buildtoolPatterns) {
      const matches = this.extractDependTags(content, pattern);
      matches.forEach(name => dependencies.push({ name, type: 'build' }));
    }

    for (const pattern of execPatterns) {
      const matches = this.extractDependTags(content, pattern);
      matches.forEach(name => dependencies.push({ name, type: 'exec' }));
    }

    for (const pattern of testPatterns) {
      const matches = this.extractDependTags(content, pattern);
      matches.forEach(name => dependencies.push({ name, type: 'test' }));
    }

    return dependencies;
  }

  private extractDependTags(content: string, tagName: string): string[] {
    const names: string[] = [];
    const regex = new RegExp(`<${tagName}>([^<]+)</${tagName}>`, 'gi');
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content)) !== null) {
      names.push(match[1].trim());
    }

    return names;
  }

  private extractBuildType(content: string): 'ament_cmake' | 'ament_python' | 'cmake' {
    const buildTypeMatch = content.match(/<build_type>([^<]+)<\/build_type>/i);
    if (buildTypeMatch) {
      const type = buildTypeMatch[1].trim();
      if (type === 'ament_cmake' || type === 'ament_python' || type === 'cmake') {
        return type;
      }
    }

    if (content.includes('<buildtool_depend>ament_cmake</buildtool_depend>')) {
      return 'ament_cmake';
    }
    if (content.includes('<buildtool_depend>ament_python</buildtool_depend>')) {
      return 'ament_python';
    }

    return 'ament_cmake';
  }

  detectPackageType(
    packagePath: string
  ): 'cpp' | 'python' | 'mixed' | 'interface' | 'empty' {
    const msgDir = path.join(packagePath, 'msg');
    const srvDir = path.join(packagePath, 'srv');
    const actionDir = path.join(packagePath, 'action');

    if (fs.existsSync(msgDir) && fs.readdirSync(msgDir).length > 0) {
      return 'interface';
    }
    if (fs.existsSync(srvDir) && fs.readdirSync(srvDir).length > 0) {
      return 'interface';
    }
    if (fs.existsSync(actionDir) && fs.readdirSync(actionDir).length > 0) {
      return 'interface';
    }

    const hasCppExecutables = this.hasCppExecutables(packagePath);
    const hasPythonExecutables = this.hasPythonExecutables(packagePath);

    if (hasCppExecutables && hasPythonExecutables) {
      return 'mixed';
    }
    if (hasCppExecutables) {
      return 'cpp';
    }
    if (hasPythonExecutables) {
      return 'python';
    }

    return 'empty';
  }

  private hasCppExecutables(packagePath: string): boolean {
    const cmakeListsPath = path.join(packagePath, 'CMakeLists.txt');
    if (!fs.existsSync(cmakeListsPath)) {
      return false;
    }

    const cmakeContent = fs.readFileSync(cmakeListsPath, 'utf-8');
    const installTargetPattern = /install\s*\(\s*TARGETS\s+\w+\s+DESTINATION\s+lib\/\$\{PROJECT_NAME\}/i;
    const addExecutablePattern = /add_executable\s*\(\s*\w+/i;

    return installTargetPattern.test(cmakeContent) && addExecutablePattern.test(cmakeContent);
  }

  private hasPythonExecutables(packagePath: string): boolean {
    const setupPyPath = path.join(packagePath, 'setup.py');
    if (!fs.existsSync(setupPyPath)) {
      return false;
    }

    const setupContent = fs.readFileSync(setupPyPath, 'utf-8');
    const consoleScriptsPattern = /['"]console_scripts['"]\s*:\s*\[/i;

    return consoleScriptsPattern.test(setupContent);
  }

  async findExecutableNodes(
    packagePath: string,
    packageType: string,
    packageName: string
  ): Promise<NodeInfo[]> {
    const nodes: NodeInfo[] = [];

    if (packageType === 'cpp' || packageType === 'mixed') {
      const cppNodes = await this.findCppNodes(packagePath, packageName);
      nodes.push(...cppNodes);
    }

    if (packageType === 'python' || packageType === 'mixed') {
      const pythonNodes = await this.findPythonNodes(packagePath, packageName);
      nodes.push(...pythonNodes);
    }

    if (packageType === 'empty') {
      const cppNodes = await this.findCppNodes(packagePath, packageName);
      const pythonNodes = await this.findPythonNodes(packagePath, packageName);
      nodes.push(...cppNodes, ...pythonNodes);
    }

    nodes.sort((a, b) => a.name.localeCompare(b.name));
    return nodes;
  }

  private async findCppNodes(packagePath: string, packageName: string): Promise<NodeInfo[]> {
    const nodes: NodeInfo[] = [];
    const cmakeListsPath = path.join(packagePath, 'CMakeLists.txt');

    if (!fs.existsSync(cmakeListsPath)) {
      return nodes;
    }

    const cmakeContent = fs.readFileSync(cmakeListsPath, 'utf-8');
    const installPattern = /install\s*\(\s*TARGETS\s+(\w+)\s+DESTINATION\s+lib\/\$\{PROJECT_NAME\}/gi;
    let match: RegExpExecArray | null;

    while ((match = installPattern.exec(cmakeContent)) !== null) {
      const nodeName = match[1];
      const nodePath = this.findCppNodeSource(packagePath, nodeName);

      if (nodePath) {
        const analysis = await this.analyzeCppNode(nodePath);
        nodes.push({
          name: nodeName,
          path: nodePath,
          packageName,
          language: 'cpp',
          isExecutable: true,
          ...analysis,
        });
      }
    }

    return nodes;
  }

  private findCppNodeSource(packagePath: string, nodeName: string): string | null {
    const srcDirs = ['src', path.join('src', nodeName)];
    
    for (const srcDir of srcDirs) {
      const fullPath = path.join(packagePath, srcDir, `${nodeName}.cpp`);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    const includeDirs = ['include', path.join('include', path.basename(packagePath))];
    for (const includeDir of includeDirs) {
      const fullPath = path.join(packagePath, includeDir, `${nodeName}.hpp`);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }

    return null;
  }

  private inferParamType(defaultValue: string | undefined): string {
    if (!defaultValue) return 'unspecified';
    const trimmed = defaultValue.trim();
    if (trimmed === 'true' || trimmed === 'false') return 'bool';
    if (/^-?\d+$/.test(trimmed)) return 'int';
    if (/^-?\d+\.\d+$/.test(trimmed)) return 'double';
    if (trimmed.startsWith("'") || trimmed.startsWith('"')) return 'string';
    if (trimmed.startsWith('[')) return 'list';
    return 'string';
  }

  private async analyzeCppNode(filePath: string): Promise<Partial<NodeInfo>> {
    if (!fs.existsSync(filePath)) {
      return {};
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const publishers: TopicEndpointInfo[] = [];
    const subscriptions: TopicEndpointInfo[] = [];
    const parameters: ParameterInfo[] = [];

    const publisherPattern = /create_publisher\s*<\s*([^>]+)>\s*\(\s*["']([^"']+)["']/gs;
    let match: RegExpExecArray | null;

    while ((match = publisherPattern.exec(content)) !== null) {
      publishers.push({
        messageType: match[1].trim(),
        topicName: match[2],
      });
    }

    const subscriptionPattern = /create_subscription\s*<\s*([^>]+)>\s*\(\s*["']([^"']+)["']/gs;
    while ((match = subscriptionPattern.exec(content)) !== null) {
      subscriptions.push({
        messageType: match[1].trim(),
        topicName: match[2],
      });
    }

    const paramPattern = /declare_parameter\s*\(\s*["']([^"']+)["']\s*(?:,\s*([^)]+))?/g;
    while ((match = paramPattern.exec(content)) !== null) {
      const paramName = match[1];
      const rawDefault = match[2]?.trim();
      let defaultValue: string | undefined;
      let paramType: string | undefined;
      
      if (rawDefault) {
        defaultValue = rawDefault.replace(/^["']|["']$/g, '');
        paramType = this.inferParamType(rawDefault);
      }
      
      parameters.push({
        name: paramName,
        defaultValue,
        type: paramType,
      });
    }

    return {
      publishers: publishers.length > 0 ? publishers : undefined,
      subscriptions: subscriptions.length > 0 ? subscriptions : undefined,
      parameters: parameters.length > 0 ? parameters : undefined,
    };
  }

  private async findPythonNodes(packagePath: string, packageName: string): Promise<NodeInfo[]> {
    const nodes: NodeInfo[] = [];
    const setupPyPath = path.join(packagePath, 'setup.py');

    if (!fs.existsSync(setupPyPath)) {
      return nodes;
    }

    const setupContent = fs.readFileSync(setupPyPath, 'utf-8');
    const consoleScriptsPattern = /['"](\w+)\s*=\s*([^:]+):(\w+)['"]/g;
    let match: RegExpExecArray | null;

    while ((match = consoleScriptsPattern.exec(setupContent)) !== null) {
      const nodeName = match[1];
      const moduleName = match[2].trim();

      const nodePath = this.findPythonNodeSource(packagePath, moduleName, nodeName);
      if (nodePath) {
        const analysis = await this.analyzePythonNode(nodePath);
        nodes.push({
          name: nodeName,
          path: nodePath,
          packageName,
          language: 'python',
          isExecutable: true,
          ...analysis,
        });
      }
    }

    return nodes;
  }

  private findPythonNodeSource(
    packagePath: string,
    moduleName: string,
    nodeName: string
  ): string | null {
    const possiblePaths = [
      path.join(packagePath, moduleName.replace(/\./g, '/'), `${nodeName}.py`),
      path.join(packagePath, moduleName.replace(/\./g, '/'), '__main__.py'),
      path.join(packagePath, 'src', moduleName.replace(/\./g, '/'), `${nodeName}.py`),
      path.join(packagePath, `${moduleName}.py`),
    ];

    for (const p of possiblePaths) {
      if (fs.existsSync(p)) {
        return p;
      }
    }

    const packageName = path.basename(packagePath);
    const fallbackPath = path.join(packagePath, packageName, `${nodeName}.py`);
    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }

    return null;
  }

  private async analyzePythonNode(filePath: string): Promise<Partial<NodeInfo>> {
    if (!fs.existsSync(filePath)) {
      return {};
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const publishers: TopicEndpointInfo[] = [];
    const subscriptions: TopicEndpointInfo[] = [];
    const parameters: ParameterInfo[] = [];

    const publisherPattern = /create_publisher\s*\(\s*([^,]+),\s*["']([^"']+)["']/gs;
    let match: RegExpExecArray | null;

    while ((match = publisherPattern.exec(content)) !== null) {
      const msgType = match[1].trim().replace(/\s*\([^)]*\)\s*$/, '');
      publishers.push({
        messageType: msgType,
        topicName: match[2],
      });
    }

    const subscriptionPattern = /create_subscription\s*\(\s*([^,]+),\s*["']([^"']+)["']/gs;
    while ((match = subscriptionPattern.exec(content)) !== null) {
      const msgType = match[1].trim().replace(/\s*\([^)]*\)\s*$/, '');
      subscriptions.push({
        messageType: msgType,
        topicName: match[2],
      });
    }

    const paramPattern = /declare_parameter\s*\(['"]([^'"]+)['"]\s*(?:,\s*([^)]+))?/g;
    while ((match = paramPattern.exec(content)) !== null) {
      const paramName = match[1];
      const rawDefault = match[2]?.trim();
      let defaultValue: string | undefined;
      let paramType: string | undefined;
      
      if (rawDefault) {
        defaultValue = rawDefault;
        if (defaultValue.startsWith("'") || defaultValue.startsWith('"')) {
          defaultValue = defaultValue.slice(1, -1);
        }
        paramType = this.inferParamType(rawDefault);
      }
      
      parameters.push({
        name: paramName,
        defaultValue,
        type: paramType,
      });
    }

    return {
      publishers: publishers.length > 0 ? publishers : undefined,
      subscriptions: subscriptions.length > 0 ? subscriptions : undefined,
      parameters: parameters.length > 0 ? parameters : undefined,
    };
  }

  async findInterfaceFiles(packagePath: string): Promise<InterfaceInfo[]> {
    const interfaces: InterfaceInfo[] = [];

    const msgDir = path.join(packagePath, 'msg');
    if (fs.existsSync(msgDir)) {
      const msgFiles = fs.readdirSync(msgDir).filter(f => f.endsWith('.msg'));
      for (const file of msgFiles) {
        const filePath = path.join(msgDir, file);
        const fields = await this.parseInterfaceFile(filePath, 'message');
        interfaces.push({
          type: 'message',
          name: path.basename(file, '.msg'),
          path: filePath,
          fields,
        });
      }
    }

    const srvDir = path.join(packagePath, 'srv');
    if (fs.existsSync(srvDir)) {
      const srvFiles = fs.readdirSync(srvDir).filter(f => f.endsWith('.srv'));
      for (const file of srvFiles) {
        const filePath = path.join(srvDir, file);
        const fields = await this.parseInterfaceFile(filePath, 'service');
        interfaces.push({
          type: 'service',
          name: path.basename(file, '.srv'),
          path: filePath,
          fields,
        });
      }
    }

    const actionDir = path.join(packagePath, 'action');
    if (fs.existsSync(actionDir)) {
      const actionFiles = fs.readdirSync(actionDir).filter(f => f.endsWith('.action'));
      for (const file of actionFiles) {
        const filePath = path.join(actionDir, file);
        const fields = await this.parseInterfaceFile(filePath, 'action');
        interfaces.push({
          type: 'action',
          name: path.basename(file, '.action'),
          path: filePath,
          fields,
        });
      }
    }

    interfaces.sort((a, b) => a.name.localeCompare(b.name));
    return interfaces;
  }

  async parseInterfaceFile(
    filePath: string,
    type: 'message' | 'service' | 'action'
  ): Promise<InterfaceFieldInfo[]> {
    if (!fs.existsSync(filePath)) {
      return [];
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const fields: InterfaceFieldInfo[] = [];
    const lines = content.split('\n');

    let inResponseSection = false;
    let inResultSection = false;

    for (let line of lines) {
      line = line.trim();

      if (line === '' || line.startsWith('#')) {
        continue;
      }

      if (type === 'service' && line === '---') {
        inResponseSection = true;
        continue;
      }

      if (type === 'action') {
        if (line === '---') {
          if (!inResponseSection) {
            inResponseSection = true;
          } else if (!inResultSection) {
            inResultSection = true;
          }
          continue;
        }
      }

      const field = this.parseInterfaceField(line);
      if (field) {
        fields.push(field);
      }
    }

    return fields;
  }

  private parseInterfaceField(line: string): InterfaceFieldInfo | null {
    const trimmed = line.trim();
    const parts = trimmed.split(/\s+/);

    if (parts.length < 2) {
      return null;
    }

    const fieldType = parts[0];
    const fieldName = parts[1];

    const arrayMatch = fieldType.match(/^([^[\]]+)(?:\[(\d*)\])?$/);
    if (!arrayMatch) {
      return null;
    }

    const baseType = arrayMatch[1];
    const isArray = arrayMatch[2] !== undefined;
    const arraySize = arrayMatch[2] ? parseInt(arrayMatch[2], 10) : undefined;

    return {
      name: fieldName,
      type: baseType,
      isArray,
      arraySize: arraySize === undefined && isArray ? undefined : arraySize,
    };
  }

  async findLaunchFiles(packagePath: string, packageName: string): Promise<LaunchFileInfo[]> {
    const launchFiles: LaunchFileInfo[] = [];
    const launchDir = path.join(packagePath, 'launch');

    if (!fs.existsSync(launchDir)) {
      return launchFiles;
    }

    const files = fs.readdirSync(launchDir).filter(f => f.endsWith('.py'));

    for (const file of files) {
      launchFiles.push({
        name: file,
        path: path.join(launchDir, file),
        packageName: packageName,
      });
    }

    launchFiles.sort((a, b) => a.name.localeCompare(b.name));
    return launchFiles;
  }
}
