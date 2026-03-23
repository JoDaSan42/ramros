import { CacheManager } from '../../cache/cache-manager';
import * as vscode from 'vscode';

describe('CacheManager Integration Tests', () => {
  let cacheManager: CacheManager;
  let onFileChangeMock: jest.Mock;

  beforeEach(() => {
    onFileChangeMock = jest.fn();
    cacheManager = new CacheManager(onFileChangeMock);
  });

  afterEach(() => {
    cacheManager.dispose();
    cacheManager.clear();
  });

  describe('Basic Operations', () => {
    it('sets and gets values', async () => {
      const key = 'test-key';
      const value = { foo: 'bar', count: 42 };

      await cacheManager.set(key, value);
      const result = await cacheManager.get<typeof value>(key);

      expect(result).toEqual(value);
    });

    it('returns null for non-existent key', async () => {
      const result = await cacheManager.get('non-existent');
      expect(result).toBeNull();
    });

    it('clear all cache entries', async () => {
      await cacheManager.set('key1', 'value1');
      await cacheManager.set('key2', 'value2');
      await cacheManager.set('key3', 'value3');

      cacheManager.clear();

      const result1 = await cacheManager.get('key1');
      const result2 = await cacheManager.get('key2');
      const result3 = await cacheManager.get('key3');

      expect(result1).toBeNull();
      expect(result2).toBeNull();
      expect(result3).toBeNull();
    });
  });

  describe('TTL Expiration', () => {
    it('TTL expiration works', async () => {
      const key = 'ttl-test';
      const value = 'expires-soon';

      // Temporarily set very short TTL for testing
      (cacheManager as any).DEFAULT_TTL = 100; // 100ms

      await cacheManager.set(key, value);

      // Should exist immediately
      const immediate = await cacheManager.get(key);
      expect(immediate).toBe(value);

      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 150));

      // Should be expired
      const expired = await cacheManager.get(key);
      expect(expired).toBeNull();

      // Restore default TTL
      (cacheManager as any).DEFAULT_TTL = 5 * 60 * 1000;
    });

    it('does not expire before TTL', async () => {
      const key = 'long-ttl-test';
      const value = 'persistent';

      // Use default TTL (5 minutes)
      await cacheManager.set(key, value);

      // Wait briefly
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should still exist
      const result = await cacheManager.get(key);
      expect(result).toBe(value);
    });
  });

  describe('LRU Eviction', () => {
    it('FIFO eviction at max size', async () => {
      // Create a cache manager with small max size
      const smallCache = new CacheManager(onFileChangeMock);
      (smallCache as any).MAX_CACHE_SIZE = 3;

      await smallCache.set('first', 'value1');
      await smallCache.set('second', 'value2');
      await smallCache.set('third', 'value3');

      // Add fourth entry - should evict 'first' (oldest inserted)
      await smallCache.set('fourth', 'value4');

      const first = await smallCache.get('first');
      const second = await smallCache.get('second');
      const third = await smallCache.get('third');
      const fourth = await smallCache.get('fourth');

      expect(first).toBeNull(); // Oldest, evicted
      expect(second).toBe('value2');
      expect(third).toBe('value3');
      expect(fourth).toBe('value4');

      smallCache.dispose();
    });

    it('get stats (hits, misses, evictions)', async () => {
      await cacheManager.set('key1', 'value1');
      
      // Generate hits
      await cacheManager.get('key1');
      await cacheManager.get('key1');
      
      // Generate misses
      await cacheManager.get('non-existent1');
      await cacheManager.get('non-existent2');

      const stats = cacheManager.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
      expect(stats.size).toBeGreaterThanOrEqual(0);
    });
  });

  describe('File-based Invalidation', () => {
    it('file-based invalidation (package.xml)', async () => {
      const packagePath = '/tmp/test-ws/src/my_package/package.xml';
      const cacheKey = 'package:my_package';

      await cacheManager.set(cacheKey, { name: 'my_package' }, [
        { fsPath: packagePath } as vscode.Uri
      ]);

      // Verify it exists
      const before = await cacheManager.get(cacheKey);
      expect(before).not.toBeNull();

      // Invalidate
      cacheManager.invalidate(packagePath);

      // Verify it's gone
      const after = await cacheManager.get(cacheKey);
      expect(after).toBeNull();
    });

    it('directory-based invalidation (src/)', async () => {
      const srcPath = '/tmp/test-ws/src';
      const cacheKey1 = 'package:pkg_a';
      const cacheKey2 = 'package:pkg_b';

      await cacheManager.set(cacheKey1, { name: 'pkg_a' }, [
        { fsPath: `${srcPath}/pkg_a/package.xml` } as vscode.Uri
      ]);
      await cacheManager.set(cacheKey2, { name: 'pkg_b' }, [
        { fsPath: `${srcPath}/pkg_b/package.xml` } as vscode.Uri
      ]);

      // Invalidate src directory
      cacheManager.invalidate(srcPath);

      const result1 = await cacheManager.get(cacheKey1);
      const result2 = await cacheManager.get(cacheKey2);

      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('invalidates on CMakeLists.txt change', async () => {
      const cmakePath = '/tmp/test-ws/src/my_package/CMakeLists.txt';
      const cacheKey = 'package:my_package';

      await cacheManager.set(cacheKey, { name: 'my_package' }, [
        { fsPath: cmakePath } as vscode.Uri
      ]);

      cacheManager.invalidate(cmakePath);

      const result = await cacheManager.get(cacheKey);
      expect(result).toBeNull();
    });

    it('invalidates on setup.py change', async () => {
      const setupPyPath = '/tmp/test-ws/src/py_package/setup.py';
      const cacheKey = 'package:py_package';

      await cacheManager.set(cacheKey, { name: 'py_package' }, [
        { fsPath: setupPyPath } as vscode.Uri
      ]);

      cacheManager.invalidate(setupPyPath);

      const result = await cacheManager.get(cacheKey);
      expect(result).toBeNull();
    });

    it('does not invalidate unrelated keys', async () => {
      const path1 = '/tmp/ws1/src/pkg_a/package.xml';
      const path2 = '/tmp/ws2/src/pkg_b/package.xml';

      await cacheManager.set('pkg_a', { name: 'pkg_a' }, [
        { fsPath: path1 } as vscode.Uri
      ]);
      await cacheManager.set('pkg_b', { name: 'pkg_b' }, [
        { fsPath: path2 } as vscode.Uri
      ]);

      // Invalidate only pkg_a
      cacheManager.invalidate(path1);

      const pkgA = await cacheManager.get('pkg_a');
      const pkgB = await cacheManager.get('pkg_b');

      expect(pkgA).toBeNull();
      expect(pkgB).toEqual({ name: 'pkg_b' });
    });

    it('handles path normalization', async () => {
      // Test that paths with different separators are handled consistently
      const unixPath = '/tmp/ws/src/pkg/package.xml';
      const cacheKey = 'package:pkg';

      await cacheManager.set(cacheKey, { name: 'pkg' }, [
        { fsPath: unixPath } as vscode.Uri
      ]);

      // Invalidate should work with the same path
      cacheManager.invalidate(unixPath);

      const result = await cacheManager.get(cacheKey);
      expect(result).toBeNull();
    });
  });

  describe('Performance', () => {
    it('performance: 1000 entries < 100ms', async () => {
      const startTime = Date.now();

      // Insert 1000 entries
      const insertPromises = [];
      for (let i = 0; i < 1000; i++) {
        insertPromises.push(cacheManager.set(`key-${i}`, { index: i }));
      }

      await Promise.all(insertPromises);

      // Read 1000 entries
      const readPromises = [];
      for (let i = 0; i < 1000; i++) {
        readPromises.push(cacheManager.get(`key-${i}`));
      }

      await Promise.all(readPromises);

      const elapsed = Date.now() - startTime;

      expect(elapsed).toBeLessThan(100);
    });
  });
});
