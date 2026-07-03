import * as fs from 'fs';

export type ParameterValue = boolean | number | string | ParameterValue[];

export class ParameterCoercer {
  static inferType(defaultValue: string | undefined): string {
    if (!defaultValue) return 'unspecified';
    const trimmed = defaultValue.trim();
    if (trimmed === 'true' || trimmed === 'false') return 'bool';
    if (/^-?\d+$/.test(trimmed)) return 'int';
    if (/^-?\d+\.\d+$/.test(trimmed)) return 'double';
    if (trimmed.startsWith("'") || trimmed.startsWith('"')) return 'string';
    if (trimmed.startsWith('[')) return 'array';
    return 'string';
  }

  static parse(value: string, type?: string): ParameterValue {
    const lowerType = type?.toLowerCase();
    if (lowerType === 'bool' || lowerType === 'boolean') {
      return value.toLowerCase() === 'true';
    }
    if (lowerType === 'int' || lowerType === 'integer') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? value : parsed;
    }
    if (lowerType === 'float' || lowerType === 'double') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? value : parsed;
    }
    if (lowerType === 'array' || lowerType === 'list' || value.startsWith('[')) {
      try {
        return JSON.parse(value) as ParameterValue;
      } catch {
        return value.split(',').map(s => s.trim());
      }
    }
    return value;
  }

  static formatPython(value: ParameterValue): string {
    if (typeof value === 'boolean') {
      return value ? 'True' : 'False';
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    if (typeof value === 'string') {
      if (/^-?\d+(\.\d+)?$/.test(value)) {
        return value;
      }
      return `'${value.replace(/'/g, "\\'")}'`;
    }
    if (Array.isArray(value)) {
      const items = value.map(v => ParameterCoercer.formatPython(v)).join(', ');
      return `[${items}]`;
    }
    return `'${String(value).replace(/'/g, "\\'")}'`;
  }
}

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

    const newEntry = `'${nodeName} = ${packageName}.${nodeName}:main'`;
    if (content.includes(newEntry)) return;

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
      const zipSafeRegex = /zip_safe=True,/;
      if (zipSafeRegex.test(content)) {
        updated = content.replace(zipSafeRegex, `zip_safe=True,\n${entryPointsBlock}`);
      }
    }

    if (updated !== content) {
      this.writeWithRollback(setupPyPath, updated, backup);
    }
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
}
