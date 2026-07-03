import { LaunchGenerator, LaunchFileConfig } from '../../wizard/launch-generator';

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
});
