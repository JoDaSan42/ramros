import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  parameters?: Array<{ name: string; value: any }>;
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
      
      if (nodeConfig.parameters && nodeConfig.parameters.length > 0) {
        lines.push('        parameters=[{');
        const paramLines: string[] = [];
        for (const param of nodeConfig.parameters) {
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
      
      if (nodeConfig.useSimTime !== undefined) {
        lines.push(`        parameters=[{'use_sim_time': ${nodeConfig.useSimTime}}],`);
      }
      
      // Remove trailing comma and close
      lines[lines.length - 1] = lines[lines.length - 1].replace(/,$/, '');
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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private formatParameterValue(value: any): string {
    if (typeof value === 'boolean') {
      return value ? 'True' : 'False';
    }
    if (typeof value === 'number') {
      return value.toString();
    }
    if (typeof value === 'string') {
      // Check if it looks like a number string
      if (/^-?\d+(\.\d+)?$/.test(value)) {
        return value;
      }
      return `'${value.replace(/'/g, "\\'")}'`;
    }
    if (Array.isArray(value)) {
      const items = value.map(v => this.formatParameterValue(v)).join(', ');
      return `[${items}]`;
    }
    return `'${String(value).replace(/'/g, "\\'")}'`;
  }

  async writeToFile(content: string, filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}
