import * as path from 'path';
import * as glob from 'glob';
import Mocha from 'mocha';

export function run(): Promise<void> {
  const testsRoot = path.resolve(__dirname);
  
  return new Promise((c, e) => {
    try {
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
