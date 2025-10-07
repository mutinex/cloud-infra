import * as pulumi from '@pulumi/pulumi';

/**
 * Utility class for detecting Pulumi reference types vs configuration objects.
 * Uses negative validation - detects references and treats everything else as config.
 */
export class PulumiTypeDetector {
  /**
   * Check if a value is a Pulumi Output
   */
  static isPulumiOutput(val: unknown): val is pulumi.Output<unknown> {
    return (
      val !== null &&
      typeof val === 'object' &&
      'apply' in val &&
      'isSecret' in val &&
      typeof (val as { apply?: unknown }).apply === 'function'
    );
  }

  /**
   * Check if a value is any form of Pulumi reference (string, Promise, Output, or arrays thereof)
   */
  static isReference(val: unknown): boolean {
    // Plain string reference
    if (typeof val === 'string') return true;

    // Promise reference
    if (val instanceof Promise) return true;

    // Pulumi Output reference
    if (this.isPulumiOutput(val)) return true;

    // Array of references - all elements must be references
    if (Array.isArray(val)) {
      return val.length > 0 && val.every(item => this.isReference(item));
    }

    return false;
  }

  /**
   * Check if a value is a configuration object (not a reference type)
   */
  static isConfigObject<T>(val: unknown): val is T {
    // Null/undefined are not config objects
    if (val === null || val === undefined) return false;

    // Not a reference type
    if (this.isReference(val)) return false;

    // Must be a plain object
    return (
      typeof val === 'object' &&
      !Array.isArray(val) &&
      !(val instanceof Promise) &&
      !(val instanceof Date) &&
      !(val instanceof RegExp)
    );
  }
}
