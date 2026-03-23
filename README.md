# RAMROS - Really Awesome Management of ROS

A VSCode extension for managing ROS2 workspaces efficiently.

## Features

- **Multi-Workspace Support**: Manage unlimited ROS2 workspaces simultaneously
- **Duplicate Package Detection**: Detect conflicts within and across workspaces
- **Smart Caching**: TTL + LRU caching with file system watcher invalidation
- **Tree View Explorer**: Visual workspace and package explorer
- **Source Workspace**: Quickly source your ROS2 environment in a new terminal
- **Build Workspace**: Build entire workspace or individual packages via command

## Requirements

- VSCode 1.85.0 or higher
- ROS2 Installation (Humble, Jazzy, Rolling, Iron, Galactic, or Foxy)

## Installation

1. Download the `.vsix` file from the releases page
2. In VSCode, go to Extensions (Ctrl+Shift+X)
3. Click "..." menu → "Install from VSIX"
4. Select the downloaded file

## Usage

### Opening Workspaces

1. Open your ROS2 workspace folder in VSCode (`File > Open Folder`)
2. The RAMROS Explorer view will automatically detect ROS2 workspaces
3. Workspaces must have either:
   - A `src/` directory containing packages, OR
   - An `install/setup.bash` file

### Tree View

The RAMROS Explorer shows:
- All detected workspaces with their structure
- Packages within each workspace
- Warnings for issues (e.g., unbuilt workspaces)
- Conflicts section showing duplicate packages

### Commands

Access commands from the tree view context menu or command palette (`Ctrl+Shift+P`):

| Command | Description |
|---------|-------------|
| `RAMROS: Refresh All Workspaces` | Reload workspace detection |
| `RAMROS: Source Workspace` | Open terminal with sourced ROS environment |
| `RAMROS: Build Workspace` | Run `colcon build` in workspace |

### Duplicate Package Detection

RAMROS automatically detects:
- **Same-workspace duplicates**: Blocks creation (error)
- **Cross-workspace duplicates**: Shows warning but allows (different workspaces can have same package names)

## Configuration

No configuration required. RAMROS auto-detects:
- ROS2 installations from standard locations
- Workspaces from opened folders
- Packages from `src/` directories

## Testing

```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# E2E tests (requires X server)
npm run test:e2e

# All tests with coverage
npm run test:coverage
```

## Development

### Prerequisites
- Node.js 18+ 
- npm 9+
- TypeScript 5+
- ROS2 (for testing)

### Setup
```bash
git clone <repository-url>
cd ramros
npm install
npm run compile
```

### Debugging
Press `F5` in VSCode to launch the Extension Development Host.

## Architecture

```
src/
├── core/                    # Core business logic
│   ├── ros-environment.ts   # ROS2 installation detection
│   ├── workspace-detector.ts # Workspace discovery & validation
│   └── duplicate-package-detector.ts # Conflict detection
├── cache/                   # Caching layer
│   └── cache-manager.ts     # TTL + LRU cache with FS invalidation
├── executor/                # Command execution
│   └── terminal-manager.ts  # Terminal management
├── treeview/                # UI components
│   ├── tree-provider.ts     # Tree data provider
│   └── tree-items.ts        # Tree item classes
└── extension.ts             # Main entry point
```

## Release Plan

### Release 1.0 (Current) ✅
- [x] ROS2 Installation Detection
- [x] Multi-Workspace Support  
- [x] Duplicate Package Detection
- [x] Caching System
- [x] Tree View Explorer
- [x] Source Workspace Command
- [x] Build Workspace Command
- [x] Unit & Integration Tests

### Future Releases (Planned)
- Package creation wizard
- Launch configuration management
- Topic/service graph visualization
- Parameter editor
- Log viewer

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style
- TypeScript strict mode enabled
- Comments in English
- Follow existing patterns
- Add tests for new features

## License

MIT License - See LICENSE file for details

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.
