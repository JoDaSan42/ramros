# Launch File Creator - Implementation Plan

## Overview
Interactive wizard for creating Python launch files in ROS2, targeting beginners while providing advanced features for experienced users. The tool discovers nodes from both workspace packages and installed system packages, generates clean Python launch files with parameter support, and integrates seamlessly into the existing RAMROS extension.

---

## Phase 1: Basic Launch File Generator (MVP)

### Feature 1: Installed Package Discovery

#### What It Does
Discovers and lists all installed ROS2 packages (from `/opt/ros/humble/`) alongside workspace packages, allowing users to create launch files that mix custom nodes with standard ROS2 nodes like `demo_nodes_cpp`, `turtlesim`, etc.

#### Technical Implementation

**New Interface: `InstalledPackageInfo`** (`src/core/package-discovery.ts`)
```typescript
export interface InstalledPackageInfo extends PackageInfo {
  source: 'installed';  // vs 'workspace' for workspace packages
  installPath: string;  // e.g., /opt/ros/humble/share/pkgname
}
```

**Discovery Method:**
- Execute `ros2 pkg list` to get all installed package names
- Execute `ros2 pkg executables` to map packages to their nodes/executables
- Parse output to build `InstalledPackageInfo[]` array
- Cache results with longer TTL (installed packages change rarely)

**UI Integration:**
- In node selection quick pick, show both workspace and installed packages
- Visual distinction: `(workspace)` vs `(system)` suffix on package names
- Installed packages grouped separately or with icon differentiation

**Files to Modify:**
- `src/core/package-discovery.ts` - Add discovery method and interface
- `src/extension.ts` - Update node picker command to include installed packages
- `src/cache/cache-manager.ts` - Add cache key for installed packages

---

### Feature 2: Python Launch File Generator Service

#### What It Does
Generates clean, well-formatted Python launch files using the modern `launch` and `launch_ros` framework with proper imports, node declarations, and parameter handling.

#### Generated Output Example
```python
from launch import LaunchDescription
from launch_ros.actions import Node
from launch.substitutions import LaunchConfiguration
from launch.actions import DeclareLaunchArgument

def generate_launch_description():
    # Launch arguments
    use_sim_time_arg = DeclareLaunchArgument(
        'use_sim_time',
        default_value='false',
        description='Use simulation clock'
    )
    
    # Nodes
    talker_node = Node(
        package='demo_nodes_cpp',
        executable='talker',
        name='talker',
        namespace='',
        parameters=[{'use_sim_time': False}],
        output='screen'
    )
    
    listener_node = Node(
        package='demo_nodes_cpp',
        executable='listener',
        name='listener',
        namespace='',
        parameters=[{'use_sim_time': False}],
        output='screen'
    )
    
    return LaunchDescription([
        use_sim_time_arg,
        talker_node,
        listener_node,
    ])
```

#### Technical Implementation

**New File: `src/wizard/launch-generator.ts`**

Core class structure:
```typescript
export interface LaunchNodeConfig {
  packageName: string;
  executableName: string;
  nodeName?: string;        // Optional ros__node name
  namespace?: string;
  parameters?: Array<{ name: string; value: any }>;
  remappings?: Array<{ from: string; to: string }>;
  output?: 'screen' | 'log';
  useSimTime?: boolean;
}

export interface LaunchFileConfig {
  fileName: string;
  description?: string;
  nodes: LaunchNodeConfig[];
  launchArguments?: LaunchArgumentConfig[];
}

export class LaunchGenerator {
  generate(config: LaunchFileConfig): string;
  validate(fileName: string): Promise<boolean>;  // Uses `ros2 launch --check`
}
```

**Key Features:**
- Template-based generation with proper formatting
- Automatic `DeclareLaunchArgument` for configurable parameters
- Smart parameter type inference (bool, int, float, string, arrays)
- Optional topic remapping support
- Namespace support at node level

**Files to Create:**
- `src/wizard/launch-generator.ts` - Main generator logic
- `src/wizard/launch-templates.ts` - String templates and formatting helpers

---

### Feature 3: Default Output Location & User Override

#### What It Does
By default, creates launch files inside the source package's `launch/` folder, but allows users to choose a custom location per-generation or set a global default.

#### Behavior

**Default Path:**
```
{workspace_root}/src/{selected_package_name}/launch/{filename}.launch.py
```

**User Flow:**
1. After configuring nodes and parameters, prompt appears:
   ```
   "Where should we save this launch file?"
   - Use default (src/my_pkg/launch/)
   - Choose custom folder...
   ```

2. If "Choose custom folder" selected → VSCode folder picker opens

3. Auto-create `launch/` directory if it doesn't exist

#### Technical Implementation

**VSCode Setting:**
Add to `package.json`:
```json
"ramros.launchGenerator.defaultLocation": {
  "type": "string",
  "default": "package_launch_folder",
  "enum": ["package_launch_folder", "workspace_root", "custom"],
  "description": "Default location for generated launch files"
},
"ramros.launchGenerator.customPath": {
  "type": "string",
  "default": "",
  "description": "Custom path for launch files (used when defaultLocation is 'custom')"
}
```

**Files to Modify:**
- `package.json` - Add configuration settings
- `src/extension.ts` - Implement folder selection logic
- `src/wizard/launch-generator.ts` - Write file to determined path

---

### Feature 4: Basic Parameter Support (Workspace Packages Only)

#### What It Does
Extracts declared parameters from workspace package source code and presents them in a dedicated parameter input step after node selection.

#### Technical Implementation

**Leverage Existing Code:**
The existing regex parser in `package-discovery.ts` already extracts:
- `declare_parameter()` calls in Python
- `declare_parameter()` calls in C++
- Default values and inferred types

**Enhancement Needed:**
- Extract parameters for ALL nodes in a package (currently may only extract for main node)
- Store in `NodeInfo.parameters[]` array
- Present in UI as editable key-value pairs

**Parameter Input UI Flow:**
After selecting nodes, show quick picks for each discovered parameter:
```
"Set value for 'max_retries' (default: 3, type: int):" [user types: 5]
"Set value for 'log_level' (default: 'info', type: string):" [user types: 'debug']
"Skip remaining parameters" option available
```

**Generated Launch Code:**
```python
my_node = Node(
    package='my_package',
    executable='my_node',
    parameters=[{
        'max_retries': 5,
        'log_level': 'debug'
    }]
)
```

**Files to Modify:**
- `src/core/package-discovery.ts` - Enhance parameter extraction for all nodes
- `src/extension.ts` - Add parameter collection step in wizard flow
- `src/wizard/launch-generator.ts` - Include parameters in generated output

**Note for Installed Packages:** 
Parameters are NOT extracted for installed/system packages in Phase 1 (per decision). These nodes appear with empty parameter lists.

---

### Feature 5: Integration & Commands

#### New Command: `ramros.createLaunchFile`

**Access Points:**
1. **Command Palette:** "RAMROS: Create Launch File"
2. **Tree Context Menu:** Right-click on package → "Create Launch File"
3. **Quick Access:** From ROS2 Tools section

**Wizard Flow:**
```
Step 1: Select Package
  └─ Show combined list: workspace packages + installed packages
  └─ Filter/search enabled
  
Step 2: Select Nodes
  └─ Multi-select from chosen package(s)
  └─ Show node descriptions where available
  └─ Can add nodes from multiple packages
  
Step 3: Configure Parameters
  └─ For each discovered parameter (workspace packages only)
  └─ Show default value and type
  └─ User enters custom value or accepts default
  └─ "Skip All" option available
  
Step 4: Set Launch Arguments (Optional)
  └─ Add custom launch arguments (e.g., use_sim_time)
  └─ Define default values
  
Step 5: Choose Save Location
  └─ Default: src/{pkg}/launch/
  └─ Custom folder option
  
Step 6: Generate & Preview
  └─ Generate launch file content
  └─ Open in editor for review
  └─ Option to run immediately
```

**Files to Modify:**
- `package.json` - Register new command
- `src/extension.ts` - Implement command handler and wizard flow
- `src/treeview/tree-items.ts` - Add context menu item to PackageItem

---

## Architecture Overview

### New Files to Create
```
src/wizard/
├── launch-generator.ts      # Core generation logic
├── launch-templates.ts      # String templates and formatters
├── launch-wizard.ts         # Wizard UI flow coordinator
└── types/
    └── launch-types.ts      # TypeScript interfaces
```

### Modified Files
```
src/core/package-discovery.ts     # Add installed package discovery
src/extension.ts                  # Add command and wizard integration
src/treeview/tree-items.ts        # Add context menu items
package.json                      # Add commands and settings
```

---

## Data Flow Diagram

```
User clicks "Create Launch File"
         │
         ▼
┌─────────────────────────┐
│  1. Package Selector    │ ← Calls PackageDiscoveryService.discoverPackages()
│  (workspace + system)   │ ← Plus discoverInstalledPackages()
└───────────┬─────────────┘
            │ User selects packages
            ▼
┌─────────────────────────┐
│  2. Node Multi-Selector │ ← Shows nodes from selected packages
└───────────┬─────────────┘
            │ User selects nodes
            ▼
┌─────────────────────────┐
│  3. Parameter Editor    │ ← For workspace nodes only
│  (key-value inputs)     │ ← Extracted via regex from source
└───────────┬─────────────┘
            │ User enters values
            ▼
┌─────────────────────────┐
│  4. Location Picker     │ ← Default or custom folder
└───────────┬─────────────┘
            │ Path confirmed
            ▼
┌─────────────────────────┐
│  5. LaunchGenerator     │ → Generates Python code
│     .generate(config)   │ → Writes file to disk
└───────────┬─────────────┘
            │
            ▼
    File opened in VSCode editor
    Prompt: "Run launch file now?"
```

---

## Testing Strategy

### Unit Tests
- `LaunchGenerator.generate()` - Verify output format and syntax
- Parameter type inference logic
- Installed package discovery parser

### Integration Tests  
- Full wizard flow with mock VSCode APIs
- File generation in test workspace
- Validation against `ros2 launch --check`

### Manual Testing
- Create launch file with demo_nodes_cpp nodes
- Test with workspace package nodes containing parameters
- Verify custom save location works
- Test multi-package node combinations

---

## Future Phases (Not in MVP)

### Phase 2: Advanced Webview Panel
- Rich visual node selector with search/filter
- Drag-and-drop node ordering
- Real-time launch file preview pane
- Table-based parameter editor with type validation
- Topic remapping UI with autocomplete

### Phase 3: Advanced Features
- Launch file validation before saving
- Visual node diagram (previews runtime topology)
- Templates & presets (single node, sensor bringup, navigation stack)
- Environment-specific overrides (dev/staging/production configs)
- Import & edit existing launch files
- Smart parameter suggestions based on node type

---

## Dependencies & Requirements

### External Dependencies
- ROS2 Humble or later (for `ros2 pkg` commands)
- Python 3 with `rclpy` (for parameter extraction if needed)

### Internal Dependencies
- Existing `PackageDiscoveryService` infrastructure
- Existing `CacheManager` for caching
- Existing terminal manager for running generated files

---

## Success Criteria

✅ User can create a launch file with nodes from both workspace and installed packages  
✅ Generated launch file is syntactically correct and runnable  
✅ Parameters from workspace nodes are pre-populated with defaults  
✅ User can override default save location  
✅ Launch file follows ROS2 Python best practices  
✅ No errors or warnings from `ros2 launch --check`  

---

## Timeline Estimate

| Feature | Complexity | Estimated Time |
|---------|-----------|----------------|
| Installed Package Discovery | Low | 2-3 hours |
| Launch File Generator | Medium | 4-6 hours |
| Save Location Logic | Low | 1-2 hours |
| Parameter Editor | Medium | 3-4 hours |
| Wizard Integration | Medium | 3-4 hours |
| Testing & Bug Fixes | - | 3-4 hours |
| **Total** | | **16-23 hours** |

---

## Decision Log

| Decision | Option Chosen | Rationale |
|----------|---------------|-----------|
| Installed package parameter discovery | Skip for Phase 1 | Keeps MVP scope manageable; installed package sources may not be accessible |
| Default save location | Inside each package (`src/{pkg}/launch/`) | Follows ROS2 package conventions; keeps launch files with their packages |
| Parameter input timing | Separate step after node selection | Cleaner UX; allows users to see all selected nodes before configuring |
| Launch file format | Python only (.launch.py) | Modern standard; more flexible than XML; aligns with ROS2 best practices |
