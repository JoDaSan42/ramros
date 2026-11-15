/**
 * Builds the `--ros-args` suffix for `ros2 run` invocations from collected
 * wizard options: parameters first, then remaps, then the node rename
 * (`__node`) last. Values are shell-safe formatted per parameter type.
 */

export interface RunParameter {
  name: string;
  value: string;
  type?: string;
}

export interface RunRemap {
  from: string;
  to: string;
}

export interface RunOptions {
  parameters: RunParameter[];
  remaps: RunRemap[];
  nodeName?: string;
}

export class RunArgsBuilder {
  static build(options: RunOptions): string {
    const parts: string[] = [];

    for (const param of options.parameters) {
      parts.push(`-p ${param.name}:=${formatParamValue(param.value, param.type)}`);
    }

    for (const remap of options.remaps) {
      parts.push(`-r ${remap.from}:=${remap.to}`);
    }

    if (options.nodeName) {
      parts.push(`-r __node:=${options.nodeName}`);
    }

    return parts.length > 0 ? `--ros-args ${parts.join(' ')}` : '';
  }
}

/**
 * Formats a parameter value for a `:=` assignment:
 * - bool: raw true/false
 * - int/float: raw number when parseable, otherwise quoted string
 * - arrays: items formatted individually, comma-joined in brackets
 * - string / unspecified: single-quoted (shell-safe, escaped)
 */
export function formatParamValue(value: string, type?: string): string {
  const lowerType = type?.toLowerCase();

  if (lowerType && lowerType.endsWith('[]')) {
    const baseType = lowerType.slice(0, -2);
    const items = splitArrayItems(value);
    return `[${items.map(item => formatParamValue(item, baseType)).join(',')}]`;
  }

  if (lowerType === 'bool' || lowerType === 'boolean') {
    return value.trim().toLowerCase() === 'true' ? 'true' : 'false';
  }

  if (lowerType === 'int' || lowerType === 'integer') {
    const parsed = Number(value.trim());
    if (!Number.isNaN(parsed)) {
      return String(parsed);
    }
    return shellSingleQuote(value);
  }

  if (lowerType === 'float' || lowerType === 'double') {
    // Keep float literals float-shaped: "1.0" must not collapse to "1".
    const trimmed = value.trim();
    if (trimmed !== '' && !Number.isNaN(Number(trimmed)) && /[.eE]/.test(trimmed) || /^-?\d+$/.test(trimmed) === false && !Number.isNaN(Number(trimmed))) {
      return trimmed;
    }
    return shellSingleQuote(value);
  }

  return shellSingleQuote(value);
}

function splitArrayItems(value: string): string[] {
  const trimmed = value.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (trimmed.length === 0) {
    return [];
  }
  return trimmed.split(',').map(item => item.trim());
}

function shellSingleQuote(s: string): string {
  return "'" + s.replace(/'/g, "'\\''") + "'";
}
