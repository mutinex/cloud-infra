import { ZodType } from 'zod';

/**
 * Applies default values to a configuration object.
 * @param defaults An object containing the default values.
 * @param config The configuration object to apply defaults to.
 * @returns A new configuration object with defaults applied.
 */
export function applyDefaults<T>(defaults: T, config: Partial<T>): T {
  return { ...defaults, ...config } as T;
}

/**
 * Validates a configuration object against a Zod schema.
 * @param schema The Zod schema to validate against.
 * @param config The configuration object to validate.
 * @returns The validated configuration object.
 */
export function validateConfig<T>(schema: ZodType<T>, config: unknown): T {
  return schema.parse(config);
}
