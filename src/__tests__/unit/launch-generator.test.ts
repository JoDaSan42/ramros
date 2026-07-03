import { LaunchGenerator, LaunchFileConfig } from '../../wizard/launch-generator';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execSync } from 'child_process';

jest.mock('child_process');

describe('LaunchGenerator', () => {
  let generator: LaunchGenerator;

  beforeEach(() => {
    generator = new LaunchGenerator();
  });

  describe('generate', () => {
    it('generates a basic launch file with one node', () => {
      const config: LaunchFileConfig = {
        fileName: 'test_launch',
        nodes: [
          { packageName: 'my_pkg', executableName: 'my_node' },
        ],
      };

      const result = generator.generate(config);

      expect(result).toContain('from launch import LaunchDescription');
      expect(result).toContain('from launch_ros.actions import Node');
      expect(result).toContain("package='my_pkg'");
      expect(result).toContain("executable='my_node'");
      expect(result).toContain('return LaunchDescription([');
    });

    it('generates launch arguments when provided', () => {
      const config: LaunchFileConfig = {
        fileName: 'test_launch',
        nodes: [],
        launchArguments: [
          { name: 'use_sim_time', defaultValue: 'false', description: 'Use sim time' },
        ],
      };

      const result = generator.generate(config);

      expect(result).toContain('use_sim_time_arg = DeclareLaunchArgument(');
      expect(result).toContain("'use_sim_time'");
      expect(result).toContain("default_value='false'");
      expect(result).toContain("description='Use sim time'");
      expect(result).toContain('use_sim_time_arg,');
    });

    it('merges useSimTime into parameters dict (no duplicate parameters key)', () => {
      const config: LaunchFileConfig = {
        fileName: 'test_launch',
        nodes: [
          {
            packageName: 'my_pkg',
            executableName: 'my_node',
            parameters: [{ name: 'frequency', value: 30 }],
            useSimTime: true,
          },
        ],
      };

      const result = generator.generate(config);

      // Should have only one parameters=[{ key
      const parametersKeyCount = (result.match(/parameters=\[\{/g) || []).length;
      expect(parametersKeyCount).toBe(1);

      // Both frequency and use_sim_time should be in the same dict
      expect(result).toContain("'frequency': 30");
      expect(result).toContain("'use_sim_time': True");
    });

    it('generates useSimTime without user parameters', () => {
      const config: LaunchFileConfig = {
        fileName: 'test_launch',
        nodes: [
          {
            packageName: 'my_pkg',
            executableName: 'my_node',
            useSimTime: false,
          },
        ],
      };

      const result = generator.generate(config);

      expect(result).toContain("'use_sim_time': False");
      const parametersKeyCount = (result.match(/parameters=\[\{/g) || []).length;
      expect(parametersKeyCount).toBe(1);
    });

    it('generates remappings when provided', () => {
      const config: LaunchFileConfig = {
        fileName: 'test_launch',
        nodes: [
          {
            packageName: 'my_pkg',
            executableName: 'my_node',
            remappings: [{ from: '/input', to: '/output' }],
          },
        ],
      };

      const result = generator.generate(config);

      expect(result).toContain('remappings=[');
      expect(result).toContain("('/input', '/output')");
    });

    it('generates output when provided', () => {
      const config: LaunchFileConfig = {
        fileName: 'test_launch',
        nodes: [
          {
            packageName: 'my_pkg',
            executableName: 'my_node',
            output: 'screen',
          },
        ],
      };

      const result = generator.generate(config);

      expect(result).toContain("output='screen'");
    });

    it('includes node name and namespace when provided', () => {
      const config: LaunchFileConfig = {
        fileName: 'test_launch',
        nodes: [
          {
            packageName: 'my_pkg',
            executableName: 'my_node',
            nodeName: 'custom_node',
            namespace: '/robot1',
          },
        ],
      };

      const result = generator.generate(config);

      expect(result).toContain("name='custom_node'");
      expect(result).toContain("namespace='/robot1'");
    });

    it('includes description as docstring when provided', () => {
      const config: LaunchFileConfig = {
        fileName: 'test_launch',
        description: 'My launch file',
        nodes: [],
      };

      const result = generator.generate(config);

      expect(result).toContain('"""My launch file"""');
    });

    it('does not produce trailing comma on last node argument', () => {
      const config: LaunchFileConfig = {
        fileName: 'test_launch',
        nodes: [
          { packageName: 'my_pkg', executableName: 'my_node' },
        ],
      };

      const result = generator.generate(config);

      // The line before "    )" should not end with a comma
      const lines = result.split('\n');
      const closingParenIdx = lines.findIndex(l => l.trim() === ')');
      expect(closingParenIdx).toBeGreaterThan(-1);
      const lastArgLine = lines[closingParenIdx - 1];
      expect(lastArgLine.trim()).not.toMatch(/,$/);
    });
  });

  describe('validate', () => {
    it('returns true when ros2 launch --check succeeds', async () => {
      (execSync as jest.Mock).mockReturnValueOnce('');
      const result = await generator.validate('/path/to/launch.py');
      expect(result).toBe(true);
      expect(execSync).toHaveBeenCalledWith(
        expect.stringContaining('ros2 launch --check'),
        expect.objectContaining({ stdio: 'pipe', encoding: 'utf-8' })
      );
    });

    it('returns false when ros2 launch --check fails', async () => {
      (execSync as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Validation failed');
      });
      const result = await generator.validate('/path/to/bad_launch.py');
      expect(result).toBe(false);
    });
  });

  describe('writeToFile', () => {
    let tmpDir: string;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'launch-gen-test-'));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    it('writes content to existing directory', async () => {
      const filePath = path.join(tmpDir, 'test.launch.py');
      await generator.writeToFile('print("hello")', filePath);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('print("hello")');
    });

    it('creates directory if it does not exist', async () => {
      const filePath = path.join(tmpDir, 'subdir', 'nested', 'test.launch.py');
      await generator.writeToFile('print("hello")', filePath);
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('print("hello")');
    });
  });

  describe('createVariableName (via generate)', () => {
    it('creates snake_case variable from package and executable names', () => {
      const config: LaunchFileConfig = {
        fileName: 'test',
        nodes: [{ packageName: 'my-package', executableName: 'my-node' }],
      };
      const result = generator.generate(config);
      expect(result).toContain('my_package_my_node_node');
    });

    it('truncates long package names to first two words', () => {
      const config: LaunchFileConfig = {
        fileName: 'test',
        nodes: [{ packageName: 'very_long_package_name', executableName: 'node' }],
      };
      const result = generator.generate(config);
      expect(result).toContain('very_long_node_node');
    });
  });
});
