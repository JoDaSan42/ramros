/**
 * Parses `ros2 interface show` output into a field-tree model for the
 * structured message input.
 *
 * Pure module: no vscode import. Two output shapes are supported:
 * - Flat: every field on its own line at column 0; nested message fields
 *   appear as a bare `pkg/type name` line (their definition is loaded
 *   recursively by the interface loader).
 * - Inline-expanded (newer distros): nested fields are indented below their
 *   parent with a leading tab (or a run of 2+ spaces per level).
 */

export interface InterfaceField {
  /** Field name inside the message. */
  name: string;
  /** Base type without array suffix. */
  type: string;
  isArray: boolean;
  /** Fixed array length; undefined for free-length arrays and scalars. */
  arrayLength?: number;
  /** Parsed nested fields of a non-primitive field (inline-expanded output). */
  children?: InterfaceField[];
  /** Loader marks sub-trees whose type could not be resolved → raw JSON/YAML input. */
  unresolved?: boolean;
}

export interface InterfaceStructure {
  typeName: string;
  fields: InterfaceField[];
}

const PRIMITIVE_TYPES = new Set([
  'bool', 'byte', 'char',
  'int8', 'int16', 'int32', 'int64',
  'uint8', 'uint16', 'uint32', 'uint64',
  'float32', 'float64',
  'string', 'wstring'
]);

/** Bounded strings (`string<=10`) are primitives with a length annotation. */
export function isPrimitiveType(type: string): boolean {
  const bounded = /^(\w+?)<=\d+$/.exec(type);
  return PRIMITIVE_TYPES.has(bounded ? bounded[1] : type);
}

export interface ArraySuffix {
  baseType: string;
  isArray: boolean;
  arrayLength?: number;
}

export function splitArraySuffix(type: string): ArraySuffix {
  const match = /^(.+?)(\[\]|\[<=?\d+\]|\[\d+\])$/.exec(type);
  if (!match) {
    return { baseType: type, isArray: false };
  }
  const suffix = match[2];
  if (suffix === '[]') {
    return { baseType: match[1], isArray: true };
  }
  if (suffix.startsWith('[<')) {
    // Bounded arrays (`float64[<=5]`) have a maximum but no fixed length.
    return { baseType: match[1], isArray: true };
  }
  return { baseType: match[1], isArray: true, arrayLength: parseInt(suffix.slice(1, -1), 10) };
}

/** Matches constant definitions like `uint8 FOO=1` or `uint8 FOO = 1`. */
const CONSTANT_LINE = /^\s*\S+\s+[A-Z_][A-Z0-9_]*\s*=/;
const SECTION_SPLIT = /^---$/;

/** Indentation depth of a raw line: one tab or one 2-space run = one level. */
function indentDepth(line: string): number {
  let depth = 0;
  let index = 0;
  while (index < line.length) {
    if (line[index] === '\t') {
      depth += 1;
      index += 1;
    } else if (line[index] === ' ' && line[index + 1] === ' ') {
      depth += 1;
      index += 2;
    } else {
      break;
    }
  }
  return depth;
}

function parseFieldLine(content: string): InterfaceField | null {
  const trimmed = content.trim();
  // TYPE NAME [DEFAULT...]
  const match = /^(\S+)\s+(\S+)\s*(.*)$/.exec(trimmed);
  if (!match) {
    return null;
  }
  const { baseType, isArray, arrayLength } = splitArraySuffix(match[1]);
  return {
    name: match[2],
    type: baseType,
    isArray,
    ...(arrayLength !== undefined ? { arrayLength } : {})
  };
}

/**
 * Parses the request (service) / top-level (message) section of a
 * `ros2 interface show` output into a field tree.
 */
export function parseInterfaceDefinition(typeName: string, output: string): InterfaceStructure {
  const section = output.split(/^---\s*$/m)[0];
  const lines = section.split('\n');

  const fields: InterfaceField[] = [];
  // Stack of (depth, field) for building the nested tree from indentation.
  const stack: Array<{ depth: number; field: InterfaceField }> = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith('#')) {
      continue;
    }
    if (SECTION_SPLIT.test(trimmed)) {
      break;
    }
    if (CONSTANT_LINE.test(trimmed)) {
      continue;
    }

    const depth = indentDepth(line);
    const field = parseFieldLine(line.slice(line.length - line.trimStart().length));
    if (!field) {
      continue;
    }

    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) {
      stack.pop();
    }
    if (stack.length === 0) {
      fields.push(field);
    } else {
      const parent = stack[stack.length - 1].field;
      parent.children = parent.children ?? [];
      parent.children.push(field);
    }
    stack.push({ depth, field });
  }

  return { typeName, fields };
}
