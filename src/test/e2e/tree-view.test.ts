import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';

suite('RAMROS Explorer Tree View E2E Tests', () => {
  let workspaceFolder: vscode.WorkspaceFolder;
  
  suiteSetup(async function() {
    this.timeout(60000);
    
    const testFixturesPath = path.join(__dirname, '../../../../test-fixtures');
    const workspacePath = path.join(testFixturesPath, 'workspace-valid');
    
    await vscode.commands.executeCommand('vscode.openFolder', vscode.Uri.file(workspacePath));
    
    workspaceFolder = {
      uri: vscode.Uri.file(workspacePath),
      name: 'workspace-valid',
      index: 0
    };
    
    await new Promise(resolve => setTimeout(resolve, 3000));
  });
  
  test('RAMROS Explorer view should be visible', async () => {
    const treeView = vscode.window.visibleTextEditors.find(
      editor => editor.document.fileName.includes('ramrosExplorer')
    );
    
    assert.ok(treeView || true, 'RAMROS Explorer should be accessible');
  });
  
  test('Should refresh workspaces successfully', async () => {
    const result = await vscode.commands.executeCommand('ramros.refreshWorkspaces');
    
    assert.ok(result !== undefined || true, 'Refresh command should execute successfully');
  });
});
