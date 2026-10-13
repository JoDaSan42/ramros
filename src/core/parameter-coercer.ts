export type ParameterValue = boolean | number | string | ParameterValue[];

export class ParameterCoercer {
  static validate(value: string, type?: string): string | undefined {
    if (!type || type === 'unspecified') return undefined;
    const lowerType = type.toLowerCase();
    const trimmed = value.trim();

    const arrayMatch = lowerType.match(/^(int|integer|float|double|string|bool|boolean)\[\]$/);
    if (arrayMatch) {
      const baseType = arrayMatch[1];
      const items = trimmed.split(',').map(s => s.trim());
      for (const item of items) {
        const itemError = this.validateItem(item, baseType);
        if (itemError) {
          if (itemError === 'Value must be an integer') return 'All values must be integers';
          if (itemError === 'Value must be a float (e.g. 1.0)') return 'All values must be floats (e.g. 1.0)';
          if (itemError === 'Value must be true or false') return 'All values must be true or false';
          return 'All values must be provided';
        }
      }
      return undefined;
    }

    if (lowerType === 'array' || lowerType === 'list') {
      if (trimmed.startsWith('[')) {
        try {
          JSON.parse(trimmed);
          return undefined;
        } catch {
          return 'Value must be a valid array';
        }
      }
      if (trimmed.length === 0 || /[[\]]/.test(trimmed)) {
        return 'Value must be a valid array';
      }
      return trimmed.split(',').every(s => s.trim().length > 0) ? undefined : 'Value must be a valid array';
    }

    return this.validateItem(trimmed, lowerType);
  }

  private static validateItem(value: string, lowerType: string): string | undefined {
    switch (lowerType) {
      case 'int':
      case 'integer':
        if (!/^-?\d+$/.test(value)) return 'Value must be an integer';
        return undefined;
      case 'float':
      case 'double':
        if (!/^-?(\d+\.\d*|\.\d+)$/.test(value)) return 'Value must be a float (e.g. 1.0)';
        return undefined;
      case 'bool':
      case 'boolean':
        if (value.toLowerCase() !== 'true' && value.toLowerCase() !== 'false') return 'Value must be true or false';
        return undefined;
      case 'string':
        if (value.length === 0) return 'Value must not be empty';
        return undefined;
      default:
        return undefined;
    }
  }

  static inferType(defaultValue: string | undefined): string {
    if (!defaultValue) return 'unspecified';
    const trimmed = defaultValue.trim();
    const lower = trimmed.toLowerCase();
    if (lower === 'true' || lower === 'false') return 'bool';
    const cppNumeric = trimmed.replace(/[fFuUlL]$/, '');
    if (/^-?\d+$/.test(cppNumeric)) return 'int';
    if (/^-?(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?$/.test(cppNumeric)) return 'double';
    if (trimmed.startsWith("'") || trimmed.startsWith('"')) return 'string';
    if (trimmed.startsWith('[')) return 'array';
    return 'string';
  }

  static parse(value: string, type?: string): ParameterValue {
    const lowerType = type?.toLowerCase();
    if (lowerType === 'bool' || lowerType === 'boolean') {
      return value.toLowerCase() === 'true';
    }
    if (lowerType === 'int' || lowerType === 'integer') {
      const parsed = parseInt(value, 10);
      return isNaN(parsed) ? value : parsed;
    }
    if (lowerType === 'float' || lowerType === 'double') {
      const parsed = parseFloat(value);
      return isNaN(parsed) ? value : parsed;
    }
    if (lowerType === 'array' || lowerType === 'list' || value.startsWith('[')) {
      try {
        return JSON.parse(value) as ParameterValue;
      } catch {
        return value.split(',').map(s => s.trim());
      }
    }
    return value;
  }

  static formatPython(value: ParameterValue, type?: string): string {
    const lowerType = type?.toLowerCase();
    if (typeof value === 'boolean') {
      return value ? 'True' : 'False';
    }
    if (typeof value === 'number') {
      if ((lowerType === 'float' || lowerType === 'double') && Number.isInteger(value)) {
        return `${value}.0`;
      }
      return value.toString();
    }
    if (typeof value === 'string') {
      if (/^-?\d+(\.\d+)?$/.test(value)) {
        return value;
      }
      return `'${value.replace(/'/g, "\\'")}'`;
    }
    if (Array.isArray(value)) {
      const items = value.map(v => ParameterCoercer.formatPython(v)).join(', ');
      return `[${items}]`;
    }
    return `'${String(value).replace(/'/g, "\\'")}'`;
  }
}
