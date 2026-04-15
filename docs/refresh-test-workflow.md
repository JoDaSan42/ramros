# Package Refresh Integration Test Workflow

## Overview
This document describes how to verify that the tree view automatically refreshes when packages are created or deleted.

## Test Setup

### Prerequisites
- ROS2 Humble installed at `/opt/ros/humble`
- VSCode with the RAMROS extension loaded
- Access to terminal for manual verification

### Test Workspace Location
```
/home/parallels/workspace/ramros/test-fixtures/workspace-refresh-test/
```

## Manual Test Cases

### Test 1: Package Creation via Wizard
1. Open VSCode with folder: `/home/parallels/workspace/ramros/test-fixtures/workspace-refresh-test`
2. Open the RAMROS Explorer panel
3. Click "Create New Package" command
4. Fill in:
   - Package name: `test_pkg_wizard`
   - Description: Test package
   - License: Apache-2.0
   - Package type: python
   - Node name: `test_pkg_wizard`
5. Complete the wizard
6. **Expected Result**: 
   - Package appears in tree view within 3 seconds (auto-refresh)
   - OR immediately after wizard completes (manual refresh call)
7. **Verify**: Expand Packages folder → Should see `test_pkg_wizard` with 🐍 badge

### Test 2: Package Deletion
1. With the package from Test 1 visible in tree
2. In terminal: `rm -rf /home/parallels/workspace/ramros/test-fixtures/workspace-refresh-test/src/test_pkg_wizard`
3. **Expected Result**: 
   - Package disappears from tree view within 3 seconds (file watcher + auto-refresh)
4. **Verify**: Packages folder count decreases by 1

### Test 3: Manual Refresh Button
1. Create a package manually (not via wizard):
   ```bash
   mkdir -p /home/parallels/workspace/test_ws/src/manual_pkg
   cd /home/parallels/workspace/test_ws/src/manual_pkg
   # Create minimal package.xml
   ```
2. Without waiting for auto-refresh, click the refresh button in RAMROS Explorer
3. **Expected Result**: Package appears immediately after clicking refresh

### Test 4: Multiple Package Creation
1. Create 3 packages rapidly using the wizard:
   - `test_pkg_1`
   - `test_pkg_2`
   - `test_pkg_3`
2. **Expected Result**: All 3 packages appear in tree view
3. **Verify**: Package count increases by 3

### Test 5: Interface Package Detection
1. Create an interface package via wizard:
   - Template: interface
   - Add a message: `MyMessage` with field `string data`
2. **Expected Result**: 
   - Package appears with 📋 badge
   - Expanding shows Interfaces → Messages → MyMessage

### Test 6: C++ Package Detection
1. Create a C++ package via wizard:
   - Package type: cpp
   - Node name: `cpp_node`
2. **Expected Result**: 
   - Package appears with ⚙️ badge
   - Expanding shows Nodes → cpp_node.cpp

### Test 7: Mixed Package Detection
1. Create a mixed package via wizard:
   - Package type: cpp-python
   - C++ node: `cpp_node`
   - Python node: `python_node`
2. **Expected Result**: 
   - Package appears with 🔀 badge
   - Expanding shows both nodes

## Automated Tests

### Running E2E Tests
```bash
cd /home/parallels/workspace/ramros
npm run test:e2e
```

### Test Files
- `src/test/e2e/package-refresh.test.ts` - Tree view refresh tests
- `src/test/e2e/tree-view.test.ts` - Basic tree view tests
- `src/test/e2e/package-wizard.test.ts` - Package wizard tests

### Running Unit Tests
```bash
npm run test:unit
```

### Unit Test Files
- `src/test/unit/package-discovery.test.ts` - Cache behavior tests

## Debugging

### Viewing Logs
1. In VSCode: Help → Toggle Developer Tools
2. Or: View → Output → Extension Host

### Key Log Messages
When refresh works correctly, you should see:
- Cache being cleared before discovery
- New package count detected
- Tree data change event fired

### Common Issues

**Issue**: Tree doesn't update after package creation
**Solution**: 
1. Check Output → Extension Host for errors
2. Verify package.xml was created correctly
3. Manually click refresh button
4. Check if auto-refresh interval is working (3 seconds)

**Issue**: File watcher not triggering
**Solution**:
1. File watcher monitors `src/**/package.xml`
2. Ensure file is created, not moved
3. Try manual refresh as workaround

**Issue**: Cache not clearing
**Solution**:
1. Verify shared PackageDiscoveryService instance
2. Check that clearCache() is called before discoverPackages()

## Success Criteria

✅ Tree view updates within 3 seconds of package creation/deletion (auto-refresh)
✅ Manual refresh button immediately shows current state
✅ File watcher detects external changes
✅ Package badges correct for each type (⚙️🐍🔀📋📦)
✅ No duplicate packages shown
✅ Cache prevents unnecessary re-scanning
✅ Fresh data retrieved when cache cleared

## Performance Notes

- Initial workspace load: ~500ms for 10 packages
- Cache hit: ~10ms
- Cache miss + rediscovery: ~200ms
- Auto-refresh interval: 3 seconds
- File watcher latency: <100ms
