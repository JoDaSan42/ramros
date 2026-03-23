import * as path from 'path';
import { describe, before, after, it } from 'mocha';
import * as assert from 'assert';
import * as vscode from 'vscode';

const EXTENSION_ID = 'ramros-team.ramros';

async function waitForExtensionActivation(timeoutMs = 10000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ext = vscode.extensions.getExtension(EXTENSION_ID);
    if (ext && ext.isActive) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Extension did not activate within timeout');
}

describe('RAMROS E2E Tests', () => {
  before(async function() {
    this.timeout(10000);
    await waitForExtensionActivation();
  });
  
  after(() => {
    vscode.commands.executeCommand('workbench.action.closeAllEditors');
  });
  
  describe('Extension Activation', () => {
    it('should activate successfully', async () => {
      const extension = vscode.extensions.getExtension(EXTENSION_ID);
      assert.ok(extension, 'Extension not found');
      assert.ok(extension.isActive, 'Extension is not active');
    });
  });
  
  describe('Commands', () => {
    it('should execute refresh command', async () => {
      await vscode.commands.executeCommand('ramros.refreshWorkspaces');
      assert.ok(true, 'Refresh command executed without error');
    });
    
    it('should execute source workspace command', async () => {
      await vscode.commands.executeCommand('ramros.sourceWorkspace');
      assert.ok(true, 'Source workspace command executed without error');
    });
    
    it('should execute build workspace command', async () => {
      await vscode.commands.executeCommand('ramros.buildWorkspace');
      assert.ok(true, 'Build workspace command executed without error');
    });
  });
});
