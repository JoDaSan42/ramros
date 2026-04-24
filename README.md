# RAMROS - Really Awesome Management of ROS

<img src="./img/RAMROS_logo_color.png">

A VSCode extension for managing ROS2 workspaces efficiently.

## Installation

### From GitHub Release
1. Go to the [Releases page](https://github.com/JoDaSan42/ramros/releases)
2. Download the latest `.vsix` file (e.g., `ramros-1.0.0.vsix`)
3. In VSCode, open Extensions (`Ctrl+Shift+X`)
4. Click the "..." menu → "Install from VSIX"
5. Select the downloaded `.vsix` file

### From OpenVSX / VS Marketplace
Search for "RAMROS" in your preferred extension marketplace and install directly.

## Building from Source

### Prerequisites
- Node.js 18+
- npm 9+
- TypeScript 5+
- ROS2 installation (Humble, Jazzy, Rolling, Iron, Galactic, or Foxy)

### Setup
```bash
git clone https://github.com/JoDaSan42/ramros.git
cd ramros
npm install
npm run compile
```

### Build Extension Package
```bash
# Production release
npx @vscode/vsce package

# Pre-release version
npx @vscode/vsce package --pre-release
```

The `.vsix` file will be created in the project root.

### Testing
```bash
# Unit tests
npm run test:unit

# Integration tests
npm run test:integration

# Linting
npm run lint

# Type checking
npm run typecheck
```

## Features

### 🛠️ ROS2 Tools Section

#### Bag Files Management
Record and playback ROS2 bag files with a user-friendly interface.

**Recording:**
- Start recording with custom filename and folder selection
- Select specific topics or record all topics
- Pause and resume recording with spacebar
- Stop recording with Ctrl+C
- Visual feedback in tree view during recording

**Playback:**
- Select bag files via file dialog or from workspace
- Play/pause playback with spacebar
- Stop playback and close terminal
- Enable/disable loop mode for continuous playback
- View detailed bag information (topics, message count, duration)

**Bag Info:**
- Display selected bag file path
- Show comprehensive bag metadata:
  - Topics with topic types and message counts
  - Total message count
  - Duration and start/end times
  - Storage format and compression

#### Live View
Real-time monitoring of ROS2 system activity.

- View all active topics in the system
- Filter system topics (hide/show `/parameter_events`, `/clock`, etc.)
- See topic type for each topic
- Refresh rate configuration (1-60 seconds)
- Auto-refresh on interval
- Publisher and subscriber count display

### 📦 Workspace Section

#### Multi-Workspace Support
- Manage unlimited ROS2 workspaces simultaneously
- Automatic workspace detection from opened folders
- Support for workspaces with `src/` directory or `install/setup.bash`
- Workspace switching without restarting VSCode

#### Package Discovery & Display
- Automatic package discovery in workspace `src/` directory
- Package type badges:
  - ⚙️ C++ package (ament_cmake with C++ executables)
  - 🐍 Python package (ament_python with Python nodes)
  - 🔀 Mixed package (both C++ and Python nodes)
  - 📋 Interface package (msg/srv/action definitions)
  - 📦 Empty package (no nodes or interfaces)
- Version badge display from `package.xml`

#### Static Code Analysis
Node information extracted via static analysis:
- **Parameters**: Declared parameters with default values and types
- **Publishers**: Topic name and message type
- **Subscriptions**: Topic name and message type
- **Services**: Service servers and clients
- **Actions**: Action servers and clients

> **Note**: Only explicitly declared constructs are detected. Dynamically created topics or parameters may not appear.

#### Interface File Management
- Grouped display by type: Messages, Services, Actions
- Field definitions shown in tooltip
- Click to open interface file in editor
- Support for `.msg`, `.srv`, and `.action` files

#### Launch File Support
- Automatic detection of `.launch.py` and `.launch.xml` files
- Click to open launch file
- Run launch files directly from tree view context menu

#### Package Creation Wizard
Interactive wizard for creating new ROS2 packages:

**Available Templates:**
| Template | Description | Files Created |
|----------|-------------|---------------|
| `empty` | Minimal package structure | `CMakeLists.txt`, `package.xml` |
| `minimal-cpp` | C++ node with publisher | C++ node, header, launch file |
| `minimal-python` | Python node with publisher | Python node, setup.py, launch file |
| `standard` | Hybrid C++/Python package | Both C++ and Python nodes |
| `interface` | Custom messages/services/actions | `msg/`, `srv/`, `action/` directories |

**Wizard Steps:**
1. Enter package name (validates uniqueness and naming rules)
2. Select template type
3. Add description, author, license
4. Choose build type (`ament_cmake`, `ament_python`, `cmake`)
5. Define node name (for non-empty templates)
6. Add dependencies (comma-separated)
7. For interface packages: define message/service/action fields

**Interface Package Support:**
- Create custom message definitions (`.msg`)
- Create custom service definitions (`.srv`)
- Create custom action definitions (`.action`)
- Automatic CMakeLists.txt configuration
- Proper rosidl interface registration

#### Duplicate Package Detection
- **Same-workspace duplicates**: Blocked with error message
- **Cross-workspace duplicates**: Warning shown (allowed in different workspaces)
- Real-time validation during package creation

#### Commands & Actions
Access commands from tree view context menu or command palette (`Ctrl+Shift+P`):

| Command | Description | Context |
|---------|-------------|---------|
| `RAMROS: Create New Package` | Launch package creation wizard | Workspace root, package folder |
| `RAMROS: Refresh All Workspaces` | Reload workspace detection | View title |
| `RAMROS: Source Workspace` | Open terminal with sourced ROS environment | Workspace root |
| `RAMROS: Build Workspace` | Run `colcon build` in workspace | Workspace root |
| `RAMROS: Build Package` | Build specific package | Package |
| `RAMROS: Run Node` | Execute node via `ros2 run <package> <node>` | Node |
| `RAMROS: Debug Node` | Start debug session for node | Node |
| `RAMROS: Open in Terminal` | Open new terminal in package directory | Package |
| `RAMROS: Run Launch File` | Execute launch file via `ros2 launch` | Launch file |
| `RAMROS: Bag: Start Recording` | Begin bag recording | Bag Files folder |
| `RAMROS: Bag: Select File` | Select bag file for playback | Bag Files folder |
| `RAMROS: Bag: Play/Pause` | Toggle playback | Selected bag |
| `RAMROS: Bag: Stop` | Stop playback and close terminal | During playback |
| `RAMROS: Bag: Toggle Loop` | Enable/disable loop mode | During playback |
| `RAMROS: Bag: View Info` | Show bag file information | Selected bag |

### 🎯 Additional Capabilities

#### Smart Caching
- TTL (Time-To-Live) cache for workspace and package data
- LRU (Least Recently Used) eviction policy
- File system watcher for automatic cache invalidation
- Configurable cache duration

#### Tree View Explorer
- Hierarchical display of workspaces, packages, and nodes
- Expandable/collapsible sections
- Rich tooltips with metadata
- Context-aware actions
- Always-expanded sections for quick access (Bag Files)

#### Terminal Management
- Reuse existing terminals or create new ones
- Script wrapper for keyboard control support (spacebar, Ctrl+C)
- Named terminals for easy identification
- Automatic terminal cleanup on stop

#### Configuration
No configuration required for basic usage. Optional settings:
- Live view refresh rate (1-60 seconds)
- Hide/show system topics in live view
- Cache duration settings

## Requirements

- VSCode 1.85.0 or higher
- ROS2 installation (Humble, Jazzy, Rolling, Iron, Galactic, or Foxy)

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
├── wizard/                  # Package creation wizard
│   ├── launch-wizard.ts     # Interactive wizard UI
│   └── launch-generator.ts  # Launch file generation
├── treeview/                # UI components
│   ├── tools-tree-provider.ts
│   ├── live-tree-provider.ts
│   └── tree-items.ts        # Tree item classes
└── extension.ts             # Main entry point
```

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
- Run `npm run lint` and `npm run typecheck` before committing

## License

MIT License - See LICENSE file for details

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history.
