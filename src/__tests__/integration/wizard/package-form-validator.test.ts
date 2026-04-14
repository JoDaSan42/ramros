import { PackageFormValidator } from '../../../wizard/package-form-validator';

describe('PackageFormValidator', () => {
  let validator: PackageFormValidator;

  beforeEach(() => {
    validator = new PackageFormValidator();
  });

  describe('validatePackageName', () => {
    it('should accept valid package names', () => {
      const result = validator.validatePackageName('my_package', []);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty package names', () => {
      const result = validator.validatePackageName('', []);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Package name is required');
    });

    it('should reject names shorter than 3 characters', () => {
      const result = validator.validatePackageName('ab', []);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Package name must be at least 3 characters long');
    });

    it('should reject names starting with uppercase', () => {
      const result = validator.validatePackageName('MyPackage', []);
      expect(result.isValid).toBe(false);
    });

    it('should reject names with invalid characters', () => {
      const result = validator.validatePackageName('my@package', []);
      expect(result.isValid).toBe(false);
    });

    it('should reject reserved names', () => {
      const result = validator.validatePackageName('src', []);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Package name 'src' is reserved");
    });

    it('should reject duplicate package names', () => {
      const result = validator.validatePackageName('existing_pkg', ['existing_pkg', 'other']);
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain("Package 'existing_pkg' already exists in workspace");
    });
  });

  describe('validateEmail', () => {
    it('should accept valid email addresses', () => {
      const result = validator.validateEmail('test@example.com');
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      const result = validator.validateEmail('invalid-email');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Invalid email format');
    });

    it('should reject empty email', () => {
      const result = validator.validateEmail('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Author email is required');
    });
  });

  describe('validateAuthorName', () => {
    it('should accept valid author names', () => {
      const result = validator.validateAuthorName('John Doe');
      expect(result.isValid).toBe(true);
    });

    it('should reject empty author names', () => {
      const result = validator.validateAuthorName('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Author name is required');
    });
  });

  describe('validateDescription', () => {
    it('should accept valid descriptions', () => {
      const result = validator.validateDescription('A test package');
      expect(result.isValid).toBe(true);
    });

    it('should reject empty descriptions', () => {
      const result = validator.validateDescription('');
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('Package description is required');
    });
  });

  describe('validateNodeName', () => {
    it('should accept valid node names', () => {
      const result = validator.validateNodeName('my_node');
      expect(result.isValid).toBe(true);
    });

    it('should accept empty node names (optional)', () => {
      const result = validator.validateNodeName('');
      expect(result.isValid).toBe(true);
    });

    it('should reject invalid node names', () => {
      const result = validator.validateNodeName('MyNode');
      expect(result.isValid).toBe(false);
    });
  });

  describe('validateFullForm', () => {
    it('should validate all fields together', () => {
      const result = validator.validateFullForm(
        'my_package',
        'John Doe',
        'john@example.com',
        'Test package',
        []
      );
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should collect multiple errors', () => {
      const result = validator.validateFullForm(
        '',
        '',
        'invalid',
        '',
        []
      );
      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(2);
    });

    it('should validate node name when provided', () => {
      const result = validator.validateFullForm(
        'my_package',
        'John Doe',
        'john@example.com',
        'Test package',
        [],
        'InvalidNode'
      );
      expect(result.isValid).toBe(false);
    });
  });
});
