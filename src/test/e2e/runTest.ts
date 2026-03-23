import * as path from 'path';
import { runTests } from '@vscode/test-electron';

async function main() {
  try {
    // Path to the extension root
    const extensionDevelopmentPath = path.resolve(__dirname, '../../..');
    
    // Path to the test fixtures (test files)
    const extensionTestsPath = path.resolve(__dirname, './index.js');
    
    // Path to workspace folder for tests
    const testWorkspace = path.resolve(extensionDevelopmentPath, './test-fixtures/workspace-valid');
    
    // Download VSCode, unzip it and run the integration test
    await runTests({
      version: '1.85.0',
      extensionDevelopmentPath,
      extensionTestsPath,
      launchArgs: [
        testWorkspace,
        '--disable-extensions'
      ]
    });
  } catch (err) {
    console.error('Failed to run tests:', err);
    process.exit(1);
  }
}

main();
