export abstract class CloudInfraError extends Error {
  public readonly component: string;
  public readonly operation?: string;
  public readonly cause?: Error;

  constructor(
    message: string,
    component: string,
    operation?: string,
    cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    this.component = component;
    this.operation = operation;
    this.cause = cause;
  }
}

/**
 * Error thrown when configuration validation fails.
 * Used to distinguish user input errors from infrastructure errors.
 */
export class ValidationError extends CloudInfraError {
  constructor(
    message: string,
    component?: string,
    operation?: string,
    cause?: Error
  ) {
    super(message, component ?? 'unknown', operation, cause);
  }
}

/**
 * Error thrown when resource creation or manipulation fails.
 * Used for Pulumi and cloud provider errors.
 */
export class ResourceError extends CloudInfraError {
  constructor(
    message: string,
    component?: string,
    operation?: string,
    cause?: Error
  ) {
    super(message, component ?? 'unknown', operation, cause);
  }
}

/**
 * Error thrown when configuration is invalid or missing.
 * Used for missing required parameters or invalid combinations.
 */
export class ConfigurationError extends CloudInfraError {}
