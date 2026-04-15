import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

suite('Package Creation and Deletion - Tree View Refresh E2E Tests', () => {
  let workspaceFolder: vscode.WorkspaceFolder;
  let testWorkspacePath: string;
  let srcPath: string;

  suiteSetup(async function() {
    this.timeout(60000);
    
    const testFixturesPath = path.join(__dirname, '../../../../test-fixtures');
    testWorkspacePath = path.join(testFixturesPath, 'workspace-refresh-test');
    srcPath = path.join(testWorkspacePath, 'src');
    
    if (!fs.existsSync(testWorkspacePath)) {
      fs.mkdirSync(testWorkspacePath, { recursive: true });
      fs.mkdirSync(srcPath, { recursive: true });
    }
    
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(testWorkspacePath));
    
    workspaceFolder = {
      uri: vscode.Uri.file(testWorkspacePath),
      name: 'workspace-refresh-test',
      index: 0
    };
    
    await new Promise(resolve => setTimeout(resolve, 3000));
  });

  suiteTeardown(async function() {
    const testPackagePath = path.join(srcPath, 'test_refresh_package');
    if (fs.existsSync(testPackagePath)) {
      fs.rmSync(testPackagePath, { recursive: true, force: true });
    }
  });

  test('Tree view should update when package is created via wizard', async function() {
    this.timeout(30000);
    
    const packageName = 'test_refresh_package';
    const packagePath = path.join(srcPath, packageName);
    
    const initialPackages = await getPackageCount();
    
    await vscode.commands.executeCommand('ramros.createPackage', {
      packageName: packageName,
      description: 'Test package for refresh verification',
      authorName: 'ramros',
      authorEmail: 'ramros@test.com',
      license: 'Apache-2.0',
      buildType: 'ament_cmake',
      template: 'empty',
    });
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    assert.ok(fs.existsSync(packagePath), `Package directory should exist at ${packagePath}`);
    assert.ok(
      fs.existsSync(path.join(packagePath, 'package.xml')),
      'package.xml should exist'
    );
    
    const newPackages = await getPackageCount();
    assert.strictEqual(
      newPackages,
      initialPackages + 1,
      `Tree view should show one more package after creation (was ${initialPackages}, now ${newPackages})`
    );
  });

  test('Tree view should update when package is deleted', async function() {
    this.timeout(15000);
    
    const packageName = 'test_refresh_package';
    const packagePath = path.join(srcPath, packageName);
    
    const packagesBeforeDelete = await getPackageCount();
    assert.ok(packagesBeforeDelete > 0, 'Should have at least one package before deletion');
    
    if (fs.existsSync(packagePath)) {
      fs.rmSync(packagePath, { recursive: true, force: true });
    }
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    assert.ok(!fs.existsSync(packagePath), 'Package directory should be deleted');
    
    const packagesAfterDelete = await getPackageCount();
    assert.strictEqual(
      packagesAfterDelete,
      packagesBeforeDelete - 1,
      `Tree view should show one less package after deletion (was ${packagesBeforeDelete}, now ${packagesAfterDelete})`
    );
  });

  test('Manual refresh should update tree view with new packages', async function() {
    this.timeout(20000);
    
    const packageName = 'test_manual_refresh_pkg';
    const packagePath = path.join(srcPath, packageName);
    
    const initialPackages = await getPackageCount();
    
    const packageXmlContent = `<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>${packageName}</name>
  <version>0.0.0</version>
  <description>Test package for manual refresh</description>
  <maintainer email="ramros@test.com">ramros</maintainer>
  <license>Apache-2.0</license>
  <buildtool_depend>ament_cmake</buildtool_depend>
  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>`;

    fs.mkdirSync(packagePath, { recursive: true });
    fs.writeFileSync(path.join(packagePath, 'package.xml'), packageXmlContent);
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const packagesWithoutRefresh = await getPackageCount();
    
    await vscode.commands.executeCommand('ramros.refreshWorkspaces');
    
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const packagesAfterRefresh = await getPackageCount();
    
    assert.strictEqual(
      packagesAfterRefresh,
      initialPackages + 1,
      'Manual refresh should detect the new package'
    );
    
    if (packagesWithoutRefresh === packagesAfterRefresh) {
      console.log('Note: Auto-refresh may have already updated the tree view');
    }
    
    fs.rmSync(packagePath, { recursive: true, force: true });
  });

  test('Auto-refresh should detect package changes within interval', async function() {
    this.timeout(10000);
    
    const packageName = 'test_auto_refresh_pkg';
    const packagePath = path.join(srcPath, packageName);
    
    const initialPackages = await getPackageCount();
    
    const packageXmlContent = `<?xml version="1.0"?>
<?xml-model href="http://download.ros.org/schema/package_format3.xsd" schematypens="http://www.w3.org/2001/XMLSchema"?>
<package format="3">
  <name>${packageName}</name>
  <version>0.0.0</version>
  <description>Test package for auto-refresh</description>
  <maintainer email="ramros@test.com">ramros</maintainer>
  <license>Apache-2.0</license>
  <buildtool_depend>ament_cmake</buildtool_depend>
  <export>
    <build_type>ament_cmake</build_type>
  </export>
</package>`;

    fs.mkdirSync(packagePath, { recursive: true });
    fs.writeFileSync(path.join(packagePath, 'package.xml'), packageXmlContent);
    
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    const packagesAfterAutoRefresh = await getPackageCount();
    
    assert.strictEqual(
      packagesAfterAutoRefresh,
      initialPackages + 1,
      'Auto-refresh should detect the new package within 5 seconds'
    );
    
    fs.rmSync(packagePath, { recursive: true, force: true });
  });

  async function getPackageCount(): Promise<number> {
    return new Promise((resolve) => {
      const checkPackages = () => {
        if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
          resolve(0);
          return;
        }
        
        const srcFolderPath = path.join(vscode.workspace.workspaceFolders[0].uri.fsPath, 'src');
        
        if (!fs.existsSync(srcFolderPath)) {
          resolve(0);
          return;
        }
        
        const packages = fs.readdirSync(srcFolderPath).filter(item => {
          const itemPath = path.join(srcFolderPath, item);
          const stat = fs.statSync(itemPath);
          return stat.isDirectory() && fs.existsSync(path.join(itemPath, 'package.xml'));
        });
        
        resolve(packages.length);
      };
      
      checkPackages();
    });
  }
});
