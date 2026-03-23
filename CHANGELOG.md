# Changelog

All notable changes to RAMROS will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Package creation wizard with template support
- Launch configuration management for ROS2 nodes
- Topic and service graph visualization
- Parameter editor GUI
- Log viewer with filtering

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
