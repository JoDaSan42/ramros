import * as path from 'path';

export function run(): Promise<void> {
  const testsRoot = path.resolve(__dirname);
  
  return new Promise((c, e) => {
    try {
      const Mocha = require('mocha');
      const mocha = new Mocha({
        ui: 'bdd',
        timeout: 60000,
        color: true
      });
      
      mocha.addFile(path.resolve(testsRoot, 'package-wizard.test.js'));
      
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
