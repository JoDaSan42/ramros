import * as fs from 'fs';

export class BuildFilePatcher {
  static readWithBackup(filePath: string): { content: string; backup: string } {
    const content = fs.readFileSync(filePath, 'utf-8');
    const backup = content;
    return { content, backup };
  }

  static writeWithRollback(filePath: string, content: string, backup: string): void {
    try {
      fs.writeFileSync(filePath, content, 'utf-8');
    } catch (error) {
      fs.writeFileSync(filePath, backup, 'utf-8');
      throw error;
    }
  }

  static addCmakeDependency(cmakePath: string, dependency: string): void {
    if (!fs.existsSync(cmakePath)) return;
    const { content, backup } = this.readWithBackup(cmakePath);

    const guardRegex = new RegExp(`find_package\\(${dependency} REQUIRED\\)`, 'i');
    if (guardRegex.test(content)) return;

    const anchorRegex = /(find_package\(ament_cmake REQUIRED\))/;
    let updated = content;
    if (anchorRegex.test(content)) {
      updated = content.replace(anchorRegex, `$1\nfind_package(${dependency} REQUIRED)`);
    }

    if (updated !== content) {
      this.writeWithRollback(cmakePath, updated, backup);
    }
  }

  static addCmakeExecutable(cmakePath: string, nodeName: string, dependencies: string[]): void {
    if (!fs.existsSync(cmakePath)) return;
    const { content, backup } = this.readWithBackup(cmakePath);

    const guardRegex = new RegExp(`add_executable\\(${nodeName}`, 'i');
    if (guardRegex.test(content)) return;

    const depsStr = dependencies.length > 0 ? ` ${dependencies.join(' ')}` : '';
    const executableBlock = `\nadd_executable(${nodeName} src/${nodeName}.cpp)\nament_target_dependencies(${nodeName}${depsStr})\n\ninstall(TARGETS ${nodeName}\n  DESTINATION lib/\${PROJECT_NAME})\n`;

    let updated = content;
    const installDirRegex = /install\s*\(\s*DIRECTORIES?/i;
    if (installDirRegex.test(content)) {
      updated = content.replace(installDirRegex, `${executableBlock}\ninstall(DIRECTORIES`);
    } else {
      const amentPackageRegex = /(ament_package\(\))/;
      if (amentPackageRegex.test(content)) {
        updated = content.replace(amentPackageRegex, `${executableBlock}\n$1`);
      }
    }

    if (updated !== content) {
      this.writeWithRollback(cmakePath, updated, backup);
    }
  }

  static addPythonEntryPoint(setupPyPath: string, nodeName: string, packageName: string): void {
    if (!fs.existsSync(setupPyPath)) return;
    const { content, backup } = this.readWithBackup(setupPyPath);

    const updated = this.addPythonEntryPointToContent(content, nodeName, packageName);
    if (updated !== content) {
      this.writeWithRollback(setupPyPath, updated, backup);
    }
  }

  static addPythonEntryPointToContent(content: string, nodeName: string, packageName: string): string {
    const newEntry = `'${nodeName} = ${packageName}.${nodeName}:main'`;
    if (content.includes(newEntry)) return content;

    let updated = content;
    const consoleScriptsRegex = /console_scripts\s*:\s*\[/i;

    if (consoleScriptsRegex.test(content)) {
      const captureRegex = /console_scripts\s*:\s*\[([^\]]*)\]/i;
      updated = content.replace(captureRegex, (_match, entries: string) => {
        const trimmed = entries.trim();
        const withComma = trimmed.endsWith(',') ? trimmed : `${trimmed},`;
        return `console_scripts: [\n            ${withComma}\n            ${newEntry}\n        ]`;
      });
    } else {
      const entryPointsBlock = `    entry_points={\n        'console_scripts': [\n            ${newEntry},\n        ],\n    },`;
      updated = this.insertPythonEntryPointsBlock(content, entryPointsBlock);
    }

    return updated;
  }

  private static insertPythonEntryPointsBlock(content: string, entryPointsBlock: string): string {
    // Prefer anchoring after zip_safe, but fall back to the closing paren of
    // setuptools.setup(...) so setup.py variants without zip_safe still work.
    const zipSafeRegex = /(\bzip_safe\s*=\s*(?:True|False)\s*,)/;
    if (zipSafeRegex.test(content)) {
      return content.replace(zipSafeRegex, `$1\n${entryPointsBlock}`);
    }

    const setupCallRegex = /(?:setuptools\.)?setup\s*\([\s\S]*?\)\s*$/m;
    if (setupCallRegex.test(content)) {
      return content.replace(setupCallRegex, (match) => {
        const closingParenIdx = match.lastIndexOf(')');
        if (closingParenIdx === -1) return match;
        const indent = '    ';
        return `${match.slice(0, closingParenIdx)}${indent}${entryPointsBlock}\n)`;
      });
    }

    return content;
  }

  static addPackageXmlDependency(packageXmlPath: string, dependency: string): void {
    if (!fs.existsSync(packageXmlPath)) return;
    const { content, backup } = this.readWithBackup(packageXmlPath);

    const guardRegex = new RegExp(`<depend>${dependency}</depend>`, 'i');
    if (guardRegex.test(content)) return;

    let updated = content;
    const buildExportRegex = /(<build_export_depend>[^<]+<\/build_export_depend>)/i;
    if (buildExportRegex.test(content)) {
      updated = content.replace(buildExportRegex, `$1\n  <depend>${dependency}</depend>`);
    } else {
      const descRegex = /(<description>[^<]*<\/description>)/i;
      if (descRegex.test(content)) {
        updated = content.replace(descRegex, `$1\n  <depend>${dependency}</depend>`);
      }
    }

    if (updated !== content) {
      this.writeWithRollback(packageXmlPath, updated, backup);
    }
  }

  static addCmakeInterfaceRegistration(
    cmakePath: string,
    interfaceType: 'message' | 'service' | 'action',
    interfaceName: string
  ): void {
    if (!fs.existsSync(cmakePath)) return;
    const { content, backup } = this.readWithBackup(cmakePath);

    const dir = interfaceType === 'message' ? 'msg' : interfaceType === 'service' ? 'srv' : 'action';
    const ext = interfaceType === 'message' ? '.msg' : interfaceType === 'service' ? '.srv' : '.action';
    const newInterfaceFile = `"${dir}/${interfaceName}${ext}"`;

    if (content.includes(newInterfaceFile)) return;

    let updated = content;
    const rosidlRegex = /(rosidl_generate_interfaces\(\$\{PROJECT_NAME\})([\s\S]*?)(\))/;
    const rosidlMatch = content.match(rosidlRegex);

    if (rosidlMatch) {
      const existingFiles = rosidlMatch[2];
      const updatedFiles = `${existingFiles.trim()}\n  ${newInterfaceFile}`;
      updated = content.replace(rosidlRegex, `$1${updatedFiles}$3`);
    } else {
      const newBlock = `\nrosidl_generate_interfaces(\${PROJECT_NAME}\n  ${newInterfaceFile}\n  DEPENDENCIES builtin_interfaces\n)\n`;
      const amentPackageRegex = /(ament_package\(\))/;
      if (amentPackageRegex.test(content)) {
        updated = content.replace(amentPackageRegex, `${newBlock}\n$1`);
      }
    }

    if (updated !== content) {
      this.writeWithRollback(cmakePath, updated, backup);
    }
  }

  static addLaunchInstallToSetupPy(content: string, packageName: string): string {
    const genericInstallEntry = `('share/${packageName}/launch', glob('launch/*.launch.py'))`;
    const hasGenericInstall = content.includes(genericInstallEntry) ||
      (content.includes(`'share/${packageName}/launch'`) && content.includes('glob') && content.includes('launch/*.launch.py'));
    if (hasGenericInstall) return content;

    const hasGlobImport = /from\s+glob\s+import\s+glob|import\s+glob/.test(content);
    const dataFilesPattern = /data_files\s*=\s*\[/gs;

    let updated: string;
    if (!dataFilesPattern.test(content)) {
      const setupPyPattern = /(?:setuptools\.)?setup\s*\([^)]*\)/gs;
      const match = setupPyPattern.exec(content);
      if (!match) return content;
      const insertPos = match.index + match[0].lastIndexOf(')');
      updated =
        content.substring(0, insertPos) +
        ',\n    data_files=[\n        ' + genericInstallEntry + ',\n    ]' +
        content.substring(insertPos);
    } else {
      updated = content.replace(
        /data_files\s*=\s*\[/,
        'data_files=[\n        ' + genericInstallEntry + ','
      );
    }

    if (!hasGlobImport) {
      const firstNewline = updated.indexOf('\n');
      updated = updated.substring(0, firstNewline + 1) + 'from glob import glob\n' + updated.substring(firstNewline + 1);
    }

    return updated;
  }

  static addLaunchInstallToCMakeLists(content: string, packageName: string): string {
    const hasLaunchInstall = /install\s*\(\s*DIRECTORY\s+launch/gi.test(content) ||
      /install\s*\(\s*FILES.*launch/gi.test(content);
    if (hasLaunchInstall) return content;

    const lines = content.split('\n');
    const installIndex = lines.findIndex(line => /^install\s*\(/i.test(line.trim()));

    if (installIndex !== -1) {
      lines.splice(installIndex + 1, 0, '', '# Install launch files', `install(DIRECTORY launch DESTINATION share/${packageName})`);
      return lines.join('\n');
    }

    return content + `\n\n# Install launch files\ninstall(DIRECTORY launch DESTINATION share/${packageName})\n`;
  }
}
