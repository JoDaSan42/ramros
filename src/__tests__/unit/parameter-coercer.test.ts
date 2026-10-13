import { ParameterCoercer } from '../../core/parameter-coercer';

describe('ParameterCoercer', () => {
  describe('inferType', () => {
    it('returns "unspecified" for undefined', () => {
      expect(ParameterCoercer.inferType(undefined)).toBe('unspecified');
    });

    it('returns "bool" for true/false', () => {
      expect(ParameterCoercer.inferType('true')).toBe('bool');
      expect(ParameterCoercer.inferType('false')).toBe('bool');
    });

    it('returns "bool" for Python-style True/False', () => {
      expect(ParameterCoercer.inferType('True')).toBe('bool');
      expect(ParameterCoercer.inferType('False')).toBe('bool');
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

    it('returns "double" for exponent notation', () => {
      expect(ParameterCoercer.inferType('1e-3')).toBe('double');
      expect(ParameterCoercer.inferType('-2.5e2')).toBe('double');
      expect(ParameterCoercer.inferType('3.14E+2')).toBe('double');
    });

    it('returns "double" for floats with f suffix', () => {
      expect(ParameterCoercer.inferType('0.5f')).toBe('double');
      expect(ParameterCoercer.inferType('1.0F')).toBe('double');
    });

    it('returns "int" for integers with l suffix', () => {
      expect(ParameterCoercer.inferType('10L')).toBe('int');
      expect(ParameterCoercer.inferType('-3l')).toBe('int');
    });

    it('returns "int" for unsigned suffixes', () => {
      expect(ParameterCoercer.inferType('42u')).toBe('int');
      expect(ParameterCoercer.inferType('42U')).toBe('int');
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

    it('serializes a double parameter as a float literal even for whole numbers', () => {
      expect(ParameterCoercer.parse('1.0', 'double')).toBe(1.0);
      expect(ParameterCoercer.formatPython(ParameterCoercer.parse('1.0', 'double'), 'double')).toBe('1.0');
      expect(ParameterCoercer.formatPython(ParameterCoercer.parse('42', 'int'), 'int')).toBe('42');
      expect(ParameterCoercer.formatPython(ParameterCoercer.parse('2.5', 'double'), 'double')).toBe('2.5');
    });

    it('serializes an int parameter as an integer literal', () => {
      expect(ParameterCoercer.parse('42', 'int')).toBe(42);
      expect(ParameterCoercer.formatPython(ParameterCoercer.parse('42', 'int'))).toBe('42');
    });

    it('parses arrays via JSON', () => {
      expect(ParameterCoercer.parse('[1, 2, 3]', 'array')).toEqual([1, 2, 3]);
    });

    it('returns an error for non-integer input when type is int', () => {
      expect(ParameterCoercer.validate('abc', 'int')).toBe('Value must be an integer');
    });

    it('accepts a valid integer when type is int', () => {
      expect(ParameterCoercer.validate('42', 'int')).toBeUndefined();
      expect(ParameterCoercer.validate('-7', 'integer')).toBeUndefined();
    });

    it('rejects a decimal value when type is int', () => {
      expect(ParameterCoercer.validate('1.0', 'int')).toBe('Value must be an integer');
      expect(ParameterCoercer.validate('2.5', 'int')).toBe('Value must be an integer');
    });

    it('rejects an integer value when type is double', () => {
      expect(ParameterCoercer.validate('1', 'double')).toBe('Value must be a float (e.g. 1.0)');
      expect(ParameterCoercer.validate('42', 'float')).toBe('Value must be a float (e.g. 1.0)');
    });

    it('accepts a decimal value when type is double', () => {
      expect(ParameterCoercer.validate('1.0', 'double')).toBeUndefined();
      expect(ParameterCoercer.validate('-0.5', 'float')).toBeUndefined();
    });

    it('returns an error for non-number input when type is float/double', () => {
      expect(ParameterCoercer.validate('abc', 'float')).toBe('Value must be a float (e.g. 1.0)');
      expect(ParameterCoercer.validate('abc', 'double')).toBe('Value must be a float (e.g. 1.0)');
    });

    it('accepts a valid number when type is float/double', () => {
      expect(ParameterCoercer.validate('3.14', 'float')).toBeUndefined();
      expect(ParameterCoercer.validate('-0.5', 'double')).toBeUndefined();
    });

    it('rejects invalid booleans when type is bool', () => {
      expect(ParameterCoercer.validate('yes', 'bool')).toBe('Value must be true or false');
    });

    it('accepts booleans case-insensitively', () => {
      expect(ParameterCoercer.validate('True', 'bool')).toBeUndefined();
      expect(ParameterCoercer.validate('FALSE', 'bool')).toBeUndefined();
    });

    it('rejects empty input for string type', () => {
      expect(ParameterCoercer.validate('', 'string')).toBe('Value must not be empty');
    });

    it('accepts any non-empty string', () => {
      expect(ParameterCoercer.validate('hello world', 'string')).toBeUndefined();
    });

    it('rejects malformed arrays', () => {
      expect(ParameterCoercer.validate('not,valid,json,[', 'array')).toBe('Value must be a valid array');
    });

    it('accepts valid JSON arrays and comma lists', () => {
      expect(ParameterCoercer.validate('[1, 2, 3]', 'array')).toBeUndefined();
      expect(ParameterCoercer.validate('1, 2, 3', 'array')).toBeUndefined();
    });

    it('accepts integer arrays when type is int[]', () => {
      expect(ParameterCoercer.validate('1, 2, 3', 'int[]')).toBeUndefined();
    });

    it('rejects non-integer items in int arrays', () => {
      expect(ParameterCoercer.validate('1, abc, 3', 'int[]')).toBe('All values must be integers');
    });

    it('accepts double arrays when type is double[]', () => {
      expect(ParameterCoercer.validate('1.5, 2.0', 'double[]')).toBeUndefined();
    });

    it('rejects non-number items in double arrays', () => {
      expect(ParameterCoercer.validate('1.5, abc', 'double[]')).toBe('All values must be floats (e.g. 1.0)');
    });

    it('rejects integer items in double arrays', () => {
      expect(ParameterCoercer.validate('1.5, 2', 'double[]')).toBe('All values must be floats (e.g. 1.0)');
    });

    it('accepts float items in double arrays', () => {
      expect(ParameterCoercer.validate('1.5, 2.0', 'double[]')).toBeUndefined();
    });

    it('rejects float items in int arrays', () => {
      expect(ParameterCoercer.validate('1, 2.5', 'int[]')).toBe('All values must be integers');
    });

    it('accepts any value when type is unspecified', () => {
      expect(ParameterCoercer.validate('anything', 'unspecified')).toBeUndefined();
      expect(ParameterCoercer.validate('anything', undefined)).toBeUndefined();
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
