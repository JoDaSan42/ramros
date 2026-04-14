# Changelog

All notable changes to RAMROS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
| 0.1.0   | 2026-03-23 | Released |
