import { LiveInfoCache } from '../../core/live-info-cache';

describe('LiveInfoCache', () => {
  it('get returns undefined for unknown name', () => {
    const cache = new LiveInfoCache<number>();
    expect(cache.get('x')).toBeUndefined();
  });

  it('set then get returns the value', () => {
    const cache = new LiveInfoCache<number>();
    cache.set('x', 1);
    expect(cache.get('x')).toBe(1);
  });

  it('newTick clears all entries', () => {
    const cache = new LiveInfoCache<number>();
    cache.set('x', 1);
    cache.set('y', 2);
    cache.newTick();
    expect(cache.size()).toBe(0);
    expect(cache.get('x')).toBeUndefined();
  });

  it('entries set after a tick survive within the new tick', () => {
    const cache = new LiveInfoCache<string>();
    cache.set('a', 'v');
    cache.newTick();
    cache.set('b', 'w');
    expect(cache.get('b')).toBe('w');
    expect(cache.size()).toBe(1);
  });

  it('snapshot returns a copy', () => {
    const cache = new LiveInfoCache<number>();
    cache.set('x', 1);
    const snap = cache.snapshot();
    snap.set('x', 99);
    expect(cache.get('x')).toBe(1);
  });
});
