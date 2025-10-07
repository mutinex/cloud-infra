import {
  ResolvedPrincipal,
  UnsupportedPrincipalError,
} from '../types/common-types';
import {
  PrincipalResolver,
  StringPrincipalResolver,
  OutputPrincipalResolver,
  MatrixObjectPrincipalResolver,
  ResourcePrincipalResolver,
} from './principal-types';
import { AllPrincipalTypes, BulkResource } from '../types/matrix-types';
import { hasMethod } from '../../helpers';
import { accessMatrixConfig } from '../../../config';
import { CloudInfraLogger } from '../../logging';

/**
 * Factory for creating and managing principal resolvers
 */
export class PrincipalFactory {
  private static readonly resolvers = new Map<
    string,
    PrincipalResolver<unknown>
  >();
  private static readonly resolutionCache = new Map<
    string,
    ResolvedPrincipal
  >();
  private static initialized = false;

  /**
   * Initialize the factory with default resolvers
   */
  private static initialize(): void {
    if (this.initialized) {
      return;
    }

    this.register('string', new StringPrincipalResolver());
    this.register('output', new OutputPrincipalResolver());
    this.register('matrix-object', new MatrixObjectPrincipalResolver());
    this.register('resource', new ResourcePrincipalResolver());

    this.initialized = true;
  }

  /**
   * Register a principal resolver
   */
  static register(type: string, resolver: PrincipalResolver<unknown>): void {
    this.resolvers.set(type, resolver);
  }

  /**
   * Resolve a principal to its IAM member format and identifier
   * Uses caching to improve performance for repeated resolutions
   */
  static resolvePrincipal(
    principal: unknown,
    principalIndex: number
  ): ResolvedPrincipal {
    this.initialize();

    // Create cache key (simple string representation for basic caching)
    const cacheKey = this.createCacheKey(principal, principalIndex);

    // Check cache first for performance
    if (this.resolutionCache.has(cacheKey)) {
      const cached = this.resolutionCache.get(cacheKey)!;
      if (accessMatrixConfig.enableDetailedLogging) {
        CloudInfraLogger.info(
          `Using cached resolution for principal ${cacheKey}`,
          { component: 'access-matrix', operation: 'principal-resolution' }
        );
      }
      return cached;
    }

    const resolver = this.findResolver(principal);
    if (!resolver) {
      const principalType = typeof principal;
      const principalInfo =
        principal && typeof principal === 'object'
          ? JSON.stringify(principal).substring(0, 100)
          : String(principal);

      throw new UnsupportedPrincipalError(
        `Principal of type '${principalType}' is not supported. Principal info: ${principalInfo}`
      );
    }

    try {
      const resolved = resolver.resolve(principal, principalIndex);

      // Cache successful resolutions (with size limit to prevent memory leaks)
      if (this.resolutionCache.size < 1000) {
        this.resolutionCache.set(cacheKey, resolved);
      } else if (accessMatrixConfig.enableDetailedLogging) {
        CloudInfraLogger.warn(
          'Resolution cache limit reached, skipping caching',
          { component: 'access-matrix', operation: 'principal-resolution' }
        );
      }

      return resolved;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new Error(
        `Failed to resolve principal at index ${principalIndex}: ${errorMessage}`
      );
    }
  }

  /**
   * Find the appropriate resolver for a principal
   */
  private static findResolver(
    principal: unknown
  ): PrincipalResolver<unknown> | undefined {
    const resolvers = Array.from(this.resolvers.values());
    for (const resolver of resolvers) {
      if (resolver.canResolve(principal)) {
        return resolver;
      }
    }
    return undefined;
  }

  /**
   * Check if a principal type is supported
   */
  static isSupported(principal: unknown): boolean {
    this.initialize();
    return this.findResolver(principal) !== undefined;
  }

  /**
   * Get all registered resolver types
   */
  static getRegisteredTypes(): string[] {
    this.initialize();
    return Array.from(this.resolvers.keys());
  }

  /**
   * Clear all resolvers and caches (useful for testing)
   */
  static clear(): void {
    this.resolvers.clear();
    this.resolutionCache.clear();
    this.initialized = false;
  }

  /**
   * Clear only the resolution cache (useful for memory management)
   */
  static clearCache(): void {
    this.resolutionCache.clear();
    if (accessMatrixConfig.enableDetailedLogging) {
      CloudInfraLogger.info('Resolution cache cleared', {
        component: 'access-matrix',
        operation: 'cache-management',
      });
    }
  }

  /**
   * Create a cache key for a principal
   */
  private static createCacheKey(
    principal: unknown,
    principalIndex: number
  ): string {
    if (typeof principal === 'string') {
      return `str:${principal}:${principalIndex}`;
    }

    if (principal && typeof principal === 'object') {
      const objString = JSON.stringify(principal);
      const hash = this.simpleHash(objString);
      return `obj:${hash}:${principalIndex}`;
    }

    return `${typeof principal}:${String(principal)}:${principalIndex}`;
  }

  /**
   * A function for creating cache keys
   * Uses a basic string hashing algorithm to create a unique identifier
   */
  private static simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Convert to hex string and ensure it's positive
    return Math.abs(hash).toString(36);
  }

  /**
   * Expand principals that might contain multiple accounts (like CloudInfraBulkAccount)
   */
  static expandPrincipals(
    principals: AllPrincipalTypes | AllPrincipalTypes[] | unknown
  ): unknown[] {
    const principalArray = Array.isArray(principals)
      ? principals
      : [principals];

    return principalArray.flatMap(principal => {
      if (principal === undefined || principal === null) {
        return [];
      }

      // Handle CloudInfraBulkAccount or similar objects with getAccounts method
      if (hasMethod(principal, 'getAccounts')) {
        return Object.values((principal as BulkResource).getAccounts());
      }

      return [principal];
    });
  }

  /**
   * Deduplicate principals based on their resolved member strings
   */
  static deduplicate(principals: unknown[]): unknown[] {
    const seen = new Set<unknown>();
    return principals.filter(principal => {
      const key = typeof principal === 'string' ? principal : principal;
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
  }

  /**
   * Process and resolve multiple principals
   */
  static resolveMultiplePrincipals(
    principals: unknown[],
    startIndex: number = 0
  ): ResolvedPrincipal[] {
    const expanded = this.expandPrincipals(principals);
    const deduplicated = this.deduplicate(expanded);

    return deduplicated.map((principal, index) =>
      this.resolvePrincipal(principal, startIndex + index)
    );
  }
}
