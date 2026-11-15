import {
  fieldDefaults,
  coerceScalar,
  parseArrayInput,
  valuesToYaml,
  valuesToJson
} from '../../core/message-serializer';
import { InterfaceField } from '../../core/interface-parser';

const STRING_DATA: InterfaceField[] = [{ name: 'data', type: 'string', isArray: false }];

const POSE_FIELDS: InterfaceField[] = [
  {
    name: 'position',
    type: 'Point',
    isArray: false,
    children: [
      { name: 'x', type: 'float64', isArray: false },
      { name: 'y', type: 'float64', isArray: false }
    ]
  }
];

describe('message serializer', () => {
  describe('fieldDefaults', () => {
    it('prefills primitive scalars with neutral defaults', () => {
      const fields: InterfaceField[] = [
        { name: 'count', type: 'int32', isArray: false },
        { name: 'speed', type: 'float64', isArray: false },
        { name: 'flag', type: 'bool', isArray: false },
        { name: 'label', type: 'string', isArray: false }
      ];

      expect(fieldDefaults(fields)).toEqual({
        'count': '0',
        'speed': '0',
        'flag': 'false',
        'label': ''
      });
    });

    it('leaves free-length arrays as one empty text input', () => {
      const fields: InterfaceField[] = [{ name: 'values', type: 'float64', isArray: true }];

      expect(fieldDefaults(fields)).toEqual({ 'values': '' });
    });

    it('expands fixed arrays of 16 or fewer elements into per-element entries', () => {
      const fields: InterfaceField[] = [{ name: 'p', type: 'float64', isArray: true, arrayLength: 3 }];

      expect(fieldDefaults(fields)).toEqual({ 'p[0]': '0', 'p[1]': '0', 'p[2]': '0' });
    });

    it('keeps fixed arrays of more than 16 elements as one text input', () => {
      const fields: InterfaceField[] = [{ name: 'p', type: 'float64', isArray: true, arrayLength: 720 }];

      expect(fieldDefaults(fields)).toEqual({ 'p': '' });
    });

    it('walks nested children to leaf paths', () => {
      expect(fieldDefaults(POSE_FIELDS)).toEqual({ 'position.x': '0', 'position.y': '0' });
    });
  });

  describe('coerceScalar', () => {
    it('coerces integer input', () => {
      expect(coerceScalar('1', 'int64')).toBe(1);
    });

    it('coerces float input', () => {
      expect(coerceScalar('1.5', 'float64')).toBe(1.5);
    });

    it('coerces bool input', () => {
      expect(coerceScalar('true', 'bool')).toBe(true);
    });

    it('rejects non-numeric input for numeric types', () => {
      expect(() => coerceScalar('abc', 'int32')).toThrow(/not a valid int32/);
    });

    it('keeps strings as strings', () => {
      expect(coerceScalar('hello', 'string')).toBe('hello');
    });
  });

  describe('parseArrayInput', () => {
    it('splits comma-separated numbers and coerces them', () => {
      expect(parseArrayInput('1, 2, 3', 'float64')).toEqual([1, 2, 3]);
    });

    it('honors backslash-escaped commas and removes the escape', () => {
      expect(parseArrayInput('a\\,b, c', 'string')).toEqual(['a,b', 'c']);
    });

    it('returns an empty array for empty input', () => {
      expect(parseArrayInput('', 'float64')).toEqual([]);
    });
  });

  describe('valuesToYaml', () => {
    it('renders string values single-quoted with escaping', () => {
      const yaml = valuesToYaml(STRING_DATA, { data: "it's" });

      expect(yaml).toBe("data: 'it''s'");
    });

    it('renders plain numbers and bools unquoted', () => {
      const fields: InterfaceField[] = [
        { name: 'count', type: 'int32', isArray: false },
        { name: 'flag', type: 'bool', isArray: false }
      ];

      expect(valuesToYaml(fields, { count: '7', flag: 'true' })).toBe('count: 7\nflag: true');
    });

    it('keeps float typing by rendering float values with a decimal point', () => {
      const fields: InterfaceField[] = [
        { name: 'x', type: 'float64', isArray: false },
        { name: 'n', type: 'int32', isArray: false }
      ];

      expect(valuesToYaml(fields, { x: '1', n: '2' })).toBe("x: 1.0\nn: 2");
    });

    it('renders nested fields in block style', () => {
      const yaml = valuesToYaml(POSE_FIELDS, { 'position.x': '1', 'position.y': '2.5' });

      expect(yaml).toBe('position:\n  x: 1.0\n  y: 2.5');
    });

    it('renders primitive arrays as flow lists', () => {
      const fields: InterfaceField[] = [{ name: 'values', type: 'float64', isArray: true }];

      expect(valuesToYaml(fields, { values: '1, 2, 3' })).toBe('values: [1.0, 2.0, 3.0]');
    });

    it('renders empty primitive array input as an empty list', () => {
      const fields: InterfaceField[] = [{ name: 'values', type: 'float64', isArray: true }];

      expect(valuesToYaml(fields, { values: '' })).toBe('values: []');
    });

    it('embeds non-primitive arrays from JSON free text', () => {
      const fields: InterfaceField[] = [
        { name: 'poses', type: 'Pose', isArray: true }
      ];

      expect(valuesToYaml(fields, { poses: '[{ "x": 1.0 }]' })).toBe('poses:\n  [{ "x": 1.0 }]');
    });

    it('embeds unresolved fields from JSON free text', () => {
      const fields: InterfaceField[] = [
        { name: 'header', type: 'std_msgs/Header', isArray: false, unresolved: true }
      ];

      expect(valuesToYaml(fields, { header: '{ "frame_id": "map" }' })).toBe('header:\n  { "frame_id": "map" }');
    });

    it('renders an empty message as an empty YAML mapping', () => {
      expect(valuesToYaml([], {})).toBe('{}');
    });
  });

  describe('valuesToJson', () => {
    it('builds a compact JSON object from scalar values', () => {
      const fields: InterfaceField[] = [
        { name: 'a', type: 'int64', isArray: false },
        { name: 'b', type: 'int64', isArray: false }
      ];

      expect(valuesToJson(fields, { a: '1', b: '2' })).toBe('{"a":1,"b":2}');
    });

    it('embeds unresolved fields from JSON free text', () => {
      const fields: InterfaceField[] = [
        { name: 'header', type: 'std_msgs/Header', isArray: false, unresolved: true }
      ];

      expect(valuesToJson(fields, { header: '{"frame_id":"map"}' })).toBe('{"header":{"frame_id":"map"}}');
    });
  });
});
