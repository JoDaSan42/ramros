import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { ParameterCoercer, ParameterValue } from './build-file-patcher';

export interface LaunchArgumentConfig {
  name: string;
  defaultValue: string;
  description?: string;
}

export interface LaunchNodeConfig {
  packageName: string;
  executableName: string;
  nodeName?: string;
  namespace?: string;
  parameters?: Array<{ name: string; value: ParameterValue }>;
  remappings?: Array<{ from: string; to: string }>;
  output?: 'screen' | 'log';
  useSimTime?: boolean;
}

export interface LaunchFileConfig {
  fileName: string;
  description?: string;
  nodes: LaunchNodeConfig[];
  launchArguments?: LaunchArgumentConfig[];
}

export class LaunchGenerator {
  generate(config: LaunchFileConfig): string {
    const lines: string[] = [];
    
    // Header imports
    lines.push('from launch import LaunchDescription');
    lines.push('from launch_ros.actions import Node');
    lines.push('from launch.substitutions import LaunchConfiguration');
    lines.push('from launch.actions import DeclareLaunchArgument');
    lines.push('');
    
    // Generate launch description function
    lines.push('');
    lines.push('def generate_launch_description():');
    
    // Add description comment if provided
    if (config.description) {
      lines.push(`    """${config.description}"""`);
      lines.push('');
    }
    
    // Generate launch arguments
    if (config.launchArguments && config.launchArguments.length > 0) {
      lines.push('    # Launch arguments');
      for (const arg of config.launchArguments) {
        lines.push(`    ${arg.name}_arg = DeclareLaunchArgument(`);
        lines.push(`        '${arg.name}',`);
        lines.push(`        default_value='${arg.defaultValue}',`);
        if (arg.description) {
          lines.push(`        description='${arg.description}'`);
        }
        lines.push('    )');
        lines.push('');
      }
      lines.push('');
    }
    
    // Generate nodes
    lines.push('    # Nodes');
    const nodeVariableNames: string[] = [];
    
    for (const nodeConfig of config.nodes) {
      const varName = this.createVariableName(nodeConfig.packageName, nodeConfig.executableName);
      nodeVariableNames.push(varName);
      
      lines.push(`    ${varName} = Node(`);
      lines.push(`        package='${nodeConfig.packageName}',`);
      lines.push(`        executable='${nodeConfig.executableName}',`);
      
      if (nodeConfig.nodeName) {
        lines.push(`        name='${nodeConfig.nodeName}',`);
      }
      
      if (nodeConfig.namespace) {
        lines.push(`        namespace='${nodeConfig.namespace}',`);
      }
      
      // Merge user parameters and use_sim_time into a single parameters dict
      // to avoid emitting duplicate parameters=[...] keys (Python SyntaxError)
      const allParams: Array<{ name: string; value: ParameterValue }> = [];
      if (nodeConfig.parameters && nodeConfig.parameters.length > 0) {
        allParams.push(...nodeConfig.parameters);
      }
      if (nodeConfig.useSimTime !== undefined) {
        allParams.push({ name: 'use_sim_time', value: nodeConfig.useSimTime });
      }
      
      if (allParams.length > 0) {
        lines.push('        parameters=[{');
        const paramLines: string[] = [];
        for (const param of allParams) {
          const valueStr = this.formatParameterValue(param.value);
          paramLines.push(`'${param.name}': ${valueStr},`);
        }
        lines.push('            ' + paramLines.join('\n            '));
        lines.push('        }],');
      }
      
      if (nodeConfig.remappings && nodeConfig.remappings.length > 0) {
        lines.push('        remappings=[');
        for (const remap of nodeConfig.remappings) {
          lines.push(`            ('${remap.from}', '${remap.to}'),`);
        }
        lines.push('        ],');
      }
      
      if (nodeConfig.output) {
        lines.push(`        output='${nodeConfig.output}',`);
      }
      
      // Remove trailing comma from the last argument line before closing
      const lastLineIdx = lines.length - 1;
      lines[lastLineIdx] = lines[lastLineIdx].replace(/,\s*$/, '');
      lines.push('    )');
      lines.push('');
    }
    
    // Generate return statement
    lines.push('    return LaunchDescription([');
    
    // Add launch arguments first
    if (config.launchArguments && config.launchArguments.length > 0) {
      for (const arg of config.launchArguments) {
        lines.push(`        ${arg.name}_arg,`);
      }
    }
    
    // Add nodes
    for (const varName of nodeVariableNames) {
      lines.push(`        ${varName},`);
    }
    
    lines.push('    ])');
    
    return lines.join('\n');
  }

  async validate(filePath: string): Promise<boolean> {
    try {
      execSync(`ros2 launch --check ${filePath}`, { 
        stdio: 'pipe',
        encoding: 'utf-8'
      });
      return true;
    } catch (error) {
      console.error('Launch file validation failed:', error);
      return false;
    }
  }

  private createVariableName(packageName: string, executableName: string): string {
    // Convert to snake_case and create a meaningful variable name
    const pkgPart = packageName.replace(/-/g, '_').split('_').slice(0, 2).join('_');
    const exePart = executableName.replace(/-/g, '_');
    return `${pkgPart}_${exePart}_node`;
  }

  private formatParameterValue(value: ParameterValue): string {
    return ParameterCoercer.formatPython(value);
  }

  async writeToFile(content: string, filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}
