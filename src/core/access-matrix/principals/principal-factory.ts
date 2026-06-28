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

/**
 * Fixed, ordered list of principal resolvers tried in sequence.
 *
 * ORDER IS LOAD-BEARING — string → output → matrix-object → resource.
 * `findResolver` returns the FIRST resolver whose `canResolve` matches; for an
 * ambiguous principal the winning resolver decides the emitted `member` /
 * `identifier`, i.e. the IAM binding name. Reordering this list silently
 * renames/replaces production IAM bindings. Do NOT reorder.
 *
 * Each entry pairs the resolver with its stable type key (the keys formerly
 * registered in the Map: `string`, `output`, `matrix-object`, `resource`),
 * which `getRegisteredTypes()` returns for callers/tests.
 */
const RESOLVERS: ReadonlyArray<{
  type: string;
  resolver: PrincipalResolver<unknown>;
}> = Object.freeze([
  { type: 'string', resolver: new StringPrincipalResolver() },
  { type: 'output', resolver: new OutputPrincipalResolver() },
  { type: 'matrix-object', resolver: new MatrixObjectPrincipalResolver() },
  { type: 'resource', resolver: new ResourcePrincipalResolver() },
]);

/**
 * Factory for creating and managing principal resolvers
 */
export class PrincipalFactory {
  /**
   * Resolve a principal to its IAM member format and identifier.
   * Resolution is intentionally uncached (see "Disable caching" note below).
   */
  static resolvePrincipal(
    principal: unknown,
    principalIndex: number
  ): ResolvedPrincipal {
    // Disable caching - it was causing issues with Pulumi Outputs
    // that appear identical when stringified but have different values

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
   * Find the appropriate resolver for a principal.
   * Iterates the fixed RESOLVERS list in order and returns the first match.
   */
  private static findResolver(
    principal: unknown
  ): PrincipalResolver<unknown> | undefined {
    for (const { resolver } of RESOLVERS) {
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
    return this.findResolver(principal) !== undefined;
  }

  /**
   * Get all registered resolver types
   */
  static getRegisteredTypes(): string[] {
    return RESOLVERS.map(({ type }) => type);
  }

  /**
   * No-op retained for backward-compatible test API.
   *
   * The resolver list is now a fixed module-level constant, so there is no
   * mutable state to reset. Tests still call `clear()` in `beforeEach` and then
   * `resolvePrincipal(...)`; resolution must keep working afterwards, which it
   * does because RESOLVERS is never mutated.
   *
   * @deprecated Inert no-op — there is no mutable resolver state to clear.
   * Safe to call but has no effect; retained only for backward-compatible test
   * API and may be removed in a future major version.
   */
  static clear(): void {
    // intentionally empty — resolvers are a fixed constant list
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

      // Handle CloudInfraBulkAccount or similar objects with getAccounts method.
      //
      // GATING (Trap 6, live access-matrix path): the merged single
      // CloudInfraAccount now ALSO exposes getAccounts() (a single-entry record),
      // so getAccounts() alone is no longer a reliable bulk signal — expanding a
      // SINGLE account here would resolve via its raw child SA instead of the
      // wrapper, changing the resolution code path. We expand ONLY on genuine
      // bulk-ness: an explicit `isCloudInfraBulkResource` marker (set true on the
      // array arity) OR more than one contained account. A single account
      // therefore falls through and is resolved via the WRAPPER path, exactly as
      // before the single class gained getAccounts() — byte-identical member +
      // identifier. Bulk expansion is unchanged.
      if (hasMethod(principal, 'getAccounts')) {
        const bulk = principal as BulkResource;
        const accounts = bulk.getAccounts();
        const isGenuineBulk =
          bulk.isCloudInfraBulkResource === true ||
          Object.keys(accounts).length > 1;
        if (isGenuineBulk) {
          return Object.values(accounts);
        }
      }

      return [principal];
    });
  }

  /**
   * Deduplicate principals based on their resolved member strings.
   *
   * FROZEN — v2 redesign notes §3 Trap 1. The `key` ternary below is an
   * intentional identity no-op (both branches return `principal`): this dedups
   * objects by reference identity, NOT by value. Do NOT "fix" it — collapsing
   * the ternary or value-comparing would delete production IAM bindings.
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
