import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { scanBagFolder } from '../../core/bag-discovery';

jest.mock('vscode', () => ({}), { virtual: true });

describe('bag-discovery', () => {
  describe('scanBagFolder', () => {
    let tempDir: string;

    beforeEach(() => {
      tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramros-bags-'));
    });

    afterEach(() => {
      fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('returns top-level .db3/.mcap files as sorted absolute paths', () => {
      fs.writeFileSync(path.join(tempDir, 'a.db3'), 'bag');
      fs.writeFileSync(path.join(tempDir, 'b.mcap'), 'bag');
      fs.writeFileSync(path.join(tempDir, 'c.txt'), 'not a bag');
      fs.mkdirSync(path.join(tempDir, 'subdir'));
      fs.writeFileSync(path.join(tempDir, 'subdir', 'nested.db3'), 'bag');

      expect(scanBagFolder(tempDir)).toEqual([
        path.join(tempDir, 'a.db3'),
        path.join(tempDir, 'b.mcap')
      ]);
    });

    it('returns [] when the folder does not exist', () => {
      expect(scanBagFolder(path.join(tempDir, 'does-not-exist'))).toEqual([]);
    });
  });
});
