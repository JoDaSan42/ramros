/**
 * Converts flat form values (path → raw string) into YAML (for
 * `ros2 topic pub`) or JSON (for `ros2 service call`), and provides the
 * default prefill per field.
 *
 * Path syntax: dotted names plus `[i]` indices — `pose.position.x`,
 * `points[0]`, `points[3]`.
 *
 * Pure module: no vscode import.
 */

import { InterfaceField, isPrimitiveType } from './interface-parser';

/** Fixed arrays up to this many elements render one input per element. */
const FIXED_ARRAY_INPUT_LIMIT = 16;

const INTEGER_TYPES = new Set([
  'byte', 'char',
  'int8', 'int16', 'int32', 'int64',
  'uint8', 'uint16', 'uint32', 'uint64'
]);

const FLOAT_TYPES = new Set(['float32', 'float64']);

function isNumericType(type: string): boolean {
  return INTEGER_TYPES.has(type) || FLOAT_TYPES.has(type);
}

/**
 * Builds the default prefill map for a form: scalars default to 0/false/'',
 * fixed arrays up to the input limit expand into per-element paths.
 */
export function fieldDefaults(fields: InterfaceField[]): Record<string, string> {
  const defaults: Record<string, string> = {};
  walkDefaults(fields, '', defaults);
  return defaults;
}

function walkDefaults(fields: InterfaceField[], prefix: string, out: Record<string, string>): void {
  for (const field of fields) {
    const path = prefix.length === 0 ? field.name : `${prefix}.${field.name}`;
    if (field.unresolved) {
      out[path] = '';
      continue;
    }
    if (!isPrimitiveType(field.type)) {
      if (field.children && field.children.length > 0) {
        walkDefaults(field.children, path, out);
      }
      continue;
    }
    if (field.isArray && field.arrayLength === undefined) {
      out[path] = '';
      continue;
    }
    if (field.isArray && field.arrayLength !== undefined) {
      if (field.arrayLength <= FIXED_ARRAY_INPUT_LIMIT) {
        for (let i = 0; i < field.arrayLength; i += 1) {
          out[`${path}[${i}]`] = defaultForType(field.type);
        }
      } else {
        out[path] = '';
      }
      continue;
    }
    out[path] = defaultForType(field.type);
  }
}

function defaultForType(type: string): string {
  if (type === 'bool') {
    return 'false';
  }
  if (isNumericType(type)) {
    return '0';
  }
  return '';
}

/**
 * Coerces a raw string input into a scalar for the given base type. Throws
 * a descriptive error for invalid numeric/bool input.
 */
export function coerceScalar(raw: string, type: string): string | number | boolean {
  if (type === 'bool') {
    const normalized = raw.trim().toLowerCase();
    if (normalized === 'true' || normalized === 'false') {
      return normalized === 'true';
    }
    throw new Error(`'${raw}' is not a valid bool`);
  }
  if (INTEGER_TYPES.has(type)) {
    if (!/^[+-]?\d+$/.test(raw.trim())) {
      throw new Error(`'${raw}' is not a valid ${type}`);
    }
    return parseInt(raw.trim(), 10);
  }
  if (FLOAT_TYPES.has(type)) {
    const value = Number(raw);
    if (raw.trim().length === 0 || Number.isNaN(value)) {
      throw new Error(`'${raw}' is not a valid ${type}`);
    }
    return value;
  }
  return raw;
}

/**
 * Splits a comma-separated array input into coerced values. Backslash
 * escapes a literal comma (`\,`); the escape is removed from the value.
 */
export function parseArrayInput(raw: string, type: string): Array<string | number | boolean> {
  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    return [];
  }
  const parts: string[] = [];
  let current = '';
  let escaped = false;
  for (const char of trimmed) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === ',') {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current.trim());
  return parts
    .filter(part => part.length > 0)
    .map(part => coerceScalar(part, type));
}

/** Parses a JSON free-text value; throws a descriptive error when invalid. */
export function parseJsonFreeText(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('Value must be valid JSON');
  }
}

/**
 * Serializes form values to a YAML document body (as consumed by
 * `ros2 topic pub`). Returns `'{}'` for messages without fields.
 */
export function valuesToYaml(fields: InterfaceField[], values: Record<string, string>): string {
  const body = yamlFields(fields, values, '', 0).trimEnd();
  return body.length === 0 ? '{}' : body;
}

function yamlFields(
  fields: InterfaceField[],
  values: Record<string, string>,
  prefix: string,
  depth: number
): string {
  const lines: string[] = [];
  const indent = '  '.repeat(depth);
  for (const field of fields) {
    const path = prefix.length === 0 ? field.name : `${prefix}.${field.name}`;
    if (field.unresolved || (!isPrimitiveType(field.type) && field.isArray)) {
      // JSON/YAML free text: embed verbatim under the key.
      const raw = (values[path] ?? '').trim();
      if (raw.length === 0) {
        lines.push(`${indent}${field.name}: []`);
      } else {
        lines.push(`${indent}${field.name}:`);
        for (const rawLine of raw.split('\n')) {
          lines.push(`${indent}  ${rawLine}`);
        }
      }
      continue;
    }
    if (!isPrimitiveType(field.type)) {
      const children = field.children ?? [];
      if (children.length === 0) {
        lines.push(`${indent}${field.name}: {}`);
      } else {
        lines.push(`${indent}${field.name}:`);
        lines.push(yamlFields(children, values, path, depth + 1).trimEnd());
      }
      continue;
    }
    if (field.isArray) {
      if (field.arrayLength !== undefined && field.arrayLength <= FIXED_ARRAY_INPUT_LIMIT) {
        const items: string[] = [];
        for (let i = 0; i < field.arrayLength; i += 1) {
          items.push(yamlScalar(values[`${path}[${i}]`] ?? '', field.type));
        }
        lines.push(`${indent}${field.name}: [${items.join(', ')}]`);
      } else {
        const items = parseArrayInput(values[path] ?? '', field.type).map(value => yamlCoerced(value, field.type));
        lines.push(`${indent}${field.name}: [${items.join(', ')}]`);
      }
      continue;
    }
    lines.push(`${indent}${field.name}: ${yamlScalar(values[path] ?? '', field.type)}`);
  }
  return lines.join('\n') + (lines.length > 0 ? '\n' : '');
}

function yamlScalar(raw: string, type: string): string {
  if (type === 'bool') {
    return coerceScalar(raw, type) ? 'true' : 'false';
  }
  if (INTEGER_TYPES.has(type)) {
    return String(coerceScalar(raw, type));
  }
  if (FLOAT_TYPES.has(type)) {
    return formatYamlFloat(Number(coerceScalar(raw, type)));
  }
  return `'${raw.replace(/'/g, "''")}'`;
}

function yamlCoerced(value: string | number | boolean, type: string): string {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return FLOAT_TYPES.has(type) ? formatYamlFloat(value) : String(value);
  }
  return `'${value.replace(/'/g, "''")}'`;
}

/**
 * Renders floats with a decimal point so YAML keeps the float type
 * (`1.0` instead of `1` for float64 fields).
 */
function formatYamlFloat(value: number): string {
  if (Number.isInteger(value)) {
    return value.toFixed(1);
  }
  return String(value);
}

/**
 * Serializes form values to a compact JSON string (as consumed by
 * `ros2 service call`).
 */
export function valuesToJson(fields: InterfaceField[], values: Record<string, string>): string {
  return jsonFields(fields, values, '');
}

function jsonFields(
  fields: InterfaceField[],
  values: Record<string, string>,
  prefix: string
): string {
  const parts: string[] = [];
  for (const field of fields) {
    const path = prefix.length === 0 ? field.name : `${prefix}.${field.name}`;
    parts.push(`${JSON.stringify(field.name)}:${jsonValue(field, values, path)}`);
  }
  return `{${parts.join(',')}}`;
}

function jsonValue(field: InterfaceField, values: Record<string, string>, path: string): string {
  if (field.unresolved || (!isPrimitiveType(field.type) && field.isArray)) {
    // Validated JSON free text: embed verbatim to preserve float typing.
    const raw = (values[path] ?? '').trim();
    parseJsonFreeText(raw.length === 0 ? '[]' : raw);
    return raw.length === 0 ? '[]' : raw;
  }
  if (!isPrimitiveType(field.type)) {
    return jsonFields(field.children ?? [], values, path);
  }
  if (field.isArray) {
    if (field.arrayLength !== undefined && field.arrayLength <= FIXED_ARRAY_INPUT_LIMIT) {
      const items: string[] = [];
      for (let i = 0; i < field.arrayLength; i += 1) {
        items.push(jsonScalar(values[`${path}[${i}]`] ?? '', field.type));
      }
      return `[${items.join(',')}]`;
    }
    const items = parseArrayInput(values[path] ?? '', field.type).map(value => jsonCoerced(value, field.type));
    return `[${items.join(',')}]`;
  }
  return jsonScalar(values[path] ?? '', field.type);
}

function jsonScalar(raw: string, type: string): string {
  if (type === 'bool') {
    return coerceScalar(raw, type) ? 'true' : 'false';
  }
  if (INTEGER_TYPES.has(type)) {
    return String(coerceScalar(raw, type));
  }
  if (FLOAT_TYPES.has(type)) {
    return formatJsonFloat(Number(coerceScalar(raw, type)));
  }
  return JSON.stringify(raw);
}

function jsonCoerced(value: string | number | boolean, type: string): string {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    return FLOAT_TYPES.has(type) ? formatJsonFloat(value) : String(value);
  }
  return JSON.stringify(value);
}

function formatJsonFloat(value: number): string {
  if (Number.isInteger(value)) {
    return value.toFixed(1);
  }
  return String(value);
}
