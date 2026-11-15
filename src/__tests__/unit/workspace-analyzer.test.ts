import { analyzeWorkspace, renderAnalysisReport, AnalyzerPackageInput } from '../../core/workspace-analyzer';

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

describe('workspace analyzer — entry points, rosidl and unused deps', () => {
  it('errors on a node file without a console_scripts entry point', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: ['rclpy'],
          pythonFiles: [
            { relativePath: 'demo_pkg/demo.py', content: 'def main():\n    pass\n' },
            { relativePath: 'demo_pkg/copied_node.py', content: 'import rclpy\nrclpy.init()\n' }
          ],
          setupPyContent: "entry_points={'console_scripts': ['demo = demo_pkg.demo:main']}"
        })
      ],
      ROS_PACKAGES
    );

    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0];
    expect(finding.severity).toBe('error');
    expect(finding.kind).toBe('unregistered-node');
    expect(finding.file).toBe('demo_pkg/copied_node.py');
  });

  it('errors on an entry point whose module does not exist', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: [],
          pythonFiles: [
            { relativePath: 'demo_pkg/other.py', content: 'def main():\n    pass\n' }
          ],
          setupPyContent: "entry_points={'console_scripts': ['demo_node = demo_pkg.demo:main']}"
        })
      ],
      ROS_PACKAGES
    );

    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].severity).toBe('error');
    expect(report.findings[0].kind).toBe('missing-entry-point-module');
  });

  it('accepts entry point modules as files or package directories', () => {
    const asFile = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: [],
          pythonFiles: [{ relativePath: 'demo_pkg/demo.py', content: 'def main():\n    pass\n' }],
          setupPyContent: "entry_points={'console_scripts': ['demo = demo_pkg.demo:main']}"
        })
      ],
      ROS_PACKAGES
    );
    const asDirectory = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: [],
          pythonFiles: [{ relativePath: 'demo_pkg/demo/__init__.py', content: '' }],
          setupPyContent: "entry_points={'console_scripts': ['demo = demo_pkg.demo:main']}"
        })
      ],
      ROS_PACKAGES
    );

    expect(asFile.findings).toEqual([]);
    expect(asDirectory.findings).toEqual([]);
  });

  it('errors on interface files missing from rosidl_generate_interfaces', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          name: 'iface_pkg',
          buildType: 'ament_cmake',
          declaredDependencies: [],
          cppFiles: [],
          interfaceFiles: ['msg/MyMessage.msg', 'msg/Other.msg'],
          cmakeContent: 'rosidl_generate_interfaces(${PROJECT_NAME}\n  "msg/Other.msg"\n)\n'
        })
      ],
      ROS_PACKAGES
    );

    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0];
    expect(finding.severity).toBe('error');
    expect(finding.kind).toBe('unregistered-interface');
    expect(finding.file).toBe('msg/MyMessage.msg');
  });

  it('skips the rosidl check for packages without interface files', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          name: 'iface_pkg',
          buildType: 'ament_cmake',
          declaredDependencies: [],
          cppFiles: [],
          interfaceFiles: [],
          cmakeContent: 'ament_target_dependencies(node rclcpp)\n'
        })
      ],
      ROS_PACKAGES
    );

    expect(report.findings).toEqual([]);
  });

  it('does not flag test-only dependencies as unused', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: ['rclpy', 'std_msgs'],
          declaredDependencyKinds: { rclpy: ['exec'], std_msgs: ['test'] },
          pythonFiles: [
            { relativePath: 'demo_pkg/node.py', content: 'import rclpy\n' }
          ]
        })
      ],
      ROS_PACKAGES
    );

    // rclpy is used; std_msgs is test-only so it is not flagged as unused.
    expect(report.findings).toEqual([]);
  });

  it('reports a truly unused dependency as info', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: ['rclpy', 'geometry_msgs'],
          declaredDependencyKinds: { rclpy: ['exec'], geometry_msgs: ['exec'] },
          pythonFiles: [
            { relativePath: 'demo_pkg/node.py', content: 'import rclpy\n' }
          ]
        })
      ],
      ROS_PACKAGES
    );

    expect(report.findings).toHaveLength(1);
    const finding = report.findings[0];
    expect(finding.severity).toBe('info');
    expect(finding.kind).toBe('unused-dependency');
    expect(finding.dependency).toBe('geometry_msgs');
  });

  it('treats dependencies used in CMakeLists.txt as used', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          name: 'iface_pkg',
          buildType: 'ament_cmake',
          declaredDependencies: ['std_msgs', 'geometry_msgs'],
          cppFiles: [],
          cmakeContent: [
            'find_package(std_msgs REQUIRED)',
            'rosidl_generate_interfaces(${PROJECT_NAME}',
            '  "msg/MyMessage.msg"',
            '  DEPENDENCIES std_msgs',
            ')',
            ''
          ].join('\n')
        })
      ],
      ROS_PACKAGES
    );

    // std_msgs appears in CMakeLists.txt; geometry_msgs does not.
    expect(report.findings).toHaveLength(1);
    expect(report.findings[0].kind).toBe('unused-dependency');
    expect(report.findings[0].dependency).toBe('geometry_msgs');
  });

  it('treats build tool dependencies as used when the build file references them', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          name: 'iface_pkg',
          buildType: 'ament_cmake',
          declaredDependencies: ['ament_cmake', 'rosidl_default_generators', 'rosidl_default_runtime'],
          cppFiles: [],
          cmakeContent: [
            'find_package(ament_cmake REQUIRED)',
            'find_package(rosidl_default_generators REQUIRED)',
            'ament_export_dependencies(rosidl_default_runtime)',
            ''
          ].join('\n')
        })
      ],
      ROS_PACKAGES
    );

    expect(report.findings).toEqual([]);
  });
});

describe('workspace analyzer — report rendering', () => {
  it('renders a hint line when there are no findings', () => {
    const report = analyzeWorkspace([], ROS_PACKAGES);

    const markdown = renderAnalysisReport(report);
    expect(markdown).toContain('No completeness issues found.');
  });

  it('groups findings by package with severity tags and file locations', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: [],
          pythonFiles: [
            { relativePath: 'demo_pkg/node.py', content: 'from geometry_msgs.msg import Pose\n' }
          ]
        })
      ],
      ROS_PACKAGES
    );

    const markdown = renderAnalysisReport(report);
    expect(markdown).toContain('## demo_pkg');
    expect(markdown).toContain('[warning]');
    expect(markdown).toContain('missing-dependency');
    expect(markdown).toContain('demo_pkg/node.py:1');
  });

  it('lists unknown imports in a skipped section without findings', () => {
    const report = analyzeWorkspace(
      [
        pythonPackage({
          declaredDependencies: [],
          pythonFiles: [
            { relativePath: 'demo_pkg/node.py', content: 'import numpy\nimport os\n' }
          ]
        })
      ],
      ROS_PACKAGES
    );

    expect(report.findings).toEqual([]);
    const markdown = renderAnalysisReport(report);
    expect(markdown).toContain('Unknown imports (skipped)');
    expect(markdown).toContain('numpy');
    expect(markdown).toContain('os');
  });
});
