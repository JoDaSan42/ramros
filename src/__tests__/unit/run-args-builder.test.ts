import { RunArgsBuilder } from '../../core/run-args-builder';

describe('RunArgsBuilder', () => {
  it('returns empty string for empty options', () => {
    expect(RunArgsBuilder.build({ parameters: [], remaps: [] })).toBe('');
  });

  it('formats numeric and boolean parameters raw', () => {
    const out = RunArgsBuilder.build({
      parameters: [
        { name: 'speed', value: '1.5', type: 'float' },
        { name: 'count', value: '3', type: 'int' },
        { name: 'enabled', value: 'true', type: 'bool' },
      ],
      remaps: [],
    });
    expect(out).toBe('--ros-args -p speed:=1.5 -p count:=3 -p enabled:=true');
  });

  it('single-quotes string parameters with escaping', () => {
    const out = RunArgsBuilder.build({
      parameters: [{ name: 'greeting', value: "it's all", type: 'string' }],
      remaps: [],
    });
    expect(out).toBe("--ros-args -p greeting:='it'\\''s all'");
  });

  it('quotes string parameters containing spaces', () => {
    const out = RunArgsBuilder.build({
      parameters: [{ name: 'msg', value: 'hello world', type: 'string' }],
      remaps: [],
    });
    expect(out).toBe("--ros-args -p msg:='hello world'");
  });

  it('formats arrays with per-item formatting', () => {
    const out = RunArgsBuilder.build({
      parameters: [{ name: 'points', value: '[1.0, 2.5]', type: 'float[]' }],
      remaps: [],
    });
    expect(out).toBe('--ros-args -p points:=[1.0,2.5]');
  });

  it('formats string arrays with quoted items', () => {
    const out = RunArgsBuilder.build({
      parameters: [{ name: 'names', value: '[a b, c]', type: 'string[]' }],
      remaps: [],
    });
    expect(out).toBe("--ros-args -p names:=['a b','c']");
  });

  it('treats unspecified type as string', () => {
    const out = RunArgsBuilder.build({
      parameters: [{ name: 'mystery', value: '42' }],
      remaps: [],
    });
    expect(out).toBe("--ros-args -p mystery:='42'");
  });

  it('adds node name as last __node remap', () => {
    const out = RunArgsBuilder.build({ parameters: [], remaps: [], nodeName: '/renamed' });
    expect(out).toBe('--ros-args -r __node:=/renamed');
  });

  it('orders parameters, then remaps, then __node', () => {
    const out = RunArgsBuilder.build({
      parameters: [{ name: 'a', value: '1', type: 'int' }],
      remaps: [{ from: '/in', to: '/out' }],
      nodeName: '/n',
    });
    expect(out).toBe('--ros-args -p a:=1 -r /in:=/out -r __node:=/n');
  });

  it('accepts remaps without a leading slash', () => {
    const out = RunArgsBuilder.build({
      parameters: [],
      remaps: [{ from: 'in', to: 'out' }],
    });
    expect(out).toBe('--ros-args -r in:=out');
  });

  it('formats bool false correctly', () => {
    const out = RunArgsBuilder.build({
      parameters: [{ name: 'flag', value: 'false', type: 'bool' }],
      remaps: [],
    });
    expect(out).toBe('--ros-args -p flag:=false');
  });
});
