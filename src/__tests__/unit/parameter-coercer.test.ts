import { ParameterCoercer } from '../../wizard/build-file-patcher';

describe('ParameterCoercer', () => {
  describe('inferType', () => {
    it('returns "unspecified" for undefined', () => {
      expect(ParameterCoercer.inferType(undefined)).toBe('unspecified');
    });

    it('returns "bool" for true/false', () => {
      expect(ParameterCoercer.inferType('true')).toBe('bool');
      expect(ParameterCoercer.inferType('false')).toBe('bool');
    });

    it('returns "int" for integer strings', () => {
      expect(ParameterCoercer.inferType('42')).toBe('int');
      expect(ParameterCoercer.inferType('-7')).toBe('int');
    });

    it('returns "double" for float strings', () => {
      expect(ParameterCoercer.inferType('3.14')).toBe('double');
      expect(ParameterCoercer.inferType('-0.5')).toBe('double');
    });

    it('returns "string" for quoted strings', () => {
      expect(ParameterCoercer.inferType("'hello'")).toBe('string');
      expect(ParameterCoercer.inferType('"world"')).toBe('string');
    });

    it('returns "array" for bracket-starting strings', () => {
      expect(ParameterCoercer.inferType('[1, 2, 3]')).toBe('array');
    });

    it('returns "string" as fallback', () => {
      expect(ParameterCoercer.inferType('hello')).toBe('string');
    });
  });

  describe('parse', () => {
    it('parses boolean values', () => {
      expect(ParameterCoercer.parse('true', 'bool')).toBe(true);
      expect(ParameterCoercer.parse('false', 'bool')).toBe(false);
      expect(ParameterCoercer.parse('True', 'boolean')).toBe(true);
    });

    it('parses integer values', () => {
      expect(ParameterCoercer.parse('42', 'int')).toBe(42);
      expect(ParameterCoercer.parse('-7', 'integer')).toBe(-7);
    });

    it('returns string for NaN integer', () => {
      expect(ParameterCoercer.parse('abc', 'int')).toBe('abc');
    });

    it('parses float values', () => {
      expect(ParameterCoercer.parse('3.14', 'float')).toBe(3.14);
      expect(ParameterCoercer.parse('-0.5', 'double')).toBe(-0.5);
    });

    it('parses arrays via JSON', () => {
      expect(ParameterCoercer.parse('[1, 2, 3]', 'array')).toEqual([1, 2, 3]);
    });

    it('parses arrays via comma split on JSON failure', () => {
      expect(ParameterCoercer.parse('a, b, c', 'array')).toEqual(['a', 'b', 'c']);
    });

    it('returns raw string for unknown type', () => {
      expect(ParameterCoercer.parse('hello', undefined)).toBe('hello');
    });
  });

  describe('formatPython', () => {
    it('formats booleans as Python True/False', () => {
      expect(ParameterCoercer.formatPython(true)).toBe('True');
      expect(ParameterCoercer.formatPython(false)).toBe('False');
    });

    it('formats numbers as-is', () => {
      expect(ParameterCoercer.formatPython(42)).toBe('42');
      expect(ParameterCoercer.formatPython(3.14)).toBe('3.14');
    });

    it('formats numeric strings without quotes', () => {
      expect(ParameterCoercer.formatPython('42')).toBe('42');
      expect(ParameterCoercer.formatPython('3.14')).toBe('3.14');
    });

    it('formats strings with single quotes', () => {
      expect(ParameterCoercer.formatPython('hello')).toBe("'hello'");
    });

    it('escapes single quotes in strings', () => {
      expect(ParameterCoercer.formatPython("it's")).toBe("'it\\'s'");
    });

    it('formats arrays', () => {
      expect(ParameterCoercer.formatPython([1, 'two', true])).toBe("[1, 'two', True]");
    });

    it('formats nested arrays', () => {
      expect(ParameterCoercer.formatPython([1, [2, 3]])).toBe('[1, [2, 3]]');
    });
  });
});
