export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

export class PackageFormValidator {
  private readonly packageNameRegex = /^[a-z][a-z0-9_-]*$/;
  private readonly emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  private readonly reservedNames = ['src', 'build', 'install', 'launch', 'test'];

  validatePackageName(name: string, existingPackages: string[]): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!name) {
      result.errors.push('Package name is required');
      result.isValid = false;
    } else {
      if (name.length < 3) {
        result.errors.push('Package name must be at least 3 characters long');
        result.isValid = false;
      }

      if (name.length > 50) {
        result.errors.push('Package name must not exceed 50 characters');
        result.isValid = false;
      }

      if (!this.packageNameRegex.test(name)) {
        result.errors.push(
          'Package name must start with a lowercase letter and contain only lowercase letters, numbers, underscores, and hyphens'
        );
        result.isValid = false;
      }

      if (this.reservedNames.includes(name)) {
        result.errors.push(`Package name '${name}' is reserved`);
        result.isValid = false;
      }

      if (existingPackages.includes(name)) {
        result.errors.push(`Package '${name}' already exists in workspace`);
        result.isValid = false;
      }
    }

    return result;
  }

  validateEmail(email: string): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!email) {
      result.errors.push('Author email is required');
      result.isValid = false;
    } else if (!this.emailRegex.test(email)) {
      result.errors.push('Invalid email format');
      result.isValid = false;
    }

    return result;
  }

  validateAuthorName(name: string): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!name || name.trim().length === 0) {
      result.errors.push('Author name is required');
      result.isValid = false;
    }

    return result;
  }

  validateDescription(description: string): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (!description || description.trim().length === 0) {
      result.errors.push('Package description is required');
      result.isValid = false;
    }

    return result;
  }

  validateNodeName(name: string): ValidationResult {
    const result: ValidationResult = { isValid: true, errors: [], warnings: [] };

    if (name && !this.packageNameRegex.test(name)) {
      result.errors.push(
        'Node name must start with a lowercase letter and contain only lowercase letters, numbers, underscores, and hyphens'
      );
      result.isValid = false;
    }

    return result;
  }

  validateFullForm(
    packageName: string,
    authorName: string,
    authorEmail: string,
    description: string,
    existingPackages: string[],
    nodeName?: string
  ): ValidationResult {
    const results = [
      this.validatePackageName(packageName, existingPackages),
      this.validateAuthorName(authorName),
      this.validateEmail(authorEmail),
      this.validateDescription(description),
    ];

    if (nodeName) {
      results.push(this.validateNodeName(nodeName));
    }

    const combined: ValidationResult = {
      isValid: results.every(r => r.isValid),
      errors: results.flatMap(r => r.errors),
      warnings: results.flatMap(r => r.warnings),
    };

    return combined;
  }
}
