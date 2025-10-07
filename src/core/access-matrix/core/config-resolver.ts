import * as pulumi from '@pulumi/pulumi';
import { z } from 'zod';
import {
  MatrixPrincipalInput,
  MatrixPrincipalSchema,
} from '../types/matrix-types';
import { AccessMatrixConfig } from '../types/common-types';
import { accessMatrixConfig } from '../../../config';
import { CloudInfraLogger } from '../../logging';

/**
 * @public
 * Resolves configuration for access matrix cases from Pulumi config.
 *
 * This class reads the `cloudInfra.accessMatrix` configuration object from the
 * Pulumi stack configuration. It is responsible for retrieving, validating,
 * and parsing the principal configurations for each access matrix case.
 *
 * The configuration is expected to be a map where keys are case names and
 * values are arrays of principals.
 *
 * Handles validation and parsing of principal configurations.
 */
export class ConfigResolver {
  private readonly matrixConfigRoot: Record<string, unknown[]>;

  /**
   * Creates an instance of ConfigResolver.
   * Reads the `accessMatrix` object from the `cloudInfra` Pulumi configuration.
   */
  constructor() {
    const cfg = new pulumi.Config('cloudInfra');
    this.matrixConfigRoot =
      cfg.getObject<Record<string, unknown[]>>('accessMatrix') ?? {};
  }

  /**
   * Resolve configuration for a specific case.
   *
   * @param caseName - Name of the case to resolve configuration for
   * @returns Resolved configuration with validated principals
   */
  resolveConfig(caseName: string): AccessMatrixConfig {
    const principals = this.getPrincipalsFromConfig(caseName);

    return {
      principals,
    };
  }

  /**
   * Get principals from configuration for a specific case.
   *
   * @param caseName - Name of the case
   * @returns Array of validated principals
   */
  private getPrincipalsFromConfig(caseName: string): MatrixPrincipalInput[] {
    const rawPrincipals = this.matrixConfigRoot[caseName] ?? [];

    if (!Array.isArray(rawPrincipals)) {
      if (
        accessMatrixConfig.enableDetailedLogging &&
        rawPrincipals !== undefined
      ) {
        CloudInfraLogger.warn(
          `Expected array of principals for case '${caseName}', got ${typeof rawPrincipals}. Skipping configuration.`,
          { component: 'access-matrix', operation: 'config-resolution' }
        );
      }
      return [];
    }

    // Performance warning for large numbers of configured principals
    if (rawPrincipals.length > accessMatrixConfig.maxPrincipalsThreshold) {
      CloudInfraLogger.warn(
        `Case '${caseName}' has ${rawPrincipals.length} configured principals. This may impact performance.`,
        { component: 'access-matrix', operation: 'config-resolution' }
      );
    }

    try {
      const validatedPrincipals = z
        .array(MatrixPrincipalSchema)
        .parse(rawPrincipals);

      if (
        accessMatrixConfig.enableDetailedLogging &&
        validatedPrincipals.length > 0
      ) {
        CloudInfraLogger.info(
          `Successfully validated ${validatedPrincipals.length} principals for case '${caseName}'`,
          { component: 'access-matrix', operation: 'config-resolution' }
        );
      }

      return validatedPrincipals;
    } catch (error) {
      const errorDetails =
        error instanceof z.ZodError
          ? error.errors
              .map(e => `${e.path.join('.')}: ${e.message}`)
              .join('; ')
          : String(error);

      CloudInfraLogger.warn(
        `Invalid principal configuration for case '${caseName}': ${errorDetails}. Using empty principal list.`,
        { component: 'access-matrix', operation: 'config-resolution' }
      );
      return [];
    }
  }

  /**
   * Check if configuration exists for a case.
   *
   * @param caseName - Name of the case to check
   * @returns True if configuration exists
   */
  hasConfig(caseName: string): boolean {
    return caseName in this.matrixConfigRoot;
  }

  /**
   * Get all configured case names.
   *
   * @returns Array of case names that have configuration
   */
  getConfiguredCases(): string[] {
    return Object.keys(this.matrixConfigRoot);
  }

  /**
   * Get raw configuration for debugging.
   *
   * @returns Raw configuration object
   */
  getRawConfig(): Record<string, unknown[]> {
    return { ...this.matrixConfigRoot };
  }
}
