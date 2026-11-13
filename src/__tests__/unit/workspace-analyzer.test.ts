import { analyzeWorkspace, AnalyzerPackageInput } from '../../core/workspace-analyzer';

const ROS_PACKAGES = new Set(['rclpy', 'rclcpp', 'std_msgs', 'geometry_msgs']);

function pythonPackage(overrides: Partial<AnalyzerPackageInput> = {}): AnalyzerPackageInput {
  return {
    name: 'demo_pkg',
    buildType: 'ament_python',
    path: '/ws/src/demo_pkg',
    declaredDependencies: [],
    pythonFiles: [],
    cppFiles: [],
    interfaceFiles: [],
    ...overrides
  };
}

describe('workspace analyzer — dependency usage', () => {
  it('reports no findings when all used imports are declared', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: ['rclpy', 'std_msgs'],
          pythonFiles: [
            { relativePath: 'demo_pkg/node.py', content: 'import rclpy\nfrom std_msgs.msg import String\n' }
          ]
        })
      ],
      ROS_PACKAGES
    );

    expect(report.findings).toEqual([]);
  });

  it('warns about an undeclared python import mapping to a ros package', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: ['rclpy'],
          pythonFiles: [
            { relativePath: 'demo_pkg/node.py', content: 'import rclpy\nfrom geometry_msgs.msg import Pose\n' }
          ]
        })
      ],
      ROS_PACKAGES
    );

    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0];
    expect(finding.severity).toBe('warning');
    expect(finding.kind).toBe('missing-dependency');
    expect(finding.packageName).toBe('demo_pkg');
    expect(finding.dependency).toBe('geometry_msgs');
    expect(finding.file).toBe('demo_pkg/node.py');
    expect(finding.line).toBe(2);
  });

  it('maps C++ includes via slash prefix and only reports undeclared packages', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: ['rclcpp'],
          cppFiles: [
            {
              relativePath: 'src/node.cpp',
              content: '#include <rclcpp/rclcpp.hpp>\n#include <geometry_msgs/msg/pose.hpp>\n'
            }
          ]
        })
      ],
      ROS_PACKAGES
    );

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].dependency).toBe('geometry_msgs');
    expect(report.findings[0].severity).toBe('warning');
    expect(report.findings[0].file).toBe('src/node.cpp');
  });

  it('maps msg/srv/action sub-modules to their base package', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: [],
          pythonFiles: [
            { relativePath: 'demo_pkg/node.py', content: 'from std_msgs.srv import SetBool\n' }
          ]
        })
      ],
      ROS_PACKAGES
    );

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].dependency).toBe('std_msgs');
  });

  it('classifies non-ros imports as unknown instead of missing dependencies', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: [],
          pythonFiles: [
            {
              relativePath: 'demo_pkg/node.py',
              content: 'import numpy\nimport os\nfrom . import sibling\nfrom my_pkg import helper\n'
            }
          ]
        })
      ],
      ROS_PACKAGES
    );

    expect(report.findings).toEqual([]);
    expect(report.unknownImports).toEqual(expect.arrayContaining(['numpy', 'os']));
  });

  it('only maps imports whose package is in the known ros package list', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: ['my_custom_msgs'],
          pythonFiles: [
            { relativePath: 'demo_pkg/node.py', content: 'from my_custom_msgs.msg import X\n' }
          ]
        })
      ],
      ROS_PACKAGES
    );

    // my_custom_msgs is not in the known package list: unknown, not a missing dep.
    expect(report.findings).toEqual([]);
    expect(report.unknownImports).toContain('my_custom_msgs');
  });

  it('maps an unknown-list package used in code but missing from package.xml as a finding', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: [],
          pythonFiles: [
            { relativePath: 'demo_pkg/node.py', content: 'from my_custom_msgs.msg import X\n' }
          ]
        })
      ],
      new Set([...ROS_PACKAGES, 'my_custom_msgs'])
    );

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].dependency).toBe('my_custom_msgs');
  });

  it('does not treat setup.py entry point modules as code imports', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: [],
          pythonFiles: [
            // The entry-point module exists; its content is irrelevant here.
            { relativePath: 'demo_pkg/demo.py', content: 'def main():\n    pass\n' }
          ],
          setupPyContent: "entry_points={'console_scripts': ['demo = demo_pkg.demo:main']}"
        })
      ],
      ROS_PACKAGES
    );

    // The entry-point reference is not a code import: no missing-dependency
    // finding and no unknown import for `demo_pkg` or its module.
    expect(report.findings).toEqual([]);
    expect(report.unknownImports).toEqual([]);
  });

  it('reports the first offending line for multi-line files', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: [],
          pythonFiles: [
            {
              relativePath: 'demo_pkg/node.py',
              content: 'import numpy\nimport os\nfrom geometry_msgs.msg import Pose\n'
            }
          ]
        })
      ],
      ROS_PACKAGES
    );

    expect(report.findings[0].line).toBe(3);
  });
});
