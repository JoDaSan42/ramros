# RAMROS - Really Awesome Management of ROS

<img src="./img/RAMROS_logo_color.png">

A VSCode extension for managing ROS2 workspaces efficiently.

## Installation

### From GitHub Release
1. Go to the [Releases page](https://github.com/JoDaSan42/ramros/releases)
2. Download the latest `.vsix` file (e.g., `ramros-1.3.2.vsix`)
3. In VSCode, open Extensions (`Ctrl+Shift+X`)
4. Click the "..." menu → "Install from VSIX"
5. Select the downloaded `.vsix` file

## Building from Source

### Prerequisites
- Node.js 18+
- npm 9+
- TypeScript 5+
- ROS2 installation (Humble, Jazzy, Lyrical, Rolling, Iron, Galactic, or Foxy)

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
- Select bag files via file dialog or from workspace (searches `.db3`/`.mcap` in workspace folders)
- Play/pause playback with spacebar
- Stop playback and close terminal
- Enable/disable loop mode for continuous playback (toggles restart playback with the new setting)
- View detailed bag information (topics, message count, duration)

**Bag Info:**
- Display selected bag file path
- Show comprehensive bag metadata:
  - Topics with topic types and message counts
  - Total message count
  - Duration and start/end times
  - Storage format and compression

**External Bag Folders:**
- Add bag folders outside the workspace via "Add Bag Folder" (stored per-workspace in `ramros.json`)
- Remove external folders via context menu
- Open bag files in rqt_bag via inline button or context menu

#### Live View
Real-time monitoring of ROS2 system activity.

- View all active topics in the system
- Filter system topics (hide/show `/parameter_events`, `/clock`, etc.)
- See topic type for each topic
- Refresh rate configuration (1-60 seconds)
- Auto-refresh on interval
- Publisher and subscriber count display
- Enable/disable the live view via view-title toggle (persisted as `liveView.enabled` in `ramros.json`)
- Publish messages to topics (`ros2 topic pub`, once or at a rate); if the topic type cannot be discovered (e.g. no node running), you can enter it manually
- Call services with JSON input (`ros2 service call`); response shown in a read-only document
- View runtime node parameters under live nodes and set them via input box (values are validated against the parameter type reported by `ros2 param get`)
- Run a ROS2 health check (`ros2 doctor`) from the view title bar; report shown in a read-only document

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
- **Services**: Service servers and clients (name and service type)
- **Actions**: Action servers and clients (name and action type)

Supports both C++ (`create_service`, `create_client`, `rclcpp_action::create_server/client`) and Python (`create_service`, `create_client`, `ActionServer`, `ActionClient`) constructs. Commented-out code is ignored.

> **Note**: Only explicitly declared constructs are detected. Dynamically created topics or parameters may not appear.

#### Interface File Management
- Grouped display by type: Messages, Services, Actions
- Field definitions shown in tooltip
- Click to open interface file in editor
- Support for `.msg`, `.srv`, and `.action` files
- "Show Definition": resolved interface definition (`ros2 interface show`) in a read-only document

#### Launch File Support
- Automatic detection of `.launch.py` and `.launch.xml` files
- Creation wizard generates `.launch.py` or `.launch.xml` (format selection in the wizard)
- Node parameters are validated during the wizard: values must match the declared type (int/float/bool/string/arrays; `1` is rejected for a float parameter and vice versa) and are re-prompted until valid; whole-number floats serialize as float literals (e.g. `1.0`)
- Save location configurable: target package `launch/` folder, workspace root, or a custom path with `{workspace}`/`{package}` placeholders
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
1. Enter package name (validates naming rules and package-name uniqueness across workspaces; cross-workspace duplicates warn)
2. Select template type (python / cpp / cpp-python / interface)
3. Add description, author, license
   - Maintainer name/email optional: skip to use ROS convention placeholders (`todo` / `todo@todo.todo`); email is validated when entered
4. Build type is derived automatically from the package type (`ament_python` for python, `ament_cmake` otherwise)
5. Define node name (for node templates) and whether to include the template node implementation
6. Add dependencies (comma-separated)
7. For interface packages: define message/service/action fields

> **Note**: The `empty` template is available programmatically (via command options) but not offered in the interactive wizard.

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

#### Category View
- Group packages by node/interface/launch-file category via "Toggle Tree View Mode"
- Create buttons (inline "Add Node/Interface") directly on category folders; the Launch Files "+" first asks for the target package and preselects it in the wizard

#### Commands & Actions
Access commands from tree view context menu or command palette (`Ctrl+Shift+P`; most commands appear without a `RAMROS:` prefix — only `RAMROS: Toggle Tree View Mode` carries the category):

| Command | Description | Context |
|---------|-------------|---------|
| `RAMROS: Create New Package` | Launch package creation wizard | Workspace root, package folder |
| `RAMROS: Add Node/Interface to Package` | Add a node or interface to an existing package | Package, nodes/interfaces folder |
| `RAMROS: Create Launch File` | Launch the launch-file creation wizard | Workspace root, package, launch folder |
| `RAMROS: Refresh All Workspaces` | Reload workspace detection | View title |
| `RAMROS: Refresh Installed ROS2 Packages` | Force rescan of installed packages | View title |
| `RAMROS: Toggle Tree View Mode` | Switch between grouped-by-package and grouped-by-category | View title |
| `RAMROS: Source Workspace` | Open terminal with sourced ROS environment | Workspace root |
| `RAMROS: Build Workspace` | Run `colcon build` in workspace | Workspace root |
| `RAMROS: Build Package` | Build specific package | Package |
| `RAMROS: Run Node` | Execute node via `ros2 run <package> <node>` | Node |
| `RAMROS: Debug Node` | Start debug session for node | Node |
| `RAMROS: Open in Terminal` | Open new terminal in package directory | Package |
| `RAMROS: Run Launch File` | Execute launch file via `ros2 launch` | Launch file |
| `RAMROS: Launch RVIZ2` | Launch `rviz2` in a sourced terminal | ROS2 Tools |
| `RAMROS: Launch rqt_graph` | Launch `rqt_graph` in a sourced terminal | ROS2 Tools |
| `RAMROS: Bag: Start Recording` | Begin bag recording | Bag Files folder |
| `RAMROS: Bag: Pause/Resume Recording` | Pause or resume the active recording | During recording |
| `RAMROS: Bag: Stop Recording` | Stop the active recording | During recording |
| `RAMROS: Bag: Select File` | Select bag file for playback and show info | Bag Files folder |
| `RAMROS: Bag: Play/Pause` | Toggle playback | Selected bag |
| `RAMROS: Bag: Stop` | Stop playback and close terminal | During playback |
| `RAMROS: Bag: Toggle Loop` | Enable/disable loop mode | During playback |
| `RAMROS: Live: Refresh` | Refresh the ROS2 Live view | Live view title |
| `RAMROS: Live: Settings` | Open ROS2 Live view settings | Live view title |
| `RAMROS: Live: Echo Topic` | Run `ros2 topic echo` for the selected topic | Live topic |
| `RAMROS: Live: Measure Topic Frequency` | Run `ros2 topic hz` for the selected topic | Live topic |

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
- `install/setup.bash` is sourced automatically when running nodes/launch files; the path is re-resolved from the workspace root after a build, so a freshly built workspace works without reloading

#### Configuration
No configuration required for basic usage. Optional settings:
- `ramros.liveView.refreshRate` — Live view refresh rate (1-60 seconds)
- `ramros.liveView.hideSystemTopics` — Hide/show system topics in live view
- `ramros.cache.ttlSeconds` — Cache time-to-live (1-3600 seconds); changes apply live
- `ramros.cache.maxEntries` — Maximum cache entries before LRU eviction (1-10000); changes apply live
- `ramros.launchGenerator.defaultLocation` — Default location for generated launch files (`package_launch_folder`, `workspace_root`, `custom`)
- `ramros.launchGenerator.customPath` — Custom launch-file path (uses `{workspace}` / `{package}` placeholders; `{package}` resolves when a target package is selected)
- `ramros.installedPackages.maxAgeHours` — How long a cached scan of installed ROS2 packages is reused before offering to rescan (hours; 0 prompts every time)

## Requirements

- VSCode 1.85.0 or higher
- ROS2 installation (Humble, Jazzy, Lyrical, Rolling, Iron, Galactic, or Foxy)

## Architecture

```
src/
├── core/                      # Core business logic
│   ├── ros-environment.ts     # ROS2 installation detection
│   ├── workspace-detector.ts  # Workspace discovery & validation
│   ├── package-discovery.ts   # Package/node/interface static analysis
│   ├── duplicate-package-detector.ts # Conflict detection
│   ├── parameter-coercer.ts   # Parameter type inference/parsing/formatting
│   └── ros2-cli-service.ts    # Async wrapper for ros2 CLI commands
├── cache/                     # Caching layer
│   └── cache-manager.ts       # TTL + LRU cache with FS invalidation
├── executor/                  # Command execution
│   ├── terminal-manager.ts    # Terminal management
│   └── bag-session-service.ts # Bag recording/playback state (singleton)
├── wizard/                    # Package & launch file creation
│   ├── package-creator.ts     # Package/node/interface creation
│   ├── package-wizard.ts      # Interactive create/add-package UI flows
│   ├── package-form-validator.ts # Name/email validation
│   ├── launch-wizard.ts       # Interactive launch file wizard
│   ├── launch-generator.ts    # Launch file generation
│   ├── interface-collector.ts # Interface definition wizard helpers
│   └── build-file-patcher.ts  # CMakeLists/setup.py/package.xml patcher
├── treeview/                  # UI components
│   ├── tree-provider.ts       # Main workspace tree provider
│   ├── tools-tree-provider.ts # ROS2 tools tree provider
│   ├── live-tree-provider.ts  # Live ROS2 topic/node monitor
│   ├── base-tree-item.ts      # Shared TreeItemBase
│   ├── bag-items.ts           # Bag record/playback tree items
│   ├── live-items.ts          # Live ROS2 tree items
│   ├── workspace-items.ts     # Workspace/package/node tree items
│   ├── conflict-items.ts      # Package conflict tree items
│   └── category-items.ts      # Category-grouped tree items
└── extension.ts               # Main entry point
```

## Planned Improvements
1. Improve launch file creation - faster discovery of installed packages
2. Improve live view - more performant automatic reload
3. Bag file investigation (open in rqt_bag)

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
