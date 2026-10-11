# Changelog

All notable changes to RAMROS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Static analysis of service servers/clients and action servers/clients for
  C++ and Python nodes, with tree view items under each node.
- Launch file wizard: XML format (`.launch.xml`) generation via format selection.
- Bag file selection from workspace (in addition to the file dialog).
- `ramros.launchGenerator.defaultLocation` and `ramros.launchGenerator.customPath`
  settings are now honored (`{workspace}`/`{package}` placeholders supported).
- Cache settings (`ramros.cache.ttlSeconds`, `ramros.cache.maxEntries`) reload
  live without restarting the extension.
- Per-workspace `ramros.json` configuration file (first key: `bagFolders`) with
  hot-reload via file watcher.
- External bag folders in the Bag Files tree (add via "Add Bag Folder", remove
  via context menu); bag files open in rqt_bag via inline button or context menu.

### Fixed
- Bag recording/playback context menus now appear on the Bag Files folder
  (previously attached to the RVIZ2/rqt_graph items).
- Toggling loop off during playback restarts playback without loop instead of
  stopping it entirely.
- Bag state resets when the user closes the record/play terminal manually
  (`onDidCloseTerminal` handling).
- SIGINT (Ctrl+C) now settles before the terminal is disposed so recordings
  finalize cleanly.
- Package wizard validates name uniqueness against real packages (previously
  against workspace names).
- `createLaunchFile` uses the clicked workspace/package context instead of
  always the first workspace.
- Bag info header `resourceUri` no longer contains the emoji prefix.
- Python nodes in dotted-module layout (`pkg/module.py`) are now discovered.

## [1.2.1] - 2026-09-21

### Added
- **Installed package caching**: System package scans are cached across sessions
  and per ROS distro, with a `ramros.installedPackages.maxAgeHours` setting
  (default 24h) controlling when the launch wizard offers to rescan.
- **Refresh Installed ROS2 Packages** command and Explorer toolbar button to
  force a re-scan on demand.

### Changed
- The launch wizard now reuses the cached installed-package list instead of
  rescanning on every run.

## [1.2.0] - 2026-09-19

### Fixed
- **Extension startup crash**: Removed duplicate `ramros.bag.stopRecording`
  command registration, which caused `activate()` to throw on launch.
- **Bag recording command**: Topics are now passed via the `--topics` flag
  (`ros2 bag record` no longer accepts positional topic arguments).
- **Add Node entry point**: `setup.py` patching now appends to an existing,
  quoted `console_scripts` block instead of creating a second, conflicting
  `entry_points` block.
- **setup.py template**: Fixed literal `{package_name}.{nodeName}` placeholders
  that were written unsubstituted.
- **Run Node / Debug / Build / Open Terminal / Launch**: These commands now
  resolve the workspace that owns the selected node, package, or launch file
  instead of always defaulting to the first workspace.

### Changed
- Workspace tree initialization failures are now caught and logged instead of
  surfacing as unhandled promise rejections.

## [1.1.0] - 2026-09-17

### Added
- **ROS2 Lyrical Support**: Installation detection now recognizes ROS2 Lyrical installations

### Planned
- Launch configuration management for ROS2 nodes
- Topic and service graph visualization
- Parameter editor GUI
- Log viewer with filtering

## [2.0.0] - 2026-04-14

### Added
- **Package Creation Wizard**: Interactive UI for creating ROS2 packages
  - Command: `RAMROS: Create New Package`
  - Supports empty workspaces (with warning)
  - Form validation for package names, dependencies, and interface definitions
- **Package Templates**:
  - `empty`: Minimal package structure
  - `minimal-cpp`: C++ node with publisher example
  - `minimal-python`: Python node with publisher example
  - `standard`: Hybrid C++/Python package with both node types
  - `interface`: Interface package for custom messages, services, and actions
- **Interface Package Support**:
  - Create custom message definitions (.msg files)
  - Create custom service definitions (.srv files)
  - Create custom action definitions (.action files)
  - Automatic CMakeLists.txt configuration with `rosidl_generate_interfaces()`
  - Automatic package.xml configuration with `rosidl_interface_packages` member group
- **C++ Class Naming Convention**: Node classes use PascalCase based on package name
- **Python Resource Folder**: Automatic creation of `resource/<package_name>` file for Python packages
- **E2E Tests**: Comprehensive end-to-end tests for all package templates including interface packages

### Changed
- Updated ESLint to v8
- Updated GitHub Actions to v5
- Improved workspace detection to support empty workspaces

### Technical Details
- Test Coverage: 73 integration tests passing
- All templates tested with colcon build verification

## Version History

## [0.1.0] - 2026-03-23

### Added
- **ROS2 Installation Detection**: Auto-detects Humble, Jazzy, Rolling, Iron, Galactic, and Foxy installations
- **Multi-Workspace Support**: Manage unlimited workspaces simultaneously
- **Duplicate Package Detection**: 
  - Blocks same-workspace package name conflicts (error)
  - Warns about cross-workspace conflicts (warning)
- **Caching System**:
  - TTL-based expiration (5 minutes default)
  - LRU eviction (max 1000 entries)
  - FileSystemWatcher invalidation for package.xml, CMakeLists.txt, setup.py
- **Tree View Explorer**:
  - Workspace root items with collapsible structure
  - Package listing per workspace
  - Conflicts section showing duplicate packages
  - Warning badges for unbuilt workspaces
- **Source Workspace Command**: Opens terminal with sourced ROS environment
- **Build Workspace Command**: Runs `colcon build` for entire workspace or specific packages
- **Test Suite**:
  - Unit tests (Jest)
  - Integration tests (Jest with VSCode mocking)
  - E2E tests (@vscode/test-electron)

### Changed
- Initial release as foundation MVP

### Technical Details
- Extension ID: `ramros-team.ramros`
- VSCode Engine: ^1.85.0
- Test Coverage: 43 integration tests passing
- Strict TypeScript mode enabled

## Version History

| Version | Date       | Status   |
|---------|------------|----------|
| 1.1.0   | 2026-09-17 | Released |
| 1.0.0   | 2026-04-14 | Released |
| 0.1.0   | 2026-03-23 | Released |
