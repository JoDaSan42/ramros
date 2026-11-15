import {
  parseInterfaceDefinition,
  splitArraySuffix,
  isPrimitiveType,
  InterfaceField
} from '../../core/interface-parser';

describe('interface parser', () => {
  describe('parseInterfaceDefinition', () => {
    it('parses a simple message with one primitive field', () => {
      const structure = parseInterfaceDefinition('std_msgs/msg/String', 'string data');

      expect(structure.typeName).toBe('std_msgs/msg/String');
      expect(structure.fields).toEqual([
        { name: 'data', type: 'string', isArray: false }
      ]);
    });

    it('keeps only the request section of a service definition', () => {
      const structure = parseInterfaceDefinition(
        'example_interfaces/srv/AddTwoInts',
        'int64 a\nint64 b\n---\nint64 sum'
      );

      expect(structure.fields.map(f => f.name)).toEqual(['a', 'b']);
    });

    it('omits constants', () => {
      const structure = parseInterfaceDefinition('pkg/msg/Demo', 'uint8 FOO=1\nint32 bar');

      expect(structure.fields.map(f => f.name)).toEqual(['bar']);
    });

    it('omits constants written with spaces around the equals sign', () => {
      const structure = parseInterfaceDefinition('pkg/msg/Demo', 'uint8 FOO = 1\nint32 bar');

      expect(structure.fields.map(f => f.name)).toEqual(['bar']);
    });

    it('skips comments and blank lines', () => {
      const structure = parseInterfaceDefinition(
        'pkg/msg/Demo',
        '# a comment\n\nint32 x\n\n# trailing comment\nfloat64 y'
      );

      expect(structure.fields.map(f => f.name)).toEqual(['x', 'y']);
    });

    it('parses inline-expanded nested fields (tab indentation) into children', () => {
      const structure = parseInterfaceDefinition(
        'geometry_msgs/msg/Pose',
        'Point position\n\tfloat64 x\n\tfloat64 y'
      );

      expect(structure.fields).toHaveLength(1);
      const position = structure.fields[0];
      expect(position.name).toBe('position');
      expect(position.type).toBe('Point');
      expect(position.isArray).toBe(false);
      expect(position.children).toEqual([
        { name: 'x', type: 'float64', isArray: false },
        { name: 'y', type: 'float64', isArray: false }
      ]);
    });

    it('keeps a non-primitive field without following lines unresolved (flat format)', () => {
      const structure = parseInterfaceDefinition('pkg/msg/Demo', 'std_msgs/Header header');

      expect(structure.fields).toHaveLength(1);
      const header = structure.fields[0];
      expect(header.name).toBe('header');
      expect(header.type).toBe('std_msgs/Header');
      expect(header.children).toBeUndefined();
    });

    it('parses a fixed-size array field', () => {
      const structure = parseInterfaceDefinition('pkg/msg/Demo', 'float64[3] x');

      expect(structure.fields[0]).toEqual({
        name: 'x',
        type: 'float64',
        isArray: true,
        arrayLength: 3
      } satisfies InterfaceField);
    });

    it('ignores trailing default values in a field line', () => {
      const structure = parseInterfaceDefinition('pkg/msg/Demo', 'float64 x 0');

      expect(structure.fields).toEqual([
        { name: 'x', type: 'float64', isArray: false }
      ]);
    });
  });

  describe('splitArraySuffix', () => {
    it('detects unbounded arrays', () => {
      expect(splitArraySuffix('float64[]')).toEqual({ baseType: 'float64', isArray: true, arrayLength: undefined });
    });

    it('detects fixed-size arrays', () => {
      expect(splitArraySuffix('float64[3]')).toEqual({ baseType: 'float64', isArray: true, arrayLength: 3 });
    });

    it('treats bounded arrays as free-length arrays without a fixed length', () => {
      expect(splitArraySuffix('float64[<=5]')).toEqual({ baseType: 'float64', isArray: true, arrayLength: undefined });
    });

    it('leaves plain types untouched', () => {
      expect(splitArraySuffix('float64')).toEqual({ baseType: 'float64', isArray: false, arrayLength: undefined });
    });
  });

  describe('isPrimitiveType', () => {
    it('accepts all primitive ros2 base types', () => {
      const primitives = [
        'bool', 'byte', 'char',
        'int8', 'int16', 'int32', 'int64',
        'uint8', 'uint16', 'uint32', 'uint64',
        'float32', 'float64',
        'string', 'wstring'
      ];
      for (const type of primitives) {
        expect(isPrimitiveType(type)).toBe(true);
      }
    });

    it('rejects qualified message types', () => {
      expect(isPrimitiveType('geometry_msgs/msg/Pose')).toBe(false);
    });

    it('accepts bounded strings', () => {
      expect(isPrimitiveType('string<=10')).toBe(true);
    });
  });
});
