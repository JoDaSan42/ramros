/**
 * Workspace completeness analysis (design spec 2026-11-13, Increment E):
 * compares package.xml declarations against actual code usage, entry points
 * against node files, and rosidl interface files against CMakeLists
 * registration.
 *
 * Pure module: no vscode import. The file system is injected — callers pass
 * file contents, the analyzer only transforms.
 */

export type AnalysisSeverity = 'error' | 'warning' | 'info';

export type AnalysisKind =
  | 'missing-dependency'
  | 'unused-dependency'
  | 'unregistered-node'
  | 'missing-entry-point-module'
  | 'unregistered-interface';

export interface AnalysisFinding {
  severity: AnalysisSeverity;
  kind: AnalysisKind;
  /** Package the finding belongs to. */
  packageName: string;
  /** Affected dependency (dependency checks only). */
  dependency?: string;
  /** Path relative to the package root, when the finding has a location. */
  file?: string;
  /** 1-based line number, when the finding has a location. */
  line?: number;
  message: string;
}

export interface AnalysisReport {
  findings: AnalysisFinding[];
  /** Imports that could not be mapped to a ROS package (pip, stdlib, …). */
  unknownImports: string[];
}

export interface CodeFile {
  /** Path relative to the package root, `/`-separated. */
  relativePath: string;
  content: string;
}

export interface AnalyzerPackageInput {
  name: string;
  buildType: 'ament_cmake' | 'ament_python' | 'cmake';
  path: string;
  /** All names declared in package.xml (any depend tag). */
  declaredDependencies: string[];
  /** Dependency types from package.xml, keyed by name (`test` deps excluded from usage checks). */
  declaredDependencyKinds?: Record<string, Array<'build' | 'exec' | 'test'>>;
  pythonFiles: CodeFile[];
  cppFiles: CodeFile[];
  setupPyContent?: string;
  cmakeContent?: string;
  /** Interface files (msg/srv/action), relative to the package root. */
  interfaceFiles: string[];
}

// import rclpy / import numpy, pandas — handled line-wise in
// collectPythonImports so multi-import lines and `as` aliases resolve.
// from X.y import z / from . import sibling
// #include <rclcpp/rclcpp.hpp> / #include "my_pkg/msg/pose.hpp"
// (Regexes are inlined at their use sites below.)

/**
 * Maps a python module path (`std_msgs.msg`, `geometry_msgs`) or a C++
 * include path (`geometry_msgs/msg/pose.hpp`) to a candidate ROS package
 * name, or undefined when no ROS mapping is plausible.
 */
function mapToRosPackage(importPath: string): string | undefined {
  const segments = importPath.split('.');
  // `from std_msgs.msg import …` → base package `std_msgs`.
  if (segments.length >= 2 && ['msg', 'srv', 'action'].includes(segments[1])) {
    return segments[0];
  }
  // C++: `geometry_msgs/msg/pose.hpp` → `geometry_msgs`.
  const slashParts = importPath.split('/');
  if (slashParts.length >= 2) {
    return slashParts[0];
  }
  // Plain `import rclpy` → `rclpy` (single-segment ROS packages).
  return segments[0];
}

interface UsedImport {
  package: string | undefined;
  file: string;
  line: number;
}

function collectPythonImports(files: CodeFile[]): UsedImport[] {
  const used: UsedImport[] = [];
  for (const file of files) {
    const lines = file.content.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const line = lines[index];
      const fromMatch = /^\s*from\s+([\w.]+)\s+import\b/.exec(line);
      const importMatch = fromMatch ? null : /^\s*import\s+([\w.,\s]+?)\s*$/.exec(line);
      const candidates: string[] = [];
      if (fromMatch) {
        candidates.push(fromMatch[1]);
      } else if (importMatch) {
        for (const part of importMatch[1].split(',')) {
          const name = part.trim().split(/\s+as\s+/)[0].trim();
          if (name.length > 0) {
            candidates.push(name);
          }
        }
      }
      for (const candidate of candidates) {
        // Relative imports (`. import x`, `..pkg`) are project-internal.
        if (candidate.startsWith('.')) {
          continue;
        }
        used.push({
          package: mapToRosPackage(candidate),
          file: file.relativePath,
          line: index + 1
        });
      }
    }
  }
  return used;
}

function collectCppIncludes(files: CodeFile[]): UsedImport[] {
  const used: UsedImport[] = [];
  for (const file of files) {
    const lines = file.content.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
      const match = /^\s*#include\s+[<"]([\w/.]+)[>"]/.exec(lines[index]);
      if (!match) {
        continue;
      }
      const includePath = match[1];
      // C++ std/boost headers have no directory prefix mapping to a package.
      const mapped = includePath.includes('/') ? includePath.split('/')[0] : undefined;
      used.push({ package: mapped, file: file.relativePath, line: index + 1 });
    }
  }
  return used;
}

export function analyzeWorkspace(
  packages: AnalyzerPackageInput[],
  knownRosPackages: ReadonlySet<string>
): AnalysisReport {
  const findings: AnalysisFinding[] = [];
  const unknownImports: string[] = [];

  for (const pkg of packages) {
    const usedImports = [...collectPythonUsages(pkg), ...collectCppUsages(pkg)];

    // Check 1: used but undeclared → warning.
    for (const usage of usedImports) {
      if (!usage.package) {
        continue;
      }
      if (!knownRosPackages.has(usage.package)) {
        if (!unknownImports.includes(usage.package)) {
          unknownImports.push(usage.package);
        }
        continue;
      }
      if (!pkg.declaredDependencies.includes(usage.package)) {
        findings.push({
          severity: 'warning',
          kind: 'missing-dependency',
          packageName: pkg.name,
          dependency: usage.package,
          file: usage.file,
          line: usage.line,
          message: `Code imports '${usage.package}' but package.xml does not declare it.`
        });
      }
    }

    findings.push(...analyzeEntryPoints(pkg));
    findings.push(...analyzeRosidlRegistration(pkg));
    findings.push(...analyzeUnusedDependencies(pkg));
  }

  return { findings, unknownImports };
}

const SEVERITY_ORDER: Record<AnalysisSeverity, number> = { error: 0, warning: 1, info: 2 };

/**
 * Renders the analysis report as a markdown document (read-only doc pattern
 * shared with `ros2 doctor` and interface definitions).
 */
export function renderAnalysisReport(report: AnalysisReport): string {
  const lines: string[] = ['# Workspace Completeness Analysis', ''];

  if (report.findings.length === 0) {
    lines.push('No completeness issues found.', '');
  } else {
    const byPackage = new Map<string, AnalysisFinding[]>();
    for (const finding of [...report.findings].sort((a, b) => {
      const severity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      if (severity !== 0) {
        return severity;
      }
      return a.packageName.localeCompare(b.packageName);
    })) {
      const bucket = byPackage.get(finding.packageName) ?? [];
      bucket.push(finding);
      byPackage.set(finding.packageName, bucket);
    }

    for (const [packageName, packageFindings] of byPackage) {
      lines.push(`## ${packageName}`, '');
      for (const finding of packageFindings) {
        const location = finding.file !== undefined ? ` (${finding.file}${finding.line !== undefined ? `:${finding.line}` : ''})` : '';
        lines.push(`- **[${finding.severity}]** ${finding.kind}${location}: ${finding.message}`);
      }
      lines.push('');
    }
  }

  if (report.unknownImports.length > 0) {
    lines.push('Unknown imports (skipped):', '');
    for (const name of report.unknownImports) {
      lines.push(`- ${name}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function collectPythonUsages(pkg: AnalyzerPackageInput): UsedImport[] {
  return collectPythonImports(pkg.pythonFiles);
}

function collectCppUsages(pkg: AnalyzerPackageInput): UsedImport[] {
  return collectCppIncludes(pkg.cppFiles);
}

function analyzeEntryPoints(pkg: AnalyzerPackageInput): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  if (pkg.buildType !== 'ament_python' || pkg.setupPyContent === undefined) {
    return findings;
  }

  const entryPoints = parseConsoleScripts(pkg.setupPyContent);
  const modulePaths = new Set<string>();
  for (const file of pkg.pythonFiles) {
    if (!file.relativePath.endsWith('.py')) {
      continue;
    }
    // Module name: path under the package directory without `.py`
    // (`demo_pkg/demo.py` → `demo_pkg.demo`, `demo_pkg/demo/__init__.py` →
    // `demo_pkg.demo`).
    const withoutExtension = file.relativePath.replace(/\.py$/, '').replace(/\/__init__$/, '');
    const normalized = withoutExtension.split('/').join('.');
    modulePaths.add(normalized);
    // Also register the parent package so `my_pkg.demo:main` matches
    // `my_pkg/demo.py` and `my_pkg/demo/__init__.py` alike.
    modulePaths.add(normalized);
  }

  const nodeLikeFiles = pkg.pythonFiles.filter(
    file => /\bimport\s+rclpy\b|\brclpy\.init\b|\bimport\s+rclpy\b/.test(file.content)
  );
  const registeredModules = new Set(entryPoints.map(entry => entry.module));

  // Direction 1: node file without an entry point (the "copied file" case).
  for (const file of nodeLikeFiles) {
    const withoutExtension = file.relativePath.replace(/\.py$/, '').replace(/\/__init__$/, '');
    const moduleName = withoutExtension.split('/').join('.');
    if (!registeredModules.has(moduleName)) {
      findings.push({
        severity: 'error',
        kind: 'unregistered-node',
        packageName: pkg.name,
        file: file.relativePath,
        message: `'${file.relativePath}' looks like a node (imports rclpy) but has no console_scripts entry point in setup.py.`
      });
    }
  }

  // Direction 2: entry point without an existing module.
  for (const entry of entryPoints) {
    if (!modulePaths.has(entry.module)) {
      findings.push({
        severity: 'error',
        kind: 'missing-entry-point-module',
        packageName: pkg.name,
        message: `Entry point '${entry.name}' points to module '${entry.module}' which does not exist in the package.`
      });
    }
  }

  return findings;
}

interface ConsoleScriptEntry {
  name: string;
  module: string;
  function: string;
}

function parseConsoleScripts(setupPyContent: string): ConsoleScriptEntry[] {
  const entries: ConsoleScriptEntry[] = [];
  const regex = /['"]([\w-]+)\s*=\s*([\w.]+):(\w+)['"]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(setupPyContent)) !== null) {
    entries.push({ name: match[1], module: match[2], function: match[3] });
  }
  return entries;
}

function analyzeRosidlRegistration(pkg: AnalyzerPackageInput): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  if (pkg.buildType !== 'ament_cmake' || pkg.interfaceFiles.length === 0) {
    return findings;
  }
  if (pkg.cmakeContent === undefined) {
    return findings;
  }

  const registered = new Set<string>();
  const blockRegex = /rosidl_generate_interfaces\s*\(([^)]*)\)/g;
  let blockMatch: RegExpExecArray | null;
  while ((blockMatch = blockRegex.exec(pkg.cmakeContent)) !== null) {
    const tokenRegex = /["']?([\w./${}-]+)["']?/g;
    let tokenMatch: RegExpExecArray | null;
    while ((tokenMatch = tokenRegex.exec(blockMatch[1])) !== null) {
      registered.add(tokenMatch[1]);
    }
  }

  for (const interfaceFile of pkg.interfaceFiles) {
    const normalized = interfaceFile.split('\\').join('/');
    if (!registered.has(normalized)) {
      findings.push({
        severity: 'error',
        kind: 'unregistered-interface',
        packageName: pkg.name,
        file: normalized,
        message: `'${normalized}' is not listed in any rosidl_generate_interfaces call in CMakeLists.txt.`
      });
    }
  }

  return findings;
}

function analyzeUnusedDependencies(pkg: AnalyzerPackageInput): AnalysisFinding[] {
  const findings: AnalysisFinding[] = [];
  const usedPackages = new Set<string>();

  for (const usage of [...collectPythonUsages(pkg), ...collectCppUsages(pkg)]) {
    if (usage.package) {
      usedPackages.add(usage.package);
    }
  }

  // ament_cmake packages reference most dependencies in CMakeLists.txt
  // (find_package, target_link_libraries, rosidl DEPENDENCIES, …) rather
  // than in code — count a dependency as used when its name appears there.
  const cmakeTokens = new Set<string>(
    pkg.cmakeContent?.match(/[A-Za-z0-9_]+/g) ?? []
  );

  for (const dependency of pkg.declaredDependencies) {
    // test dependencies are not expected to appear in runtime code.
    const kinds = pkg.declaredDependencyKinds?.[dependency] ?? [];
    if (kinds.length > 0 && kinds.every(kind => kind === 'test')) {
      continue;
    }
    if (!usedPackages.has(dependency) && !cmakeTokens.has(dependency)) {
      findings.push({
        severity: 'info',
        kind: 'unused-dependency',
        packageName: pkg.name,
        dependency,
        message: `Dependency '${dependency}' is declared in package.xml but not referenced in the package code or build files.`
      });
    }
  }

  return findings;
}
