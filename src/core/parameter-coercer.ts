export type ParameterValue = boolean | number | string | ParameterValue[];

export class ParameterCoercer {
  static inferType(defaultValue: string | undefined): string {
    if (!defaultValue) return 'unspecified';
    const trimmed = defaultValue.trim();
    if (trimmed === 'true' || trimmed === 'false') return 'bool';
    if (/^-?\d+$/.test(trimmed)) return 'int';
    if (/^-?\d+\.\d+$/.test(trimmed)) return 'double';
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

  static formatPython(value: ParameterValue): string {
    if (typeof value === 'boolean') {
      return value ? 'True' : 'False';
    }
    if (typeof value === 'number') {
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
