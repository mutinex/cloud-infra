import * as pulumi from '@pulumi/pulumi';
import {
  MatrixPrincipalObject,
  ResourcePrincipal,
  OutputPrincipalWithHints,
  AllPrincipalTypes,
} from '../types/matrix-types';
import { ResolvedPrincipal } from '../types/common-types';
import { CloudInfraReference, ReferenceWithoutDomain } from '../../reference';
import { serviceAccountAliases } from '../../reference/config';

/**
 * Interface for principal resolvers
 */
export interface PrincipalResolver<T = AllPrincipalTypes> {
  resolve(principal: T, principalIndex: number): ResolvedPrincipal;
  canResolve(principal: unknown): principal is T;
}

// Type guard functions
function isStringPrincipal(principal: unknown): principal is string {
  return typeof principal === 'string';
}

function isOutputPrincipal(
  principal: unknown
): principal is pulumi.Output<string> {
  return pulumi.Output.isInstance(principal);
}

function isMatrixPrincipal(
  principal: unknown
): principal is MatrixPrincipalObject {
  return (
    typeof principal === 'object' &&
    principal !== null &&
    'stack' in principal &&
    'name' in principal &&
    (!('domain' in principal) ||
      typeof (principal as { domain?: unknown }).domain === 'string' ||
      (principal as { domain?: unknown }).domain === undefined)
  );
}

function isResourcePrincipal(
  principal: unknown
): principal is ResourcePrincipal {
  return (
    typeof principal === 'object' &&
    principal !== null &&
    ('email' in principal || 'getEmail' in principal)
  );
}

/**
 * Constructor type for principal resolvers
 */
export type PrincipalResolverConstructor = new () => PrincipalResolver;

/**
 * String principal resolver for literal IAM member strings
 */
export class StringPrincipalResolver implements PrincipalResolver<string> {
  canResolve(principal: unknown): principal is string {
    return isStringPrincipal(principal);
  }

  resolve(principal: string): ResolvedPrincipal {
    const parts = principal.split(':');
    const identifier = parts.length > 1 ? parts[1] : parts[0];

    return {
      member: principal,
      identifier,
    };
  }
}

/**
 * Output principal resolver for Pulumi Output values
 */
export class OutputPrincipalResolver
  implements PrincipalResolver<pulumi.Output<string>>
{
  canResolve(principal: unknown): principal is pulumi.Output<string> {
    return isOutputPrincipal(principal);
  }

  resolve(principal: pulumi.Output<string>): ResolvedPrincipal {
    // Check for explicit identifier hint first
    let identifier: string = 'output-principal';
    const hintedPrincipal = principal as OutputPrincipalWithHints;

    if (hintedPrincipal.__identifierHint) {
      identifier = hintedPrincipal.__identifierHint;
    } else {
      // Attempt resource-based heuristics
      if (
        hintedPrincipal.resources &&
        Array.isArray(hintedPrincipal.resources)
      ) {
        const resArray = hintedPrincipal.resources;
        if (resArray.length > 0 && resArray[0]?._name) {
          identifier = resArray[0]._name as string;
        } else if (resArray.length > 0 && resArray[0]?.__name) {
          identifier = resArray[0].__name as string;
        }
      }
    }

    return {
      member: principal,
      identifier,
    };
  }
}

/**
 * Matrix object principal resolver for configuration-based principals
 */
export class MatrixObjectPrincipalResolver
  implements PrincipalResolver<MatrixPrincipalObject>
{
  canResolve(principal: unknown): principal is MatrixPrincipalObject {
    return isMatrixPrincipal(principal);
  }

  resolve(principal: MatrixPrincipalObject): ResolvedPrincipal {
    // Conditional resolution based on domain presence
    if (principal.domain) {
      return this.resolveWithDomain(principal);
    } else {
      return this.resolveWithoutDomain(principal);
    }
  }

  private resolveWithDomain(
    principal: MatrixPrincipalObject
  ): ResolvedPrincipal {
    // Existing domain-based resolution logic
    // Uses CloudInfraReference with domain
    const ref = new CloudInfraReference({
      domain: principal.domain!,
      stack: principal.stack,
      outputKey: principal.version,
    });

    const resourceType = principal.resourceType || 'account';
    const rTypeLower = resourceType.toLowerCase();

    let member: pulumi.Input<string>;
    if (
      serviceAccountAliases.includes(
        rTypeLower as (typeof serviceAccountAliases)[number]
      )
    ) {
      const email = ref.getEmail(resourceType, principal.name);
      member = pulumi.interpolate`serviceAccount:${email}`;
    } else {
      member = ref.getMember(resourceType, principal.name);
    }

    const identifier = ref.getIdentifier(principal.name);
    return { member, identifier };
  }

  private resolveWithoutDomain(
    principal: MatrixPrincipalObject
  ): ResolvedPrincipal {
    // New domain-optional resolution logic
    // Direct stack access using name as key
    const ref = new ReferenceWithoutDomain({
      stack: principal.stack,
    });

    const resourceType = principal.resourceType || 'account';
    const rTypeLower = resourceType.toLowerCase();

    let member: pulumi.Input<string>;
    if (
      serviceAccountAliases.includes(
        rTypeLower as (typeof serviceAccountAliases)[number]
      )
    ) {
      const email = ref.getEmail(principal.name);
      member = pulumi.interpolate`serviceAccount:${email}`;
    } else {
      member = ref.getMember(principal.name);
    }

    const identifier = ref.getIdentifier(principal.name);
    return { member, identifier };
  }
}

/**
 * Resource principal resolver for service account resources
 */
export class ResourcePrincipalResolver
  implements PrincipalResolver<ResourcePrincipal>
{
  canResolve(principal: unknown): principal is ResourcePrincipal {
    return isResourcePrincipal(principal);
  }

  resolve(
    principal: ResourcePrincipal,
    principalIndex: number
  ): ResolvedPrincipal {
    const emailOutput = this.extractEmail(principal);

    if (!emailOutput) {
      throw new Error(
        `Unsupported inline principal object passed to CloudInfraAccessMatrix – cannot derive email from: ${JSON.stringify(principal)}`
      );
    }

    const member = pulumi.interpolate`serviceAccount:${emailOutput}`;
    const identifier = this.extractIdentifier(principal, principalIndex);

    return {
      member,
      identifier,
    };
  }

  private extractEmail(
    principal: ResourcePrincipal
  ): pulumi.Input<string> | undefined {
    if (principal.email) {
      return principal.email;
    }

    if (principal.getEmail) {
      return principal.getEmail();
    }

    return undefined;
  }

  private extractIdentifier(
    principal: ResourcePrincipal,
    principalIndex: number
  ): string {
    // Try __name first (fixes the issue with newer Pulumi versions)
    if (principal.__name && typeof principal.__name === 'string') {
      return principal.__name;
    }

    // Try to get from meta if available
    if (principal.meta?.getName) {
      try {
        return principal.meta.getName();
      } catch {
        // Ignore and try other methods
      }
    }

    if (principal.getName) {
      try {
        const name = principal.getName();
        if (typeof name === 'string') {
          return name;
        }
      } catch {
        // Ignore and try other methods
      }
    }

    // Try other internal name properties for backward compatibility
    if (principal instanceof pulumi.CustomResource) {
      const resourceName =
        principal.__pulumiResourceName ??
        principal._name ??
        principal.__opts?.name;
      if (resourceName && typeof resourceName === 'string') {
        return resourceName;
      }
    }

    // Try to get from the resource's name property if it's a string
    if (principal.name && typeof principal.name === 'string') {
      return principal.name;
    }

    // Fallback to email-based derivation
    const emailIdentifier = this.deriveIdentifierFromEmail(
      principal.email || principal.getEmail?.(),
      principalIndex
    );

    return emailIdentifier || `principal-${principalIndex}`;
  }

  private deriveIdentifierFromEmail(
    email: pulumi.Input<string> | undefined,
    fallbackIndex: number
  ): string {
    if (typeof email === 'string') {
      return email.split('@')[0];
    }

    // Try to extract from Output if possible
    if (pulumi.Output.isInstance(email)) {
      const hintedEmail = email as OutputPrincipalWithHints;
      if (hintedEmail.resources && Array.isArray(hintedEmail.resources)) {
        // Check if the Output has any resource hints we can use
        const resources = hintedEmail.resources;
        if (Array.isArray(resources) && resources.length > 0) {
          const resource = resources[0];
          const resourceName =
            resource.__name ?? resource._name ?? resource.urn?.name;
          if (typeof resourceName === 'string') {
            return resourceName;
          }
        }
      }
    }

    return `sa-${fallbackIndex}`;
  }
}

/**
 * All available principal resolver types
 */
export const PRINCIPAL_RESOLVER_TYPES = [
  'string',
  'output',
  'matrix-object',
  'resource',
] as const;

export type PrincipalResolverType = (typeof PRINCIPAL_RESOLVER_TYPES)[number];
