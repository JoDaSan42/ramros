import * as path from 'path';
import * as glob from 'glob';

export function run(): Promise<void> {
  const testsRoot = path.resolve(__dirname);
  
  return new Promise((c, e) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const Mocha = require('mocha');
      const mocha = new Mocha({
        ui: 'tdd',
        timeout: 60000,
        color: true
      });
      
      const testFiles = glob.sync('**/*.test.js', { cwd: testsRoot });
      testFiles.forEach(file => {
        mocha.addFile(path.resolve(testsRoot, file));
      });
      
      mocha.run((failures: number) => {
        if (failures > 0) {
          e(new Error(`${failures} tests failed.`));
        } else {
          c();
        }
      });
    } catch (err) {
      console.error(err);
      e(err);
    }
  });
}
