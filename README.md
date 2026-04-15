# RAMROS - Really Awesome Management of ROS

A VSCode extension for managing ROS2 workspaces efficiently.

## Features

- **Package Creation Wizard**: Create new ROS2 packages from templates (empty, minimal-cpp, minimal-python, standard)
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

The RAMROS Explorer provides a hierarchical view of your ROS2 workspace:

**Workspace Level:**
- Shows workspace name and ROS distribution
- Displays warnings/errors if any
- Contains discovered packages

**Package Level:**
- Package name with version badge
- Type indicator emoji:
  - ⚙️ C++ package (ament_cmake with C++ executables)
  - 🐍 Python package (ament_python with Python nodes)
  - 🔀 Mixed package (both C++ and Python nodes)
  - 📋 Interface package (msg/srv/action definitions)
  - 📦 Empty package (no nodes or interfaces)

**Node Level:**
- Node name with language indicator (.cpp or .py)
- Static analysis information in tooltip:
  - Declared parameters with default values
  - Publishers (topic name and message type)
  - Subscriptions (topic name and message type)
  
**Interface Files:**
- Grouped by type: Messages, Services, Actions
- Shows field definitions in tooltip
- Click to open interface file

**Launch Files:**
- Lists all `.launch.py` and `.launch.xml` files
- Click to open launch file

> **Note on Static Analysis**: Node information (parameters, publishers, subscriptions) is extracted via static code analysis. This means only explicitly declared constructs are detected. Dynamically created topics or parameters may not appear. No disclaimer is shown in tooltips to keep the UI clean.

### Commands

Access commands from the tree view context menu or command palette (`Ctrl+Shift+P`):

| Command | Description | Context Menu |
|---------|-------------|--------------|
| `RAMROS: Create New Package` | Launch package creation wizard | Workspace root |
| `RAMROS: Refresh All Workspaces` | Reload workspace detection | View title |
| `RAMROS: Source Workspace` | Open terminal with sourced ROS environment | Workspace root |
| `RAMROS: Build Workspace` | Run `colcon build` in workspace | Workspace root |
| `RAMROS: Build Package` | Build specific package (`colcon build --packages-select`) | Package |
| `RAMROS: Run Node` | Execute node via `ros2 run <package> <node>` | Node |
| `RAMROS: Debug Node` | Start debug session for node | Node |
| `RAMROS: Open in Terminal` | Open new terminal in package directory | Package |
| `RAMROS: Run Launch File` | Execute launch file via `ros2 launch` | Launch file |

### Package Creation Wizard

The wizard guides you through creating a new ROS2 package:

1. **Open the wizard**: Click "Create New Package" in the RAMROS Explorer or run `RAMROS: Create New Package`
2. **Enter package details**:
   - Package name (must be unique, start with lowercase letter)
   - Select template: `empty`, `minimal-cpp`, `minimal-python`, `standard`, or `interface`
   - Description
   - Author name and email
   - License (Apache-2.0, MIT, BSD, GPL)
   - Build type (`ament_cmake`, `ament_python`, `cmake`)
   - Node name (for non-empty templates)
   - Dependencies (comma-separated)
3. **For interface packages**: Add message/service/action definitions
4. **Package is created** in the `src/` directory of your workspace

#### Available Templates

| Template | Description | Files Created |
|----------|-------------|---------------|
| `empty` | Minimal package structure | `CMakeLists.txt`, `package.xml` |
| `minimal-cpp` | C++ node with publisher | C++ node file, header, launch file |
| `minimal-python` | Python node with publisher | Python node file, setup.py, launch file |
| `standard` | Hybrid C++/Python package | Both C++ and Python nodes, CMakeLists, setup.py |
| `interface` | Interface package for custom messages, services, actions | `msg/`, `srv/`, `action/` directories with interface files |

#### Interface Packages

Interface packages define custom ROS2 interfaces (messages, services, actions):

**Creating a Message Package:**
1. Select `interface` template
2. Add dependencies (e.g., `std_msgs`, `geometry_msgs`)
3. Add message definition:
   - Name: `SensorData`
   - Fields:
     ```
     int32 id
     float64 value
     string name
     ```
4. Result: Creates `msg/SensorData.msg` with proper CMakeLists.txt configuration

**Creating a Service Package:**
1. Select `interface` template
2. Add service definition:
   - Name: `ComputeSum`
   - Fields:
     ```
     int32 a
     int32 b
     ---
     int32 sum
     ```
3. Result: Creates `srv/ComputeSum.srv` with request/response sections

**Creating an Action Package:**
1. Select `interface` template
2. Add action definition:
   - Name: `NavigateToPose`
   - Fields:
     ```
     geometry_msgs/PoseStamped pose
     ---
     duration elapsed_time
     float64 distance_traveled
     ---
     bool success
     string error_message
     ```
3. Result: Creates `action/NavigateToPose.action` with goal/feedback/result sections

**Interface Package Structure:**
```
my_interfaces/
├── CMakeLists.txt          # Configured with rosidl_generate_interfaces()
├── package.xml             # Includes rosidl_interface_packages member group
├── msg/                    # Custom message definitions
│   └── SensorData.msg
├── srv/                    # Custom service definitions
│   └── ComputeSum.srv
└── action/                 # Custom action definitions
    └── NavigateToPose.action
```

**Building Interface Packages:**
```bash
cd /path/to/workspace
source /opt/ros/<distro>/setup.bash
colcon build
source install/setup.bash
```

Your custom interfaces will be available as `<package_name>/msg/<MessageName>` in other packages.

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

### Building a Release Package

#### Local Build

```bash
# Compile the extension
npm run compile

# Package as .vsix file
npx vsce package          # Production release
npx vsce package --pre-release  # Pre-release/beta version
```

The `.vsix` file will be created in the project root.

#### GitHub Actions (CI/CD)

Pushing to main branch automatically:
1. Runs all tests and linting
2. Builds the extension
3. Uploads the `.vsix` artifact

To trigger a full release:
1. Push changes to `main`
2. Create a tag: `git tag v1.0.0 && git push origin v1.0.0`
3. CI/CD will create a GitHub Release with the `.vsix` attached

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

### Release 1.0 ✅
- [x] ROS2 Installation Detection
- [x] Multi-Workspace Support  
- [x] Duplicate Package Detection
- [x] Caching System
- [x] Tree View Explorer
- [x] Source Workspace Command
- [x] Build Workspace Command
- [x] Unit & Integration Tests

### Release 2.0 (In Progress) 🚧
- [x] Package Creation Wizard
  - [x] Empty template
  - [x] Minimal C++ template
  - [x] Minimal Python template
  - [x] Standard hybrid template
  - [x] Interface package template (messages, services, actions)
- [x] Tree View Display of Packages and Nodes
  - [x] Package discovery on workspace load
  - [x] Package type badges (C++, Python, Mixed, Interface, Empty)
  - [x] Node display with static analysis (parameters, publishers, subscriptions)
  - [x] Interface file grouping and display
  - [x] Launch file listing
  - [x] Context menu commands (build, run, debug, terminal)
- [ ] Launch Configuration Management
- [ ] Topic/Service Graph Visualization (Cytoscape.js)
- [ ] Parameter Editor
- [ ] Log Viewer

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
